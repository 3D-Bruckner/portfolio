import { readFile } from "node:fs/promises";
import { getPhoto, originalFile, type Runtime } from "@/backend";

// A photo's original (without its metadata), for the web app's crop frame only: someone signed in with the session cookie. An API or
// OAuth token is refused; scripts and the site build get the cutout (/photos/[id]). The original never changes under its id, so the
// browser keeps it for a year, privately.
export async function serveOriginal(rt: Runtime, req: Request, id: string): Promise<Response> {
  const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  if (!(await rt.person(req.headers))) return refuse(401, "sign in");
  const photo = getPhoto(rt, id);
  if (!photo.ok) return refuse(404, photo.message);
  const file = originalFile(rt, photo.value);
  if (!file) return refuse(404, `Photo ${id} has no original.`);
  let bytes: Buffer;
  try {
    bytes = await readFile(file.path);
  } catch {
    rt.log.error({ photoId: id }, "original photo file unreadable");
    return refuse(404, `Photo ${id} has no original.`);
  }
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": file.type, "content-length": String(bytes.length), "cache-control": "private, max-age=31536000, immutable" },
  });
}
