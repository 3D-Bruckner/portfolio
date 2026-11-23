import { describe, expect, it } from "vitest";
import { copyFor, languageOf, LOCALES, negotiate } from ".";
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

describe("languageOf", () => {
  it("is negotiate over a request's headers: the switch's cookie, then Accept-Language", () => {
    expect(languageOf(new Headers({ cookie: "a=b; portfolio_lang=en", "accept-language": "de" }))).toBe("en");
    expect(languageOf(new Headers({ cookie: "portfolio_lang=fr", "accept-language": "de-AT" }))).toBe("de");
    expect(languageOf(new Headers())).toBe("en");
  });

  it("each language has its sign-in mail, with the link only when there is one", () => {
    for (const lang of LOCALES) {
      const mail = copyFor(lang).mail;
      expect(mail.subject("123456")).toContain("123456");
      expect(mail.body("123456", "https://portfolio.example.com/l")).toContain("https://portfolio.example.com/l");
      expect(mail.body("123456", undefined)).not.toContain("http");
    }
  });
});
