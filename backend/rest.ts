// The REST API under /api/v1: next-app-kit/rest's table of operations, the API's one source (the route, openapi.json and its test are
// built from it). Each operation calls the same domain functions as the MCP tool it mirrors (conventions: architecture/mcp-first) and
// names it; the two without a tool (the site export and a photo's bytes) say why. The print bodies are the field table's own schemas
// (printfields.ts), so no field is written out here again. A domain refusal answers by its reason: not found 404, invalid 400,
// conflict 409. A read token may only GET (the kit refuses the rest with 403); the site build's token is one.
import { readFile } from "node:fs/promises";
import { fail, openApiDocument, type OpenApiInfo, type Op, type Reply } from "next-app-kit/rest";
import { createApiToken, listApiTokens, revokeApiToken } from "next-app-kit/tokens";
import * as z from "zod";
import { API_TOKEN_PREFIX } from "./accounts";
import { CATEGORY_NAME_LIMIT, createCategory, deleteCategory, listCategories, renameCategory } from "./categories";
import { siteExport, siteExportSchema } from "./export";
import { movePrint, moveShowcase, setShowcase } from "./order";
import type { Outcome, Reason } from "./outcome";
import { deletePhoto, getPhoto, photoPath, reorderPhotos, setCover, setCrop, type Photo } from "./photos";
import { PRINT_FIELDS, printInputSchema, printPatchSchema } from "./printfields";
import { createPrint, deletePrint, findPrint, getPrint, listPrints, publishPrint, unpublishPrint, updatePrint, type Print } from "./prints";
import type { Runtime } from "./runtime";

/** Where the committed openapi.json says the API is; a running instance serves its own at <PUBLIC_URL>/api/v1/openapi.json. */
export const PRODUCTION_URL = "https://upload.3dbruckner.de";

export const OPEN_API: OpenApiInfo = {
  title: "3D Bruckner Upload API",
  version: "1",
  description:
    "3dbruckner.de's prints: their fields, photos, categories and order, and the export the site build reads. Every operation but the export and a photo's bytes mirrors an MCP tool of /mcp, named in its description.",
  tags: [
    { name: "Prints", description: "Drafts and published prints, their fields and publishing." },
    { name: "Order", description: "The portfolio's order and the showcases pinned above it." },
    { name: "Photos", description: "A print's photos: order, cover, cutout, delete. Photos are uploaded in the web app." },
    { name: "Categories", description: "The categories prints are filed under." },
    { name: "Site", description: "What the site build reads." },
    { name: "Tokens", description: "The caller's own API tokens." },
  ],
  bearer: `An API token (\`${API_TOKEN_PREFIX}…\`, made in the web app or with create_api_token; a \`read\` token may only GET), or an OAuth access token from this instance issued for this API (\`resource=<base>/api/v1\`). A token for /mcp is refused here.`,
};

// ---- answers

const STATUS: Record<Reason, number> = { not_found: 404, invalid: 400, conflict: 409 };

/** A domain outcome as a reply: `status` with `body(value)`, or the refusal's status and message. */
function answer<T>(o: Outcome<T>, status: number, body?: (v: T) => unknown): Reply {
  if (!o.ok) return fail(STATUS[o.reason], o.message);
  return body ? { status, body: body(o.value) } : { status };
}

/** A print as REST answers it: with its page in the web app. */
const printJson = (base: string, p: Print) => ({ ...p, url: `${base}/prints/${p.id}` });

/** After a change that answers nothing of its own, the print as it is now. */
const thenPrint = (base: string, ctx: Runtime, o: Outcome<void>, id: string): Reply =>
  o.ok ? answer(getPrint(ctx, id), 200, (p) => printJson(base, p)) : answer(o, 200);

// ---- schemas of the answers (for openapi.json); the print's fields come from the field table

const cropSchema = z.strictObject({
  left: z.number().int().min(0),
  top: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});

const photoSchema = z.object({
  id: z.string(),
  printId: z.string(),
  position: z.number(),
  width: z.number().int().describe("The cutout's width in pixels."),
  height: z.number().int().describe("The cutout's height in pixels."),
  bytes: z.number().int().describe("The cutout's file size."),
  sha256: z.string().describe("The cutout's SHA-256, hex."),
  original: z
    .object({ width: z.number().int(), height: z.number().int() })
    .nullable()
    .describe("The original's size; null for a photo stored before originals were kept."),
  crop: cropSchema.nullable().describe("The cutout's rectangle in the original as shown; null: the whole photo."),
}) satisfies z.ZodType<Photo>;

const categorySchema = z.object({ id: z.string(), name: z.string(), slug: z.string().describe("Fixed at creation: the site's /portfolio#<slug>.") });

const printFields = Object.fromEntries(
  (Object.keys(PRINT_FIELDS) as (keyof typeof PRINT_FIELDS)[]).map((n) => {
    const f = PRINT_FIELDS[n];
    return [n, (f.nullable ? f.value.nullable() : f.value).describe(f.description)];
  }),
);

const printSchema = z.object({
  id: z.string(),
  ...printFields,
  status: z.enum(["draft", "published"]),
  showcase: z.boolean().describe("Pinned above the rest of the portfolio (and on the start page)."),
  coverPhotoId: z.string().nullable(),
  photos: z.array(photoSchema),
  categories: z.array(categorySchema),
  firstPublishedAt: z.string().nullable().describe("When it was first published; its slug is fixed from then on."),
  createdAt: z.string(),
  updatedAt: z.string(),
  url: z.string().describe("The print's page in the web app."),
});

const tokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.enum(["read", "read+write"]),
  start: z.string().describe("The token's first characters, to recognise it by."),
  created_at: z.string(),
  expires_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
});

const beforeId = z.object({ beforeId: z.string().min(1).nullable().describe("The print to stand before; null: to the end.") });
const ID = { id: "The print's id" };
const PRINT_ID_OR_SLUG = { id: "The print's id or slug" };
const PHOTO_ID = { id: "The photo's id" };
const CATEGORY_ID = { id: "The category's id" };
const PRINT_OK = { status: 200, description: "The print as it is now", schema: printSchema };

// ---- the table

export const REST_OPS: Op<Runtime>[] = [
  // Prints
  {
    method: "GET",
    path: "/prints",
    operationId: "listPrints",
    tool: "list_prints",
    summary: "List prints: drafts newest first, then the published ones in the site's order",
    tag: "Prints",
    query: z.object({ status: z.enum(["draft", "published"]).optional().describe("Only drafts or only published prints.") }),
    ok: { status: 200, description: "The prints", schema: z.object({ prints: z.array(printSchema) }) },
    errors: [400, 401],
    handle: ({ ctx, base, query }) => ({
      status: 200,
      body: { prints: listPrints(ctx, { status: query.status as "draft" | "published" | undefined }).map((p) => printJson(base, p)) },
    }),
  },
  {
    method: "GET",
    path: "/prints/{id}",
    operationId: "getPrint",
    tool: "get_print",
    summary: "Get a print by its id or slug",
    tag: "Prints",
    params: PRINT_ID_OR_SLUG,
    ok: { status: 200, description: "The print", schema: printSchema },
    errors: [401, 404],
    handle: ({ ctx, base, params }) => answer(findPrint(ctx, params.id!), 200, (p) => printJson(base, p)),
  },
  {
    method: "POST",
    path: "/prints",
    operationId: "createPrint",
    tool: "create_print",
    summary: "Create a print as a draft (photos are added in the web app); its slug is made from the title",
    tag: "Prints",
    body: printInputSchema,
    ok: { status: 201, description: "The new draft", schema: printSchema },
    errors: [400, 401, 403, 409],
    handle: ({ ctx, base, body }) => answer(createPrint(ctx, body as z.infer<typeof printInputSchema>), 201, (p) => printJson(base, p)),
  },
  {
    method: "PATCH",
    path: "/prints/{id}",
    operationId: "updatePrint",
    tool: "update_print",
    summary: "Change the fields named; null clears an optional one",
    tag: "Prints",
    params: ID,
    body: printPatchSchema,
    ok: PRINT_OK,
    errors: [400, 401, 403, 404, 409],
    handle: ({ ctx, base, params, body }) => answer(updatePrint(ctx, params.id!, body as z.infer<typeof printPatchSchema>), 200, (p) => printJson(base, p)),
  },
  {
    method: "POST",
    path: "/prints/{id}/publish",
    operationId: "publishPrint",
    tool: "publish_print",
    summary: "Put a draft on the site, at the top of the portfolio (needs a title, a description and a photo)",
    tag: "Prints",
    params: ID,
    ok: PRINT_OK,
    errors: [400, 401, 403, 404, 409],
    handle: ({ ctx, base, params }) => answer(publishPrint(ctx, params.id!), 200, (p) => printJson(base, p)),
  },
  {
    method: "POST",
    path: "/prints/{id}/unpublish",
    operationId: "unpublishPrint",
    tool: "unpublish_print",
    summary: "Take a print off the site, back to a draft",
    tag: "Prints",
    params: ID,
    ok: PRINT_OK,
    errors: [401, 403, 404],
    handle: ({ ctx, base, params }) => answer(unpublishPrint(ctx, params.id!), 200, (p) => printJson(base, p)),
  },
  {
    method: "DELETE",
    path: "/prints/{id}",
    operationId: "deletePrint",
    tool: "delete_print",
    summary: "Delete a print and its photos; a slug that was published is never used again",
    tag: "Prints",
    params: ID,
    ok: { status: 204, description: "Deleted" },
    errors: [401, 403, 404],
    handle: ({ ctx, params }) => answer(deletePrint(ctx, params.id!), 204),
  },
  // Order
  {
    method: "POST",
    path: "/prints/{id}/move",
    operationId: "movePrint",
    tool: "move_print",
    summary: "Move a published print that isn't a showcase in the portfolio order",
    tag: "Order",
    params: ID,
    body: beforeId,
    ok: PRINT_OK,
    errors: [400, 401, 403, 404],
    handle: ({ ctx, base, params, body }) => thenPrint(base, ctx, movePrint(ctx, params.id!, (body as z.infer<typeof beforeId>).beforeId), params.id!),
  },
  {
    method: "PUT",
    path: "/prints/{id}/showcase",
    operationId: "setShowcase",
    tool: "set_showcase",
    summary: "Pin a published print as a showcase (at the end of the showcases) or unpin it",
    tag: "Order",
    params: ID,
    body: z.object({ on: z.boolean().describe("true pins it, false unpins it.") }),
    ok: PRINT_OK,
    errors: [400, 401, 403, 404],
    handle: ({ ctx, base, params, body }) => thenPrint(base, ctx, setShowcase(ctx, params.id!, (body as { on: boolean }).on), params.id!),
  },
  {
    method: "POST",
    path: "/showcases/{id}/move",
    operationId: "moveShowcase",
    tool: "move_showcase",
    summary: "Move a showcase among the showcases",
    tag: "Order",
    params: ID,
    body: beforeId,
    ok: PRINT_OK,
    errors: [400, 401, 403, 404],
    handle: ({ ctx, base, params, body }) => thenPrint(base, ctx, moveShowcase(ctx, params.id!, (body as z.infer<typeof beforeId>).beforeId), params.id!),
  },
  // Photos
  {
    method: "PUT",
    path: "/prints/{id}/photos/order",
    operationId: "reorderPhotos",
    tool: "reorder_photos",
    summary: "Put a print's photos in this order",
    tag: "Photos",
    params: ID,
    body: z.object({ photoIds: z.array(z.string().min(1)).max(200).describe("Each of the print's photos exactly once.") }),
    ok: PRINT_OK,
    errors: [400, 401, 403, 404],
    handle: ({ ctx, base, params, body }) => thenPrint(base, ctx, reorderPhotos(ctx, params.id!, (body as { photoIds: string[] }).photoIds), params.id!),
  },
  {
    method: "PUT",
    path: "/prints/{id}/cover",
    operationId: "setCover",
    tool: "set_cover",
    summary: "Make one of a print's photos its cover",
    tag: "Photos",
    params: ID,
    body: z.object({ photoId: z.string().min(1) }),
    ok: PRINT_OK,
    errors: [400, 401, 403, 404],
    handle: ({ ctx, base, params, body }) => thenPrint(base, ctx, setCover(ctx, params.id!, (body as { photoId: string }).photoId), params.id!),
  },
  {
    method: "PUT",
    path: "/photos/{id}/crop",
    operationId: "setPhotoCrop",
    tool: "set_photo_crop",
    summary: "Choose a photo's cutout: a rectangle of the original as shown, in whole pixels; null for the whole photo",
    tag: "Photos",
    params: PHOTO_ID,
    body: z.object({ crop: cropSchema.nullable() }),
    ok: { status: 200, description: "The photo with its new cutout", schema: photoSchema },
    errors: [400, 401, 403, 404, 409],
    handle: async ({ ctx, params, body }) => answer(await setCrop(ctx, params.id!, (body as { crop: z.infer<typeof cropSchema> | null }).crop), 200, (p) => p),
  },
  {
    method: "DELETE",
    path: "/photos/{id}",
    operationId: "deletePhoto",
    tool: "delete_photo",
    summary: "Delete a photo; deleting a published print's last photo takes the print off the site",
    tag: "Photos",
    params: PHOTO_ID,
    ok: { status: 200, description: "Deleted", schema: z.object({ unpublished: z.boolean().describe("Whether the print went off the site with it.") }) },
    errors: [401, 403, 404],
    handle: ({ ctx, params }) => answer(deletePhoto(ctx, params.id!), 200, (v) => v),
  },
  {
    method: "GET",
    path: "/photos/{id}",
    operationId: "getPhotoFile",
    noTool: "binary JPEG; photos come in and go out through the web app only",
    summary: "A photo's cutout, the JPEG the site shows (ETag: its sha256)",
    tag: "Site",
    params: PHOTO_ID,
    ok: { status: 200, description: "The JPEG", binary: true },
    errors: [401, 404],
    handle: async ({ ctx, params }) => {
      const photo = getPhoto(ctx, params.id!);
      if (!photo.ok) return answer(photo, 200);
      let bytes: Buffer;
      try {
        bytes = await readFile(photoPath(ctx, photo.value));
      } catch {
        ctx.log.error({ photoId: photo.value.id }, "photo file missing");
        return fail(404, `No photo ${params.id}.`);
      }
      const headers = {
        "content-type": "image/jpeg",
        "content-length": String(bytes.length),
        etag: `"${photo.value.sha256}"`,
        "cache-control": "private, no-cache",
      };
      return { status: 200, raw: new Response(new Uint8Array(bytes), { headers }) };
    },
  },
  // Categories
  {
    method: "GET",
    path: "/categories",
    operationId: "listCategories",
    tool: "list_categories",
    summary: "List the categories by name, with how many prints use each",
    tag: "Categories",
    ok: {
      status: 200,
      description: "The categories",
      schema: z.object({ categories: z.array(categorySchema.extend({ prints: z.number().int().describe("Prints using it, drafts included.") })) }),
    },
    errors: [401],
    handle: ({ ctx }) => ({ status: 200, body: { categories: listCategories(ctx) } }),
  },
  {
    method: "POST",
    path: "/categories",
    operationId: "createCategory",
    tool: "create_category",
    summary: "Create a category; its slug is made from the name and never changes",
    tag: "Categories",
    body: z.object({ name: z.string().max(CATEGORY_NAME_LIMIT) }),
    ok: { status: 201, description: "The new category", schema: categorySchema },
    errors: [400, 401, 403, 409],
    handle: ({ ctx, body }) => answer(createCategory(ctx, (body as { name: string }).name), 201, (c) => c),
  },
  {
    method: "PATCH",
    path: "/categories/{id}",
    operationId: "renameCategory",
    tool: "rename_category",
    summary: "Rename a category; its slug stays",
    tag: "Categories",
    params: CATEGORY_ID,
    body: z.object({ name: z.string().max(CATEGORY_NAME_LIMIT) }),
    ok: { status: 200, description: "The category", schema: categorySchema },
    errors: [400, 401, 403, 404, 409],
    handle: ({ ctx, params, body }) => answer(renameCategory(ctx, params.id!, (body as { name: string }).name), 200, (c) => c),
  },
  {
    method: "DELETE",
    path: "/categories/{id}",
    operationId: "deleteCategory",
    tool: "delete_category",
    summary: "Delete a category no print uses (refused, naming the prints, while any does)",
    tag: "Categories",
    params: CATEGORY_ID,
    ok: { status: 204, description: "Deleted" },
    errors: [401, 403, 404, 409],
    handle: ({ ctx, params }) => answer(deleteCategory(ctx, params.id!), 204),
  },
  // Site
  {
    method: "GET",
    path: "/export",
    operationId: "getSiteExport",
    noTool: "the site build's read; MCP clients don't need the whole export",
    summary: "Every published print in the site's order, with its photos and the categories: what the site build reads",
    tag: "Site",
    ok: { status: 200, description: "The export", schema: siteExportSchema },
    errors: [401],
    handle: ({ ctx }) => ({ status: 200, body: siteExport(ctx) }),
  },
  // Tokens
  {
    method: "GET",
    path: "/tokens",
    operationId: "listApiTokens",
    tool: "list_api_tokens",
    summary: "List the caller's API tokens, newest first (never the tokens themselves)",
    tag: "Tokens",
    ok: { status: 200, description: "The tokens", schema: z.object({ tokens: z.array(tokenSchema) }) },
    errors: [401],
    handle: async ({ ctx, caller }) => ({ status: 200, body: { tokens: await listApiTokens(await ctx.auth(), caller.person) } }),
  },
  {
    method: "POST",
    path: "/tokens",
    operationId: "createApiToken",
    tool: "create_api_token",
    summary: "Make an API token for the caller; the token is in this answer once and never again",
    tag: "Tokens",
    body: z.object({
      name: z.string().trim().min(1).max(100).describe("What it is for, e.g. 'site build'."),
      scope: z.enum(["read", "read+write"]).describe("`read` may only GET (the site build's); `read+write` may change things."),
      expiresInDays: z.number().int().min(1).max(365).nullable().describe("Its lifetime in days; null: it never expires (chosen on purpose)."),
    }),
    ok: { status: 201, description: "The new token", schema: tokenSchema.extend({ token: z.string().describe("The token itself, shown this once.") }) },
    errors: [400, 401, 403],
    handle: async ({ ctx, caller, body }) => {
      const made = await createApiToken(await ctx.auth(), caller.person, body as { name: string; scope: "read" | "read+write"; expiresInDays: number | null });
      return "error" in made ? fail(400, made.error) : { status: 201, body: made };
    },
  },
  {
    method: "DELETE",
    path: "/tokens/{id}",
    operationId: "revokeApiToken",
    tool: "revoke_api_token",
    summary: "Revoke one of the caller's API tokens",
    tag: "Tokens",
    params: { id: "The token's id" },
    ok: { status: 204, description: "Revoked" },
    errors: [401, 403, 404],
    handle: async ({ ctx, caller, params }) => {
      const r = await revokeApiToken(await ctx.auth(), caller.person, params.id!);
      return r.ok ? { status: 204 } : fail(404, r.error);
    },
  },
];

/** openapi.json as committed: the table's document, its server the production instance (scripts/generate-openapi.mjs writes it). */
export const openApiFile = (): Record<string, unknown> => openApiDocument(REST_OPS, { ...OPEN_API, serverUrl: `${PRODUCTION_URL}/api/v1` });
