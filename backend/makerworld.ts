// A print from a MakerWorld link: paste the model's address and upload makes the draft from what MakerWorld says about it, so in the
// best case nothing is typed by hand. MakerWorld's own JSON API (the one its pages load, open without signing in) gives:
//   GET https://makerworld.com/api/v1/design-service/design/<id>
//   title, summary (HTML), designCreator.name, designExtension.design_pictures / real_pictures (the gallery), defaultInstanceId and
//   instances[]: the print profiles, each with prediction (seconds), weight (grams), instanceFilaments[{type, color, usedG}], pictures.
// The draft gets the title, the description as plain text, the MakerWorld page as its source, and time, weight, colours and the site's
// price from one profile: the one the link names (#profileId-<n>), else the default, else the first. The 3MF itself needs a MakerWorld
// sign-in and isn't fetched; the profile carries the slicer's numbers already. Then the gallery's pictures become its photos (a GIF by
// its first frame), at most PHOTO_MAX, fetched only from MakerWorld's own picture hosts. A picture that fails is skipped and counted;
// MakerWorld being unreachable or answering something else refuses the import and makes nothing.
//
// The pictures are the designer's, not Marcel's: the import says so (guidance, the UI's message), so they are replaced by his own before
// the print goes on the site.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import * as z from "zod";
import { conflict, invalid, notFound, ok, type Outcome } from "./outcome";
import { addPhoto } from "./photos";
import { PRINT_FIELDS, type PrintInput } from "./printfields";
import { suggestedPrice } from "./pricing";
import { createPrint, getPrint, listPrints, type Print } from "./prints";
import type { Runtime } from "./runtime";
import { materialOf, plainText } from "./threemf";

export const MAKERWORLD_API = "https://makerworld.com/api/v1/design-service/design";
/** The most photos one import brings; the gallery can hold dozens. */
export const PHOTO_MAX = 12;
const PICTURE_BYTES_MAX = 25 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
// MakerWorld's API answers a plain client; a browser's name isn't needed, a name of our own is honest.
const USER_AGENT = "3dbruckner-upload (+https://upload.3dbruckner.de)";

/** The model a MakerWorld link names, and the print profile in its #profileId-<n>, if any. Null for anything else. */
export function makerWorldLink(input: string): { designId: number; profileId: number | null } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/^(www\.)?makerworld\.com$/.test(url.hostname)) return null;
  const m = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?models\/(\d+)(?:[-/][^/]*)?\/?$/i.exec(url.pathname);
  if (!m) return null;
  const profile = /^#profileId-(\d+)$/.exec(url.hash);
  return { designId: Number(m[1]), profileId: profile ? Number(profile[1]) : null };
}

const picture = z.object({ url: z.string() });
const pictures = z.array(picture).nullish();
const grams = z.union([z.number(), z.string()]).transform((v) => Number(v));
const designSchema = z.object({
  id: z.number(),
  title: z.string(),
  summary: z.string().nullish(),
  designCreator: z.object({ name: z.string().nullish() }).nullish(),
  coverUrl: z.string().nullish(),
  defaultInstanceId: z.number().nullish(),
  designExtension: z.object({ design_pictures: pictures, real_pictures: pictures }).nullish(),
  instances: z
    .array(
      z.object({
        id: z.number(),
        profileId: z.number().nullish(),
        title: z.string().nullish(),
        isDefault: z.boolean().nullish(),
        prediction: z.number().nullish(),
        weight: z.number().nullish(),
        instanceFilaments: z.array(z.object({ type: z.string(), color: z.string(), usedG: grams.nullish() })).nullish(),
        pictures,
      }),
    )
    .nullish(),
});
// What draftFrom reads: MakerWorld's answer as it comes (a filament's grams may be a string) or as checked.
type Design = z.input<typeof designSchema>;
type Instance = NonNullable<Design["instances"]>[number];

/** What MakerWorld says, as a print's fields: pure, so it is tested without the network. */
export function draftFrom(design: Design, profileId: number | null): { input: PrintInput; profile: string | null; pictures: string[] } {
  const instances = design.instances ?? [];
  const instance: Instance | undefined =
    (profileId !== null ? instances.find((i) => i.id === profileId || i.profileId === profileId) : undefined) ??
    instances.find((i) => i.id === design.defaultInstanceId) ??
    instances.find((i) => i.isDefault) ??
    instances[0];
  const url = `https://makerworld.com/en/models/${design.id}`;
  // The "Boost me" box many designers put on top is MakerWorld's, not the model's.
  const summary = (design.summary ?? "").replace(/<boostme>[\s\S]*?<\/boostme>/gi, "");
  const description = plainText(summary).slice(0, PRINT_FIELDS.description.limit);
  const filaments = (instance?.instanceFilaments ?? []).filter((f) => !(Number(f.usedG) === 0));
  const colors = new Set(filaments.map((f) => f.color.toLowerCase())).size;
  const minutes = instance?.prediction ? Math.max(1, Math.round(instance.prediction / 60)) : undefined;
  const weight = instance?.weight ? Math.max(1, Math.round(instance.weight)) : undefined;
  const input: PrintInput = {
    title: design.title.trim().slice(0, 200) || `MakerWorld ${design.id}`,
    description: description
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    sources: [{ label: "MakerWorld", url }],
    ...(minutes ? { printTimeMinutes: minutes } : {}),
    ...(weight ? { weightGrams: weight } : {}),
    ...(colors >= 2 ? { colors } : {}),
    ...(minutes && weight
      ? { price: suggestedPrice({ weightGrams: weight, printTimeMinutes: minutes, multicolor: colors >= 2, material: materialOf(filaments) }) }
      : {}),
  } as PrintInput;
  // The gallery first (the designer's chosen pictures), then photos of real prints, then the profile's own; each once.
  const all = [
    ...(design.designExtension?.design_pictures ?? []),
    ...(design.designExtension?.real_pictures ?? []),
    ...(instance?.pictures ?? []),
    ...(design.coverUrl ? [{ url: design.coverUrl }] : []),
  ].map((p) => p.url);
  return { input, profile: instance?.title ?? null, pictures: [...new Set(all.filter(isPictureUrl))].slice(0, PHOTO_MAX) };
}

/** Only MakerWorld's own picture hosts, over HTTPS: the addresses come from MakerWorld's answer, never from the caller. */
function isPictureUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" && (u.hostname.endsWith(".bblmw.com") || u.hostname === "public-cdn.bambulab.com");
  } catch {
    return false;
  }
}

export type Imported = { print: Print; photos: number; photosSkipped: number; profile: string | null };

/** The print the model was imported as before, if any (its MakerWorld source names the same model). */
function alreadyImported(rt: Runtime, designId: number): Print | undefined {
  const page = new RegExp(`^https://(www\\.)?makerworld\\.com/([a-z-]+/)?models/${designId}(\\D|$)`);
  return listPrints(rt).find((p) => p.sources.some((s) => page.test(s.url)));
}

/** Creates a draft from the MakerWorld model at `link`, with its photos. Refused when the link is no MakerWorld model, the model is
 * imported already, or MakerWorld can't be read. */
export async function importFromMakerWorld(rt: Runtime, link: string): Promise<Outcome<Imported>> {
  const named = makerWorldLink(link);
  if (!named) return invalid("url: a MakerWorld model's address, e.g. https://makerworld.com/de/models/123456");
  const before = alreadyImported(rt, named.designId);
  if (before) return conflict(`MakerWorld model ${named.designId} is print ${before.id} ("${before.title}") already.`);

  let design: Design;
  try {
    const r = await rt.fetch(`${MAKERWORLD_API}/${named.designId}`, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.status === 404) return notFound(`MakerWorld has no model ${named.designId}.`);
    if (!r.ok) {
      rt.log.warn({ designId: named.designId, status: r.status }, "makerworld: the API refused");
      return invalid(`MakerWorld didn't answer (${r.status}); try again later.`);
    }
    const parsed = designSchema.safeParse(await r.json());
    if (!parsed.success) {
      rt.log.warn({ designId: named.designId, issues: parsed.error.issues.slice(0, 3) }, "makerworld: an answer of another shape");
      return invalid("MakerWorld answered with something upload doesn't read; the import needs a change.");
    }
    design = parsed.data;
  } catch (e) {
    rt.log.warn({ designId: named.designId, error: e instanceof Error ? e.message : String(e) }, "makerworld: unreachable");
    return invalid("MakerWorld can't be reached right now; try again later.");
  }

  const draft = draftFrom(design, named.profileId);
  const made = createPrint(rt, draft.input);
  if (!made.ok) return made;
  const id = made.value.id;

  let photos = 0;
  let skipped = 0;
  const dir = mkdtempSync(join(tmpdir(), "upload-makerworld-"));
  try {
    for (const [i, url] of draft.pictures.entries()) {
      const file = join(dir, `${i}.jpg`);
      try {
        const r = await rt.fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) throw new Error(`status ${r.status}`);
        if (Number(r.headers.get("content-length") ?? 0) > PICTURE_BYTES_MAX) throw new Error("too large");
        const bytes = Buffer.from(await r.arrayBuffer());
        if (bytes.length > PICTURE_BYTES_MAX) throw new Error("too large");
        // Whatever it is (JPEG, PNG, WebP, an animated GIF), the photo is a JPEG of its first frame, upright.
        writeFileSync(file, await sharp(bytes, { animated: false }).rotate().jpeg({ quality: 92 }).toBuffer());
        const added = await addPhoto(rt, id, { path: file, type: "image/jpeg" });
        if (!added.ok) throw new Error(added.message);
        photos++;
      } catch (e) {
        skipped++;
        rt.log.warn({ printId: id, picture: i, error: e instanceof Error ? e.message : String(e) }, "makerworld: a picture was skipped");
      } finally {
        rmSync(file, { force: true });
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  rt.log.info({ printId: id, designId: named.designId, photos, skipped }, "makerworld: imported");
  const now = getPrint(rt, id);
  return ok({ print: now.ok ? now.value : made.value, photos, photosSkipped: skipped, profile: draft.profile });
}
