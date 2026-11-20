// The MCP tools at /mcp (conventions: architecture/mcp-first): the kit's defineTool over the same domain functions REST calls, each tool
// mirrored by the REST operation that names it (rest.ts; checkOpsMirrorTools in rest.test.ts). What Claude needs before a call is in the
// descriptions; what only matters after it is in each result's `guidance`, built from what the call did, and written only here (REST
// stays plain data). Every result naming a print carries its page in the web app (`url`). The print fields of create_print and
// update_print are the field table's (printfields.ts); the other shapes are shared with REST (shapes.ts). A domain refusal is the kit's
// `refuse`, its message the domain's English one, with what to do about it added where the tool knows.
import { defineTool, refuse, type McpContext, type Refused, type Tool, type Who } from "next-app-kit/mcp";
import { createApiToken, listApiTokens, revokeApiToken } from "next-app-kit/tokens";
import * as z from "zod";
import { createCategory, deleteCategory, listCategories, renameCategory } from "./categories";
import { movePrint, moveShowcase, setShowcase } from "./order";
import type { Outcome } from "./outcome";
import { deletePhoto, getPhoto, reorderPhotos, setCover, setCrop } from "./photos";
import { printInputSchema, printPatchSchema } from "./printfields";
import { readiness } from "./readiness";
import { createPrint, deletePrint, findPrint, getPrint, listPrints, missingToPublish, publishPrint, unpublishPrint, updatePrint, type Print } from "./prints";
import type { Runtime } from "./runtime";
import {
  BEFORE_ID,
  buildStatusSchema,
  CATEGORY_NAME,
  categorySchema,
  categoryWithCountSchema,
  CROP,
  newTokenSchema,
  PHOTO_IDS,
  photoSchema,
  printJson,
  printSchema,
  printUrl,
  SHOWCASE_ON,
  STATUS_FILTER,
  tokenInputSchema,
  tokenSchema,
} from "./shapes";
import { buildStatus, type BuildStatus } from "./site";
import { importFromLink } from "./sources";

/** The server's own text: what a client may drop, so nothing here is needed after a call (that is each result's guidance). */
export const MCP_INSTRUCTIONS = [
  "3D Bruckner Upload is where the prints on 3dbruckner.de's portfolio are put in: their details, photos, categories and order. Marcel runs it.",
  "Photos are added only in the web app's form, at a print's url (usually from his phone); the tools here order, crop and delete photos but can't upload them. The one exception: import_from_link brings a model page's pictures along with its details.",
  "A new print is a draft, and a draft is not on the site; publish_print puts it there. The site rebuilds itself about a minute after the last change it shows (site_build_status).",
  "A print's description is German, as the site shows it; everything else here is English.",
].join(" ");

const SERVER_INFO = { name: "3dbruckner-upload", version: "1" };

// ---- what the tools say

/** What a change to `p` means for the site: shown with the next build, or nothing while it is a draft. */
function onTheSite(p: Pick<Print, "status">): string {
  return p.status === "published"
    ? "The site shows this with its next build, about a minute after the last change and a few minutes to run (site_build_status)."
    : "It is a draft, so this is not on the site until publish_print.";
}

/** What a draft still lacks before publish_print, and where each is added; null when it can be published. */
function toPublish(p: Print, url: string): string | null {
  const missing = missingToPublish({ title: p.title, description: p.description, photos: p.photos });
  if (missing.length === 0) return null;
  const where = whereToAdd(missing, url).map((w) => w.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase()));
  return `Publishing it needs ${missing.join(" and ")}${where.length > 0 ? `: ${where.join("; ")}` : ""}.`;
}

/** Where each missing part of a print is added, one line each: a refused publish's guidance. */
function whereToAdd(missing: ReturnType<typeof missingToPublish>, url: string): string[] {
  return [
    missing.includes("a title") && "update_print sets the title.",
    missing.includes("at least one photo") && `Photos are added in the web form at ${url}: give Marcel that link (he adds them from his phone).`,
    missing.includes("a description") && "update_print sets the description (German, as the site shows it).",
  ].filter((line): line is string => typeof line === "string");
}

/** What would make the print look better on the site (readiness.ts), each as one line of guidance. */
const tips = (p: Print): string[] =>
  readiness(p)
    .filter((h) => h.level === "tip")
    .map((h) => h.text);

/** A domain refusal as the tool's refusal. */
const refused = (o: Extract<Outcome<unknown>, { ok: false }>): Refused => refuse(o.message);

/** The print `id` as answered, with `guidance`; the refusal if it is gone. */
function printResult(who: Who, rt: Runtime, id: string, guidance: (p: Print) => string[]) {
  const p = getPrint(rt, id);
  if (!p.ok) return refused(p);
  return { ...printJson(who.base, p.value), guidance: guidance(p.value) };
}

const PRINT_ID = z.string().min(1).describe("The print's id.");
const PHOTO_ID = z.string().min(1).describe("The photo's id (a print's photos are in get_print).");
const CATEGORY_ID = z.string().min(1).describe("The category's id (list_categories).");

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DELETE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

// ---- the tools

/** The tools over `rt`, each acting for the caller the kit found (who). */
export function mcpTools(rt: Runtime): Tool[] {
  return [
    // Prints
    defineTool({
      name: "list_prints",
      description:
        "List the prints: drafts newest first, then the published ones in the site's order (showcases first). Each with its fields, photos and url (its page in the web app).",
      input: z.object({ status: STATUS_FILTER }),
      output: z.object({ prints: z.array(printSchema) }),
      annotations: READ,
      handle: async ({ status }, who) => {
        const prints = listPrints(rt, { status });
        const drafts = prints.filter((p) => p.status === "draft").length;
        const guidance =
          prints.length === 0
            ? [status ? `No ${status === "draft" ? "drafts" : "published prints"}.` : "No prints yet; create_print makes one."]
            : [`${drafts} draft${drafts === 1 ? "" : "s"}, ${prints.length - drafts} published. Drafts are not on the site.`];
        return { prints: prints.map((p) => printJson(who.base, p)), guidance };
      },
    }),
    defineTool({
      name: "get_print",
      description:
        "Get one print by its id or its slug (its address on the site, /portfolio/<slug>): its fields, photos (with each original's size), categories and url.",
      input: z.object({ id: z.string().min(1).describe("The print's id or slug.") }),
      output: printSchema,
      annotations: READ,
      handle: async ({ id }, who) => {
        const p = findPrint(rt, id);
        if (!p.ok) return refused(p);
        const url = printUrl(who.base, p.value.id);
        const guidance =
          p.value.status === "published"
            ? [`It is on the site at /portfolio/${p.value.slug}${p.value.showcase ? ", as a showcase" : ""}.`, ...tips(p.value)]
            : ["It is a draft, not on the site.", toPublish(p.value, url) ?? "It can be published (publish_print).", ...tips(p.value)];
        return { ...printJson(who.base, p.value), guidance };
      },
    }),
    defineTool({
      name: "create_print",
      description:
        "Create a print as a draft, not yet on the site. Its slug (its address on the site) is made from the title. Categories must exist first (list_categories, create_category). Photos can't be added here: they are added in the web form at the print's url.",
      input: printInputSchema,
      output: printSchema,
      annotations: WRITE,
      handle: async (input, who) => {
        const made = createPrint(rt, input);
        if (!made.ok) return refused(made);
        const url = printUrl(who.base, made.value.id);
        return {
          ...printJson(who.base, made.value),
          guidance: [
            `Created as a draft: a draft is not on the site. Its address will be /portfolio/${made.value.slug}.`,
            `Photos are added in the web form at ${url}: give Marcel that link (he adds them from his phone).`,
            "Once it has photos and a description, publish_print puts it on the site.",
          ],
        };
      },
    }),
    defineTool({
      name: "import_from_link",
      description:
        "Create a draft from a model page's address on MakerWorld (https://makerworld.com/<lang>/models/<id>, optionally #profileId-<n>), Printables (https://www.printables.com/model/<id>) or Thingiverse (https://www.thingiverse.com/thing:<id>): its title, description (as the site has it, often English), the page as its source, print time, weight, colours and the site's price where the site has slicer numbers (the time put onto Marcel's Bambu Lab A1), and up to 12 of its pictures as photos. Refused when the model is a print already.",
      input: z.object({ url: z.string().min(1).describe("The model page's address.") }),
      output: printSchema.extend({
        site: z.string(),
        photosAdded: z.number(),
        photosSkipped: z.number(),
        profile: z.string().nullable(),
        scaled: z.object({ from: z.string(), factor: z.number(), to: z.string() }).nullable(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      handle: async ({ url }, who) => {
        const got = await importFromLink(rt, url);
        if (!got.ok) return refused(got);
        const { print, site, photos, photosSkipped, profile, scaled } = got.value;
        const link = printUrl(who.base, print.id);
        return {
          ...printJson(who.base, print),
          site,
          photosAdded: photos,
          photosSkipped,
          profile,
          scaled,
          guidance: [
            `Created as a draft from ${site}${profile ? ` (numbers from "${profile}")` : ""}: not on the site yet.`,
            ...(scaled
              ? [
                  `The print time was sliced for a ${scaled.from} and is scaled by ${scaled.factor} for Marcel's ${scaled.to}: an estimate; his own 3MF gives the real time.`,
                ]
              : []),
            "The description is the site's, often English: the site's is German, so write it in German with update_print (what the print is, short).",
            `The ${photos} photo${photos === 1 ? " is" : "s are"} the designer's pictures, not Marcel's: before publishing, Marcel adds his own at ${link} and removes these.`,
            ...tips(print),
          ],
        };
      },
    }),
    defineTool({
      name: "update_print",
      description:
        "Change the fields named; a field left out stays, null clears an optional one, and a list (categoryIds, sources) replaces the whole list. The slug can change only until the print is first published.",
      input: printPatchSchema.extend({ id: PRINT_ID }),
      output: printSchema,
      annotations: WRITE,
      handle: async ({ id, ...patch }, who) => {
        const p = updatePrint(rt, id, patch);
        if (!p.ok) return refused(p);
        return { ...printJson(who.base, p.value), guidance: [onTheSite(p.value), ...tips(p.value)] };
      },
    }),
    defineTool({
      name: "publish_print",
      description:
        "Put a draft on the site, at the top of the portfolio (move_print moves it). Needs a title, a description and at least one photo. Its slug is fixed from then on, and never used again once the print is deleted.",
      input: z.object({ id: PRINT_ID }),
      output: printSchema,
      annotations: WRITE,
      handle: async ({ id }, who) => {
        const before = getPrint(rt, id);
        if (!before.ok) return refused(before);
        const p = publishPrint(rt, id);
        if (!p.ok) {
          if (p.reason === "conflict") return refuse(p.message, { guidance: ["update_print's slug field takes another one; then publish_print again."] });
          const missing = missingToPublish({ title: before.value.title, description: before.value.description, photos: before.value.photos });
          return refuse(p.message, { guidance: [...whereToAdd(missing, printUrl(who.base, id)), "Then publish_print again."] });
        }
        return {
          ...printJson(who.base, p.value),
          guidance: [
            before.value.status === "published"
              ? "It was published already; nothing changed."
              : `Published: the site updates in a few minutes (the build starts a minute after the last change); site_build_status shows how it goes. Its address is /portfolio/${p.value.slug}.`,
          ],
        };
      },
    }),
    defineTool({
      name: "unpublish_print",
      description: "Take a print off the site, back to a draft; it leaves the portfolio order and the showcases. Its slug stays fixed.",
      input: z.object({ id: PRINT_ID }),
      output: printSchema,
      annotations: WRITE,
      handle: async ({ id }, who) => {
        const before = getPrint(rt, id);
        if (!before.ok) return refused(before);
        const p = unpublishPrint(rt, id);
        if (!p.ok) return refused(p);
        return {
          ...printJson(who.base, p.value),
          guidance: [
            before.value.status === "draft"
              ? "It was a draft already; nothing changed."
              : "Now a draft: it leaves the site with the next build. publish_print puts it back, at the top of the portfolio.",
          ],
        };
      },
    }),
    defineTool({
      name: "delete_print",
      description:
        "Delete a print with its photos, for good. Before deleting a published print, confirm with Marcel: it leaves the site, and a print that was ever published leaves its slug reserved, so no print can have that address again. To take it off the site and keep it, use unpublish_print.",
      input: z.object({ id: PRINT_ID }),
      output: z.object({
        deleted: z.object({
          id: z.string(),
          title: z.string(),
          slug: z.string(),
          wasPublished: z.boolean().describe("Whether it was on the site when deleted."),
        }),
      }),
      annotations: DELETE,
      handle: async ({ id }) => {
        const before = getPrint(rt, id);
        if (!before.ok) return refused(before);
        const p = before.value;
        const out = deletePrint(rt, id);
        if (!out.ok) return refused(out);
        const guidance =
          p.status === "published"
            ? [
                `Deleted. It leaves the site with the next build, and its address /portfolio/${p.slug} is now gone for good: the slug "${p.slug}" can't be reused, not even by a new print with the same title.`,
              ]
            : p.firstPublishedAt
              ? [`Deleted. It was a draft, but it was published once, so the slug "${p.slug}" can't be reused.`]
              : ["Deleted. It was a draft that was never published, so the site never showed it."];
        return { deleted: { id: p.id, title: p.title, slug: p.slug, wasPublished: p.status === "published" }, guidance };
      },
    }),
    // Order
    defineTool({
      name: "move_print",
      description:
        "Move a published print that isn't a showcase in the portfolio order: before another such print, or to the end (beforeId null). Showcases are moved with move_showcase.",
      input: z.object({ id: PRINT_ID, beforeId: BEFORE_ID }),
      output: printSchema,
      annotations: WRITE,
      handle: async ({ id, beforeId }, who) => {
        const o = movePrint(rt, id, beforeId);
        if (!o.ok) return refused(o);
        return printResult(who, rt, id, () => ["Moved; the site shows the new order with its next build."]);
      },
    }),
    defineTool({
      name: "set_showcase",
      description:
        "Pin a published print as a showcase, shown above the rest of the portfolio and on the start page (it joins at the end of the showcases), or unpin it.",
      input: z.object({ id: PRINT_ID, on: SHOWCASE_ON }),
      output: printSchema,
      annotations: WRITE,
      handle: async ({ id, on }, who) => {
        const o = setShowcase(rt, id, on);
        if (!o.ok) return refused(o);
        return printResult(who, rt, id, () => [
          on
            ? "Pinned as a showcase, at the end of the showcases (move_showcase reorders them); the site shows it with its next build."
            : "Unpinned: back to its place in the portfolio order with the next build.",
        ]);
      },
    }),
    defineTool({
      name: "move_showcase",
      description: "Move a showcase among the showcases: before another showcase, or to the end (beforeId null).",
      input: z.object({ id: PRINT_ID, beforeId: BEFORE_ID.describe("The showcase to stand before; null: to the end.") }),
      output: printSchema,
      annotations: WRITE,
      handle: async ({ id, beforeId }, who) => {
        const o = moveShowcase(rt, id, beforeId);
        if (!o.ok) return refused(o);
        return printResult(who, rt, id, () => ["Moved; the site shows the showcases' new order with its next build."]);
      },
    }),
    // Photos
    defineTool({
      name: "reorder_photos",
      description: "Put a print's photos in this order, naming each of them exactly once (their ids are in get_print). The cover stays; set_cover changes it.",
      input: z.object({ printId: PRINT_ID, photoIds: PHOTO_IDS }),
      output: printSchema,
      annotations: WRITE,
      handle: async ({ printId, photoIds }, who) => {
        const o = reorderPhotos(rt, printId, photoIds);
        if (!o.ok) return refused(o);
        return printResult(who, rt, printId, (p) => [`Photos reordered. ${onTheSite(p)}`]);
      },
    }),
    defineTool({
      name: "set_cover",
      description: "Make one of a print's photos its cover, the photo cards and lists show.",
      input: z.object({ printId: PRINT_ID, photoId: PHOTO_ID }),
      output: printSchema,
      annotations: WRITE,
      handle: async ({ printId, photoId }, who) => {
        const o = setCover(rt, printId, photoId);
        if (!o.ok) return refused(o);
        return printResult(who, rt, printId, (p) => [`Cover set. ${onTheSite(p)}`]);
      },
    }),
    defineTool({
      name: "set_photo_crop",
      description:
        "Choose a photo's cutout, the part the site shows: a rectangle in whole pixels of the original as shown, whose size is the photo's `original` in get_print; null for the whole photo. The original is kept, so a crop can always be changed.",
      input: z.object({ photoId: PHOTO_ID, crop: CROP.describe("left, top, width and height in the original's shown size; null: the whole photo.") }),
      output: photoSchema.extend({ printUrl: z.string().describe("The page of the photo's print in the web app.") }),
      annotations: WRITE,
      handle: async ({ photoId, crop }, who) => {
        const photo = await setCrop(rt, photoId, crop);
        if (!photo.ok) return refused(photo);
        const print = getPrint(rt, photo.value.printId);
        const size = `The cutout is now ${photo.value.width}×${photo.value.height} px (long edge at most 2400).`;
        const published = print.ok && print.value.status === "published";
        return {
          ...photo.value,
          printUrl: printUrl(who.base, photo.value.printId),
          guidance: [
            size,
            "Crops are in the original's shown size (`original` in get_print), whatever the cutout's size.",
            published ? "The site gets the new cutout with its next build." : "The print is a draft: the site shows the cutout once it is published.",
          ],
        };
      },
    }),
    defineTool({
      name: "delete_photo",
      description:
        "Delete a photo, its cutout and its original, for good; the cover moves to the first photo left. Deleting a published print's last photo takes the print off the site, back to a draft.",
      input: z.object({ photoId: PHOTO_ID }),
      output: z.object({ unpublished: z.boolean().describe("Whether the print went off the site with it."), print: printSchema }),
      annotations: DELETE,
      handle: async ({ photoId }, who) => {
        const photo = getPhoto(rt, photoId);
        if (!photo.ok) return refused(photo);
        const out = deletePhoto(rt, photoId);
        if (!out.ok) return refused(out);
        const p = getPrint(rt, photo.value.printId);
        if (!p.ok) return refused(p);
        const url = printUrl(who.base, p.value.id);
        const guidance = out.value.unpublished
          ? [
              `That was the print's last photo: the print is now a draft and leaves the site with the next build. Photos are added in the web form at ${url}; then publish_print puts it back.`,
            ]
          : [`Deleted. ${onTheSite(p.value)}`];
        return { unpublished: out.value.unpublished, print: printJson(who.base, p.value), guidance };
      },
    }),
    // Categories
    defineTool({
      name: "list_categories",
      description: "List the categories by name, each with how many prints (drafts included) use it.",
      input: z.object({}),
      output: z.object({ categories: z.array(categoryWithCountSchema) }),
      annotations: READ,
      handle: async () => {
        const categories = listCategories(rt);
        return {
          categories,
          guidance: [
            categories.length === 0
              ? "No categories yet; create_category makes one."
              : "A print's categories are set with create_print's or update_print's categoryIds (the ids here; a list replaces them all).",
          ],
        };
      },
    }),
    defineTool({
      name: "create_category",
      description:
        "Create a category. Its slug (the site's /portfolio#<slug>) is made from the name and never changes. Check list_categories first: a near-duplicate ('Geschenkidee' next to 'Geschenkideen') is what the list is there to prevent.",
      input: z.object({ name: CATEGORY_NAME }),
      output: categorySchema,
      annotations: WRITE,
      handle: async ({ name }) => {
        const c = createCategory(rt, name);
        if (!c.ok) return refused(c);
        return {
          ...c.value,
          guidance: [
            `Created; its slug "${c.value.slug}" stays through renames. Give prints this category with update_print's categoryIds (the whole list: it replaces the old one).`,
          ],
        };
      },
    }),
    defineTool({
      name: "rename_category",
      description: "Rename a category; its slug (the site's /portfolio#<slug>) stays.",
      input: z.object({ id: CATEGORY_ID, name: CATEGORY_NAME }),
      output: categorySchema,
      annotations: WRITE,
      handle: async ({ id, name }) => {
        const c = renameCategory(rt, id, name);
        if (!c.ok) return refused(c);
        const shown = listPrints(rt, { status: "published" }).some((p) => p.categoryIds.includes(id));
        return {
          ...c.value,
          guidance: [
            shown
              ? `Renamed; the slug "${c.value.slug}" stays. Published prints in it show the new name with the next build.`
              : `Renamed; the slug "${c.value.slug}" stays. No published print uses it, so the site doesn't change.`,
          ],
        };
      },
    }),
    defineTool({
      name: "delete_category",
      description:
        "Delete a category no print uses. Refused, naming the prints, while any print (a draft too) uses it: take it off them first with update_print.",
      input: z.object({ id: CATEGORY_ID }),
      output: z.object({ deleted: z.string().describe("The deleted category's id.") }),
      annotations: DELETE,
      handle: async ({ id }) => {
        const o = deleteCategory(rt, id);
        if (!o.ok) return refused(o);
        return { deleted: id, guidance: ["Deleted. No print used it, so the site doesn't change."] };
      },
    }),
    // Site
    defineTool({
      name: "site_build_status",
      description:
        "Whether a site build is pending (it starts about a minute after the last change the site shows), how the last dispatch went, and the latest build run on GitHub.",
      input: z.object({}),
      output: buildStatusSchema,
      annotations: { ...READ, openWorldHint: true },
      handle: async () => {
        const s = await buildStatus(rt);
        return { ...s, guidance: buildGuidance(s) };
      },
    }),
    // Tokens
    defineTool({
      name: "create_api_token",
      description:
        "Make an API token for scripts (the site build reads with a `read` one). The token is in this result once and never again. Ask Marcel for its name, scope and lifetime first.",
      input: tokenInputSchema,
      output: newTokenSchema,
      annotations: WRITE,
      handle: async (input, who) => {
        const made = await createApiToken(await rt.auth(), who.person, input);
        if ("error" in made) return refuse(made.error);
        return {
          ...made,
          guidance: [
            "Hand the token to Marcel once, to keep in 1Password; never repeat it afterwards, and don't put it anywhere else (no files, no notes).",
            `list_api_tokens shows it by its start, "${made.start}"; revoke_api_token takes it back.`,
          ],
        };
      },
    }),
    defineTool({
      name: "list_api_tokens",
      description: "List the caller's API tokens, newest first: names, scopes, starts and dates, never the tokens themselves.",
      input: z.object({}),
      output: z.object({ tokens: z.array(tokenSchema) }),
      annotations: READ,
      handle: async (_, who) => {
        const tokens = await listApiTokens(await rt.auth(), who.person);
        return {
          tokens,
          guidance: [
            tokens.length === 0 ? "No API tokens; create_api_token makes one." : "A token can't be shown again; revoke_api_token takes one back by its id.",
          ],
        };
      },
    }),
    defineTool({
      name: "revoke_api_token",
      description: "Revoke one of the caller's API tokens by its id (list_api_tokens); scripts using it are refused from then on.",
      input: z.object({ id: z.string().min(1).describe("The token's id.") }),
      output: z.object({ revoked: z.string().describe("The revoked token's id.") }),
      annotations: DELETE,
      handle: async ({ id }, who) => {
        const r = await revokeApiToken(await rt.auth(), who.person, id);
        if (!r.ok) return refuse(r.error);
        return { revoked: id, guidance: ["Revoked: whatever used it now gets 401. If a script still needs access, it needs a new token."] };
      },
    }),
  ];
}

/** What the site build's status means for Marcel. */
function buildGuidance(s: BuildStatus): string[] {
  const lines: string[] = [];
  if (s.pending) lines.push("Changes wait for a build: it is started once nothing changed for a minute.");
  if (s.lastError) lines.push(`The last start failed (${s.lastError}); it is tried again on its own, after 1, 2, 4 … minutes.`);
  if (s.run) {
    if (s.run.status !== "completed") lines.push(`A build is running (${s.run.status}): ${s.run.url}. The site updates when it finishes.`);
    else if (s.run.conclusion === "success") lines.push(`The latest build succeeded${s.pending ? "" : "; the site is up to date"}.`);
    else lines.push(`The latest build ended ${s.run.conclusion ?? "without a result"}: ${s.run.url}. Tell Marcel.`);
  }
  if (lines.length === 0) lines.push("Nothing waits for a build.");
  return lines;
}

// One context per runtime: the kit keeps one MCP handler per context object, and the route asks for it once.
const contexts = new WeakMap<Runtime, Promise<McpContext>>();

/** /mcp's context for `rt`: its sign-in, the tools, the server's instructions and the log a tool that throws is logged to. */
export function mcpContext(rt: Runtime): Promise<McpContext> {
  let ctx = contexts.get(rt);
  if (!ctx) {
    ctx = (async () => ({
      auth: await rt.auth(),
      signIn: rt.signIn,
      tools: mcpTools(rt),
      serverInfo: SERVER_INFO,
      instructions: MCP_INSTRUCTIONS,
      log: (line: string) => rt.log.error(line),
    }))();
    contexts.set(rt, ctx);
    ctx.catch(() => contexts.delete(rt));
  }
  return ctx;
}
