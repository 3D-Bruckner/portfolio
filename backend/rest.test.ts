// The REST API (backend/rest.ts) through the kit's restRoute, as /api/v1 serves it: the site export and the photos for the build's read
// token, the operations mirroring the MCP tools, the print bodies built from the field table, and openapi.json as committed.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkOpsMirrorTools, openApiDocument, restRoute } from "next-app-kit/rest";
import { signedInCookie } from "next-app-kit/testing";
import { createApiToken, type RestCaller } from "next-app-kit/tokens";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "./categories";
import { mcpContext } from "./mcp";
import type { Outcome } from "./outcome";
import { addPhoto, photoPath, type Photo } from "./photos";
import { PRINT_FIELDS } from "./printfields";
import { createPrint, getPrint, publishPrint, type Print } from "./prints";
import { OPEN_API, openApiFile, REST_OPS } from "./rest";
import { MARCEL, seedPhoto, testRuntime, type TestRuntime } from "./testing/runtime";

let rt: TestRuntime;
beforeEach(() => {
  rt = testRuntime();
});
afterEach(() => rt.store.close());

const BASE = "https://upload.example.com";
const WRITER: RestCaller = { person: "u1", actor: MARCEL, scope: "read+write", kind: "token" };

function value<T>(o: Outcome<T>): T {
  if (!o.ok) throw new Error(`expected ok, got ${o.reason}: ${o.message}`);
  return o.value;
}

function request(method: string, path: string, opts: { body?: unknown; token?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${BASE}/api/v1${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

/** A request as /api/v1 answers it, the caller found from its token as in production. */
async function withToken(method: string, path: string, token?: string): Promise<Response> {
  const req = request(method, path, { token });
  return restRoute(req, REST_OPS, rt, await rt.apiCaller(req), { base: BASE, log: () => {} });
}

/** The same with a JSON body. */
async function withTokenBody(method: string, path: string, token: string, body: unknown): Promise<Response> {
  const req = request(method, path, { token, body });
  return restRoute(req, REST_OPS, rt, await rt.apiCaller(req), { base: BASE, log: () => {} });
}

/** A request from a caller who may read and write (who they are is restCaller's, tested in accounts.test.ts). */
const call = (method: string, path: string, body?: unknown, caller: RestCaller = WRITER) =>
  restRoute(request(method, path, { body }), REST_OPS, rt, caller, { base: BASE, log: () => {} });

async function json<T = Record<string, unknown>>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

/** A token of Marcel's with this scope. */
async function token(scope: "read" | "read+write"): Promise<string> {
  const auth = await rt.auth();
  const cookie = await signedInCookie(auth, MARCEL);
  const person = (await rt.person(new Headers({ cookie })))!.id;
  const made = await createApiToken(auth, person, { name: "site build", scope, expiresInDays: null });
  if ("error" in made) throw new Error(made.error);
  return made.token;
}

async function publishedWithPhoto(title: string): Promise<{ print: Print; photo: Photo }> {
  const p = value(createPrint(rt, { title, description: `About ${title}.` }));
  const path = join(rt.config.dataDir, "in.png");
  await sharp({ create: { width: 300, height: 200, channels: 3, background: "#808080" } })
    .png()
    .toFile(path);
  const photo = value(await addPhoto(rt, p.id, { path, type: "image/png" }));
  return { print: value(publishPrint(rt, p.id)), photo };
}

describe("GET /api/v1/export", () => {
  it("exportWithReadToken: the site build's read token gets the export", async () => {
    const { print, photo } = await publishedWithPhoto("Vase");
    const r = await withToken("GET", "/export", await token("read"));
    expect(r.status).toBe(200);
    const e = await json<{ version: number; prints: { slug: string; photos: { url: string }[] }[] }>(r);
    expect(e.version).toBe(1);
    expect(e.prints.map((p) => p.slug)).toEqual([print.slug]);
    expect(e.prints[0]!.photos[0]!.url).toBe(`${BASE}/api/v1/photos/${photo.id}`);
  });

  it("withoutToken: 401, and a wrong token too", async () => {
    expect((await withToken("GET", "/export")).status).toBe(401);
    expect((await withToken("GET", "/export", "upl_nope")).status).toBe(401);
  });
});

describe("GET /api/v1/photos/{id}", () => {
  it("photoDownloadReadToken: the cutout's bytes for a read token, its sha256 as ETag; 401 without, 404 for none", async () => {
    const { photo } = await publishedWithPhoto("Vase");
    const read = await token("read");
    const r = await withToken("GET", `/photos/${photo.id}`, read);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("etag")).toBe(`"${photo.sha256}"`);
    expect(Buffer.from(await r.arrayBuffer()).equals(readFileSync(photoPath(rt, photo)))).toBe(true);
    expect((await withToken("GET", `/photos/${photo.id}`)).status).toBe(401);
    expect((await withToken("GET", "/photos/nope", read)).status).toBe(404);
  });

  it("answers 304 without the bytes when the caller holds the cutout's ETag, and 200 once the cutout changed", async () => {
    const { photo } = await publishedWithPhoto("Vase");
    const read = await token("read");
    const get = async (ifNoneMatch: string) => {
      const req = new Request(`${BASE}/api/v1/photos/${photo.id}`, { headers: { authorization: `Bearer ${read}`, "if-none-match": ifNoneMatch } });
      return restRoute(req, REST_OPS, rt, await rt.apiCaller(req), { base: BASE, log: () => {} });
    };
    const same = await get(`W/"other", "${photo.sha256}"`);
    expect(same.status).toBe(304);
    expect(same.headers.get("etag")).toBe(`"${photo.sha256}"`);
    expect(same.headers.get("cache-control")).toBe("private, no-cache");
    expect((await same.arrayBuffer()).byteLength).toBe(0);
    expect((await get('"an-older-cutout"')).status).toBe(200);
    // The ETag is checked before the file is read: a caller holding the current cutout costs no disk read (here, the file is gone).
    rmSync(photoPath(rt, photo));
    expect((await get(`"${photo.sha256}"`)).status).toBe(304);
  });

  it("a read token may not change anything", async () => {
    const r = await withToken("POST", "/categories", await token("read"));
    expect(r.status).toBe(403);
  });
});

describe("the operations", () => {
  it("restTakesEveryPrintField: create takes every field create takes, edit every field, from printfields.ts", async () => {
    const doc = openApiFile() as {
      paths: Record<string, Record<string, { requestBody?: { content: { "application/json": { schema: { properties: Record<string, unknown> } } } } }>>;
    };
    const props = (path: string, method: string) => Object.keys(doc.paths[path]![method]!.requestBody!.content["application/json"].schema.properties).sort();
    const all = Object.keys(PRINT_FIELDS).sort();
    expect(props("/prints", "post")).toEqual(all.filter((n) => PRINT_FIELDS[n as keyof typeof PRINT_FIELDS].onCreate !== null));
    expect(props("/prints/{id}", "patch")).toEqual(all);

    const cat = value(createCategory(rt, "Deko"));
    const fields = {
      title: "Vase – groß",
      shortTitle: "Vase",
      description: "Eine Vase.",
      price: 12,
      selfDesigned: true,
      weightGrams: 80,
      printTimeMinutes: 240,
      colors: 2,
      categoryIds: [cat.id],
      sources: [{ label: "MakerWorld", url: "https://makerworld.com/x" }],
    };
    const created = await call("POST", "/prints", fields);
    expect(created.status).toBe(201);
    const p = await json<Print & { url: string }>(created);
    expect(p).toMatchObject({ ...fields, slug: "vase-gross", status: "draft", url: `${BASE}/prints/${p.id}` });
    const edit = { ...fields, title: "Schale", shortTitle: null, price: null, weightGrams: null, printTimeMinutes: null, colors: null, slug: "schale" };
    const edited = await call("PATCH", `/prints/${p.id}`, { ...edit, categoryIds: [], sources: [], selfDesigned: false });
    expect(edited.status).toBe(200);
    expect(await json(edited)).toMatchObject({ ...edit, categoryIds: [], sources: [], selfDesigned: false });
    // An unknown field is refused, not dropped.
    expect((await call("POST", "/prints", { ...fields, colour: 2 })).status).toBe(400);
  });

  it("answers a refusal by its reason: not found 404, invalid 400, conflict 409", async () => {
    expect((await call("GET", "/prints/nope")).status).toBe(404);
    const draft = await json<Print>(await call("POST", "/prints", { title: "Vase", description: "" }));
    const refused = await call("POST", `/prints/${draft.id}/publish`);
    expect(refused.status).toBe(400);
    expect(await json(refused)).toEqual({ error: "Publishing needs a description and at least one photo.", code: "invalid_input" });
    const cat = value(createCategory(rt, "Deko"));
    value(createPrint(rt, { title: "Schale", description: "x", categoryIds: [cat.id] }));
    const inUse = await call("DELETE", `/categories/${cat.id}`);
    expect(inUse.status).toBe(409);
    expect(await json(inUse)).toMatchObject({ code: "conflict" });
  });

  it("finds a print by its id or its slug, and lists prints by status", async () => {
    const p = value(createPrint(rt, { title: "Vase", description: "x" }));
    expect(await json(await call("GET", `/prints/${p.id}`))).toMatchObject({ id: p.id });
    expect(await json(await call("GET", "/prints/vase"))).toMatchObject({ id: p.id });
    seedPhoto(rt, p.id);
    expect((await call("POST", `/prints/${p.id}/publish`)).status).toBe(200);
    expect((await json<{ prints: Print[] }>(await call("GET", "/prints?status=draft"))).prints).toEqual([]);
    expect((await json<{ prints: Print[] }>(await call("GET", "/prints?status=published"))).prints.map((x) => x.id)).toEqual([p.id]);
    expect((await call("GET", "/prints?status=gone")).status).toBe(400);
  });

  it("orders, pins, reorders photos, sets the cover and crops through the domain", async () => {
    const { print: a, photo } = await publishedWithPhoto("A");
    const b = value(createPrint(rt, { title: "B", description: "x" }));
    seedPhoto(rt, b.id);
    value(publishPrint(rt, b.id));
    expect((await call("POST", `/prints/${a.id}/move`, { beforeId: b.id })).status).toBe(200);
    expect(value(getPrint(rt, a.id)).showcase).toBe(false);
    expect(await json(await call("PUT", `/prints/${a.id}/showcase`, { on: true }))).toMatchObject({ showcase: true });
    expect((await call("POST", `/showcases/${a.id}/move`, { beforeId: null })).status).toBe(200);
    expect((await call("PUT", `/prints/${a.id}/photos/order`, { photoIds: [photo.id] })).status).toBe(200);
    expect(await json(await call("PUT", `/prints/${a.id}/cover`, { photoId: photo.id }))).toMatchObject({ coverPhotoId: photo.id });
    const cropped = await call("PUT", `/photos/${photo.id}/crop`, { crop: { left: 0, top: 0, width: 100, height: 100 } });
    expect(await json(cropped)).toMatchObject({ crop: { left: 0, top: 0, width: 100, height: 100 }, width: 100, height: 100 });
    expect((await call("PUT", `/photos/${photo.id}/crop`, { crop: { left: 0, top: 0, width: 999, height: 100 } })).status).toBe(400);
    expect(await json(await call("DELETE", `/photos/${photo.id}`))).toEqual({ unpublished: true });
  });

  it("manages categories", async () => {
    const made = await call("POST", "/categories", { name: "Deko" });
    expect(made.status).toBe(201);
    const cat = await json<{ id: string; slug: string }>(made);
    expect(cat.slug).toBe("deko");
    expect(await json(await call("PATCH", `/categories/${cat.id}`, { name: "Dekoration" }))).toMatchObject({ name: "Dekoration", slug: "deko" });
    expect(await json(await call("GET", "/categories"))).toEqual({ categories: [{ id: cat.id, name: "Dekoration", slug: "deko", prints: 0 }] });
    expect((await call("DELETE", `/categories/${cat.id}`)).status).toBe(204);
  });

  it("makes, lists and revokes the caller's own API tokens (signed in through OAuth)", async () => {
    const auth = await rt.auth();
    const person = (await rt.person(new Headers({ cookie: await signedInCookie(auth, MARCEL) })))!.id;
    const me: RestCaller = { person, actor: `${MARCEL} via Claude`, scope: "read+write", kind: "oauth" };
    const made = await call("POST", "/tokens", { name: "site build", scope: "read", expiresInDays: null }, me);
    expect(made.status).toBe(201);
    const t = await json<{ id: string; token: string; scope: string; expires_at: string | null }>(made);
    expect(t).toMatchObject({ scope: "read", expires_at: null });
    expect(t.token.startsWith("upl_")).toBe(true);
    const list = await json<{ tokens: { id: string }[] }>(await call("GET", "/tokens", undefined, me));
    expect(list.tokens.map((x) => x.id)).toEqual([t.id]);
    expect(JSON.stringify(list)).not.toContain(t.token);
    expect((await call("DELETE", `/tokens/${t.id}`, undefined, me)).status).toBe(204);
    expect((await call("DELETE", `/tokens/${t.id}`, undefined, me)).status).toBe(404);
  });

  it("tokenManagementRefusesApiTokens: an API token may list tokens but neither make nor revoke one (403 forbidden)", async () => {
    const auth = await rt.auth();
    const person = (await rt.person(new Headers({ cookie: await signedInCookie(auth, MARCEL) })))!.id;
    const kept = await createApiToken(auth, person, { name: "site build", scope: "read", expiresInDays: null });
    if ("error" in kept) throw new Error(kept.error);
    // As restCaller finds them: a write token is the person by their address alone.
    const writeToken = await token("read+write");
    const made = await withTokenBody("POST", "/tokens", writeToken, { name: "more", scope: "read+write", expiresInDays: null });
    expect(made.status).toBe(403);
    expect(await json(made)).toMatchObject({ code: "forbidden" });
    const revoked = await withToken("DELETE", `/tokens/${kept.id}`, writeToken);
    expect(revoked.status).toBe(403);
    expect(await json(revoked)).toMatchObject({ code: "forbidden" });
    expect((await withToken("GET", "/tokens", writeToken)).status).toBe(200);
    const list = await json<{ tokens: { id: string }[] }>(
      await call("GET", "/tokens", undefined, { person, actor: `${MARCEL} via Claude`, scope: "read+write", kind: "oauth" }),
    );
    expect(list.tokens.map((x) => x.id)).toContain(kept.id);
    expect(list.tokens).toHaveLength(2);
  });

  it("tokenManagementGoesByKind: the caller's kind decides, never what its actor says", async () => {
    const auth = await rt.auth();
    const person = (await rt.person(new Headers({ cookie: await signedInCookie(auth, MARCEL) })))!.id;
    const body = { name: "x", scope: "read", expiresInDays: 30 };
    // An API token is refused even with an actor that reads like a client's, and an OAuth caller allowed whatever its actor says.
    expect((await call("POST", "/tokens", body, { person, actor: `${MARCEL} via Claude`, scope: "read+write", kind: "token" })).status).toBe(403);
    expect((await call("POST", "/tokens", body, { person, actor: MARCEL, scope: "read+write", kind: "oauth" })).status).toBe(201);
  });

  it("tells the site build's status: pending after a change the site shows", async () => {
    expect(await json(await call("GET", "/site/build"))).toEqual({ pending: false });
    await publishedWithPhoto("Vase");
    expect(await json(await call("GET", "/site/build"))).toEqual({ pending: true });
  });

  it("deletes a print", async () => {
    const p = value(createPrint(rt, { title: "Vase", description: "x" }));
    expect((await call("DELETE", `/prints/${p.id}`)).status).toBe(204);
    expect((await call("DELETE", `/prints/${p.id}`)).status).toBe(404);
  });
});

describe("the table", () => {
  it("openapiIsCurrent: the committed openapi.json is the table's document (npm run generate writes it)", () => {
    const committed = JSON.parse(readFileSync(join(import.meta.dirname, "..", "openapi.json"), "utf8")) as unknown;
    expect(committed).toEqual(openApiFile());
    expect(openApiFile()).toEqual(openApiDocument(REST_OPS, { ...OPEN_API, serverUrl: "https://upload.3dbruckner.de/api/v1" }));
  });

  it("names the MCP tool each operation mirrors, or why none (export and photo bytes)", () => {
    const noTool = REST_OPS.filter((o) => o.noTool).map((o) => o.operationId);
    expect(noTool.sort()).toEqual(["getPhotoFile", "getSiteExport"]);
    expect(REST_OPS.every((o) => (o.tool === undefined) !== (o.noTool === undefined))).toBe(true);
  });

  it("everyToolHasAnOperation: every MCP tool has the operation that mirrors it, and every operation's tool exists", async () => {
    const tools = (await mcpContext(rt)).tools;
    expect(() => checkOpsMirrorTools(REST_OPS, tools)).not.toThrow();
    expect(() => checkOpsMirrorTools(REST_OPS, [...tools, { name: "a_tool_without_an_operation" }])).toThrow();
  });
});
