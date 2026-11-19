// What REST and MCP answer and take besides a print's fields (those are printfields.ts's): a print as it is answered (with its page in the
// web app), a photo, a category, an API token, the site build's status, and the few inputs both surfaces share (where to move a print to,
// a photo order, a crop, a token's settings). Written once here, so /api/v1 (rest.ts) and /mcp (mcp.ts) can't drift apart.
import * as z from "zod";
import { CATEGORY_NAME_LIMIT } from "./categories";
import type { Photo } from "./photos";
import { PRINT_FIELDS } from "./printfields";
import type { Print } from "./prints";
import type { BuildStatus } from "./site";

/** A print's page in the web app: what every answer naming a print carries. The web app's URLs carry no language. */
export const printUrl = (base: string, id: string): string => `${base}/prints/${id}`;

/** A print as REST and MCP answer it: with its page in the web app. */
export const printJson = (base: string, p: Print) => ({ ...p, url: printUrl(base, p.id) });

// ---- inputs

export const cropSchema = z.strictObject({
  left: z.number().int().min(0),
  top: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});

export const BEFORE_ID = z.string().min(1).nullable().describe("The print to stand before; null: to the end.");
export const PHOTO_IDS = z.array(z.string().min(1)).max(200).describe("Each of the print's photos exactly once.");
export const SHOWCASE_ON = z.boolean().describe("true pins it, false unpins it.");
export const CATEGORY_NAME = z.string().max(CATEGORY_NAME_LIMIT);
export const STATUS_FILTER = z.enum(["draft", "published"]).optional().describe("Only drafts or only published prints.");
export const CROP = cropSchema.nullable();

/** A new API token's settings. */
export const tokenInputSchema = z.object({
  name: z.string().trim().min(1).max(100).describe("What it is for, e.g. 'site build'."),
  scope: z.enum(["read", "read+write"]).describe("`read` may only GET (the site build's); `read+write` may change things."),
  expiresInDays: z.number().int().min(1).max(365).nullable().describe("Its lifetime in days; null: it never expires (chosen on purpose)."),
});

// ---- answers

export const photoSchema = z.object({
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
    .describe("The original's size as shown (its orientation applied), the space a crop is chosen in; null for a photo stored before originals were kept."),
  crop: cropSchema.nullable().describe("The cutout's rectangle in the original as shown; null: the whole photo."),
}) satisfies z.ZodType<Photo>;

export const categorySchema = z.object({ id: z.string(), name: z.string(), slug: z.string().describe("Fixed at creation: the site's /portfolio#<slug>.") });

export const categoryWithCountSchema = categorySchema.extend({ prints: z.number().int().describe("Prints using it, drafts included.") });

const printFields = Object.fromEntries(
  (Object.keys(PRINT_FIELDS) as (keyof typeof PRINT_FIELDS)[]).map((n) => {
    const f = PRINT_FIELDS[n];
    return [n, (f.nullable ? f.value.nullable() : f.value).describe(f.description)];
  }),
);

export const printSchema = z.object({
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

export const tokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.enum(["read", "read+write"]),
  start: z.string().describe("The token's first characters, to recognise it by."),
  created_at: z.string(),
  expires_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
});

export const newTokenSchema = tokenSchema.extend({ token: z.string().describe("The token itself, shown this once.") });

export const buildStatusSchema = z.object({
  pending: z.boolean().describe("Changes the site shows wait for a build; it is dispatched once nothing changed for a minute."),
  lastDispatch: z.string().optional().describe("When the site build was last dispatched."),
  lastError: z.string().optional().describe("Why the last dispatch failed; it is tried again after 1, 2, 4 … minutes, at most 30."),
  run: z
    .object({
      status: z.string().describe("GitHub's: queued, in_progress, completed …"),
      conclusion: z.string().nullable().describe("GitHub's once completed: success, failure …"),
      url: z.string().describe("The run on GitHub."),
      startedAt: z.string(),
    })
    .optional()
    .describe("The latest dispatched run of the site's workflow; absent when there is none or GitHub didn't answer."),
}) satisfies z.ZodType<BuildStatus>;
