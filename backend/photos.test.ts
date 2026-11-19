import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Outcome } from "./outcome";
import { addPhoto, deletePhoto, getPhoto, originalPath, photoPath, reorderPhotos, setCover, setCrop, type Photo } from "./photos";
import { createPrint, getPrint, publishPrint, type Print } from "./prints";
import { seedPhoto, testRuntime, type TestRuntime } from "./testing/runtime";

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

/** A JPEG's bytes from its first SOS marker on: the entropy-coded scans and EOI. */
function fromFirstSos(jpeg: Buffer): Buffer {
  let pos = 2;
  while (jpeg[pos + 1] !== 0xda) pos += 2 + jpeg.readUInt16BE(pos + 2);
  return jpeg.subarray(pos);
}

describe("addPhoto", () => {
  it("stripsMetadataAndRotates: turns the photo upright, caps the long edge at 2400 px and keeps no metadata", async () => {
    const before = await sharp(FIXTURE).metadata();
    expect(before).toMatchObject({ width: 4000, height: 3000, orientation: 6 });
    expect(before.exif).toBeDefined();
    expect(before.icc).toBeDefined();

    const p = draft();
    const photo = value(await addPhoto(rt, p.id, { path: FIXTURE, type: "image/jpeg" }));
    expect(photo).toMatchObject({ printId: p.id, width: 1800, height: 2400, position: 1, original: { width: 4000, height: 3000 }, crop: null });

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
    expect(photoFiles()).toHaveLength(2);
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

  it("originalKeptWithoutMetadata: the JPEG's image data is kept byte for byte, with its orientation and colour profile and nothing else", async () => {
    const p = draft();
    const photo = value(await addPhoto(rt, p.id, { path: FIXTURE, type: "image/jpeg" }));
    const path = originalPath(rt, photo);
    expect(path).toBe(join(rt.config.dataDir, "photos", p.id, `${photo.id}.orig.jpg`));
    const original = readFileSync(path!);
    // The entropy-coded scans, from the first SOS to EOI, are the input's.
    expect(fromFirstSos(original).equals(fromFirstSos(readFileSync(FIXTURE)))).toBe(true);
    const m = await sharp(original).metadata();
    expect(m).toMatchObject({ format: "jpeg", width: 4000, height: 3000, orientation: 6 });
    expect(m.icc?.equals((await sharp(FIXTURE).metadata()).icc!)).toBe(true);
    expect(m.xmp).toBeUndefined();
    expect(m.iptc).toBeUndefined();
    // The fixture's GPS (Exif and XMP), camera, date taken, IPTC caption and place and comment are in the input and not in the original.
    const input = readFileSync(FIXTURE);
    const before = await sharp(FIXTURE).metadata();
    expect([before.xmp, before.iptc].every(Boolean)).toBe(true);
    for (const s of ["GPS", "Apple", "iPhone 15", "2026:11:19", "2026-11-19", "Munich", "Vase at home", "Marienplatz"]) {
      expect(input.includes(s), s).toBe(true);
      expect(original.includes(s), s).toBe(false);
    }
    // The Exif left holds the orientation alone: one IFD0 entry, nothing else.
    expect(m.exif?.length).toBeLessThanOrEqual(6 + 8 + 2 + 12 + 4);
  });

  it("keeps a PNG's or WebP's original losslessly, turned upright, with its colour profile and no other metadata", async () => {
    const p = draft();
    for (const format of ["png", "webp"] as const) {
      const path = join(tmp, `in-${format}`);
      await sharp({ create: { width: 30, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } } })
        .composite([{ input: { create: { width: 5, height: 5, channels: 3, background: { r: 250, g: 0, b: 0 } } }, left: 0, top: 0 }])
        .withIccProfile("p3")
        .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/">GPS</x:xmpmeta>')
        .toFormat(format, format === "webp" ? { lossless: true } : {})
        .toFile(path);
      const photo = value(await addPhoto(rt, p.id, { path, type: `image/${format}` }));
      const original = originalPath(rt, photo)!;
      expect(original.endsWith(`${photo.id}.orig.${format}`)).toBe(true);
      expect(photo.original).toEqual({ width: 30, height: 20 });
      const m = await sharp(original).metadata();
      expect(m).toMatchObject({ format, width: 30, height: 20 });
      expect(m.icc).toBeDefined();
      expect(m.xmp).toBeUndefined();
      expect(m.exif).toBeUndefined();
      const raw = (f: string) => sharp(f).keepIccProfile().removeAlpha().raw().toBuffer();
      expect((await raw(original)).equals(await raw(path))).toBe(true);
    }
  });

  it("keeps a 16-bit PNG's original at 16 bits", async () => {
    const samples = new Uint16Array(7 * 5 * 3).map((_, i) => (i * 4099 + 13) & 0xffff);
    const path = join(tmp, "deep.png");
    // sharp reads 16-bit raw input (its types don't list `depth` yet).
    const raw16 = { width: 7, height: 5, channels: 3 as const, depth: "ushort" };
    await sharp(Buffer.from(samples.buffer), { raw: raw16 }).toColourspace("rgb16").png().toFile(path);
    const photo = value(await addPhoto(rt, draft().id, { path, type: "image/png" }));
    const original = originalPath(rt, photo)!;
    expect((await sharp(original).metadata()).depth).toBe("ushort");
    const raw = (f: string) => sharp(f).raw({ depth: "ushort" }).toBuffer();
    expect((await raw(original)).equals(await raw(path))).toBe(true);
  });

  it("jpegMetaFilterRejectsMalformed: a JPEG that isn't whole, or no image at all, is refused and nothing stored", async () => {
    const p = draft();
    const whole = readFileSync(FIXTURE);
    for (const [name, bytes] of [
      ["cut off", whole.subarray(0, whole.length - 2)],
      ["text", Buffer.from("this is not a photo\n".repeat(50))],
    ] as const) {
      const path = join(tmp, name);
      writeFileSync(path, bytes);
      expect(await addPhoto(rt, p.id, { path, type: "image/jpeg" }), name).toMatchObject({ ok: false, reason: "invalid" });
    }
    expect(print(p.id).photos).toEqual([]);
    expect(photoFiles()).toEqual([]);
  });

  it("cutoutDefaultsToWholePhoto: the cutout is the whole photo, turned upright, until a crop is chosen", async () => {
    const photo = value(await addPhoto(rt, draft().id, { path: FIXTURE, type: "image/jpeg" }));
    expect(photo).toMatchObject({ crop: null, original: { width: 4000, height: 3000 }, width: 1800, height: 2400 });
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

  it("deleting a published print's last photo unpublishes it in the same step, one site change", async () => {
    const p = draft();
    const a = await jpeg(p.id);
    value(publishPrint(rt, p.id));
    const before = rt.siteChanges;
    expect(deletePhoto(rt, a.id)).toEqual({ ok: true, value: { unpublished: true } });
    expect(print(p.id)).toMatchObject({ status: "draft", photos: [], coverPhotoId: null });
    expect(rt.siteChanges).toBe(before + 1);
    expect(photoFiles()).toEqual([]);
  });

  it("deletePhotoRemovesBothFiles: the cutout and the original go; another photo's stay", async () => {
    const p = draft();
    const a = value(await addPhoto(rt, p.id, { path: FIXTURE, type: "image/jpeg" }));
    const b = await jpeg(p.id);
    const original = originalPath(rt, a)!;
    expect(existsSync(original)).toBe(true);
    expect(deletePhoto(rt, a.id)).toEqual({ ok: true, value: { unpublished: false } });
    expect(existsSync(photoPath(rt, a))).toBe(false);
    expect(existsSync(original)).toBe(false);
    expect(photoFiles().sort()).toEqual([`${b.id}.jpg`, `${b.id}.orig.jpg`].sort());
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
    expect(deletePhoto(rt, "nope")).toMatchObject({ ok: false });
    expect(count()).toBe(before);
  });
});

describe("setCrop", () => {
  /** The fixture as a photo: 4000×3000 stored, shown as 3000×4000, the red corner top-right once shown. */
  const fixture = async (printId = draft().id) => value(await addPhoto(rt, printId, { path: FIXTURE, type: "image/jpeg" }));
  const pixel = async (path: string, left: number, top: number) => {
    const px = await sharp(path).extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
    return { r: px.readUInt8(0), b: px.readUInt8(2) };
  };

  it("setCropRendersCutout: the cutout is the chosen part of the photo as shown, the row says so", async () => {
    const photo = await fixture();
    const cropped = value(await setCrop(rt, photo.id, { left: 100, top: 200, width: 1000, height: 1000 }));
    expect(cropped).toMatchObject({ width: 1000, height: 1000, crop: { left: 100, top: 200, width: 1000, height: 1000 }, original: photo.original });
    expect(cropped.sha256).not.toBe(photo.sha256);
    const bytes = readFileSync(photoPath(rt, cropped));
    expect(cropped.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(cropped.bytes).toBe(bytes.length);
    expect(value(getPhoto(rt, photo.id))).toEqual(cropped);
    const m = await sharp(bytes).metadata();
    expect(m).toMatchObject({ format: "jpeg", width: 1000, height: 1000 });
    expect(m.exif).toBeUndefined();
    expect(m.icc).toBeUndefined();
    // Its pixels are that region's: compared with the same region cut from the fixture shown upright, they differ only by JPEG's noise.
    const expected = await sharp(FIXTURE).rotate().extract({ left: 100, top: 200, width: 1000, height: 1000 }).raw().toBuffer();
    const got = await sharp(bytes).raw().toBuffer();
    expect(got.length).toBe(expected.length);
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff = Math.max(diff, Math.abs(got.readUInt8(i) - expected.readUInt8(i)));
    expect(diff).toBeLessThan(16);
    // Displayed coordinates: the red corner is at the top right of the shown photo (x 2700–3000, y 0–400), so a cutout there is red
    // at its top right and blue at its bottom left.
    const corner = value(await setCrop(rt, photo.id, { left: 2500, top: 0, width: 500, height: 600 }));
    expect(corner).toMatchObject({ width: 500, height: 600 });
    const red = await pixel(photoPath(rt, corner), 450, 50);
    expect([red.r > 200, red.b < 60]).toEqual([true, true]);
    const blue = await pixel(photoPath(rt, corner), 50, 550);
    expect([blue.r < 80, blue.b > 160]).toEqual([true, true]);
  });

  it("caps a large cutout's long edge at 2400 px and keeps the original as it was", async () => {
    const photo = await fixture();
    const before = readFileSync(originalPath(rt, photo)!);
    const cropped = value(await setCrop(rt, photo.id, { left: 0, top: 0, width: 3000, height: 3000 }));
    expect(cropped).toMatchObject({ width: 2400, height: 2400 });
    expect(readFileSync(originalPath(rt, photo)!).equals(before)).toBe(true);
  });

  it("cropOutOfBoundsRefused: outside the photo as shown, empty, or not whole pixels is invalid, and nothing changes", async () => {
    const photo = await fixture();
    const file = readFileSync(photoPath(rt, photo));
    for (const crop of [
      { left: 0, top: 0, width: 3001, height: 100 },
      { left: 0, top: 0, width: 100, height: 4001 },
      // In the stored 4000×3000, but not in the shown 3000×4000.
      { left: 3500, top: 0, width: 100, height: 100 },
      { left: -1, top: 0, width: 100, height: 100 },
      { left: 0, top: 0, width: 0, height: 100 },
      { left: 0, top: 0, width: 100, height: 0 },
      { left: 0.5, top: 0, width: 100, height: 100 },
      { left: 0, top: 0, width: 100, height: Number.NaN },
      { left: 2999, top: 3999, width: 2, height: 1 },
    ])
      expect(await setCrop(rt, photo.id, crop), JSON.stringify(crop)).toMatchObject({ ok: false, reason: "invalid" });
    expect(value(getPhoto(rt, photo.id))).toEqual(photo);
    expect(readFileSync(photoPath(rt, photo)).equals(file)).toBe(true);
    // The far corner pixel itself is in.
    expect(value(await setCrop(rt, photo.id, { left: 2999, top: 3999, width: 1, height: 1 }))).toMatchObject({ width: 1, height: 1 });
    expect(await setCrop(rt, "nope", null)).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("cropNullRestoresWhole: null puts the whole photo back", async () => {
    const photo = await fixture();
    value(await setCrop(rt, photo.id, { left: 100, top: 200, width: 1000, height: 1000 }));
    const whole = value(await setCrop(rt, photo.id, null));
    expect(whole).toMatchObject({ crop: null, width: 1800, height: 2400 });
    expect(await sharp(photoPath(rt, whole)).metadata()).toMatchObject({ width: 1800, height: 2400 });
    expect(value(getPhoto(rt, photo.id))).toEqual(whole);
  });

  it("setCropOnPublishedCallsSiteChange: once per change to a published print's photo; a draft's, or the same crop again, none", async () => {
    const d = await fixture();
    value(await setCrop(rt, d.id, { left: 0, top: 0, width: 10, height: 10 }));
    expect(rt.siteChanges).toBe(0);

    const p = draft("Becher");
    const photo = await fixture(p.id);
    value(publishPrint(rt, p.id));
    const before = rt.siteChanges;
    value(await setCrop(rt, photo.id, { left: 0, top: 0, width: 10, height: 10 }));
    expect(rt.siteChanges).toBe(before + 1);
    value(await setCrop(rt, photo.id, { left: 0, top: 0, width: 10, height: 10 }));
    expect(rt.siteChanges).toBe(before + 1);
    expect(await setCrop(rt, photo.id, { left: 0, top: 0, width: 0, height: 10 })).toMatchObject({ ok: false });
    expect(rt.siteChanges).toBe(before + 1);
    value(await setCrop(rt, photo.id, null));
    expect(rt.siteChanges).toBe(before + 2);
  });

  it("leaves no temporary file behind, and refuses a photo whose original isn't kept", async () => {
    const p = draft();
    const photo = await fixture(p.id);
    value(await setCrop(rt, photo.id, { left: 0, top: 0, width: 10, height: 10 }));
    expect(photoFiles().sort()).toEqual([`${photo.id}.jpg`, `${photo.id}.orig.jpg`].sort());
    // A photo from before originals were kept: its cutout is all there is.
    const old = seedPhoto(rt, p.id);
    expect(value(getPhoto(rt, old))).toMatchObject({ original: null, crop: null });
    expect(await setCrop(rt, old, null)).toMatchObject({ ok: false, reason: "conflict" });
  });
});
