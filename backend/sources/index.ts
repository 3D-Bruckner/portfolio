// A print from a model page's link: paste the address of a model on MakerWorld, Printables or Thingiverse and upload makes the draft
// from what the site says about it, so in the best case nothing is typed by hand. Each site's reader (makerworld.ts, printables.ts,
// thingiverse.ts) turns its answer into a draft: the title, the description as plain text, the page as its source, the slicer's numbers
// where the site has them (the time put onto Marcel's A1, printer.ts) with the site's price, and its pictures. Here the draft becomes a
// print, and the pictures its photos (a GIF by its first frame), at most PHOTO_MAX, fetched only from that site's picture hosts. A picture
// that fails is skipped and counted; a page that can't be read refuses the import and makes nothing. A model imported before is refused
// with the print it is.
//
// The pictures are the designer's, not Marcel's: the import says so, so they are replaced by his own before the print goes on the site.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { conflict, invalid, ok, type Outcome } from "../outcome";
import { addPhoto } from "../photos";
import { createPrint, getPrint, listPrints, type Print } from "../prints";
import type { Runtime } from "../runtime";
import { TIMEOUT_MS, USER_AGENT, type Reader } from "./common";
import { makerWorld } from "./makerworld";
import { printables } from "./printables";
import { OUR_PRINTER } from "./printer";
import { thingiverse } from "./thingiverse";

export const READERS: Reader[] = [makerWorld, printables, thingiverse];
/** The most photos one import brings; a gallery can hold dozens. */
export const PHOTO_MAX = 12;
const PICTURE_BYTES_MAX = 25 * 1024 * 1024;

export type Imported = {
  print: Print;
  site: string;
  photos: number;
  photosSkipped: number;
  /** The profile or file the numbers are from. */
  profile: string | null;
  /** When the time was sliced for a faster printer: that printer and the factor it was scaled by for the A1. */
  scaled: { from: string; factor: number; to: string } | null;
};

/** The site and model a link names, or null when it is no model page upload reads. */
export function modelLink(input: string): { reader: Reader; id: string; url: URL } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  for (const reader of READERS) {
    const id = reader.match(url);
    if (id) return { reader, id, url };
  }
  return null;
}

/** The print whose sources name the same model as `link` (on any of the sites), other than `except`; null when there is none. */
export function printOfModel(rt: Runtime, link: string, except: string | null = null): Print | null {
  const named = modelLink(link);
  if (!named) return null;
  const same = (u: string) => {
    const l = modelLink(u);
    return l !== null && l.reader === named.reader && l.id === named.id;
  };
  return listPrints(rt).find((p) => p.id !== except && p.sources.some((s) => same(s.url))) ?? null;
}

/** Creates a draft from the model page at `link`, with its photos. */
export async function importFromLink(rt: Runtime, link: string): Promise<Outcome<Imported>> {
  const named = modelLink(link);
  if (!named) return invalid("url: a model's address on MakerWorld, Printables or Thingiverse, e.g. https://makerworld.com/de/models/123456");
  const { reader, id } = named;
  const before = printOfModel(rt, link);
  if (before) return conflict(`${reader.site} model ${id} is print ${before.id} ("${before.title}") already.`);

  const draft = await reader.read(rt, id, named.url);
  if (!draft.ok) return draft;
  const made = createPrint(rt, draft.value.input);
  if (!made.ok) return made;
  const printId = made.value.id;

  const pictures = [
    ...new Set(
      draft.value.pictures.filter((s) => {
        try {
          const u = new URL(s);
          return u.protocol === "https:" && reader.isPicture(u);
        } catch {
          return false;
        }
      }),
    ),
  ].slice(0, PHOTO_MAX);
  let photos = 0;
  let skipped = 0;
  const dir = mkdtempSync(join(tmpdir(), "upload-import-"));
  try {
    for (const [i, url] of pictures.entries()) {
      const file = join(dir, `${i}.jpg`);
      try {
        const r = await rt.fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) throw new Error(`status ${r.status}`);
        if (Number(r.headers.get("content-length") ?? 0) > PICTURE_BYTES_MAX) throw new Error("too large");
        const bytes = Buffer.from(await r.arrayBuffer());
        if (bytes.length > PICTURE_BYTES_MAX) throw new Error("too large");
        // Whatever it is (JPEG, PNG, WebP, an animated GIF), the photo is a JPEG of its first frame, upright.
        writeFileSync(file, await sharp(bytes, { animated: false }).rotate().jpeg({ quality: 92 }).toBuffer());
        const added = await addPhoto(rt, printId, { path: file, type: "image/jpeg" });
        if (!added.ok) throw new Error(added.message);
        photos++;
      } catch (e) {
        skipped++;
        rt.log.warn({ printId, picture: i, error: e instanceof Error ? e.message : String(e) }, "import: a picture was skipped");
      } finally {
        rmSync(file, { force: true });
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  rt.log.info({ printId, site: reader.site, photos, skipped }, "import: done");
  const now = getPrint(rt, printId);
  const { slicedFor, factor, profile } = draft.value;
  return ok({
    print: now.ok ? now.value : made.value,
    site: reader.site,
    photos,
    photosSkipped: skipped,
    profile,
    scaled: slicedFor && factor !== 1 ? { from: slicedFor, factor, to: OUR_PRINTER } : null,
  });
}
