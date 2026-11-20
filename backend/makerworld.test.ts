// The MakerWorld import with a fake MakerWorld (rt.fetch): never the real one.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { draftFrom, importFromMakerWorld, makerWorldLink, MAKERWORLD_API } from "./makerworld";
import { getPrint, listPrints } from "./prints";
import { testRuntime } from "./testing/runtime";

const PIC = (name: string) => `https://makerworld.bblmw.com/makerworld/model/X/design/${name}`;

const design = {
  id: 2872376,
  title: "ESP32 Plane Radar — Live ADS-B on a Round Display",
  summary:
    "<boostme><boosttitle>Boost Me</boosttitle><boostcontent>Boost for more!</boostcontent></boostme><h2>ESP32 C3 Plane Radar</h2><p>Shows planes &amp; more.</p><ul><li>ESP32</li><li>GC9A01</li></ul>",
  designCreator: { name: "someone" },
  coverUrl: PIC("cover.gif"),
  defaultInstanceId: 2,
  designExtension: { design_pictures: [{ url: PIC("a.png") }, { url: PIC("b.gif") }], real_pictures: [{ url: "https://evil.example/x.jpg" }] },
  instances: [
    { id: 1, profileId: 101, title: "PETG", prediction: 3600, weight: 100, instanceFilaments: [{ type: "PETG", color: "#C0C0C0", usedG: "100" }] },
    {
      id: 2,
      profileId: 102,
      title: "0.2mm layer, 3 walls",
      prediction: 2081,
      weight: 9,
      instanceFilaments: [
        { type: "PLA", color: "#161616", usedG: "8" },
        { type: "PLA", color: "#FFFFFF", usedG: "1" },
        { type: "PLA", color: "#FF0000", usedG: "0" },
      ],
      pictures: [{ url: PIC("a.png") }],
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

/** A runtime whose MakerWorld answers `answer` for the design and pictures by name; every request is recorded. */
async function withMakerWorld(answer: unknown = design, status = 200) {
  const rt = testRuntime();
  const asked: string[] = [];
  const images: Record<string, Buffer> = { [PIC("a.png")]: await png(), [PIC("b.gif")]: await gif() };
  rt.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    asked.push(u);
    if (u.startsWith(MAKERWORLD_API)) return new Response(JSON.stringify(answer), { status });
    const img = images[u];
    return img ? new Response(new Uint8Array(img)) : new Response("gone", { status: 404 });
  }) as typeof fetch;
  return { rt, asked };
}

describe("makerWorldLink", () => {
  it("readsTheModelAndProfile: with or without language, slug and profile", () => {
    expect(makerWorldLink("https://makerworld.com/de/models/2872376-esp32-plane-radar#profileId-3207083")).toEqual({ designId: 2872376, profileId: 3207083 });
    expect(makerWorldLink(" https://makerworld.com/en/models/123 ")).toEqual({ designId: 123, profileId: null });
    expect(makerWorldLink("https://makerworld.com/models/123")).toEqual({ designId: 123, profileId: null });
  });
  it("refusesOtherAddresses", () => {
    for (const s of ["http://makerworld.com/en/models/1", "https://makerworld.com.evil/en/models/1", "https://makerworld.com/en/u/1", "kein link", ""])
      expect(makerWorldLink(s)).toBeNull();
  });
});

describe("draftFrom", () => {
  it("fillsFromTheDefaultProfile: words, source, numbers, price; only MakerWorld's own pictures, each once", () => {
    const d = draftFrom(design, null);
    expect(d.profile).toBe("0.2mm layer, 3 walls");
    expect(d.input).toMatchObject({
      title: "ESP32 Plane Radar — Live ADS-B on a Round Display",
      sources: [{ label: "MakerWorld", url: "https://makerworld.com/en/models/2872376" }],
      printTimeMinutes: 35,
      weightGrams: 9,
      colors: 2,
    });
    expect(d.input.description).not.toContain("Boost");
    expect(d.input.description).toContain("Shows planes & more.");
    expect(d.input.description).toContain("• ESP32");
    expect(d.input.price).toBeGreaterThan(0);
    expect(d.pictures).toEqual([PIC("a.png"), PIC("b.gif"), PIC("cover.gif")]);
  });
  it("takesTheLinkedProfile: by its id or profile id", () => {
    expect(draftFrom(design, 101).input).toMatchObject({ printTimeMinutes: 60, weightGrams: 100 });
    expect(draftFrom(design, 1).profile).toBe("PETG");
    expect("colors" in draftFrom(design, 1).input).toBe(false);
  });
});

describe("importFromMakerWorld", () => {
  it("makesADraftWithPhotos: a GIF by its first frame, a missing picture skipped", async () => {
    const { rt } = await withMakerWorld();
    const got = await importFromMakerWorld(rt, "https://makerworld.com/de/models/2872376-esp32");
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value).toMatchObject({ photos: 2, photosSkipped: 1, profile: "0.2mm layer, 3 walls" });
    const p = getPrint(rt, got.value.print.id);
    expect(p.ok && p.value).toMatchObject({ status: "draft", weightGrams: 9, printTimeMinutes: 35 });
    expect(p.ok && p.value.photos).toHaveLength(2);
  });
  it("refusesTheSameModelTwice", async () => {
    const { rt } = await withMakerWorld();
    expect((await importFromMakerWorld(rt, "https://makerworld.com/en/models/2872376")).ok).toBe(true);
    const again = await importFromMakerWorld(rt, "https://makerworld.com/de/models/2872376#profileId-101");
    expect(again).toMatchObject({ ok: false, reason: "conflict" });
  });
  it("makesNothingWhenMakerWorldFails: unknown model, an error, another shape", async () => {
    for (const [answer, status, reason] of [
      [{}, 404, "not_found"],
      [{}, 503, "invalid"],
      [{ nothing: true }, 200, "invalid"],
    ] as const) {
      const { rt } = await withMakerWorld(answer, status);
      expect(await importFromMakerWorld(rt, "https://makerworld.com/en/models/5")).toMatchObject({ ok: false, reason });
      expect(listPrints(rt)).toHaveLength(0);
    }
  });
  it("refusesANonMakerWorldLinkWithoutAsking", async () => {
    const { rt, asked } = await withMakerWorld();
    expect(await importFromMakerWorld(rt, "https://www.printables.com/model/1")).toMatchObject({ ok: false, reason: "invalid" });
    expect(asked).toEqual([]);
  });
});
