// Importing from a model page with fake sites (rt.fetch): never the real ones.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { getPrint, listPrints } from "../prints";
import { testRuntime } from "../testing/runtime";
import { importFromLink, modelLink, printOfModel } from ".";
import { draftFrom as fromMakerWorld, MAKERWORLD_API } from "./makerworld";
import { draftFrom as fromPrintables, PRINTABLES_API } from "./printables";
import { A1_FACTOR, onOurPrinter } from "./printer";
import { draftFrom as fromThingiverse, THINGIVERSE_API } from "./thingiverse";

const PIC = (name: string) => `https://makerworld.bblmw.com/makerworld/model/X/design/${name}`;
const sliced = (printer: string) => ({ modelInfo: { compatibility: { devProductName: printer } } });

const design = {
  id: 2872376,
  title: "ESP32 Plane Radar — Live ADS-B on a Round Display",
  summary:
    "<boostme><boosttitle>Boost Me</boosttitle><boostcontent>Boost for more!</boostcontent></boostme><h2>ESP32 C3 Plane Radar</h2><p>Shows planes &amp; more.</p><ul><li>ESP32</li><li>GC9A01</li></ul>",
  coverUrl: PIC("cover.gif"),
  defaultInstanceId: 2,
  designExtension: { design_pictures: [{ url: PIC("a.png") }, { url: PIC("b.gif") }], real_pictures: [{ url: "https://evil.example/x.jpg" }] },
  instances: [
    {
      id: 1,
      profileId: 101,
      title: "PETG",
      prediction: 3600,
      weight: 100,
      instanceFilaments: [{ type: "PETG", color: "#C0C0C0", usedG: "100" }],
      extention: sliced("P1S"),
    },
    {
      id: 2,
      profileId: 102,
      title: "0.2mm layer, 3 walls",
      prediction: 2100,
      weight: 9,
      instanceFilaments: [
        { type: "PLA", color: "#161616", usedG: "8" },
        { type: "PLA", color: "#FFFFFF", usedG: "1" },
        { type: "PLA", color: "#FF0000", usedG: "0" },
      ],
      pictures: [{ url: PIC("a.png") }],
      extention: sliced("H2D"),
    },
  ],
};

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: "#c2305e" } })
    .png()
    .toBuffer();
}
async function gif(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 20, channels: 4, background: "#00ff00" } })
    .gif()
    .toBuffer();
}

/** A runtime whose sites answer from `pages` (by address prefix) and pictures by address; every request is recorded. */
async function withSites(pages: Record<string, { status?: number; body: unknown }>, env: Record<string, string> = {}) {
  const rt = testRuntime(env);
  const asked: { url: string; init?: RequestInit }[] = [];
  const images: Record<string, Buffer> = {
    [PIC("a.png")]: await png(),
    [PIC("b.gif")]: await gif(),
    "https://media.printables.com/media/prints/3161/images/1/benchy.jpg": await png(),
    "https://cdn.thingiverse.com/assets/large.jpg": await png(),
  };
  rt.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    asked.push({ url: u, init });
    const page = Object.entries(pages).find(([prefix]) => u.startsWith(prefix));
    if (page) return new Response(JSON.stringify(page[1].body), { status: page[1].status ?? 200 });
    const img = images[u];
    return img ? new Response(new Uint8Array(img)) : new Response("gone", { status: 404 });
  }) as typeof fetch;
  return { rt, asked };
}

describe("modelLink", () => {
  it("readsTheSitesLinks: language, slug and profile may be there", () => {
    const at = (s: string) => {
      const l = modelLink(s);
      return l && [l.reader.site, l.id];
    };
    expect(at("https://makerworld.com/de/models/2872376-esp32-plane-radar#profileId-3207083")).toEqual(["MakerWorld", "2872376"]);
    expect(at(" https://makerworld.com/models/123 ")).toEqual(["MakerWorld", "123"]);
    expect(at("https://www.printables.com/de/model/3161-3d-benchy")).toEqual(["Printables", "3161"]);
    expect(at("https://www.printables.com/model/3161-3d-benchy/files")).toEqual(["Printables", "3161"]);
    expect(at("https://www.thingiverse.com/thing:763622")).toEqual(["Thingiverse", "763622"]);
  });
  it("refusesOtherAddresses", () => {
    for (const s of [
      "http://makerworld.com/en/models/1",
      "https://makerworld.com.evil/en/models/1",
      "https://makerworld.com/en/u/1",
      "https://example.com/model/1",
      "kein link",
      "",
    ])
      expect(modelLink(s)).toBeNull();
  });
});

describe("onOurPrinter", () => {
  it("scalesFasterPrintersOnly", () => {
    expect(onOurPrinter(100, "H2D")).toEqual({ minutes: Math.round(100 * A1_FACTOR), factor: A1_FACTOR });
    expect(onOurPrinter(100, "Prusa MK4S")).toEqual({ minutes: Math.round(100 * A1_FACTOR), factor: A1_FACTOR });
    expect(onOurPrinter(100, "A1")).toEqual({ minutes: 100, factor: 1 });
    expect(onOurPrinter(100, "Bambu Lab A1 mini")).toEqual({ minutes: 100, factor: 1 });
    expect(onOurPrinter(100, null)).toEqual({ minutes: 100, factor: 1 });
  });
});

describe("MakerWorld", () => {
  it("fillsFromTheDefaultProfile: words, source, numbers onto the A1, price; pictures each once", () => {
    const d = fromMakerWorld(design, null);
    expect(d.profile).toBe("0.2mm layer, 3 walls");
    expect(d).toMatchObject({ slicedFor: "H2D", factor: A1_FACTOR });
    expect(d.input).toMatchObject({
      title: "ESP32 Plane Radar — Live ADS-B on a Round Display",
      sources: [{ label: "MakerWorld", url: "https://makerworld.com/en/models/2872376" }],
      printTimeMinutes: Math.round(35 * A1_FACTOR),
      weightGrams: 9,
      colors: 2,
    });
    expect(d.input.description).not.toContain("Boost");
    expect(d.input.description).toContain("Shows planes & more.");
    expect(d.input.price).toBeGreaterThan(0);
    expect(d.pictures).toEqual([PIC("a.png"), PIC("b.gif"), "https://evil.example/x.jpg", PIC("cover.gif")]);
  });
  it("keepsTheDesignersProfile: another maker's A1 profile (a model at three times the size) doesn't replace it; the link's profile wins", () => {
    const withA1 = {
      ...design,
      instances: [...design.instances, { ...design.instances[1]!, id: 3, title: "3 x Size", prediction: 16020, weight: 72, extention: sliced("A1") }],
    };
    expect(fromMakerWorld(withA1, null)).toMatchObject({ profile: "0.2mm layer, 3 walls", factor: A1_FACTOR, input: { weightGrams: 9 } });
    expect(fromMakerWorld(withA1, 3)).toMatchObject({ profile: "3 x Size", factor: 1, input: { weightGrams: 72, printTimeMinutes: 267 } });
    expect(fromMakerWorld(withA1, 101)).toMatchObject({ profile: "PETG", factor: A1_FACTOR });
  });
});

describe("Printables", () => {
  const print = {
    id: "3161",
    name: "3D BENCHY",
    summary: "A test boat.",
    description: "<p>3DBenchy is a <b>test</b> model.</p>",
    images: [{ filePath: "media/prints/3161/images/1/benchy.jpg" }],
    gcodes: [
      { name: "mk4s.bgcode", printDuration: "0.5", weight: 10, material: { name: "PETG" }, printer: { name: "Prusa MK4S" } },
      { name: "a1.gcode", printDuration: "1.25", weight: 12, material: { name: "PLA" }, printer: { name: "Bambu Lab A1" } },
    ],
  };
  it("takesTheA1GcodeWhenThereIsOne", () => {
    const d = fromPrintables(print);
    expect(d).toMatchObject({ profile: "a1.gcode", factor: 1, slicedFor: "Bambu Lab A1" });
    expect(d.input).toMatchObject({
      title: "3D BENCHY",
      printTimeMinutes: 75,
      weightGrams: 12,
      sources: [{ label: "Printables", url: "https://www.printables.com/model/3161" }],
    });
    expect(d.input.description).toBe("3DBenchy is a test model.");
    expect(d.pictures).toEqual(["https://media.printables.com/media/prints/3161/images/1/benchy.jpg"]);
  });
  it("takesTheMiddleTimeWithoutAnA1Gcode: not a speed-run file", () => {
    const g = (name: string, hours: string) => ({ name, printDuration: hours, weight: 10, material: { name: "PLA" }, printer: { name: "Prusa MK4S" } });
    expect(fromPrintables({ ...print, gcodes: [g("speed", "0.1"), g("normal", "1"), g("fine", "3")] }).profile).toBe("normal");
  });
  it("scalesAFasterPrintersGcode", () => {
    expect(fromPrintables({ ...print, gcodes: [print.gcodes[0]!] })).toMatchObject({
      factor: A1_FACTOR,
      input: { printTimeMinutes: Math.round(30 * A1_FACTOR) },
    });
  });
  it("importsThroughTheGraphqlApi", async () => {
    const { rt, asked } = await withSites({ [PRINTABLES_API]: { body: { data: { print } } } });
    const got = await importFromLink(rt, "https://www.printables.com/model/3161-3d-benchy");
    expect(got).toMatchObject({ ok: true, value: { site: "Printables", photos: 1, photosSkipped: 0, scaled: null } });
    expect(JSON.parse(String(asked[0]!.init?.body))).toMatchObject({ variables: { id: "3161" } });
  });
});

describe("Thingiverse", () => {
  const thing = { id: 763622, name: "Cable clip", description_html: "<p>A clip.</p>" };
  const images = [
    {
      sizes: [
        { type: "thumb", size: "small", url: "https://cdn.thingiverse.com/assets/small.jpg" },
        { type: "display", size: "large", url: "https://cdn.thingiverse.com/assets/large.jpg" },
      ],
    },
  ];
  it("readsWordsAndPictures: no slicer numbers", () => {
    const d = fromThingiverse(thing, images);
    expect(d.input).toEqual({
      title: "Cable clip",
      description: "A clip.",
      sources: [{ label: "Thingiverse", url: "https://www.thingiverse.com/thing:763622" }],
    });
    expect(d.pictures).toEqual(["https://cdn.thingiverse.com/assets/large.jpg"]);
  });
  it("needsTheTokenAndSendsIt", async () => {
    const pages = { [`${THINGIVERSE_API}/things/763622/images`]: { body: images }, [`${THINGIVERSE_API}/things/763622`]: { body: thing } };
    const without = await withSites(pages);
    expect(await importFromLink(without.rt, "https://www.thingiverse.com/thing:763622")).toMatchObject({ ok: false, reason: "invalid" });
    expect(without.asked).toEqual([]);
    const { rt, asked } = await withSites(pages, { UPLOAD_THINGIVERSE_TOKEN: "tv-token" });
    expect(await importFromLink(rt, "https://www.thingiverse.com/thing:763622")).toMatchObject({ ok: true, value: { photos: 1 } });
    expect(new Headers(asked[0]!.init?.headers).get("authorization")).toBe("Bearer tv-token");
  });
});

describe("importFromLink", () => {
  it("makesADraftWithPhotos: a GIF by its first frame, a missing picture and a foreign host skipped", async () => {
    const { rt, asked } = await withSites({ [MAKERWORLD_API]: { body: design } });
    const got = await importFromLink(rt, "https://makerworld.com/de/models/2872376-esp32");
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value).toMatchObject({ site: "MakerWorld", photos: 2, photosSkipped: 1, scaled: { from: "H2D", factor: A1_FACTOR, to: "Bambu Lab A1" } });
    expect(asked.some((a) => a.url.includes("evil.example"))).toBe(false);
    const p = getPrint(rt, got.value.print.id);
    expect(p.ok && p.value).toMatchObject({ status: "draft", weightGrams: 9 });
    expect(p.ok && p.value.photos).toHaveLength(2);
  });
  it("printOfModel: the same model on any address, but not the print itself", async () => {
    const { rt } = await withSites({ [MAKERWORLD_API]: { body: design } });
    const got = await importFromLink(rt, "https://makerworld.com/en/models/2872376");
    const id = got.ok ? got.value.print.id : "";
    expect(printOfModel(rt, "https://makerworld.com/de/models/2872376-radar#profileId-1")?.id).toBe(id);
    expect(printOfModel(rt, "https://makerworld.com/de/models/2872376", id)).toBeNull();
    expect(printOfModel(rt, "https://makerworld.com/de/models/1")).toBeNull();
  });
  it("refusesTheSameModelTwice", async () => {
    const { rt } = await withSites({ [MAKERWORLD_API]: { body: design } });
    expect((await importFromLink(rt, "https://makerworld.com/en/models/2872376")).ok).toBe(true);
    expect(await importFromLink(rt, "https://makerworld.com/de/models/2872376#profileId-101")).toMatchObject({ ok: false, reason: "conflict" });
  });
  it("makesNothingWhenTheSiteFails: unknown model, an error, another shape", async () => {
    for (const [body, status, reason] of [
      [{}, 404, "not_found"],
      [{}, 503, "invalid"],
      [{ nothing: true }, 200, "invalid"],
    ] as const) {
      const { rt } = await withSites({ [MAKERWORLD_API]: { body, status } });
      expect(await importFromLink(rt, "https://makerworld.com/en/models/5")).toMatchObject({ ok: false, reason });
      expect(listPrints(rt)).toHaveLength(0);
    }
  });
  it("refusesAnotherSitesLinkWithoutAsking", async () => {
    const { rt, asked } = await withSites({});
    expect(await importFromLink(rt, "https://www.example.com/model/1")).toMatchObject({ ok: false, reason: "invalid" });
    expect(asked).toEqual([]);
  });
});
