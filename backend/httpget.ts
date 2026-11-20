// A plain HTTPS GET with node:https, for the pages Marcel shares to import (MakerWorld): their bot protection answers Node's built-in
// fetch (undici) with 403 but an ordinary client with the page, as it answers his browser (tried 2026-11-20). Marcel's decision: one
// request per link he shares, on his behalf, as if he opened it and copied the details himself; never a crawl. Follows up to three
// redirects (HTTPS only), gives up after `timeoutMs`, and stops reading past `maxBytes`. Tests replace it on the runtime (rt.httpGet), as
// they replace rt.fetch: they never reach the network.
import { get } from "node:https";

export type HttpAnswer = { status: number; type: string | null; body: Buffer };
export type HttpGet = (url: string, opts: { headers?: Record<string, string>; timeoutMs: number; maxBytes: number }) => Promise<HttpAnswer>;

export const httpGet: HttpGet = (url, opts) => follow(url, opts, 3);

function follow(url: string, opts: Parameters<HttpGet>[1], redirects: number): Promise<HttpAnswer> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== "https:") return reject(new Error(`not HTTPS: ${u.protocol}`));
    const req = get(u, { headers: opts.headers, timeout: opts.timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        if (redirects === 0) return reject(new Error("too many redirects"));
        return resolve(follow(new URL(location, u).toString(), opts, redirects - 1));
      }
      if (Number(res.headers["content-length"] ?? 0) > opts.maxBytes) {
        res.destroy();
        return reject(new Error("too large"));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > opts.maxBytes) {
          res.destroy();
          reject(new Error("too large"));
        } else chunks.push(c);
      });
      res.on("end", () => resolve({ status, type: res.headers["content-type"] ?? null, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
  });
}
