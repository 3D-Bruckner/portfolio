import { describe, expect, it } from "vitest";
import { copyFor, LOCALES, negotiate } from ".";
import { de } from "./de";
import { en } from "./en";

describe("negotiate", () => {
  it("takes the picked language first", () => {
    expect(negotiate("en", "de-DE,de;q=0.9")).toBe("en");
    expect(negotiate("de", "en")).toBe("de");
  });

  it("ignores a picked language the UI doesn't speak", () => {
    expect(negotiate("fr", "de")).toBe("de");
  });

  it("then the browser's Accept-Language by weight, a region matching its language", () => {
    expect(negotiate(undefined, "de-AT,de;q=0.9,en;q=0.8")).toBe("de");
    expect(negotiate(undefined, "fr;q=1, en;q=0.5, de;q=0.7")).toBe("de");
    expect(negotiate(undefined, "de;q=0, en")).toBe("en");
  });

  it("else English", () => {
    expect(negotiate(undefined, null)).toBe("en");
    expect(negotiate(undefined, "fr, es")).toBe("en");
  });
});

describe("the copy modules", () => {
  it("speak English and German", () => {
    expect(LOCALES).toEqual(["en", "de"]);
    expect(copyFor("de")).toBe(de);
    expect(copyFor("xx")).toBe(en);
  });
});
