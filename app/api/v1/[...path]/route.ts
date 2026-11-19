import { restHandler } from "next-app-kit/next";
import { OPEN_API, REST_OPS } from "@/backend";
import { runtime } from "@/app/_lib/runtime";

// /api/v1 (next-app-kit): the REST table of backend/rest.ts for API tokens and OAuth access tokens, and /api/v1/openapi.json.
export const { GET, POST, PUT, PATCH, DELETE } = restHandler(async () => {
  const rt = runtime();
  return { auth: await rt.auth(), signIn: rt.signIn, ops: REST_OPS, ctx: rt, log: (line: string) => rt.log.error(line), openApi: OPEN_API };
});
