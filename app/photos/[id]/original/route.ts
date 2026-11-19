import { runtime } from "@/app/_lib/runtime";
import { serveOriginal } from "./serve";

// GET: the photo's original without metadata (serve.ts), for someone signed in; outside app/[lang], so the proxy leaves it alone.
export async function GET(req: Request, ctx: RouteContext<"/photos/[id]/original">) {
  return serveOriginal(runtime(), req, (await ctx.params).id);
}
