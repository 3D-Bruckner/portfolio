// Printables (Prusa's model site). Its GraphQL API answers a plain client:
//   POST https://api.printables.com/graphql/  print(id) { name summary description images { filePath } gcodes { name printDuration
//   weight material { name } printer { name } } }
// printDuration is in hours (decimal), weight in grams. The numbers come from a G-code sliced for Marcel's A1 if there is one, else the
// one with the middle time; one for a faster printer has its time scaled for the A1 (printer.ts). Pictures are on media.printables.com.
import * as z from "zod";
import { ok } from "../outcome";
import type { PrintInput } from "../printfields";
import { materialOf } from "../threemf";
import { descriptionOf, getJson, numbers, titleOf, type Draft, type Reader } from "./common";
import { isOurPrinter } from "./printer";

export const PRINTABLES_API = "https://api.printables.com/graphql/";
const MEDIA = "https://media.printables.com/";

const QUERY = `query Print($id: ID!) { print(id: $id) { id name summary description images { filePath }
  gcodes { name printDuration weight material { name } printer { name } } } }`;

const hours = z.union([z.number(), z.string()]).transform((v) => Number(v));
const printSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  summary: z.string().nullish(),
  description: z.string().nullish(),
  images: z.array(z.object({ filePath: z.string() })).nullish(),
  gcodes: z
    .array(
      z.object({
        name: z.string().nullish(),
        printDuration: hours.nullish(),
        weight: z.number().nullish(),
        material: z.object({ name: z.string().nullish() }).nullish(),
        printer: z.object({ name: z.string().nullish() }).nullish(),
      }),
    )
    .nullish(),
});
const answerSchema = z.object({ data: z.object({ print: printSchema.nullable() }) });
type PrintablesPrint = z.input<typeof printSchema>;

/** What Printables says, as a draft: pure, so it is tested without the network. */
export function draftFrom(p: PrintablesPrint): Draft {
  const gcodes = (p.gcodes ?? []).filter((g) => Number(g.printDuration) > 0);
  // One sliced for the A1, else the one with the middle time: designers often add a speed-run or a draft file next to the real one.
  const byTime = [...gcodes].sort((a, b) => Number(a.printDuration) - Number(b.printDuration));
  const g = gcodes.find((x) => isOurPrinter(x.printer?.name)) ?? byTime[Math.floor((byTime.length - 1) / 2)];
  const printer = g?.printer?.name ?? null;
  const n = numbers({
    minutes: g ? Number(g.printDuration) * 60 : undefined,
    grams: g?.weight ?? undefined,
    material: materialOf([{ type: g?.material?.name ?? "PLA" }]),
    printer,
  });
  const id = String(p.id);
  const input = {
    title: titleOf(p.name, `Printables ${id}`),
    description: descriptionOf(p.description?.trim() ? p.description : (p.summary ?? "")),
    sources: [{ label: "Printables", url: printables.page(id) }],
    ...n.fields,
  } as PrintInput;
  return {
    input,
    pictures: (p.images ?? []).map((i) => MEDIA + i.filePath.replace(/^\//, "")),
    profile: g?.name ?? null,
    slicedFor: printer,
    factor: n.factor,
  };
}

export const printables: Reader = {
  site: "Printables",
  match(url) {
    if (!/^(www\.)?printables\.com$/.test(url.hostname)) return null;
    const m = /^\/(?:[a-z]{2}\/)?model\/(\d+)(?:-[^/]*)?(?:\/.*)?$/i.exec(url.pathname);
    return m ? m[1]! : null;
  },
  page: (id) => `https://www.printables.com/model/${id}`,
  isPicture: (u) => u.hostname === "media.printables.com",
  async read(rt, id) {
    const got = await getJson(
      rt,
      "Printables",
      PRINTABLES_API,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: QUERY, variables: { id } }) },
      answerSchema,
    );
    if (!got.ok) return got;
    if (!got.value.data.print) return { ok: false, reason: "not_found", message: "Printables has no such model." };
    return ok(draftFrom(got.value.data.print));
  },
};
