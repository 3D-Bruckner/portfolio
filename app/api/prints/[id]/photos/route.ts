import { runtime } from "@/backend";
import { uploadPhoto } from "./upload";

// POST: one photo for the print, as multipart form data (upload.ts).
export async function POST(req: Request, ctx: RouteContext<"/api/prints/[id]/photos">) {
  return uploadPhoto(runtime(), req, (await ctx.params).id);
}
