import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Outcome } from "./outcome";
import { addPhoto, deletePhoto, getPhoto, photoPath, reorderPhotos, setCover, type Photo } from "./photos";
import { createPrint, getPrint, publishPrint, type Print } from "./prints";
import { testRuntime, type TestRuntime } from "./testing/runtime";

const FIXTURE = join(import.meta.dirname, "fixtures", "gps-rotated.jpg");

let rt: TestRuntime;
let tmp: string;
beforeEach(() => {
  rt = testRuntime();
  tmp = mkdtempSync(join(process.env.DATA_DIR!, "upload-"));
});
afterEach(() => rt.store.close());

function value<T>(o: Outcome<T>): T {
  if (!o.ok) throw new Error(`expected ok, got ${o.reason}: ${o.message}`);
  return o.value;
}

const draft = (title = "Vase"): Print => value(createPrint(rt, { title, description: `About ${title}.` }));
const print = (id: string): Print => value(getPrint(rt, id));

let n = 0;
/** An image file as the request's temporary file would hold it. */
async function image(width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg"): Promise<string> {
  const path = join(tmp, `in-${++n}`);
  await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 30 } } })
    .toFormat(format)
    .toFile(path);
  return path;
}

const jpeg = async (printId: string) => value(await addPhoto(rt, printId, { path: await image(800, 600), type: "image/jpeg" }));

/** The files under DATA_DIR/photos/, wherever they are. */
const photoFiles = (): string[] => {
  const root = join(rt.config.dataDir, "photos");
  return existsSync(root)
    ? readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
    : [];
};

describe("addPhoto", () => {
  it("stripsMetadataAndRotates: turns the photo upright, caps the long edge at 2400 px and keeps no metadata", async () => {
    const before = await sharp(FIXTURE).metadata();
    expect(before).toMatchObject({ width: 4000, height: 3000, orientation: 6 });
    expect(before.exif).toBeDefined();
    expect(before.icc).toBeDefined();

    const p = draft();
    const photo = value(await addPhoto(rt, p.id, { path: FIXTURE, type: "image/jpeg" }));
    expect(photo).toMatchObject({ printId: p.id, width: 1800, height: 2400, position: 1 });

    const stored = photoPath(rt, photo);
    expect(stored).toBe(join(rt.config.dataDir, "photos", p.id, `${photo.id}.jpg`));
    const m = await sharp(stored).metadata();
    expect(m).toMatchObject({ format: "jpeg", width: 1800, height: 2400 });
    expect(m.exif).toBeUndefined();
    expect(m.icc).toBeUndefined();
    expect(m.xmp).toBeUndefined();
    expect(m.iptc).toBeUndefined();
    expect(m.orientation).toBeUndefined();
    // No GPS anywhere in the file, not only in what sharp parses.
    expect(readFileSync(stored).includes("Exif")).toBe(false);
    // The fixture's red corner was stored top-left; turned 90° clockwise, it is top-right.
    const { data } = await sharp(stored).extract({ left: 1790, top: 5, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(200);
    expect(data[2]).toBeLessThan(60);
    // The original stays where the request left it; it is the request's to remove.
    expect(existsSync(FIXTURE)).toBe(true);
  });

  it("neverEnlarges: an 800×600 photo stays 800×600", async () => {
    const photo = await jpeg(draft().id);
    expect(photo).toMatchObject({ width: 800, height: 600 });
    expect(await sharp(photoPath(rt, photo)).metadata()).toMatchObject({ format: "jpeg", width: 800, height: 600 });
  });

  it("takes PNG and WebP, stored as JPEG", async () => {
    const p = draft();
    for (const format of ["png", "webp"] as const) {
      const photo = value(await addPhoto(rt, p.id, { path: await image(500, 400, format), type: `image/${format}` }));
      expect(await sharp(photoPath(rt, photo)).metadata()).toMatchObject({ format: "jpeg", width: 500, height: 400 });
    }
  });

  it("refusesHeic: a HEIC photo is refused as invalid, asking for a JPEG", async () => {
    const p = draft();
    const o = await addPhoto(rt, p.id, { path: await image(100, 100), type: "image/heic" });
    expect(o).toMatchObject({ ok: false, reason: "invalid" });
    if (!o.ok) expect(o.message).toContain("JPEG");
    expect(print(p.id).photos).toEqual([]);
    expect(photoFiles()).toEqual([]);
  });

  it("refusesNonImage: text declared as a JPEG is refused as invalid", async () => {
    const p = draft();
    const path = join(tmp, "not-a-photo");
    writeFileSync(path, "this is not a photo\n".repeat(50));
    expect(await addPhoto(rt, p.id, { path, type: "image/jpeg" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(print(p.id).photos).toEqual([]);
    expect(photoFiles()).toEqual([]);
  });

  it("refusesOtherDecodedFormats: an SVG declared as a JPEG is refused by what it is, not what it claims", async () => {
    const p = draft();
    const path = join(tmp, "drawing");
    writeFileSync(path, '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c50"/></svg>');
    expect((await sharp(path).metadata()).format).toBe("svg");
    expect(await addPhoto(rt, p.id, { path, type: "image/jpeg" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(print(p.id).photos).toEqual([]);
    expect(photoFiles()).toEqual([]);
  });

  it("a failed upload leaves the print's folder alone, so another upload to the same print can still write into it", async () => {
    const p = draft();
    const dir = join(rt.config.dataDir, "photos", p.id);
    mkdirSync(dir, { recursive: true });
    const path = join(tmp, "not-a-photo-either");
    writeFileSync(path, "nope\n".repeat(50));
    expect(await addPhoto(rt, p.id, { path, type: "image/jpeg" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(existsSync(dir)).toBe(true);
    // Two at once, one failing: the good one is stored.
    const [good, bad] = await Promise.all([
      addPhoto(rt, p.id, { path: await image(800, 600), type: "image/jpeg" }),
      addPhoto(rt, p.id, { path, type: "image/jpeg" }),
    ]);
    expect([good.ok, bad.ok]).toEqual([true, false]);
    expect(photoFiles()).toHaveLength(1);
  });

  it("refuses a photo cut off halfway (the upload broke off): invalid, and nothing stays", async () => {
    const p = draft();
    const whole = readFileSync(FIXTURE);
    const path = join(tmp, "cut-off");
    writeFileSync(path, whole.subarray(0, Math.floor(whole.length / 2)));
    expect(await addPhoto(rt, p.id, { path, type: "image/jpeg" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(print(p.id).photos).toEqual([]);
    expect(photoFiles()).toEqual([]);
  });

  it("abortedUploadLeavesNothing: when storing fails after processing, no row and no file stay", async () => {
    const p = draft();
    vi.spyOn(rt.store, "insertPhoto").mockImplementation(() => {
      throw new Error("disk gone");
    });
    await expect(addPhoto(rt, p.id, { path: await image(800, 600), type: "image/jpeg" })).rejects.toThrow("disk gone");
    expect(rt.store.photosOf([p.id])).toEqual([]);
    expect(print(p.id).coverPhotoId).toBeNull();
    expect(photoFiles()).toEqual([]);
  });

  it("refuses a print that doesn't exist, leaving nothing", async () => {
    expect(await addPhoto(rt, "nope", { path: await image(10, 10), type: "image/jpeg" })).toMatchObject({ ok: false, reason: "not_found" });
    expect(photoFiles()).toEqual([]);
  });

  it("sha256MatchesStoredBytes: the hash and the size are the stored file's", async () => {
    const photo = value(await addPhoto(rt, draft().id, { path: FIXTURE, type: "image/jpeg" }));
    const bytes = readFileSync(photoPath(rt, photo));
    expect(photo.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(photo.bytes).toBe(bytes.length);
    expect(value(getPhoto(rt, photo.id))).toEqual(photo);
  });

  it("firstPhotoIsCover: the first photo becomes the cover, later ones go after it", async () => {
    const p = draft();
    const first = await jpeg(p.id);
    const second = await jpeg(p.id);
    const got = print(p.id);
    expect(got.coverPhotoId).toBe(first.id);
    expect(got.photos.map((ph) => ph.id)).toEqual([first.id, second.id]);
    expect(second.position).toBeGreaterThan(first.position);
  });
});

describe("deletePhoto", () => {
  it("deletingCoverMovesCover: the first remaining photo becomes the cover", async () => {
    const p = draft();
    const [a, b, c] = [await jpeg(p.id), await jpeg(p.id), await jpeg(p.id)];
    value(reorderPhotos(rt, p.id, [c.id, a.id, b.id]));
    value(deletePhoto(rt, a.id));
    expect(print(p.id)).toMatchObject({ coverPhotoId: c.id });
    expect(print(p.id).photos.map((ph) => ph.id)).toEqual([c.id, b.id]);
    expect(existsSync(photoPath(rt, a))).toBe(false);
    expect(existsSync(photoPath(rt, b))).toBe(true);
  });

  it("a file that can't be removed after the delete is logged; the photo is gone all the same", async () => {
    const p = draft();
    const [a, b] = [await jpeg(p.id), await jpeg(p.id)];
    // A directory where the file was: removing it without recursion throws.
    rmSync(photoPath(rt, a));
    mkdirSync(join(photoPath(rt, a), "x"), { recursive: true });
    const logged = vi.spyOn(rt.log, "error").mockImplementation(() => {});
    try {
      expect(deletePhoto(rt, a.id)).toMatchObject({ ok: true });
      expect(print(p.id).photos.map((ph) => ph.id)).toEqual([b.id]);
      expect(logged).toHaveBeenCalledWith(expect.objectContaining({ photoId: a.id }), expect.stringContaining("photo file"));
    } finally {
      logged.mockRestore();
    }
  });

  it("leaves no cover when the last photo of a draft goes", async () => {
    const p = draft();
    const a = await jpeg(p.id);
    value(deletePhoto(rt, a.id));
    expect(print(p.id)).toMatchObject({ coverPhotoId: null, photos: [] });
    expect(photoFiles()).toEqual([]);
  });

  it("refuses to take the last photo off a published print", async () => {
    const p = draft();
    const a = await jpeg(p.id);
    value(publishPrint(rt, p.id));
    const o = deletePhoto(rt, a.id);
    expect(o).toMatchObject({ ok: false, reason: "conflict" });
    expect(existsSync(photoPath(rt, a))).toBe(true);
  });

  it("refuses a photo that doesn't exist", () => {
    expect(deletePhoto(rt, "nope")).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("reorderPhotos", () => {
  it("puts the photos in the given order; the cover stays", async () => {
    const p = draft();
    const [a, b, c] = [await jpeg(p.id), await jpeg(p.id), await jpeg(p.id)];
    value(reorderPhotos(rt, p.id, [b.id, c.id, a.id]));
    expect(print(p.id).photos.map((ph) => ph.id)).toEqual([b.id, c.id, a.id]);
    expect(print(p.id).coverPhotoId).toBe(a.id);
  });

  it("reorderMustNameEveryPhoto: refuses a list that leaves one out, repeats one or names another print's", async () => {
    const p = draft();
    const [a, b] = [await jpeg(p.id), await jpeg(p.id)];
    const other = await jpeg(draft("Becher").id);
    for (const ids of [[a.id], [a.id, a.id], [a.id, b.id, other.id], [a.id, other.id], []])
      expect(reorderPhotos(rt, p.id, ids), ids.join(",")).toMatchObject({ ok: false, reason: "invalid" });
    expect(print(p.id).photos.map((ph) => ph.id)).toEqual([a.id, b.id]);
    expect(reorderPhotos(rt, "nope", [])).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("setCover", () => {
  it("makes one of the print's photos its cover", async () => {
    const p = draft();
    const [, b] = [await jpeg(p.id), await jpeg(p.id)];
    value(setCover(rt, p.id, b.id));
    expect(print(p.id).coverPhotoId).toBe(b.id);
  });

  it("refuses another print's photo, and an unknown print or photo", async () => {
    const p = draft();
    await jpeg(p.id);
    const other = await jpeg(draft("Becher").id);
    expect(setCover(rt, p.id, other.id)).toMatchObject({ ok: false, reason: "not_found" });
    expect(setCover(rt, p.id, "nope")).toMatchObject({ ok: false, reason: "not_found" });
    expect(setCover(rt, "nope", other.id)).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("site changes", () => {
  it("changes to a published print's photos call onSiteChange, once each; a draft's don't", async () => {
    const d = draft("Entwurf");
    const [d1, d2] = [await jpeg(d.id), await jpeg(d.id)];
    value(reorderPhotos(rt, d.id, [d2.id, d1.id]));
    value(setCover(rt, d.id, d2.id));
    value(deletePhoto(rt, d1.id));
    expect(rt.siteChanges).toBe(0);

    const p = draft();
    const a = await jpeg(p.id);
    value(publishPrint(rt, p.id));
    const count = () => rt.siteChanges;
    let before = count();
    const b: Photo = await jpeg(p.id);
    expect(count()).toBe(before + 1);
    before = count();
    value(reorderPhotos(rt, p.id, [b.id, a.id]));
    expect(count()).toBe(before + 1);
    before = count();
    value(setCover(rt, p.id, b.id));
    expect(count()).toBe(before + 1);
    before = count();
    value(deletePhoto(rt, a.id));
    expect(count()).toBe(before + 1);
    // A refusal is no change.
    before = count();
    expect(deletePhoto(rt, b.id)).toMatchObject({ ok: false });
    expect(count()).toBe(before);
  });
});
