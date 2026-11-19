// Photos: what the phone sends, kept as taken, and the cutout of it the site shows. Each photo is two files under
// DATA_DIR/photos/<printId>/:
// - <photoId>.orig.<jpg|png|webp>, the original: a JPEG's image data byte for byte (no rotation, no re-encode), with every metadata
//   segment taken out but its orientation and colour profile (jpegmeta.ts); a PNG or WebP re-encoded losslessly by sharp, turned upright,
//   with its colour profile and nothing else. So no GPS position, camera or date is ever stored. original_width/height are its stored
//   pixel size (before the orientation is applied).
// - <photoId>.jpg, the cutout: the crop chosen from the original as shown (orientation applied; the whole photo until one is chosen),
//   its long edge capped at 2400 px (never enlarged), a JPEG of quality 85 with no metadata at all. width, height, bytes and sha256 are
//   the cutout's, so the site build sees a changed cutout.
// The upload itself stays in the request's temporary file, which the request removes. Files are written beside their place under a
// temporary name, renamed into place and only then given their row, in one transaction: a failure on the way leaves neither a row nor a
// file (the print's folder stays: another upload to the same print may be writing into it). What a photo is goes by what sharp reads in
// it, not the type its sender declared. A print's first photo becomes its cover; a change to a published print's photos is a site change.
// A photo stored before originals were kept has only its cutout (original and crop null), and that cutout can't be changed.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp, { type OutputInfo } from "sharp";
import type { PhotoRow } from "./db";
import { stripJpegMetadata } from "./jpegmeta";
import { conflict, done, invalid, notFound, ok, type Outcome } from "./outcome";
import { OFF_THE_SITE } from "./prints";
import { mutation, type Runtime } from "./runtime";

/** A rectangle of the original as shown (its orientation applied), in whole pixels. */
export type Crop = { left: number; top: number; width: number; height: number };

export type Photo = {
  id: string;
  printId: string;
  position: number;
  /** The cutout's size, file size and hash: what the site gets. */
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  /** The original's stored pixel size (before its orientation is applied); null for a photo stored before originals were kept. */
  original: { width: number; height: number } | null;
  /** The cutout's rectangle in the original as shown; null = the whole photo. */
  crop: Crop | null;
};

/** The kinds of photo an upload may be; an iPhone's HEIC is not one (sharp's prebuilt libvips can't read it). */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** What sharp must find in the file, whatever its sender declared (an SVG or a GIF named .jpg is refused all the same), and the
 * original's file extension and content type for each. */
const ORIGINALS = {
  jpeg: { ext: "jpg", type: "image/jpeg" },
  png: { ext: "png", type: "image/png" },
  webp: { ext: "webp", type: "image/webp" },
} as const;
type OriginalFormat = keyof typeof ORIGINALS;
const isOriginalFormat = (f: string | undefined): f is OriginalFormat => f !== undefined && Object.hasOwn(ORIGINALS, f);
/** The longest edge a cutout has, in pixels. */
export const PHOTO_LONG_EDGE = 2400;
export const PHOTO_QUALITY = 85;

export const photoOf = (r: PhotoRow): Photo => ({
  id: r.id,
  printId: r.print_id,
  position: r.position,
  width: r.width,
  height: r.height,
  bytes: r.bytes,
  sha256: r.sha256,
  original: r.original_width !== null && r.original_height !== null ? { width: r.original_width, height: r.original_height } : null,
  crop:
    r.crop_left !== null && r.crop_top !== null && r.crop_width !== null && r.crop_height !== null
      ? { left: r.crop_left, top: r.crop_top, width: r.crop_width, height: r.crop_height }
      : null,
});

const photosDir = (rt: Runtime, printId: string): string => join(rt.config.dataDir, "photos", printId);

/** Where a photo's cutout (the JPEG the site gets) is stored. */
export const photoPath = (rt: Runtime, photo: Pick<Photo, "id" | "printId">): string => join(photosDir(rt, photo.printId), `${photo.id}.jpg`);

const originalPathAs = (rt: Runtime, photo: Pick<Photo, "id" | "printId">, format: OriginalFormat): string =>
  join(photosDir(rt, photo.printId), `${photo.id}.orig.${ORIGINALS[format].ext}`);

/** A photo's original, where it is stored and its content type (by its extension); null when it has none. */
export function originalFile(rt: Runtime, photo: Pick<Photo, "id" | "printId">): { path: string; type: string } | null {
  for (const format of Object.keys(ORIGINALS) as OriginalFormat[]) {
    const path = originalPathAs(rt, photo, format);
    if (existsSync(path)) return { path, type: ORIGINALS[format].type };
  }
  return null;
}

/** Where a photo's original is stored; null when it has none. */
export const originalPath = (rt: Runtime, photo: Pick<Photo, "id" | "printId">): string | null => originalFile(rt, photo)?.path ?? null;

export function getPhoto(rt: Runtime, id: string): Outcome<Photo> {
  const row = rt.store.photo(id);
  return row ? ok(photoOf(row)) : notFound(`No photo ${id}.`);
}

/** The original as it is kept: a JPEG's segments filtered (its image data untouched), a PNG or WebP re-encoded losslessly, upright. */
async function keptOriginal(path: string, format: OriginalFormat): Promise<Outcome<Buffer>> {
  if (format === "jpeg") return stripJpegMetadata(readFileSync(path));
  // keepIccProfile: the colour profile goes along and the pixels aren't converted; no other metadata is written.
  const img = sharp(path).rotate().keepIccProfile();
  if (format === "webp") return ok(await img.webp({ lossless: true }).toBuffer());
  // sharp writes 8 bits per sample unless told otherwise: a 16-bit PNG stays 16-bit.
  const m = await sharp(path).metadata();
  if (m.depth === "ushort") img.toColourspace(m.channels <= 2 ? "grey16" : "rgb16");
  return ok(await img.png().toBuffer());
}

/** Renders the cutout of `original` (a file) into `out`: turned upright, cropped, capped at 2400 px, quality 85, no metadata. */
function renderCutout(original: string, crop: Crop | null, out: string): Promise<OutputInfo> {
  // rotate() before extract(): the crop is in the original as shown. No withMetadata/keepExif: sharp writes no EXIF, XMP, IPTC or ICC
  // profile unless asked to (a profile is converted to sRGB first).
  const img = sharp(original).rotate();
  return (crop ? img.extract(crop) : img)
    .resize({ width: PHOTO_LONG_EDGE, height: PHOTO_LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: PHOTO_QUALITY, mozjpeg: true })
    .toFile(out);
}

const sha256Of = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/**
 * Adds the photo in `file` (the request's temporary file and the type its sender declared) to the print, after its others: its original
 * without metadata and its cutout, the whole photo. Refused as invalid when it is not a JPEG, PNG or WebP that can be read whole; throws
 * when storing it fails, leaving nothing behind.
 */
export async function addPhoto(rt: Runtime, printId: string, file: { path: string; type: string }): Promise<Outcome<Photo>> {
  if (!PHOTO_TYPES.includes(file.type))
    return invalid(`file: a ${file.type} photo isn't taken; send it as a JPEG (PNG and WebP work too; an iPhone's HEIC must be a JPEG first)`);
  if (!rt.store.print(printId)) return notFound(`No print ${printId}.`);
  const id = randomUUID();
  const dir = photosDir(rt, printId);
  const tmp = join(dir, `.${id}.tmp`);
  const originalTmp = join(dir, `.${id}.orig.tmp`);
  const path = photoPath(rt, { id, printId });
  let originalAt: string | null = null;
  let stored = false;
  try {
    let cut: OutputInfo;
    let original: { width: number; height: number; bytes: number };
    try {
      const format = (await sharp(file.path).metadata()).format;
      if (!isOriginalFormat(format)) {
        rt.log.warn({ printId, format }, "photo upload: not a JPEG, PNG or WebP inside");
        return invalid("file: this is no JPEG, PNG or WebP photo, whatever its name says; send it as a JPEG");
      }
      const kept = await keptOriginal(file.path, format);
      if (!kept.ok) {
        rt.log.warn({ printId, reason: kept.message }, "photo upload: not a whole JPEG");
        return invalid("file: not a photo that can be read, or it arrived incomplete; send it again as a JPEG");
      }
      const m = await sharp(kept.value).metadata();
      original = { width: m.width, height: m.height, bytes: kept.value.length };
      // Made right before the files are written, and never removed: another upload to the same print may be writing into it too.
      mkdirSync(dir, { recursive: true });
      writeFileSync(originalTmp, kept.value);
      originalAt = originalPathAs(rt, { id, printId }, format);
      cut = await renderCutout(originalTmp, null, tmp);
    } catch (e) {
      rt.log.warn({ printId, error: e instanceof Error ? e.message : String(e) }, "photo upload: not a readable image");
      return invalid("file: not a photo that can be read, or it arrived incomplete; send it again as a JPEG");
    }
    const bytes = readFileSync(tmp);
    const sha256 = sha256Of(bytes);
    renameSync(originalTmp, originalAt);
    renameSync(tmp, path);
    const out = mutation(rt, (siteChange): Outcome<Photo> => {
      const print = rt.store.print(printId);
      if (!print) return notFound(`No print ${printId}.`);
      const now = rt.clock().toISOString();
      rt.store.insertPhoto({
        id,
        print_id: printId,
        position: (rt.store.maxPhotoPosition(printId) ?? 0) + 1,
        width: cut.width,
        height: cut.height,
        bytes: bytes.length,
        sha256,
        created_at: now,
        original_width: original.width,
        original_height: original.height,
        original_bytes: original.bytes,
      });
      rt.store.updatePrint(printId, { ...(print.cover_photo_id ? {} : { cover_photo_id: id }), updated_at: now });
      if (print.status === "published") siteChange();
      return ok(photoOf(rt.store.photo(id)!));
    });
    stored = out.ok;
    return out;
  } finally {
    rmSync(tmp, { force: true });
    rmSync(originalTmp, { force: true });
    if (!stored) {
      rmSync(path, { force: true });
      if (originalAt) rmSync(originalAt, { force: true });
    }
  }
}

/** Why `crop` can't be cut from a photo shown `shown` big, or null when it can. */
function cropProblem(crop: Crop, shown: { width: number; height: number }): string | null {
  const { left, top, width, height } = crop;
  const whole = [left, top, width, height].every(Number.isInteger);
  if (!whole || left < 0 || top < 0 || width < 1 || height < 1 || left + width > shown.width || top + height > shown.height)
    return `crop: whole pixels inside the photo as shown (${shown.width}×${shown.height}), at least 1×1; got ${JSON.stringify(crop)}`;
  return null;
}

const sameCrop = (a: Crop | null, b: Crop | null) =>
  a === b || (a !== null && b !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

/**
 * Chooses a photo's cutout: `crop` is a rectangle of the original as shown (orientation applied), in whole pixels; null is the whole
 * photo. Renders the new cutout from the original and stores it with its row (size, hash, crop). Invalid when the crop isn't inside the
 * photo; a conflict when the photo has no original (stored before originals were kept).
 */
export async function setCrop(rt: Runtime, photoId: string, crop: Crop | null): Promise<Outcome<Photo>> {
  const row = rt.store.photo(photoId);
  if (!row) return notFound(`No photo ${photoId}.`);
  const photo = photoOf(row);
  const source = photo.original ? originalPath(rt, photo) : null;
  if (!source) return conflict(`Photo ${photoId} was stored before originals were kept: its cutout is all there is and can't be changed.`);
  const shown = (await sharp(source).metadata()).autoOrient;
  if (crop) {
    const problem = cropProblem(crop, shown);
    if (problem) return invalid(problem);
    // The whole photo as a rectangle is the whole photo.
    if (crop.left === 0 && crop.top === 0 && crop.width === shown.width && crop.height === shown.height) crop = null;
  }
  if (sameCrop(photo.crop, crop)) return ok(photo);
  const chosen = crop && { left: crop.left, top: crop.top, width: crop.width, height: crop.height };
  const tmp = join(photosDir(rt, photo.printId), `.${photoId}.${randomUUID()}.tmp`);
  try {
    const cut = await renderCutout(source, chosen, tmp);
    const bytes = readFileSync(tmp);
    return mutation(rt, (siteChange): Outcome<Photo> => {
      if (!rt.store.photo(photoId)) return notFound(`No photo ${photoId}.`);
      const print = rt.store.print(photo.printId)!;
      rt.store.updatePhoto(photoId, {
        width: cut.width,
        height: cut.height,
        bytes: bytes.length,
        sha256: sha256Of(bytes),
        crop_left: chosen?.left ?? null,
        crop_top: chosen?.top ?? null,
        crop_width: chosen?.width ?? null,
        crop_height: chosen?.height ?? null,
      });
      rt.store.updatePrint(print.id, { updated_at: rt.clock().toISOString() });
      // Last, so a failure before it leaves the old cutout with its old row; nothing in between can interleave (all synchronous).
      renameSync(tmp, photoPath(rt, photo));
      if (print.status === "published") siteChange();
      return ok(photoOf(rt.store.photo(photoId)!));
    });
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * Deletes a photo, row and files (the cutout and the original). The cover moves to the first photo left. Deleting a published print's
 * last photo takes the print off the site in the same step (`unpublished: true`), since a published print shows at least one photo.
 */
export function deletePhoto(rt: Runtime, photoId: string): Outcome<{ unpublished: boolean }> {
  let gone: Photo | null = null;
  const out = mutation(rt, (siteChange): Outcome<{ unpublished: boolean }> => {
    const row = rt.store.photo(photoId);
    if (!row) return notFound(`No photo ${photoId}.`);
    const print = rt.store.print(row.print_id)!;
    const left = rt.store.photosOf([print.id]).filter((p) => p.id !== photoId);
    const unpublished = print.status === "published" && left.length === 0;
    rt.store.deletePhoto(photoId);
    rt.store.updatePrint(print.id, {
      ...(print.cover_photo_id === photoId ? { cover_photo_id: left[0]?.id ?? null } : {}),
      ...(unpublished ? OFF_THE_SITE : {}),
      updated_at: rt.clock().toISOString(),
    });
    if (print.status === "published") siteChange();
    gone = photoOf(row);
    return ok({ unpublished });
  });
  // The row is gone and committed: a file that can't be removed is only logged (it is never served again), not the delete undone.
  if (out.ok && gone) {
    const photo: Photo = gone;
    for (const path of [photoPath(rt, photo), ...(Object.keys(ORIGINALS) as OriginalFormat[]).map((f) => originalPathAs(rt, photo, f))]) {
      try {
        rmSync(path, { force: true });
      } catch (e) {
        rt.log.error(
          { photoId: photo.id, printId: photo.printId, error: e instanceof Error ? e.message : String(e) },
          "photo deleted, but its photo file could not be removed",
        );
      }
    }
  }
  return out;
}

/** Puts the print's photos in the order of `photoIds`, which names each of them exactly once. The cover stays. */
export function reorderPhotos(rt: Runtime, printId: string, photoIds: string[]): Outcome<void> {
  return mutation(rt, (siteChange) => {
    const print = rt.store.print(printId);
    if (!print) return notFound(`No print ${printId}.`);
    const current = rt.store.photosOf([printId]).map((p) => p.id);
    const known = new Set(current);
    if (photoIds.length !== current.length || new Set(photoIds).size !== photoIds.length || !photoIds.every((id) => known.has(id)))
      return invalid(`photoIds: name each of the print's ${current.length} photos exactly once (${current.join(", ")})`);
    if (photoIds.every((id, i) => current[i] === id)) return done;
    photoIds.forEach((id, i) => rt.store.setPhotoPosition(id, i + 1));
    rt.store.updatePrint(printId, { updated_at: rt.clock().toISOString() });
    if (print.status === "published") siteChange();
    return done;
  });
}

/** Makes one of the print's photos its cover. */
export function setCover(rt: Runtime, printId: string, photoId: string): Outcome<void> {
  return mutation(rt, (siteChange) => {
    const print = rt.store.print(printId);
    if (!print) return notFound(`No print ${printId}.`);
    if (rt.store.photo(photoId)?.print_id !== printId) return notFound(`The print "${print.title}" has no photo ${photoId}.`);
    if (print.cover_photo_id === photoId) return done;
    rt.store.updatePrint(printId, { cover_photo_id: photoId, updated_at: rt.clock().toISOString() });
    if (print.status === "published") siteChange();
    return done;
  });
}
