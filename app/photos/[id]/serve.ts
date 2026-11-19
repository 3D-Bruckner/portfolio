import { readFile } from "node:fs/promises";
import { getPhoto, photoPath, type Runtime } from "@/backend";

// A stored photo, for the web app's pages (the session cookie) and for scripts (an API or OAuth token; reading is all it needs). A photo
// never changes under its id, so the browser keeps it for a year; privately, since only someone signed in may see it.
export async function servePhoto(rt: Runtime, req: Request, id: string): Promise<Response> {
  const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  if (!(await rt.person(req.headers)) && !(await rt.apiCaller(req))) return refuse(401, "sign in, or send an API token");
  const photo = getPhoto(rt, id);
  if (!photo.ok) return refuse(404, photo.message);
  let bytes: Buffer;
  try {
    bytes = await readFile(photoPath(rt, photo.value));
  } catch {
    rt.log.error({ photoId: id }, "photo file missing");
    return refuse(404, `No photo ${id}.`);
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(bytes.length),
      "cache-control": "private, max-age=31536000, immutable",
      etag: `"${photo.value.sha256}"`,
    },
  });
}
