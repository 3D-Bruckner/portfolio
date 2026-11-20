import { describe, expect, it } from "vitest";
import type { Print } from "./prints";
import { readiness } from "./readiness";

const print = (over: Partial<Print> = {}): Print =>
  ({
    id: "p",
    slug: "drachenei",
    status: "draft",
    title: "Salz & Pfeffer – Drachenei-Gewürzstreuer",
    shortTitle: null,
    description: "Ein Gewürzstreuer in Form eines Dracheneis, aus zwei Farben gedruckt, mit Schraubdeckel zum Nachfüllen.",
    price: 10,
    selfDesigned: false,
    weightGrams: 60,
    printTimeMinutes: 180,
    colors: 2,
    categoryIds: ["c"],
    categories: [{ id: "c", name: "Haushalt & Küche", slug: "haushalt-kueche" }],
    sources: [{ label: "MakerWorld", url: "https://makerworld.com/en/models/1" }],
    photos: [{}, {}, {}] as Print["photos"],
    showcase: false,
    coverPhotoId: null,
    firstPublishedAt: null,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as Print;

describe("readiness", () => {
  it("readyPrintHasNoHints: a print with everything has nothing to say", () => {
    expect(readiness(print())).toEqual([]);
  });

  it("neededFirst: what publishing needs is 'needed', in the order a person fills it", () => {
    const hints = readiness(print({ title: "", description: "", photos: [] }));
    expect(hints.filter((h) => h.level === "needed").map((h) => h.code)).toEqual(["title", "description", "photo"]);
  });

  it("tips: each gap the site would show", () => {
    const hints = readiness(
      print({
        title: "Ein sehr langer Titel ohne Gedankenstrich für die Karte",
        price: null,
        categories: [],
        categoryIds: [],
        weightGrams: null,
        photos: [{}] as Print["photos"],
        description: "Kurz.",
        sources: [],
      }),
    );
    expect(hints.map((h) => [h.code, h.level, h.field])).toEqual([
      ["price", "tip", "price"],
      ["category", "tip", "categoryIds"],
      ["slicer", "tip", "weightGrams"],
      ["cardTitle", "tip", "shortTitle"],
      ["morePhotos", "tip", "photos"],
      ["longerDescription", "tip", "description"],
      ["origin", "tip", "sources"],
    ]);
  });

  it("cardTitleUsesWhatTheSiteShows: the title up to ' – ', or the short title, is what must fit", () => {
    expect(readiness(print({ title: "Beyblade – Dragoon mit einem sehr, sehr langen Untertitel" }))).toEqual([]);
    expect(readiness(print({ title: "Ein sehr langer Titel ohne Gedankenstrich für die Karte", shortTitle: "Kurz" }))).toEqual([]);
  });

  it("ownDesignIsAnOrigin: selfDesigned stands in for a source", () => {
    expect(readiness(print({ sources: [], selfDesigned: true }))).toEqual([]);
  });
});
