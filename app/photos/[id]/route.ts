import { runtime } from "@/app/_lib/runtime";
import { servePhoto } from "./serve";

// GET: the photo's JPEG (serve.ts); outside app/[lang], so the proxy leaves it alone.
export async function GET(req: Request, ctx: RouteContext<"/photos/[id]">) {
  return servePhoto(runtime(), req, (await ctx.params).id);
}
