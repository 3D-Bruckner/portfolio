// Photos: what the phone sends, made fit for the site on arrival. Each upload is turned upright (EXIF orientation), its long edge capped at
// 2400 px (never enlarged) and stored as a JPEG of quality 85 with no metadata at all, so no GPS position, camera or colour profile ever
// reaches the site. The original stays in the request's temporary file, which the request removes; only the processed JPEG is stored, as
// DATA_DIR/photos/<printId>/<photoId>.jpg. It is written beside its place under a temporary name, renamed into place and only then given
// its row, in one transaction: a failure on the way leaves neither a row nor a file. A print's first photo becomes its cover; a change to
// a published print's photos is a site change.
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp, { type OutputInfo } from "sharp";
import type { PhotoRow } from "./db";
import { conflict, done, invalid, notFound, ok, type Outcome } from "./outcome";
import { mutation, type Runtime } from "./runtime";

export type Photo = { id: string; printId: string; position: number; width: number; height: number; bytes: number; sha256: string };

/** The kinds of photo an upload may be; an iPhone's HEIC is not one (sharp's prebuilt libvips can't read it). */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** The longest edge a stored photo has, in pixels. */
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
});

const photosDir = (rt: Runtime, printId: string): string => join(rt.config.dataDir, "photos", printId);

/** Where a photo's JPEG is stored. */
export const photoPath = (rt: Runtime, photo: Pick<Photo, "id" | "printId">): string => join(photosDir(rt, photo.printId), `${photo.id}.jpg`);

export function getPhoto(rt: Runtime, id: string): Outcome<Photo> {
  const row = rt.store.photo(id);
  return row ? ok(photoOf(row)) : notFound(`No photo ${id}.`);
}

/**
 * Adds the photo in `file` (the request's temporary file and the type its sender declared) to the print, after its others. Refused as
 * invalid when it is not a JPEG, PNG or WebP that can be read; throws when storing it fails, leaving nothing behind.
 */
export async function addPhoto(rt: Runtime, printId: string, file: { path: string; type: string }): Promise<Outcome<Photo>> {
  if (!PHOTO_TYPES.includes(file.type))
    return invalid(`file: a ${file.type} photo isn't taken; send it as a JPEG (PNG and WebP work too; an iPhone's HEIC must be a JPEG first)`);
  if (!rt.store.print(printId)) return notFound(`No print ${printId}.`);
  const id = randomUUID();
  const dir = photosDir(rt, printId);
  const tmp = join(dir, `.${id}.tmp`);
  const path = photoPath(rt, { id, printId });
  let stored = false;
  mkdirSync(dir, { recursive: true });
  try {
    let info: OutputInfo;
    try {
      // No withMetadata/keepExif: sharp writes no EXIF, XMP, IPTC or ICC profile unless asked to.
      info = await sharp(file.path)
        .rotate()
        .resize({ width: PHOTO_LONG_EDGE, height: PHOTO_LONG_EDGE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: PHOTO_QUALITY, mozjpeg: true })
        .toFile(tmp);
    } catch (e) {
      rt.log.warn({ printId, error: e instanceof Error ? e.message : String(e) }, "photo upload: not a readable image");
      return invalid("file: not a photo that can be read, or it arrived incomplete; send it again as a JPEG");
    }
    const bytes = readFileSync(tmp);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    renameSync(tmp, path);
    const out = mutation(rt, (siteChange): Outcome<Photo> => {
      const print = rt.store.print(printId);
      if (!print) return notFound(`No print ${printId}.`);
      const photo: Photo = {
        id,
        printId,
        position: (rt.store.maxPhotoPosition(printId) ?? 0) + 1,
        width: info.width,
        height: info.height,
        bytes: bytes.length,
        sha256,
      };
      const now = rt.clock().toISOString();
      rt.store.insertPhoto({
        id,
        print_id: printId,
        position: photo.position,
        width: photo.width,
        height: photo.height,
        bytes: photo.bytes,
        sha256,
        created_at: now,
      });
      rt.store.updatePrint(printId, { ...(print.cover_photo_id ? {} : { cover_photo_id: id }), updated_at: now });
      if (print.status === "published") siteChange();
      return ok(photo);
    });
    stored = out.ok;
    return out;
  } finally {
    rmSync(tmp, { force: true });
    if (!stored) {
      rmSync(path, { force: true });
      try {
        rmdirSync(dir);
      } catch {
        // the print's other photos are in it
      }
    }
  }
}

/** Deletes a photo, row and file. The cover moves to the first photo left. A published print keeps at least one photo. */
export function deletePhoto(rt: Runtime, photoId: string): Outcome<void> {
  let gone: Photo | null = null;
  const out = mutation(rt, (siteChange) => {
    const row = rt.store.photo(photoId);
    if (!row) return notFound(`No photo ${photoId}.`);
    const print = rt.store.print(row.print_id)!;
    const left = rt.store.photosOf([print.id]).filter((p) => p.id !== photoId);
    if (print.status === "published" && left.length === 0)
      return conflict(`A published print keeps at least one photo; add another before deleting this one, or unpublish "${print.title}" first.`);
    rt.store.deletePhoto(photoId);
    rt.store.updatePrint(print.id, {
      ...(print.cover_photo_id === photoId ? { cover_photo_id: left[0]?.id ?? null } : {}),
      updated_at: rt.clock().toISOString(),
    });
    if (print.status === "published") siteChange();
    gone = photoOf(row);
    return done;
  });
  if (out.ok && gone) rmSync(photoPath(rt, gone), { force: true });
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
