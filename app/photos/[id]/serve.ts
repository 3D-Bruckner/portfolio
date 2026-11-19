import { readFile } from "node:fs/promises";
import { etagMatches } from "next-app-kit/rest";
import { getPhoto, photoPath, photoThumb, type Runtime } from "@/backend";

// A photo's cutout (the JPEG the site gets), for the web app's pages (the session cookie) and for scripts (an API or OAuth token; reading
// is all it needs). A new crop changes the cutout under the same id, so the browser keeps it privately but asks again each time: its
// ETag is the cutout's sha256, and an unchanged one is answered 304 without the bytes. `?size=thumb` serves the cutout's thumbnail
// (backend/photos.ts, 256 px), what the lists show, behind the same gate and with an ETag of its own.
export async function servePhoto(rt: Runtime, req: Request, id: string): Promise<Response> {
  const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  if (!(await rt.person(req.headers)) && !(await rt.apiCaller(req))) return refuse(401, "sign in, or send an API token");
  const size = new URL(req.url).searchParams.get("size");
  if (size !== null && size !== "thumb") return refuse(400, "size is thumb or left out");
  const photo = getPhoto(rt, id);
  if (!photo.ok) return refuse(404, photo.message);
  const etag = size === "thumb" ? `"${photo.value.sha256}-thumb"` : `"${photo.value.sha256}"`;
  const cache = { "cache-control": "private, no-cache", etag };
  if (etagMatches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers: cache });
  let bytes: Buffer;
  try {
    bytes = size === "thumb" ? await photoThumb(rt, photo.value) : await readFile(photoPath(rt, photo.value));
  } catch {
    rt.log.error({ photoId: id }, "photo file missing");
    return refuse(404, `No photo ${id}.`);
  }
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg", "content-length": String(bytes.length), ...cache } });
}
