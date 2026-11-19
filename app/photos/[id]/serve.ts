import { readFile } from "node:fs/promises";
import { etagMatches } from "next-app-kit/rest";
import { getPhoto, photoPath, type Runtime } from "@/backend";

// A photo's cutout (the JPEG the site gets), for the web app's pages (the session cookie) and for scripts (an API or OAuth token; reading
// is all it needs). A new crop changes the cutout under the same id, so the browser keeps it privately but asks again each time: its
// ETag is the cutout's sha256, and an unchanged one is answered 304 without the bytes.
export async function servePhoto(rt: Runtime, req: Request, id: string): Promise<Response> {
  const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  if (!(await rt.person(req.headers)) && !(await rt.apiCaller(req))) return refuse(401, "sign in, or send an API token");
  const photo = getPhoto(rt, id);
  if (!photo.ok) return refuse(404, photo.message);
  const etag = `"${photo.value.sha256}"`;
  const cache = { "cache-control": "private, no-cache", etag };
  if (etagMatches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers: cache });
  let bytes: Buffer;
  try {
    bytes = await readFile(photoPath(rt, photo.value));
  } catch {
    rt.log.error({ photoId: id }, "photo file missing");
    return refuse(404, `No photo ${id}.`);
  }
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg", "content-length": String(bytes.length), ...cache } });
}
