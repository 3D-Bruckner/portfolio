import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const get = (path: string, headers: Record<string, string> = {}) => proxy(new NextRequest(new URL(path, "http://localhost"), { headers }));
const rewrite = (r: Response) => r.headers.get("x-middleware-rewrite");

describe("proxy", () => {
  it("rewrites a page to its language, which no URL carries", () => {
    expect(rewrite(get("/", { "accept-language": "de-DE,de;q=0.9" }))).toBe("http://localhost/de");
    expect(rewrite(get("/prints/abc?x=1", { "accept-language": "en" }))).toBe("http://localhost/en/prints/abc?x=1");
    expect(rewrite(get("/prints"))).toBe("http://localhost/en/prints");
  });

  it("prefers the language picked in the switch (its cookie) over the browser's", () => {
    expect(rewrite(get("/", { "accept-language": "de", cookie: "upload_lang=en" }))).toBe("http://localhost/en");
  });

  it("passes the language on as a request header", () => {
    expect(get("/", { "accept-language": "de" }).headers.get("x-middleware-request-x-upload-lang")).toBe("de");
  });

  it("passes the language on to the route handlers too, whose refusals speak it (a photo upload's)", () => {
    const r = get("/api/prints/abc/photos", { "accept-language": "de", "x-upload-lang": "en" });
    expect(r.headers.get("x-middleware-request-x-upload-lang")).toBe("de");
    expect(rewrite(r)).toBeNull();
  });

  it("leaves the route handlers outside app/[lang] alone", () => {
    for (const path of [
      "/health",
      "/mcp",
      "/api/v1/prints",
      "/api/auth/jwks",
      "/api/language",
      "/photos/abc.jpg",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      const r = get(path, { "accept-language": "de" });
      expect(rewrite(r), path).toBeNull();
      expect(r.headers.get("x-middleware-next"), path).toBe("1");
    }
  });
});
