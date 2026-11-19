// Conditional GETs: a client that sends the ETag it holds (If-None-Match) gets 304 without the bytes when nothing changed. The cutouts are
// served `private, no-cache` (a new crop changes one under the same id), so the browser and the site build ask again each time, and this
// keeps the answer small. The kit's REST table hands its operations no request headers, so /api/v1's GET is wrapped (`notModified`).

/** Whether `ifNoneMatch` (the header's value: a list, weak tags allowed, or `*`) names `etag`. */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(",").some((t) => {
    const tag = t.trim();
    return tag === "*" || tag.replace(/^W\//, "") === etag;
  });
}

/** `res` as a 304 when it is a 200 with an ETag that the request already holds; otherwise `res` unchanged. */
export function notModified(req: Request, res: Response): Response {
  const etag = res.headers.get("etag");
  if (res.status !== 200 || !etag || !etagMatches(req.headers.get("if-none-match"), etag)) return res;
  void res.body?.cancel();
  const headers = new Headers({ etag });
  const cache = res.headers.get("cache-control");
  if (cache) headers.set("cache-control", cache);
  return new Response(null, { status: 304, headers });
}
