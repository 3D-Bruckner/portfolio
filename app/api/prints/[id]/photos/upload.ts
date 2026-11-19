import { MultipartError, readMultipart, type Multipart } from "next-app-kit/multipart";
import { addPhoto, getPrint, PHOTO_TYPES, type Runtime } from "@/backend";
import { copyFor, languageOf } from "@/components/copy";

// One photo per request, from the web app's form, so a phone on mobile data that drops one upload loses only that photo and sends it
// again. Cookie-authenticated (Better Auth's session cookie is SameSite=Lax, so a cross-site post acts for nobody). The photo waits in the
// kit's temporary folder while it is processed (backend/photos.ts) and that folder is removed afterwards, whatever happened. A refusal
// answers { error } in the page's language, picked here as proxy.ts picks it for the pages: the proxy never runs on this route, since Next
// would cut a proxied body at 10 MB.

export async function uploadPhoto(rt: Runtime, req: Request, printId: string): Promise<Response> {
  const t = copyFor(languageOf(req.headers)).photos;
  const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  if (!(await rt.person(req.headers))) return refuse(401, t.signedOut);
  if (!getPrint(rt, printId).ok) return refuse(404, t.noPrint);
  let upload: Multipart;
  try {
    upload = await readMultipart(req, { maxFileBytes: rt.config.maxPhotoMb * 1024 * 1024, maxFiles: 1, types: PHOTO_TYPES });
  } catch (e) {
    if (!(e instanceof MultipartError)) throw e;
    rt.log.info({ printId, status: e.status, code: e.code }, "photo upload refused");
    return refuse(e.status, e.code === "too_large" ? t.tooLarge : e.code === "wrong_type" ? t.notAccepted : t.incomplete);
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
