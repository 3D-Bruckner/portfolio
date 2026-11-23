// Thingiverse (MakerBot's model site), through its official API with an app token of Marcel's (PORTFOLIO_THINGIVERSE_TOKEN, made at
// thingiverse.com/developers); without the token a Thingiverse link is refused.
//   GET https://api.thingiverse.com/things/<id>          name, description_html (or description)
//   GET https://api.thingiverse.com/things/<id>/images   [{ sizes: [{ type, size, url }] }]: the "display"/"large" one of each
// Thingiverse has no slicer numbers: time, weight and colours stay for the 3MF button or by hand.
import * as z from "zod";
import { invalid, ok } from "../outcome";
import type { PrintInput } from "../printfields";
import { descriptionOf, getJson, titleOf, type Draft, type Reader } from "./common";

export const THINGIVERSE_API = "https://api.thingiverse.com";

const thingSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullish(),
  description_html: z.string().nullish(),
});
const imagesSchema = z.array(z.object({ sizes: z.array(z.object({ type: z.string(), size: z.string(), url: z.string() })).nullish() }));

/** What Thingiverse says, as a draft: pure, so it is tested without the network. */
export function draftFrom(thing: z.infer<typeof thingSchema>, images: z.infer<typeof imagesSchema>): Draft {
  const id = String(thing.id);
  const input = {
    title: titleOf(thing.name, `Thingiverse ${id}`),
    description: descriptionOf(thing.description_html ?? thing.description ?? ""),
    sources: [{ label: "Thingiverse", url: thingiverse.page(id) }],
  } as PrintInput;
  const pick = (sizes: { type: string; size: string; url: string }[]) =>
    (sizes.find((s) => s.type === "display" && s.size === "large") ?? sizes.find((s) => s.type === "display") ?? sizes[0])?.url;
  const pictures = images.map((i) => pick(i.sizes ?? [])).filter((u): u is string => Boolean(u));
  return { input, pictures, profile: null, profileId: null, profiles: [], slicedFor: null, factor: 1 };
}

export const thingiverse: Reader = {
  site: "Thingiverse",
  match(url) {
    if (!/^(www\.)?thingiverse\.com$/.test(url.hostname)) return null;
    const m = /^\/thing:(\d+)\/?/i.exec(url.pathname);
    return m ? m[1]! : null;
  },
  page: (id) => `https://www.thingiverse.com/thing:${id}`,
  isPicture: (u) => u.hostname === "cdn.thingiverse.com" || u.hostname.endsWith(".thingiverse.com"),
  async read(rt, id) {
    const token = rt.config.thingiverseToken;
    if (!token) return invalid("thingiverse: Thingiverse needs PORTFOLIO_THINGIVERSE_TOKEN, an app token from thingiverse.com/developers.");
    const auth = { headers: { authorization: `Bearer ${token}` } };
    const thing = await getJson(rt, "Thingiverse", `${THINGIVERSE_API}/things/${id}`, auth, thingSchema);
    if (!thing.ok) return thing;
    const images = await getJson(rt, "Thingiverse", `${THINGIVERSE_API}/things/${id}/images`, auth, imagesSchema);
    return ok(draftFrom(thing.value, images.ok ? images.value : []));
  },
};
