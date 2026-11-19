import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addPhoto, createPrint, originalFile, type Photo } from "@/backend";
import { testRuntime, type TestRuntime } from "@/backend/testing/runtime";
import { serveOriginal } from "./serve";

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
  // An API token that would be good for the cutout.
  rt.apiCaller = async (req) =>
    req.headers.get("authorization") === "Bearer upl_read" ? { person: "u1", actor: "marcel@example.com", scope: "read", kind: "token" } : null;
});
afterEach(() => rt.store.close());

const get = (headers: Record<string, string> = {}) => new Request(`http://localhost/photos/${photo.id}/original`, { headers });

describe("GET /photos/[id]/original", () => {
  it("serves the original to someone signed in, with its own content type, cached privately for a year", async () => {
    rt.person = async () => ({ id: "u1", email: "marcel@example.com" });
    const r = await serveOriginal(rt, get(), photo.id);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(Buffer.from(await r.arrayBuffer()).equals(readFileSync(originalFile(rt, photo)!.path))).toBe(true);
  });

  it("refuses an API token and anyone not signed in: 401, never cached", async () => {
    for (const headers of [{ authorization: "Bearer upl_read" }, {}] as Record<string, string>[]) {
      const r = await serveOriginal(rt, get(headers), photo.id);
      expect(r.status).toBe(401);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("answers 404 for a photo that doesn't exist, or one without an original", async () => {
    rt.person = async () => ({ id: "u1", email: "marcel@example.com" });
    expect((await serveOriginal(rt, get(), "nope")).status).toBe(404);
    rt.store.insertPhoto({ id: "old", print_id: photo.printId, position: 9, width: 1, height: 1, bytes: 1, sha256: "0", created_at: "" });
    expect((await serveOriginal(rt, get(), "old")).status).toBe(404);
  });
});
