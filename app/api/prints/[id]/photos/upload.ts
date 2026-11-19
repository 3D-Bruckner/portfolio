import { MultipartError, readMultipart, type Multipart } from "next-app-kit/multipart";
import { addPhoto, getPrint, PHOTO_TYPES, type Runtime } from "@/backend";
import { copyFor, LANG_HEADER } from "@/components/copy";

// One photo per request, from the web app's form, so a phone on mobile data that drops one upload loses only that photo and sends it
// again. Cookie-authenticated (Better Auth's session cookie is SameSite=Lax, so a cross-site post acts for nobody). The photo waits in the
// kit's temporary folder while it is processed (backend/photos.ts) and that folder is removed afterwards, whatever happened. A refusal
// answers { error } in the page's language, which proxy.ts passes on in a request header.

// The kit's MultipartError carries the status only; a file of a kind not in `types` is told apart by its message.
const NOT_ACCEPTED = /is not one of the accepted kinds/;

export async function uploadPhoto(rt: Runtime, req: Request, printId: string): Promise<Response> {
  const t = copyFor(req.headers.get(LANG_HEADER) ?? "").photos;
  const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  if (!(await rt.person(req.headers))) return refuse(401, t.signedOut);
  if (!getPrint(rt, printId).ok) return refuse(404, t.noPrint);
  let upload: Multipart;
  try {
    upload = await readMultipart(req, { maxFileBytes: rt.config.maxPhotoMb * 1024 * 1024, maxFiles: 1, types: PHOTO_TYPES });
  } catch (e) {
    if (!(e instanceof MultipartError)) throw e;
    rt.log.info({ printId, status: e.status }, "photo upload refused");
    return refuse(e.status, e.status === 413 ? t.tooLarge : NOT_ACCEPTED.test(e.message) ? t.notAccepted : t.incomplete);
  }
  try {
    const file = upload.files[0];
    if (!file) return refuse(400, t.noFile);
    const added = await addPhoto(rt, printId, file);
    if (added.ok) return Response.json(added.value, { status: 201, headers: { "cache-control": "no-store" } });
    return added.reason === "not_found" ? refuse(404, t.noPrint) : refuse(400, t.unreadable);
  } finally {
    await upload.cleanup();
  }
}
