import { describe, expect, it } from "vitest";
import { toSlug } from "./slug";

describe("toSlug", () => {
  it("matches the site's slugs (src/lib/printed.ts in 3dbruckner)", () => {
    expect(toSlug("Zigaretten-Anhänger")).toBe("zigaretten-anhaenger");
    expect(toSlug("Beyblade – Dragoon")).toBe("beyblade-dragoon");
    expect(toSlug("  Größe! ")).toBe("groesse");
    expect(toSlug("ÄÖÜ äöü ß")).toBe("aeoeue-aeoeue-ss");
    expect(toSlug("AMS Lite: Top-Mount (v2)")).toBe("ams-lite-top-mount-v2");
    expect(toSlug("!!!")).toBe("");
  });
});
