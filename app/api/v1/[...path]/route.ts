import { restHandler } from "next-app-kit/next";
import { notModified, OPEN_API, REST_OPS } from "@/backend";
import { runtime } from "@/app/_lib/runtime";

// /api/v1 (next-app-kit): the REST table of backend/rest.ts for API tokens and OAuth access tokens, and /api/v1/openapi.json. A GET whose
// ETag the caller already holds (a photo's cutout) is answered 304 (backend/conditional.ts).
const rest = restHandler(async () => {
  const rt = runtime();
  return { auth: await rt.auth(), signIn: rt.signIn, ops: REST_OPS, ctx: rt, log: (line: string) => rt.log.error(line), openApi: OPEN_API };
});

export const { POST, PUT, PATCH, DELETE } = rest;
export const GET = async (req: Request) => notModified(req, await rest.GET(req));
