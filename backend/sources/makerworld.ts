// MakerWorld (Bambu Lab's model site). Its design data comes from Bambu Lab's own API host, which answers a plain client
// (makerworld.com's copy of the same API sits behind bot protection, which upload doesn't try to get around):
//   GET https://api.bambulab.com/v1/design-service/design/<id>
//   title, summary (HTML), designExtension.design_pictures / real_pictures (the gallery), coverUrl, defaultInstanceId and instances[]: the
//   print profiles, each with prediction (seconds), weight (grams), instanceFilaments[{type, color, usedG}], pictures, and
//   extention.modelInfo.compatibility.devProductName, the printer it was sliced for.
// The numbers come from one profile: the one the link names (#profileId-<n>), else the default, else the first. Not "any for the A1":
// profiles are other makers' too, and the first for the A1 can be a different size. A profile for a faster printer has its time scaled
// for the A1 (printer.ts). The 3MF itself needs a sign-in and isn't fetched.
import * as z from "zod";
import { ok } from "../outcome";
import type { PrintInput } from "../printfields";
import { materialOf } from "../threemf";
import { descriptionOf, getJson, numbers, titleOf, type Draft, type Reader } from "./common";

export const MAKERWORLD_API = "https://api.bambulab.com/v1/design-service/design";

const picture = z.object({ url: z.string() });
const pictures = z.array(picture).nullish();
const grams = z.union([z.number(), z.string()]).transform((v) => Number(v));
const designSchema = z.object({
  id: z.number(),
  title: z.string(),
  summary: z.string().nullish(),
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
        extention: z.object({ modelInfo: z.object({ compatibility: z.object({ devProductName: z.string().nullish() }).nullish() }).nullish() }).nullish(),
      }),
    )
    .nullish(),
});
// What draftFrom reads: MakerWorld's answer as it comes (a filament's grams may be a string) or as checked.
type Design = z.input<typeof designSchema>;
type Instance = NonNullable<Design["instances"]>[number];

const printerOf = (i: Instance | undefined): string | null => i?.extention?.modelInfo?.compatibility?.devProductName ?? null;

/** What MakerWorld says, as a draft: pure, so it is tested without the network. */
export function draftFrom(design: Design, profileId: number | null): Draft {
  const instances = design.instances ?? [];
  const instance: Instance | undefined =
    (profileId !== null ? instances.find((i) => i.id === profileId || i.profileId === profileId) : undefined) ??
    instances.find((i) => i.id === design.defaultInstanceId) ??
    instances.find((i) => i.isDefault) ??
    instances[0];
  // The "Boost me" box many designers put on top is MakerWorld's, not the model's.
  const summary = (design.summary ?? "").replace(/<boostme>[\s\S]*?<\/boostme>/gi, "");
  const filaments = (instance?.instanceFilaments ?? []).filter((f) => Number(f.usedG) !== 0);
  const printer = printerOf(instance);
  const n = numbers({
    minutes: instance?.prediction ? instance.prediction / 60 : undefined,
    grams: instance?.weight ?? undefined,
    colors: new Set(filaments.map((f) => f.color.toLowerCase())).size,
    material: materialOf(filaments),
    printer,
  });
  const input = {
    title: titleOf(design.title, `MakerWorld ${design.id}`),
    description: descriptionOf(summary),
    sources: [{ label: "MakerWorld", url: makerWorld.page(String(design.id)) }],
    ...n.fields,
  } as PrintInput;
  // The gallery first (the designer's chosen pictures), then photos of real prints, then the profile's own, then the cover; each once.
  const all = [
    ...(design.designExtension?.design_pictures ?? []),
    ...(design.designExtension?.real_pictures ?? []),
    ...(instance?.pictures ?? []),
    ...(design.coverUrl ? [{ url: design.coverUrl }] : []),
  ].map((p) => p.url);
  return { input, pictures: [...new Set(all)], profile: instance?.title ?? null, slicedFor: printer, factor: n.factor };
}

export const makerWorld: Reader = {
  site: "MakerWorld",
  match(url) {
    if (!/^(www\.)?makerworld\.com$/.test(url.hostname)) return null;
    const m = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?models\/(\d+)(?:[-/][^/]*)?\/?$/i.exec(url.pathname);
    return m ? m[1]! : null;
  },
  page: (id) => `https://makerworld.com/en/models/${id}`,
  isPicture: (u) => u.hostname.endsWith(".bblmw.com") || u.hostname === "public-cdn.bambulab.com",
  async read(rt, id, url) {
    const design = await getJson(rt, "MakerWorld", `${MAKERWORLD_API}/${id}`, {}, designSchema);
    if (!design.ok) return design;
    const profile = /^#profileId-(\d+)$/.exec(url.hash);
    return ok(draftFrom(design.value, profile ? Number(profile[1]) : null));
  },
};
