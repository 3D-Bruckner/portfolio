import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCategory, renameCategory } from "./categories";
import type { Outcome } from "./outcome";
import { createPrint, deletePrint, getPrint, listPrints, publishPrint, siteOrder, unpublishPrint, updatePrint, type Print, type PrintInput } from "./prints";
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

const input = (title: string, more: Partial<PrintInput> = {}): PrintInput => ({ title, description: `About ${title}.`, ...more });

/** A published print with one photo. */
function published(title: string, more: Partial<PrintInput> = {}): Print {
  const p = value(createPrint(rt, input(title, more)));
  seedPhoto(rt, p.id);
  return value(publishPrint(rt, p.id));
}

const titles = (prints: Print[]) => prints.map((p) => p.title);

describe("createPrint", () => {
  it("refuses a price that isn't whole euros", () => {
    const o = createPrint(rt, input("Vase", { price: 6.5 }));
    expect(o).toMatchObject({ ok: false, reason: "invalid" });
    if (!o.ok) expect(o.message).toContain("price");
  });

  it("refuses zero colours", () => {
    expect(createPrint(rt, input("Vase", { colors: 0 }))).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses a source that isn't an http(s) URL, an unknown field and an unknown category", () => {
    expect(createPrint(rt, input("Vase", { sources: [{ label: "MakerWorld", url: "ftp://example.com/x" }] }))).toMatchObject({ reason: "invalid" });
    expect(createPrint(rt, { ...input("Vase"), colour: 3 } as PrintInput)).toMatchObject({ reason: "invalid" });
    const o = createPrint(rt, input("Vase", { categoryIds: ["nope"] }));
    expect(o).toMatchObject({ ok: false, reason: "invalid" });
    if (!o.ok) expect(o.message).toContain("nope");
  });

  it("refuses a title without a letter or digit, since the slug comes from it", () => {
    expect(createPrint(rt, input("–!"))).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("makes a draft whose slug comes from the title, with every field kept", () => {
    const cat = value(createCategory(rt, "Geschenkideen"));
    const p = value(
      createPrint(rt, {
        title: "Beyblade – Dragoon",
        shortTitle: "Beyblade",
        description: "Ein Kreisel.",
        price: 12,
        selfDesigned: true,
        weightGrams: 40,
        printTimeMinutes: 95,
        colors: 3,
        categoryIds: [cat.id],
        sources: [{ label: "MakerWorld", url: "https://makerworld.com/de/models/1" }],
      }),
    );
    expect(p).toMatchObject({
      status: "draft",
      slug: "beyblade-dragoon",
      title: "Beyblade – Dragoon",
      shortTitle: "Beyblade",
      price: 12,
      selfDesigned: true,
      weightGrams: 40,
      printTimeMinutes: 95,
      colors: 3,
      categoryIds: [cat.id],
      categories: [{ id: cat.id, name: "Geschenkideen", slug: "geschenkideen" }],
      sources: [{ label: "MakerWorld", url: "https://makerworld.com/de/models/1" }],
      showcase: false,
      coverPhotoId: null,
      photos: [],
      firstPublishedAt: null,
    });
    expect(getPrint(rt, p.id)).toEqual({ ok: true, value: p });
  });

  it("defaults what was left out", () => {
    const p = value(createPrint(rt, { title: "Vase", description: "" }));
    expect(p).toMatchObject({
      shortTitle: null,
      price: null,
      selfDesigned: false,
      weightGrams: null,
      printTimeMinutes: null,
      colors: null,
      categoryIds: [],
      sources: [],
    });
  });

  it("keepsCategoryOrder: a print's categories stay in the order given, the first its main one; a new order is a change", () => {
    const gift = value(createCategory(rt, "Geschenkideen"));
    const home = value(createCategory(rt, "Haushalt & Küche"));
    const p = value(createPrint(rt, input("Drachenei", { categoryIds: [home.id, gift.id] })));
    expect(p.categoryIds).toEqual([home.id, gift.id]);
    expect(p.categories.map((c) => c.name)).toEqual(["Haushalt & Küche", "Geschenkideen"]);
    const swapped = value(updatePrint(rt, p.id, { categoryIds: [gift.id, home.id] }));
    expect(swapped.categories.map((c) => c.name)).toEqual(["Geschenkideen", "Haushalt & Küche"]);
  });

  it("takes a key that is present but undefined as left out", () => {
    const p = value(createPrint(rt, { title: "Vase", description: "", sources: undefined, categoryIds: undefined, price: undefined, selfDesigned: undefined }));
    expect(p).toMatchObject({ sources: [], categoryIds: [], price: null, selfDesigned: false });
  });

  it("refuses a second print whose title gives a slug another print has, naming it", () => {
    value(createPrint(rt, input("Beyblade – Dragoon")));
    const o = createPrint(rt, input("Beyblade Dragoon"));
    expect(o).toMatchObject({ ok: false, reason: "conflict" });
    if (!o.ok) expect(o.message).toContain("beyblade-dragoon");
  });
});

describe("updatePrint", () => {
  it("changes only what the patch names; null clears an optional field", () => {
    const p = value(createPrint(rt, input("Vase", { price: 5, colors: 2 })));
    const u = value(updatePrint(rt, p.id, { price: null, title: "Große Vase" }));
    // A draft's address follows its new title (slugFollowsTitle below).
    expect(u).toMatchObject({ title: "Große Vase", price: null, colors: 2, slug: "grosse-vase" });
  });

  it("lets a draft's slug change", () => {
    const p = value(createPrint(rt, input("Vase")));
    expect(value(updatePrint(rt, p.id, { slug: "blumenvase" })).slug).toBe("blumenvase");
    expect(updatePrint(rt, p.id, { slug: "Not A Slug" })).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("slugFollowsTitle: a draft's address follows its title until it is published, unless it was set by hand or is taken", () => {
    const p = value(createPrint(rt, input("Entwurf 20.11. 14:05")));
    expect(p.slug).toBe("entwurf-20-11-14-05");
    // Renamed (the form sends the slug it shows): the address follows.
    expect(value(updatePrint(rt, p.id, { title: "Drachenei", slug: p.slug })).slug).toBe("drachenei");
    // Set by hand: from then on it stays when the title changes.
    value(updatePrint(rt, p.id, { slug: "ei" }));
    expect(value(updatePrint(rt, p.id, { title: "Drachenei – groß" })).slug).toBe("ei");
    // Taken by another print: the title is saved, the address stays.
    const q = value(createPrint(rt, input("Vase")));
    value(createPrint(rt, input("Krug")));
    const renamed = value(updatePrint(rt, q.id, { title: "Krug" }));
    expect(renamed).toMatchObject({ title: "Krug", slug: "vase" });
    // Published once: the address is fixed.
    const r = published("Schale");
    expect(value(updatePrint(rt, r.id, { title: "Obstschale" })).slug).toBe("schale");
  });

  it("slugFixedAfterPublish: refuses a slug change once the print was published, even after unpublishing", () => {
    const p = published("Vase");
    value(unpublishPrint(rt, p.id));
    expect(updatePrint(rt, p.id, { slug: "blumenvase" })).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("refuses emptying a published print's description", () => {
    const p = published("Vase");
    expect(updatePrint(rt, p.id, { description: "  " })).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("answers not_found for an unknown print", () => {
    expect(updatePrint(rt, "nope", { title: "x" })).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("publishPrint", () => {
  it("publishRefusesWithoutPhoto", () => {
    const p = value(createPrint(rt, input("Vase")));
    const o = publishPrint(rt, p.id);
    expect(o).toMatchObject({ ok: false, reason: "invalid" });
    if (!o.ok) expect(o.message).toContain("photo");
    expect(value(getPrint(rt, p.id)).status).toBe("draft");
  });

  it("refuses without a description", () => {
    const p = value(createPrint(rt, { title: "Vase", description: "" }));
    seedPhoto(rt, p.id);
    expect(publishPrint(rt, p.id)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("publishPutsNewPrintOnTop", () => {
    published("A");
    published("B");
    expect(titles(siteOrder(rt))).toEqual(["B", "A"]);
  });

  it("sets firstPublishedAt once", () => {
    const p = published("Vase");
    expect(p.firstPublishedAt).not.toBeNull();
    value(unpublishPrint(rt, p.id));
    expect(value(publishPrint(rt, p.id)).firstPublishedAt).toBe(p.firstPublishedAt);
  });

  it("publishRefusesReservedSlug: a deleted print's slug is never reused, and the refusal names it", () => {
    const p = published("Beyblade – Dragoon");
    value(deletePrint(rt, p.id));
    const again = value(createPrint(rt, input("Beyblade – Dragoon")));
    seedPhoto(rt, again.id);
    const o = publishPrint(rt, again.id);
    expect(o).toMatchObject({ ok: false, reason: "conflict" });
    if (!o.ok) expect(o.message).toContain("beyblade-dragoon");
    expect(updatePrint(rt, again.id, { slug: "beyblade-dragoon-2" })).toMatchObject({ ok: true });
    expect(publishPrint(rt, again.id)).toMatchObject({ ok: true });
  });

  it("draftsNotInSiteOrder", () => {
    published("A");
    value(createPrint(rt, input("Draft")));
    expect(titles(siteOrder(rt))).toEqual(["A"]);
    expect(titles(listPrints(rt, { status: "draft" }))).toEqual(["Draft"]);
    expect(titles(listPrints(rt, { status: "published" }))).toEqual(["A"]);
    expect(titles(listPrints(rt, {}))).toEqual(["Draft", "A"]);
  });
});

describe("unpublishPrint and deletePrint", () => {
  it("unpublishing takes the print off the site", () => {
    const a = published("A");
    published("B");
    expect(value(unpublishPrint(rt, a.id)).status).toBe("draft");
    expect(titles(siteOrder(rt))).toEqual(["B"]);
  });

  it("deleting removes the print, its photos on disk and reserves a published slug", () => {
    const p = published("Vase");
    const dir = join(rt.config.dataDir, "photos", p.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${p.photos[0]!.id}.jpg`), "jpeg");
    expect(deletePrint(rt, p.id)).toEqual({ ok: true, value: undefined });
    expect(existsSync(dir)).toBe(false);
    expect(getPrint(rt, p.id)).toMatchObject({ ok: false, reason: "not_found" });
    expect(deletePrint(rt, p.id)).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("a draft that was never published leaves its slug free", () => {
    const p = value(createPrint(rt, input("Vase")));
    value(deletePrint(rt, p.id));
    const again = value(createPrint(rt, input("Vase")));
    seedPhoto(rt, again.id);
    expect(publishPrint(rt, again.id)).toMatchObject({ ok: true });
  });
});

describe("getPrint", () => {
  it("carries the photos in order and the first as cover", () => {
    const p = value(createPrint(rt, input("Vase")));
    const first = seedPhoto(rt, p.id);
    const second = seedPhoto(rt, p.id);
    rt.store.updatePrint(p.id, { cover_photo_id: first });
    const got = value(getPrint(rt, p.id));
    expect(got.photos.map((ph) => ph.id)).toEqual([first, second]);
    expect(got.coverPhotoId).toBe(first);
  });
});

describe("siteChangeHook", () => {
  it("is called for changes the site shows and only for those", () => {
    const draft = value(createPrint(rt, input("Draft")));
    value(updatePrint(rt, draft.id, { title: "Draft 2" }));
    expect(rt.siteChanges).toBe(0);

    const p = published("Vase");
    expect(rt.siteChanges).toBe(1);
    value(updatePrint(rt, p.id, { price: 7 }));
    expect(rt.siteChanges).toBe(2);

    const used = value(createCategory(rt, "Geschenkideen"));
    const unused = value(createCategory(rt, "Sonstiges"));
    expect(rt.siteChanges).toBe(2);
    value(updatePrint(rt, p.id, { categoryIds: [used.id] }));
    expect(rt.siteChanges).toBe(3);
    value(renameCategory(rt, used.id, "Geschenke"));
    expect(rt.siteChanges).toBe(4);
    value(renameCategory(rt, unused.id, "Anderes"));
    expect(rt.siteChanges).toBe(4);

    value(unpublishPrint(rt, p.id));
    expect(rt.siteChanges).toBe(5);
    value(deletePrint(rt, p.id));
    value(deletePrint(rt, draft.id));
    expect(rt.siteChanges).toBe(5);
  });

  it("unchangedSaveIsNoSiteChange: saving a published print's form unchanged writes nothing and starts no build", () => {
    const a = value(createCategory(rt, "Geschenke"));
    const b = value(createCategory(rt, "Deko"));
    const p = published("Vase", { price: 7, categoryIds: [a.id, b.id], sources: [{ label: "MakerWorld", url: "https://makerworld.com/x" }] });
    const before = rt.siteChanges;
    // What the web form sends back: every field as shown, an empty short title as "", the categories in their order.
    const same = value(
      updatePrint(rt, p.id, {
        title: p.title,
        shortTitle: "",
        description: p.description,
        price: 7,
        selfDesigned: p.selfDesigned,
        weightGrams: p.weightGrams,
        printTimeMinutes: p.printTimeMinutes,
        colors: p.colors,
        categoryIds: [a.id, b.id],
        sources: [{ label: "MakerWorld", url: "https://makerworld.com/x" }],
        slug: p.slug,
      }),
    );
    expect(rt.siteChanges).toBe(before);
    expect(same.updatedAt).toBe(p.updatedAt);
    // One field that differs is a change again.
    value(updatePrint(rt, p.id, { title: p.title, price: 8 }));
    expect(rt.siteChanges).toBe(before + 1);
  });

  it("deleting a published print is a site change", () => {
    const p = published("Vase");
    value(deletePrint(rt, p.id));
    expect(rt.siteChanges).toBe(2);
  });
});
