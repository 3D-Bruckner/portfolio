// The site export: what 3dbruckner.de's build reads (GET /api/v1/export, with a read token) to write its src/assets/printed/<slug>/.
// Every published print in the site's order (the showcases in theirs, then the rest), with its fields, its photos' ids, hashes, sizes
// and download URLs, and the categories the published prints use. A field a print hasn't is left out, never null. Its print fields'
// schemas come from the field table (printfields.ts), so a field's limit and description are written once.
import * as z from "zod";
import { PRINT_FIELDS } from "./printfields";
import { siteOrder } from "./prints";
import type { Runtime } from "./runtime";

/** The print fields the export carries as they are (categories go by name, the slug is the address). */
const EXPORTED = ["title", "shortTitle", "description", "price", "selfDesigned", "sources", "weightGrams", "printTimeMinutes", "colors"] as const;

const fields = Object.fromEntries(
  EXPORTED.map((n) => {
    const f = PRINT_FIELDS[n];
    return [n, (f.nullable ? f.value.optional() : f.value).describe(f.description)];
  }),
) as {
  [K in (typeof EXPORTED)[number]]: (typeof PRINT_FIELDS)[K] extends { nullable: true; value: infer S extends z.ZodType }
    ? z.ZodOptional<S>
    : (typeof PRINT_FIELDS)[K]["value"];
};

export const siteExportSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().describe("When the export was made (ISO 8601)."),
  categories: z.array(z.object({ name: z.string(), slug: z.string() })).describe("The categories the published prints use, by name."),
  prints: z
    .array(
      z.object({
        slug: z.string().describe(PRINT_FIELDS.slug.description),
        ...fields,
        categories: z.array(z.string()).describe("The print's categories' names."),
        showcase: z.boolean().describe("Pinned above the rest of the portfolio and shown on the start page."),
        cover: z.string().describe("The cover photo's id."),
        photos: z
          .array(
            z.object({
              id: z.string(),
              sha256: z.string().describe("The cutout's SHA-256, hex: a new crop changes it."),
              width: z.number().int(),
              height: z.number().int(),
              url: z.string().describe("Where its JPEG is downloaded (GET, with the same token)."),
            }),
          )
          .describe("The print's photos, in their order."),
      }),
    )
    .describe("Every published print in the site's order: the showcases first, in theirs, then the rest."),
});

export type SiteExport = z.infer<typeof siteExportSchema>;

/** What a print has: null and undefined left out. */
const present = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as T;

export function siteExport(rt: Runtime): SiteExport {
  const prints = siteOrder(rt);
  const used = new Map(prints.flatMap((p) => p.categories).map((c) => [c.id, c]));
  return {
    version: 1,
    generatedAt: rt.clock().toISOString(),
    categories: [...used.values()].sort((a, b) => a.name.localeCompare(b.name, "de")).map((c) => ({ name: c.name, slug: c.slug })),
    prints: prints.map((p) => ({
      slug: p.slug,
      ...(present(Object.fromEntries(EXPORTED.map((n) => [n, p[n]]))) as Pick<SiteExport["prints"][number], (typeof EXPORTED)[number]>),
      categories: p.categories.map((c) => c.name),
      showcase: p.showcase,
      // A published print has a photo (publishing needs one, deleting the last unpublishes), so it has a cover.
      cover: p.coverPhotoId ?? p.photos[0]!.id,
      photos: p.photos.map((ph) => ({
        id: ph.id,
        sha256: ph.sha256,
        width: ph.width,
        height: ph.height,
        url: `${rt.config.publicUrl}/api/v1/photos/${ph.id}`,
      })),
    })),
  };
}
