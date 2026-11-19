import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPrint, getPrint, type Print } from "@/backend";
import { testRuntime, type TestRuntime } from "@/backend/testing/runtime";
import { uploadPhoto } from "./upload";

const FIXTURE = readFileSync(join(process.cwd(), "backend", "fixtures", "gps-rotated.jpg"));
const MARCEL = { id: "u1", email: "marcel@example.com" };

let rt: TestRuntime;
let print: Print;
beforeEach(() => {
  rt = testRuntime();
  rt.person = async () => MARCEL;
  const p = createPrint(rt, { title: "Vase", description: "Eine Vase." });
  if (!p.ok) throw new Error(p.message);
  print = p.value;
});
afterEach(() => rt.store.close());

/** The multipart post a browser's form sends, with one file and German or English asked for (as proxy.ts passes it on). */
async function post(file: File | null, lang = "de", init: RequestInit = {}): Promise<Request> {
  const fd = new FormData();
  if (file) fd.append("photo", file);
  const encoded = new Response(fd);
  return new Request("http://localhost/api/prints/x/photos", {
    method: "POST",
    body: await encoded.arrayBuffer(),
    headers: { "content-type": encoded.headers.get("content-type")!, "x-upload-lang": lang },
    ...init,
  });
}

const photoFile = (type = "image/jpeg", name = "IMG_0001.jpg") => new File([FIXTURE], name, { type });
const answer = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });
const storedFiles = () => {
  const dir = join(rt.config.dataDir, "photos", print.id);
  return existsSync(dir) ? readdirSync(dir) : [];
};

describe("POST /api/prints/[id]/photos", () => {
  it("stores the photo and answers 201 with it", async () => {
    const { status, body } = await answer(await uploadPhoto(rt, await post(photoFile()), print.id));
    expect(status).toBe(201);
    expect(body).toMatchObject({ printId: print.id, width: 1800, height: 2400 });
    const got = getPrint(rt, print.id);
    expect(got.ok && got.value.coverPhotoId).toBe(body.id);
    expect(storedFiles().sort()).toEqual([`${body.id}.jpg`, `${body.id}.orig.jpg`]);
  });

  it("refusesHeic: answers 400 with „Bitte als JPEG hochladen“, in English for an English page", async () => {
    expect(await answer(await uploadPhoto(rt, await post(photoFile("image/heic", "IMG_0001.HEIC")), print.id))).toEqual({
      status: 400,
      body: { error: "Bitte als JPEG hochladen" },
    });
    expect(await answer(await uploadPhoto(rt, await post(photoFile("image/heic", "IMG_0001.HEIC"), "en"), print.id))).toEqual({
      status: 400,
      body: { error: "Please upload it as a JPEG" },
    });
    expect(storedFiles()).toEqual([]);
  });

  it("refuses text declared as a JPEG, in German", async () => {
    const r = await answer(await uploadPhoto(rt, await post(new File(["not a photo"], "a.jpg", { type: "image/jpeg" })), print.id));
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("Bitte als JPEG hochladen");
    expect(storedFiles()).toEqual([]);
  });

  it("answers 413 for a photo over UPLOAD_MAX_PHOTO_MB", async () => {
    rt.config.maxPhotoMb = 1;
    const big = new File([new Uint8Array(1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    expect(await answer(await uploadPhoto(rt, await post(big), print.id))).toEqual({ status: 413, body: { error: "Dieses Foto ist zu groß." } });
  });

  it("refuses a post with no photo, or with two", async () => {
    expect((await uploadPhoto(rt, await post(null), print.id)).status).toBe(400);
    const fd = new FormData();
    fd.append("photo", photoFile());
    fd.append("photo", photoFile());
    const encoded = new Response(fd);
    const two = new Request("http://localhost/x", {
      method: "POST",
      body: await encoded.arrayBuffer(),
      headers: { "content-type": encoded.headers.get("content-type")! },
    });
    expect((await uploadPhoto(rt, two, print.id)).status).toBe(400);
    expect(storedFiles()).toEqual([]);
  });

  it("answers 404 for a print that doesn't exist", async () => {
    expect(await answer(await uploadPhoto(rt, await post(photoFile()), "nope"))).toEqual({
      status: 404,
      body: { error: "Diesen Druck gibt es nicht (mehr)." },
    });
  });

  it("answers 401 to someone not signed in, storing nothing", async () => {
    rt.person = async () => null;
    expect(await answer(await uploadPhoto(rt, await post(photoFile()), print.id))).toEqual({ status: 401, body: { error: "Bitte zuerst anmelden." } });
    expect(storedFiles()).toEqual([]);
  });

  it("a phone losing its connection halfway: that photo fails with a German message, nothing stays, and it can be sent again", async () => {
    const whole = new Uint8Array(await (await post(photoFile())).arrayBuffer());
    const ct = (await post(photoFile())).headers.get("content-type")!;
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(c) {
        if (sent < whole.length / 2) {
          c.enqueue(whole.subarray(sent, sent + 8192));
          sent += 8192;
          await new Promise((r) => setTimeout(r, 1));
        } else c.error(new Error("connection reset"));
      },
    });
    const broken = new Request("http://localhost/x", {
      method: "POST",
      body,
      headers: { "content-type": ct, "x-upload-lang": "de" },
      duplex: "half",
    } as RequestInit);
    expect(await answer(await uploadPhoto(rt, broken, print.id))).toEqual({
      status: 400,
      body: { error: "Das Foto kam nicht vollständig an. Bitte noch einmal versuchen." },
    });
    expect(rt.store.photosOf([print.id])).toEqual([]);
    expect(storedFiles()).toEqual([]);

    expect((await uploadPhoto(rt, await post(photoFile()), print.id)).status).toBe(201);
    expect(rt.store.photosOf([print.id])).toHaveLength(1);
  });
});
