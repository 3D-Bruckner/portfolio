import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addPhoto, createPrint, photoPath, setCrop, type Photo } from "@/backend";
import { testRuntime, type TestRuntime } from "@/backend/testing/runtime";
import { servePhoto } from "./serve";

let rt: TestRuntime;
let photo: Photo;
beforeEach(async () => {
  rt = testRuntime();
  const p = createPrint(rt, { title: "Vase", description: "Eine Vase." });
  if (!p.ok) throw new Error(p.message);
  const path = join(rt.config.dataDir, "in.png");
  await sharp({ create: { width: 300, height: 200, channels: 3, background: "#808080" } })
    .png()
    .toFile(path);
  const added = await addPhoto(rt, p.value.id, { path, type: "image/png" });
  if (!added.ok) throw new Error(added.message);
  photo = added.value;
});
afterEach(() => rt.store.close());

const get = (headers: Record<string, string> = {}) => new Request(`http://localhost/photos/${photo.id}`, { headers });

describe("GET /photos/[id]", () => {
  it("serves the cutout to someone signed in, kept privately but asked for again each time (a new crop changes it)", async () => {
    rt.person = async () => ({ id: "u1", email: "marcel@example.com" });
    const r = await servePhoto(rt, get(), photo.id);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toBe("private, no-cache");
    expect(r.headers.get("etag")).toBe(`"${photo.sha256}"`);
    expect(Buffer.from(await r.arrayBuffer()).equals(readFileSync(photoPath(rt, photo)))).toBe(true);
  });

  it("answers 304 while the browser's copy is the current cutout, 200 with the new one after a new crop", async () => {
    rt.person = async () => ({ id: "u1", email: "marcel@example.com" });
    const same = await servePhoto(rt, get({ "if-none-match": `"${photo.sha256}"` }), photo.id);
    expect(same.status).toBe(304);
    expect(same.headers.get("etag")).toBe(`"${photo.sha256}"`);
    const cropped = await setCrop(rt, photo.id, { left: 0, top: 0, width: 100, height: 100 });
    if (!cropped.ok) throw new Error(cropped.message);
    const changed = await servePhoto(rt, get({ "if-none-match": `"${photo.sha256}"` }), photo.id);
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).toBe(`"${cropped.value.sha256}"`);
  });

  it("serves it to an API token (a read one is enough)", async () => {
    rt.apiCaller = async (req) =>
      req.headers.get("authorization") === "Bearer upl_read" ? { person: "u1", actor: "marcel@example.com", scope: "read" } : null;
    expect((await servePhoto(rt, get({ authorization: "Bearer upl_read" }), photo.id)).status).toBe(200);
    expect((await servePhoto(rt, get({ authorization: "Bearer upl_wrong" }), photo.id)).status).toBe(401);
  });

  it("answers 401 to anyone else, never cached", async () => {
    const r = await servePhoto(rt, get(), photo.id);
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 404 for a photo that doesn't exist", async () => {
    rt.person = async () => ({ id: "u1", email: "marcel@example.com" });
    expect((await servePhoto(rt, get(), "nope")).status).toBe(404);
  });
});
