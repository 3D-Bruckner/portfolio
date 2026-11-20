import { describe, expect, it } from "vitest";
import { SLUG_MAX, SLUG_PATTERN, toSlug } from "./slug";

describe("toSlug", () => {
  it("matches the site's slugs (src/lib/printed.ts in 3dbruckner)", () => {
    expect(toSlug("Zigaretten-Anhänger")).toBe("zigaretten-anhaenger");
    expect(toSlug("Beyblade – Dragoon")).toBe("beyblade-dragoon");
    expect(toSlug("  Größe! ")).toBe("groesse");
    expect(toSlug("ÄÖÜ äöü ß")).toBe("aeoeue-aeoeue-ss");
    expect(toSlug("AMS Lite: Top-Mount (v2)")).toBe("ams-lite-top-mount-v2");
    expect(toSlug("!!!")).toBe("");
  });

  it("capsLongTitles: an address stays at most 80 characters, cut between words", () => {
    const long = "ESP32 Plane Radar – Live ADS-B Flugzeuge auf einem runden GC9A01 Display mit Gehäuse zum Hinstellen oder Aufhängen";
    const slug = toSlug(long);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(slug).toMatch(SLUG_PATTERN);
    expect(long.length).toBeGreaterThan(SLUG_MAX);
    expect(toSlug("a".repeat(120))).toBe("a".repeat(SLUG_MAX));
  });
});
