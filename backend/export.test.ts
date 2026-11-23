import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "./categories";
import { siteExport, siteExportSchema } from "./export";
import { moveShowcase, setShowcase } from "./order";
import type { Outcome } from "./outcome";
import { addPhoto, photoPath } from "./photos";
import { createPrint, publishPrint, type Print, type PrintInput } from "./prints";
import { seedPhoto, testRuntime, type TestRuntime } from "./testing/runtime";

let rt: TestRuntime;
beforeEach(() => {
  rt = testRuntime();
});
afterEach(() => rt.store.close());

function value<T>(o: Outcome<T>): T {
  if (!o.ok) throw new Error(`expected ok, got ${o.reason}: ${o.message}`);
  return o.value;
}

const draft = (title: string, more: Partial<PrintInput> = {}): Print => value(createPrint(rt, { title, description: `About ${title}.`, ...more }));

function published(title: string, more: Partial<PrintInput> = {}): Print {
  const p = draft(title, more);
  seedPhoto(rt, p.id);
  return value(publishPrint(rt, p.id));
}

describe("siteExport", () => {
  it("exportOnlyPublished: drafts stay out; a published print carries its fields, and what it hasn't is left out", () => {
    rt.clock = () => new Date("2026-11-19T12:00:00.000Z");
    draft("Entwurf");
    const unpublished = published("Zurückgezogen");
    rt.store.updatePrint(unpublished.id, { status: "draft", position: null });
    const vase = published("Vase – groß", {
      shortTitle: "Vase",
      price: 12,
      selfDesigned: true,
      weightGrams: 80,
      printTimeMinutes: 240,
      colors: 2,
      sources: [{ label: "MakerWorld", url: "https://makerworld.com/x" }],
    });
    const plain = published("Haken");
    const e = siteExport(rt);
    expect(siteExportSchema.parse(e)).toEqual(e);
    expect(e.version).toBe(1);
    expect(e.generatedAt).toBe("2026-11-19T12:00:00.000Z");
    expect(e.prints.map((p) => p.slug)).toEqual([plain.slug, vase.slug]);
    const v = e.prints.find((p) => p.slug === vase.slug)!;
    expect(v).toEqual({
      slug: "vase-gross",
      title: "Vase – groß",
      shortTitle: "Vase",
      description: "About Vase – groß.",
      categories: [],
      price: 12,
      selfDesigned: true,
      sources: [{ label: "MakerWorld", url: "https://makerworld.com/x" }],
      weightGrams: 80,
      printTimeMinutes: 240,
      colors: 2,
      showcase: false,
      cover: vase.photos[0]!.id,
      photos: [
        {
          id: vase.photos[0]!.id,
          sha256: vase.photos[0]!.sha256,
          width: 2400,
          height: 1800,
          url: `https://portfolio.example.com/api/v1/photos/${vase.photos[0]!.id}`,
        },
      ],
    });
    // Nothing the print hasn't: no null on the wire.
    const h = e.prints.find((p) => p.slug === plain.slug)!;
    for (const k of ["shortTitle", "price", "weightGrams", "printTimeMinutes", "colors"]) expect(h, k).not.toHaveProperty(k);
    expect(JSON.stringify(e)).not.toContain("null");
  });

  it("exportOrderShowcasesFirst: the showcases in their order, then the rest in the portfolio's", () => {
    published("A");
    const b = published("B");
    published("C");
    const d = published("D");
    value(setShowcase(rt, b.id, true));
    value(setShowcase(rt, d.id, true));
    value(moveShowcase(rt, d.id, b.id));
    const e = siteExport(rt);
    expect(e.prints.map((p) => [p.title, p.showcase])).toEqual([
      ["D", true],
      ["B", true],
      ["C", false],
      ["A", false],
    ]);
  });

  it("exportCategoriesCarrySlug: the categories published prints use, each with its slug; prints name theirs", () => {
    const gift = value(createCategory(rt, "Geschenkideen"));
    const home = value(createCategory(rt, "Haus & Garten"));
    value(createCategory(rt, "Leer"));
    const onlyDraft = value(createCategory(rt, "Nur Entwurf"));
    draft("Entwurf", { categoryIds: [onlyDraft.id] });
    published("Vase", { categoryIds: [home.id, gift.id] });
    const e = siteExport(rt);
    expect(e.categories).toEqual([
      { name: "Geschenkideen", slug: "geschenkideen" },
      { name: "Haus & Garten", slug: "haus-garten" },
    ]);
    // A print names its categories in its order, the main one first.
    expect(e.prints[0]!.categories).toEqual(["Haus & Garten", "Geschenkideen"]);
  });

  it("exportPhotoShaMatchesFile: each photo's sha256 is its stored cutout's, the cover first or as chosen", async () => {
    const p = draft("Vase");
    const path = join(rt.config.dataDir, "in.png");
    await sharp({ create: { width: 300, height: 200, channels: 3, background: "#808080" } })
      .png()
      .toFile(path);
    const first = value(await addPhoto(rt, p.id, { path, type: "image/png" }));
    const second = value(await addPhoto(rt, p.id, { path, type: "image/png" }));
    value(publishPrint(rt, p.id));
    const [print] = siteExport(rt).prints;
    expect(print!.cover).toBe(first.id);
    expect(print!.photos.map((ph) => ph.id)).toEqual([first.id, second.id]);
    for (const [i, photo] of [first, second].entries()) {
      const bytes = readFileSync(photoPath(rt, photo));
      expect(print!.photos[i]!.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(print!.photos[i]).toMatchObject({ width: 300, height: 200 });
    }
  });
});
