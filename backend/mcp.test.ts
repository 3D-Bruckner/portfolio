// The MCP tools (backend/mcp.ts) through the kit's MCP server, as /mcp serves them (callTool: schemas and all, without a token): each
// tool's result with its guidance and the URL of each print it names, the print fields taken from the field table, and the tools acting
// for their caller.
import { join } from "node:path";
import { mcpRoute, type McpContext, type Who } from "next-app-kit/mcp";
import { callTool, signedInCookie } from "next-app-kit/testing";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as z from "zod";
import { createCategory } from "./categories";
import { MCP_INSTRUCTIONS, mcpContext } from "./mcp";
import type { Outcome } from "./outcome";
import { addPhoto } from "./photos";
import { PRINT_FIELDS } from "./printfields";
import { createPrint, publishPrint, updatePrint, type Print } from "./prints";
import { MARCEL, seedPhoto, testRuntime, type TestRuntime } from "./testing/runtime";

let rt: TestRuntime;
let ctx: McpContext;
let who: Who;
beforeEach(async () => {
  rt = testRuntime();
  ctx = await mcpContext(rt);
  who = { actor: `${MARCEL} via Claude`, person: "u1", clientId: "claude", base: BASE };
});
afterEach(() => rt.store.close());

const BASE = "https://portfolio.example.com";
const urlOf = (id: string) => `${BASE}/prints/${id}`;

function value<T>(o: Outcome<T>): T {
  if (!o.ok) throw new Error(`expected ok, got ${o.reason}: ${o.message}`);
  return o.value;
}

type Result = Record<string, unknown> & { guidance: string[] };

/** A tool's result; throws with the refusal's text when it refused. */
async function tool<T = Result>(name: string, input: Record<string, unknown> = {}, as: Who = who): Promise<T & { guidance: string[] }> {
  const r = await callTool(ctx, as, name, input);
  if (r.isError) throw new Error(`${name} refused: ${JSON.stringify(r.content)}`);
  const out = r.structuredContent as T & { guidance: string[] };
  expect(Array.isArray(out.guidance), `${name}'s guidance`).toBe(true);
  expect(out.guidance.length, `${name}'s guidance`).toBeGreaterThan(0);
  return out;
}

/** A tool's refusal text; fails when it didn't refuse. */
async function refusal(name: string, input: Record<string, unknown>, as: Who = who): Promise<string> {
  const r = await callTool(ctx, as, name, input);
  expect(r.isError, `${name} should refuse`).toBe(true);
  return (r.content as { type: string; text: string }[]).map((c) => c.text).join("\n");
}

const said = (r: { guidance: string[] }) => r.guidance.join("\n");

function draft(title = "Vase", extra: Record<string, unknown> = {}): Print {
  return value(createPrint(rt, { title, description: `About ${title}.`, ...extra }));
}

function published(title = "Vase"): Print {
  const p = draft(title);
  seedPhoto(rt, p.id);
  return value(publishPrint(rt, p.id));
}

/** Marcel as Better Auth knows him, and as an MCP call acts for him. */
async function marcel(): Promise<Who> {
  const auth = await rt.auth();
  const person = (await rt.person(new Headers({ cookie: await signedInCookie(auth, MARCEL) })))!.id;
  return { actor: `${MARCEL} via Claude`, person, clientId: "claude", base: BASE };
}

const TOOLS = [
  "list_prints",
  "get_print",
  "create_print",
  "import_from_link",
  "read_model_link",
  "update_print",
  "publish_print",
  "unpublish_print",
  "delete_print",
  "move_print",
  "set_showcase",
  "move_showcase",
  "reorder_photos",
  "set_cover",
  "set_photo_crop",
  "delete_photo",
  "list_categories",
  "create_category",
  "rename_category",
  "delete_category",
  "list_add_ons",
  "create_add_on",
  "update_add_on",
  "delete_add_on",
  "site_build_status",
  "create_api_token",
  "list_api_tokens",
  "revoke_api_token",
];

describe("the server", () => {
  it("serves the tools, each with guidance in its output schema", () => {
    expect(ctx.tools.map((t) => t.name).sort()).toEqual([...TOOLS].sort());
    for (const t of ctx.tools) {
      expect(t.outputSchema.shape, t.name).toHaveProperty("guidance");
      expect(t.description.length, t.name).toBeGreaterThan(20);
    }
  });

  it("says what the app is, that photos come in through the web form only, and that drafts aren't on the site", () => {
    expect(MCP_INSTRUCTIONS).toMatch(/3dbruckner\.de/);
    expect(MCP_INSTRUCTIONS).toMatch(/photos.*web (app|form)/i);
    expect(MCP_INSTRUCTIONS).toMatch(/draft.*not on the site/i);
    expect(ctx.instructions).toBe(MCP_INSTRUCTIONS);
  });

  it("mcpTakesEveryPrintField: create_print and update_print take every field of the table, with its description and limit", () => {
    const schema = (name: string) => {
      const t = ctx.tools.find((x) => x.name === name)!;
      return z.toJSONSchema(t.inputSchema, { io: "input" }) as { properties: Record<string, { description?: string }>; required?: string[] };
    };
    const create = schema("create_print");
    const update = schema("update_print");
    // Left out of create by name: a print's slug comes from its title (PRINT_FIELDS.slug.onCreate is null).
    expect(Object.keys(create.properties).sort()).toEqual(
      Object.keys(PRINT_FIELDS)
        .filter((n) => n !== "slug")
        .sort(),
    );
    expect(Object.keys(update.properties).sort()).toEqual(["id", ...Object.keys(PRINT_FIELDS)].sort());
    for (const [name, f] of Object.entries(PRINT_FIELDS)) {
      expect(update.properties[name]!.description, name).toBe(f.description);
      if (f.onCreate !== null) expect(create.properties[name]!.description, name).toBe(f.description);
    }
    expect(create.required?.sort()).toEqual(["description", "title"]);
    expect(update.required).toEqual(["id"]);
  });
});

describe("prints", () => {
  it("list_prints: drafts and published prints, each with its URL; status narrows it", async () => {
    const d = draft("Lampe");
    const p = published("Vase");
    const all = await tool<{ prints: { id: string; url: string }[] }>("list_prints");
    expect(all.prints.map((x) => [x.id, x.url])).toEqual([
      [d.id, urlOf(d.id)],
      [p.id, urlOf(p.id)],
    ]);
    expect(said(all)).toMatch(/1 draft.*1 published/);
    const drafts = await tool<{ prints: { id: string }[] }>("list_prints", { status: "draft" });
    expect(drafts.prints.map((x) => x.id)).toEqual([d.id]);
    const onSite = await tool<{ prints: { id: string }[] }>("list_prints", { status: "published" }, who);
    expect(onSite.prints.map((x) => x.id)).toEqual([p.id]);
  });

  it("list_prints with none yet says how to make one", async () => {
    expect(said(await tool("list_prints"))).toMatch(/create_print/);
  });

  it("get_print: by id or slug, with its URL; a draft says what publishing still needs", async () => {
    const d = draft("Lampe", { description: "" });
    const byId = await tool<{ id: string; url: string; status: string }>("get_print", { id: d.id });
    expect(byId).toMatchObject({ id: d.id, url: urlOf(d.id), status: "draft" });
    expect(said(byId)).toMatch(/a description/);
    expect(said(byId)).toMatch(/photo/);
    expect(said(byId)).toContain(urlOf(d.id));
    const bySlug = await tool<{ id: string }>("get_print", { id: "lampe" });
    expect(bySlug.id).toBe(d.id);
    expect(await refusal("get_print", { id: "nope" })).toMatch(/No print/);
  });

  it("get_print and update_print: tips for how the print looks on the site, until it has what they name", async () => {
    const d = draft("Lampe");
    expect(said(await tool("get_print", { id: d.id }))).toMatch(/No price/);
    expect(said(await tool("update_print", { id: d.id, price: 12 }))).not.toMatch(/No price/);
    expect(said(await tool("get_print", { id: d.id }))).toMatch(/No category/);
  });

  it("create_print: a draft with its URL; photos are added in the web form there, and a draft is not on the site", async () => {
    const cat = value(createCategory(rt, "Deko"));
    const made = await tool<{ id: string; url: string; status: string; slug: string; categoryIds: string[]; price: number | null }>("create_print", {
      title: "Beyblade – Dragoon",
      description: "Ein Kreisel.",
      price: 12,
      categoryIds: [cat.id],
    });
    expect(made).toMatchObject({ status: "draft", slug: "beyblade-dragoon", url: urlOf(made.id), categoryIds: [cat.id], price: 12 });
    expect(said(made)).toContain(urlOf(made.id));
    expect(said(made)).toMatch(/photos.*web form/i);
    expect(said(made)).toMatch(/draft.*not on the site/i);
    expect(rt.siteChanges).toBe(0);
    expect(await refusal("create_print", { title: "X", description: "", categoryIds: ["nope"] })).toMatch(/categor/i);
  });

  it("update_print: changes the fields named; a published print's change reaches the site with the next build", async () => {
    const d = draft();
    const changed = await tool<{ title: string; price: number | null; url: string }>("update_print", { id: d.id, title: "Vase 2", price: null });
    expect(changed).toMatchObject({ title: "Vase 2", price: null, url: urlOf(d.id) });
    expect(said(changed)).toMatch(/draft.*not on the site/i);
    const p = published("Lampe");
    const live = await tool("update_print", { id: p.id, price: 20 });
    expect(said(live)).toMatch(/next build/);
    expect(await refusal("update_print", { id: p.id, slug: "other" })).toMatch(/fixed/);
  });

  it("publish_print: the site updates in a few minutes and site_build_status shows it", async () => {
    const d = draft();
    seedPhoto(rt, d.id);
    const p = await tool<{ status: string; url: string }>("publish_print", { id: d.id });
    expect(p).toMatchObject({ status: "published", url: urlOf(d.id) });
    expect(said(p)).toMatch(/few minutes/);
    expect(said(p)).toMatch(/site_build_status/);
    expect(rt.siteChanges).toBe(1);
  });

  it("a refused publish says what is missing, and its guidance where to add it", async () => {
    const d = draft("Lampe", { description: "" });
    const r = await callTool(ctx, who, "publish_print", { id: d.id });
    expect(r.isError).toBe(true);
    const { error, guidance } = r.structuredContent as { error: string; guidance: string[] };
    expect(error).toBe("Publishing needs a description and at least one photo.");
    expect(guidance).toEqual([
      `Photos are added in the web form at ${urlOf(d.id)}: give Marcel that link (he adds them from his phone).`,
      "update_print sets the description (German, as the site shows it).",
      "Then publish_print again.",
    ]);
    // A client that reads only the text finds both.
    const text = await refusal("publish_print", { id: d.id });
    expect(text).toContain(urlOf(d.id));
    expect(text).toMatch(/update_print/);
  });

  it("a publish refused for a reserved slug names it, and its guidance says how to go on", async () => {
    const old = published("Beyblade – Dragoon");
    await tool("delete_print", { id: old.id });
    const again = draft("Beyblade – Dragoon");
    seedPhoto(rt, again.id);
    const r = await callTool(ctx, who, "publish_print", { id: again.id });
    const { error, guidance } = r.structuredContent as { error: string; guidance: string[] };
    expect(error).toMatch(/The slug "beyblade-dragoon" is reserved/);
    expect(guidance).toEqual(["update_print's slug field takes another one; then publish_print again."]);
  });

  it("unpublish_print: back to a draft, off the site with the next build", async () => {
    const p = published();
    const r = await tool<{ status: string; url: string }>("unpublish_print", { id: p.id });
    expect(r).toMatchObject({ status: "draft", url: urlOf(p.id) });
    expect(said(r)).toMatch(/next build/);
  });

  it("delete_print of a published print: its address is gone for good and its slug can't be reused", async () => {
    const p = published("Beyblade – Dragoon");
    const r = await tool<{ deleted: { id: string; slug: string; wasPublished: boolean } }>("delete_print", { id: p.id });
    expect(r.deleted).toMatchObject({ id: p.id, slug: "beyblade-dragoon", wasPublished: true });
    expect(said(r)).toMatch(/gone for good/);
    expect(said(r)).toMatch(/beyblade-dragoon.*can't be (re)?used/);
    expect(await refusal("get_print", { id: p.id })).toMatch(/No print/);
  });

  it("delete_print of a draft never published says the site never showed it", async () => {
    const d = draft();
    const r = await tool<{ deleted: { wasPublished: boolean } }>("delete_print", { id: d.id });
    expect(r.deleted.wasPublished).toBe(false);
    expect(said(r)).toMatch(/never/);
    expect(await refusal("delete_print", { id: d.id })).toMatch(/No print/);
  });
});

describe("order", () => {
  it("move_print: the print with its URL; the site shows the new order with its next build", async () => {
    const a = published("A");
    const b = published("B");
    const r = await tool<{ id: string; url: string }>("move_print", { id: b.id, beforeId: null });
    expect(r).toMatchObject({ id: b.id, url: urlOf(b.id) });
    expect(said(r)).toMatch(/next build/);
    const list = await tool<{ prints: { id: string }[] }>("list_prints", { status: "published" });
    expect(list.prints.map((x) => x.id)).toEqual([a.id, b.id]);
    expect(await refusal("move_print", { id: draft("C").id, beforeId: null })).toMatch(/"C" isn't in the portfolio order/);
  });

  it("set_showcase and move_showcase", async () => {
    const a = published("A");
    const b = published("B");
    const on = await tool<{ showcase: boolean; url: string }>("set_showcase", { id: a.id, on: true });
    expect(on).toMatchObject({ showcase: true, url: urlOf(a.id) });
    expect(said(on)).toMatch(/move_showcase/);
    await tool("set_showcase", { id: b.id, on: true });
    const moved = await tool<{ id: string }>("move_showcase", { id: b.id, beforeId: a.id });
    expect(moved.id).toBe(b.id);
    expect(said(moved)).toMatch(/next build/);
    const off = await tool<{ showcase: boolean }>("set_showcase", { id: a.id, on: false });
    expect(off.showcase).toBe(false);
    expect(said(off)).toMatch(/unpinned/i);
  });
});

describe("photos", () => {
  it("reorder_photos and set_cover: the print with its URL", async () => {
    const d = draft();
    const one = seedPhoto(rt, d.id);
    const two = seedPhoto(rt, d.id);
    const r = await tool<{ photos: { id: string }[]; url: string }>("reorder_photos", { printId: d.id, photoIds: [two, one] });
    expect(r.photos.map((p) => p.id)).toEqual([two, one]);
    expect(r.url).toBe(urlOf(d.id));
    expect(said(r)).toMatch(/draft/);
    const c = await tool<{ coverPhotoId: string }>("set_cover", { printId: d.id, photoId: two });
    expect(c.coverPhotoId).toBe(two);
    expect(await refusal("reorder_photos", { printId: d.id, photoIds: [one] })).toMatch(/exactly once/);
  });

  it("set_photo_crop: the photo and its print's URL; the site gets the new cutout with the next build", async () => {
    const d = draft();
    const path = join(rt.config.dataDir, "in.png");
    await sharp({ create: { width: 300, height: 200, channels: 3, background: "#808080" } })
      .png()
      .toFile(path);
    const photo = value(await addPhoto(rt, d.id, { path, type: "image/png" }));
    value(publishPrint(rt, d.id));
    const r = await tool<{ id: string; width: number; height: number; crop: unknown; printUrl: string }>("set_photo_crop", {
      photoId: photo.id,
      crop: { left: 10, top: 20, width: 100, height: 50 },
    });
    expect(r).toMatchObject({ id: photo.id, width: 100, height: 50, crop: { left: 10, top: 20, width: 100, height: 50 }, printUrl: urlOf(d.id) });
    expect(said(r)).toMatch(/next build/);
    expect(said(r)).toMatch(/original/);
    const whole = await tool<{ crop: unknown; width: number }>("set_photo_crop", { photoId: photo.id, crop: null });
    expect(whole).toMatchObject({ crop: null, width: 300 });
    expect(await refusal("set_photo_crop", { photoId: photo.id, crop: { left: 250, top: 0, width: 100, height: 10 } })).toMatch(
      /crop: whole pixels inside the photo as shown \(300×200\)/,
    );
    const t = ctx.tools.find((x) => x.name === "set_photo_crop")!;
    expect(t.description).toMatch(/original/);
    expect(t.description).toMatch(/get_print/);
  });

  it("delete_photo of a published print's last photo: the print is now a draft and leaves the site with the next build", async () => {
    const p = published();
    const r = await tool<{ unpublished: boolean; print: { status: string; url: string } }>("delete_photo", { photoId: p.photos[0]!.id });
    expect(r).toMatchObject({ unpublished: true, print: { status: "draft", url: urlOf(p.id) } });
    expect(said(r)).toMatch(/now a draft/);
    expect(said(r)).toMatch(/leaves the site with the next build/);
    expect(said(r)).toContain(urlOf(p.id));
  });

  it("delete_photo of one of several photos", async () => {
    const p = published();
    seedPhoto(rt, p.id);
    const r = await tool<{ unpublished: boolean; print: { photos: unknown[] } }>("delete_photo", { photoId: p.photos[0]!.id });
    expect(r.unpublished).toBe(false);
    expect(r.print.photos).toHaveLength(1);
    expect(said(r)).toMatch(/next build/);
    expect(await refusal("delete_photo", { photoId: "nope" })).toMatch(/No photo/);
  });
});

describe("categories", () => {
  it("create, list, rename and delete a category", async () => {
    const made = await tool<{ id: string; slug: string }>("create_category", { name: "Deko" });
    expect(made.slug).toBe("deko");
    expect(said(made)).toMatch(/categoryIds/);
    const list = await tool<{ categories: { id: string; prints: number }[] }>("list_categories");
    expect(list.categories).toEqual([{ id: made.id, name: "Deko", slug: "deko", prints: 0 }]);
    expect(said(list)).toMatch(/categoryIds/);
    const renamed = await tool<{ name: string; slug: string }>("rename_category", { id: made.id, name: "Dekoration" });
    expect(renamed).toMatchObject({ name: "Dekoration", slug: "deko" });
    expect(said(renamed)).toMatch(/slug "deko" stays/);
    expect(said(renamed)).toMatch(/No published print uses it/);
    expect(said(renamed)).not.toMatch(/next build/);
    const p = draft("Vase", { categoryIds: [made.id] });
    expect(await refusal("delete_category", { id: made.id })).toMatch(/Vase/);
    await tool("update_print", { id: p.id, categoryIds: [] });
    const gone = await tool<{ deleted: string }>("delete_category", { id: made.id });
    expect(gone.deleted).toBe(made.id);
  });

  it("rename_category of a category a published print uses: the site shows the new name with the next build", async () => {
    const made = await tool<{ id: string }>("create_category", { name: "Deko" });
    const p = published("Vase");
    value(updatePrint(rt, p.id, { categoryIds: [made.id] }));
    const renamed = await tool("rename_category", { id: made.id, name: "Dekoration" });
    expect(said(renamed)).toMatch(/next build/);
  });

  it("a category's name is trimmed and may not be empty, as its description says", async () => {
    expect(await refusal("create_category", { name: "   " })).toMatch(/name/);
    const made = await tool<{ name: string }>("create_category", { name: "  Deko  " });
    expect(made.name).toBe("Deko");
    const t = ctx.tools.find((x) => x.name === "create_category")!;
    const schema = z.toJSONSchema(t.inputSchema, { io: "input" }) as unknown as { properties: { name: { description?: string; minLength?: number } } };
    expect(schema.properties.name).toMatchObject({ minLength: 1 });
    expect(schema.properties.name.description).toMatch(/not empty/);
  });

  it("delete_print says to confirm with Marcel before deleting a published print", () => {
    expect(ctx.tools.find((x) => x.name === "delete_print")!.description).toMatch(/confirm with Marcel/);
  });

  it("list_categories with none says how to make one", async () => {
    expect(said(await tool("list_categories"))).toMatch(/create_category/);
  });
});

describe("the site build", () => {
  it("site_build_status: nothing pending, then pending after a publish", async () => {
    const idle = await tool<{ pending: boolean }>("site_build_status");
    expect(idle.pending).toBe(false);
    expect(said(idle)).toMatch(/nothing/i);
    published();
    const busy = await tool<{ pending: boolean }>("site_build_status");
    expect(busy.pending).toBe(true);
    expect(said(busy)).toMatch(/minute/);
  });
});

describe("API tokens", () => {
  it("create_api_token: the token once; hand it to Marcel for 1Password once and never repeat it", async () => {
    const me = await marcel();
    const made = await tool<{ id: string; token: string; scope: string }>("create_api_token", { name: "site build", scope: "read", expiresInDays: null }, me);
    expect(made.token.startsWith("ptf_")).toBe(true);
    expect(said(made)).toMatch(/Marcel/);
    expect(said(made)).toMatch(/1Password/);
    expect(said(made)).toMatch(/once/);
    expect(said(made)).toMatch(/never repeat/i);
    expect(said(made)).not.toContain(made.token);
    const list = await tool<{ tokens: { id: string }[] }>("list_api_tokens", {}, me);
    expect(list.tokens.map((t) => t.id)).toEqual([made.id]);
    expect(JSON.stringify(list)).not.toContain(made.token);
    const revoked = await tool<{ revoked: string }>("revoke_api_token", { id: made.id }, me);
    expect(revoked.revoked).toBe(made.id);
    expect(await refusal("revoke_api_token", { id: made.id }, me)).toMatch(/no such token/);
  });

  it("create_api_token over /mcp with an API token is refused (401): tokens are made by a person or an OAuth client, never by a token", async () => {
    const me = await marcel();
    const made = await tool<{ token: string }>("create_api_token", { name: "script", scope: "read+write", expiresInDays: 30 }, me);
    const call = new Request(`${rt.config.publicUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${made.token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "tools/call",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_api_token", arguments: { name: "x", scope: "read", expiresInDays: 30 } },
      }),
    });
    const r = await mcpRoute(call, ctx);
    expect(r.status).toBe(401);
    expect((await tool<{ tokens: unknown[] }>("list_api_tokens", {}, me)).tokens).toHaveLength(1);
  });

  it("toolsActAsCaller: an MCP call acts for the person it came from: the tokens it makes are theirs", async () => {
    const me = await marcel();
    const made = await tool<{ id: string }>("create_api_token", { name: "mine", scope: "read+write", expiresInDays: 30 }, me);
    // Someone else (another person id) sees none of Marcel's tokens and can't revoke his.
    const other: Who = { ...me, person: "someone-else", actor: "other@example.com via Claude" };
    expect((await tool<{ tokens: unknown[] }>("list_api_tokens", {}, other)).tokens).toEqual([]);
    expect(await refusal("revoke_api_token", { id: made.id }, other)).toBeTruthy();
    expect((await tool<{ tokens: { id: string }[] }>("list_api_tokens", {}, me)).tokens.map((t) => t.id)).toEqual([made.id]);
  });
});
