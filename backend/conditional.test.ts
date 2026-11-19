import { describe, expect, it } from "vitest";
import { etagMatches, notModified } from "./conditional";

const TAG = '"abc"';
const req = (ifNoneMatch?: string) => new Request("https://upload.example.com/x", { headers: ifNoneMatch ? { "if-none-match": ifNoneMatch } : {} });
const ok = (headers: Record<string, string> = { etag: TAG, "cache-control": "private, no-cache" }, status = 200) => new Response("bytes", { status, headers });

describe("conditional GETs", () => {
  it("matches a tag in the list, a weak one and *", () => {
    expect(etagMatches(TAG, TAG)).toBe(true);
    expect(etagMatches(`"x", W/${TAG}`, TAG)).toBe(true);
    expect(etagMatches("*", TAG)).toBe(true);
    expect(etagMatches('"abcd"', TAG)).toBe(false);
    expect(etagMatches(null, TAG)).toBe(false);
  });

  it("answers 304 with the ETag and caching only for a 200 whose ETag the request holds", async () => {
    const r = notModified(req(TAG), ok());
    expect(r.status).toBe(304);
    expect(r.headers.get("etag")).toBe(TAG);
    expect(r.headers.get("cache-control")).toBe("private, no-cache");
    expect(await r.text()).toBe("");
    expect(notModified(req('"other"'), ok()).status).toBe(200);
    expect(notModified(req(), ok()).status).toBe(200);
    expect(notModified(req(TAG), ok({})).status).toBe(200);
    expect(notModified(req(TAG), ok({ etag: TAG }, 404)).status).toBe(404);
  });
});
