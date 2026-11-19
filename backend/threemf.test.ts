import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { suggestedPrice } from "./pricing";
import { bytesSource, plainText, readThreeMf, type ByteSource } from "./threemf";

const MODEL = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Application">BambuStudio-02.03.00.70</metadata>
 <metadata name="Title">ESP32 Plane Radar &amp; Display</metadata>
 <metadata name="Designer">someone</metadata>
 <metadata name="DesignModelId">2872376</metadata>
 <metadata name="Description">&lt;p&gt;Live ADS-B on a &lt;b&gt;round&lt;/b&gt; display.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;ESP32&lt;/li&gt;&lt;li&gt;GC9A01&lt;/li&gt;&lt;/ul&gt;</metadata>
 <resources/><build/>
</model>`;

const plate = (index: number, seconds: number, grams: number, filaments: string) => `<plate>
  <metadata key="index" value="${index}"/>
  <metadata key="prediction" value="${seconds}"/>
  <metadata key="weight" value="${grams}"/>
  ${filaments}
 </plate>`;

const SLICE = `<?xml version="1.0" encoding="UTF-8"?>
<config>
 <header><header_item key="X-BBL-Client-Type" value="slicer"/></header>
 ${plate(1, 5400, 30.4, `<filament id="1" tray_info_idx="GFA00" type="PLA" color="#FFFFFF" used_m="9.1" used_g="27.2"/><filament id="4" type="PLA" color="#000000" used_m="1.0" used_g="3.2"/>`)}
 ${plate(2, 1200, 8.1, `<filament id="1" type="PLA" color="#ffffff" used_m="2.7" used_g="8.1"/><filament id="2" type="PLA" color="#FF0000" used_m="0" used_g="0"/>`)}
</config>`;

function threeMf(files: Record<string, string>, gcodeBytes = 0): Uint8Array {
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = { "[Content_Types].xml": strToU8("<Types/>") };
  for (const [name, content] of Object.entries(files)) entries[name] = strToU8(content);
  // The G-code a sliced file carries: large, stored, never read.
  if (gcodeBytes) entries["Metadata/plate_1.gcode"] = [new Uint8Array(gcodeBytes).fill(59), { level: 0 }];
  return zipSync(entries);
}

/** A source that counts what is read. */
function counted(bytes: Uint8Array): ByteSource & { readBytes: number } {
  const s = bytesSource(bytes);
  const c = { size: s.size, readBytes: 0, read: async (o: number, l: number) => ((c.readBytes += l), s.read(o, l)) };
  return c;
}

describe("readThreeMf", () => {
  it("readsSlicedTotals: time and weight summed over the plates, colours by colour, the price the site would show", async () => {
    const got = await readThreeMf(bytesSource(threeMf({ "Metadata/slice_info.config": SLICE, "3D/3dmodel.model": MODEL })));
    expect(got).toEqual({
      ok: true,
      value: {
        sliced: true,
        plates: 2,
        printTimeMinutes: 110,
        weightGrams: 39,
        colors: 2,
        filaments: [
          { type: "PLA", color: "#FFFFFF", grams: 35.3 },
          { type: "PLA", color: "#000000", grams: 3.2 },
        ],
        price: suggestedPrice({ weightGrams: 39, printTimeMinutes: 110, multicolor: true, material: "PLA" }),
        title: "ESP32 Plane Radar & Display",
        description: "Live ADS-B on a round display.\n\n• ESP32\n• GC9A01",
        designer: "someone",
        source: { label: "MakerWorld", url: "https://makerworld.com/en/models/2872376" },
      },
    });
  });

  it("readsOnlyWhatItNeeds: a file with megabytes of G-code is read a few kilobytes at a time", async () => {
    const src = counted(threeMf({ "Metadata/slice_info.config": SLICE, "3D/3dmodel.model": MODEL }, 5 * 1024 * 1024));
    expect((await readThreeMf(src)).ok).toBe(true);
    expect(src.size).toBeGreaterThan(5 * 1024 * 1024);
    expect(src.readBytes).toBeLessThan(80 * 1024);
  });

  it("projectWithoutSlicing: the model's words, no totals", async () => {
    const got = await readThreeMf(bytesSource(threeMf({ "3D/3dmodel.model": MODEL })));
    expect(got.ok && got.value).toMatchObject({ sliced: false, plates: 0, filaments: [], title: "ESP32 Plane Radar & Display" });
    expect(got.ok && "printTimeMinutes" in got.value).toBe(false);
    expect(got.ok && "price" in got.value).toBe(false);
  });

  it("oneColourPetg: no colour count for a single colour, PETG priced as PETG", async () => {
    const slice = `<config>${plate(1, 3600, 100, `<filament id="1" type="PETG HF" color="#00FF00" used_g="100"/>`)}</config>`;
    const got = await readThreeMf(bytesSource(threeMf({ "Metadata/slice_info.config": slice })));
    expect(got.ok && got.value).toMatchObject({ sliced: true, printTimeMinutes: 60, weightGrams: 100, price: 8 });
    expect(got.ok && "colors" in got.value).toBe(false);
  });

  it("refusesWhatIsNot3mf: a JPEG, an empty file and a zip without a model", async () => {
    expect(await readThreeMf(bytesSource(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])))).toEqual({ ok: false, reason: "not_3mf" });
    expect(await readThreeMf(bytesSource(new Uint8Array()))).toEqual({ ok: false, reason: "not_3mf" });
    expect(await readThreeMf(bytesSource(zipSync({ "a.txt": strToU8("hi") })))).toEqual({ ok: false, reason: "not_3mf" });
  });

  it("refusesHugeEntry: a slice_info that claims to be enormous is not inflated", async () => {
    const big = threeMf({ "Metadata/slice_info.config": `<config>${"<!-- x -->".repeat(1_000_000)}</config>` });
    expect(await readThreeMf(bytesSource(big))).toEqual({ ok: false, reason: "unreadable" });
  });

  it("onePartTooLarge: a model too large to read still leaves the slicer's numbers", async () => {
    const file = threeMf({ "Metadata/slice_info.config": SLICE, "3D/3dmodel.model": `<model>${"<vertex/>".repeat(1_000_000)}</model>` });
    const got = await readThreeMf(bytesSource(file));
    expect(got.ok && got.value).toMatchObject({ sliced: true, printTimeMinutes: 110, weightGrams: 39 });
    expect(got.ok && "title" in got.value).toBe(false);
  });
});

describe("plainText", () => {
  it("keepsParagraphs: tags and entities go, paragraphs and lists stay readable", () => {
    expect(plainText("<p>One&nbsp;line<br>two</p><p>Next &amp; last</p>")).toBe("One line\ntwo\n\nNext & last");
    // Markup written as entities, or left half-open, comes out as text without angle brackets.
    expect(plainText("&lt;script&gt;alert(1)&lt;/script&gt; <scr<script>ipt>x")).toBe("scriptalert(1)/script iptx");
  });
});

describe("suggestedPrice", () => {
  it("matchesTheSite: 3dbruckner's formula, rounded to whole euros", () => {
    // 50 g PLA (2.25 €) + 2 h (2 €) + 2 € fee = 6.25 → 6; multi-colour: (4.25 × 1.1) + 2 = 6.675 → 7.
    expect(suggestedPrice({ weightGrams: 50, printTimeMinutes: 120, multicolor: false, material: "PLA" })).toBe(6);
    expect(suggestedPrice({ weightGrams: 50, printTimeMinutes: 120, multicolor: true, material: "PLA" })).toBe(7);
  });
});
