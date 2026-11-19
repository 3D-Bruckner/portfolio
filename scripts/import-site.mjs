#!/usr/bin/env node
// One-off import of 3dbruckner.de's prints into upload (the spec's Migration, step 1): reads src/assets/printed/<slug>/ (meta.yaml and the
// photos) and the start page's showcases (homePrints in src/pages/index.astro) from a checkout of 3D-Bruckner/3dbruckner, and creates each
// print through upload's REST API with its slug, fields, categories, photos in filename order and cover, published. Then the showcases
// in the start page's order and the rest in today's portfolio order (by folder name).
//
//   UPLOAD_URL=https://upload.3dbruckner.de UPLOAD_TOKEN=upl_… node scripts/import-site.mjs ../3dbruckner [--dry-run]
//
// The token must be allowed to write. A print whose slug is already in upload is left as it is, so a run that stopped half-way can run
// again; a print left without photos (a failed upload) is a draft and is finished by the next run. js-yaml comes from the site checkout.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const site = resolve(process.argv[2] ?? "");
const dryRun = process.argv.includes("--dry-run");
const base = (process.env.UPLOAD_URL ?? "").replace(/\/$/, "");
const token = process.env.UPLOAD_TOKEN ?? "";
if (!process.argv[2] || !base || (!token && !dryRun)) {
  console.error("usage: UPLOAD_URL=… UPLOAD_TOKEN=… node scripts/import-site.mjs <checkout of 3D-Bruckner/3dbruckner> [--dry-run]");
  process.exit(2);
}
const yaml = createRequire(join(site, "package.json"))("js-yaml");
const printedDir = join(site, "src", "assets", "printed");
const PHOTO = /\.(jpe?g)$/i;

// What the site has.
const folders = readdirSync(printedDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
// A print's address on the site is its folder's name as the site's toSlug writes it (zigaretten-anhänger: /portfolio/zigaretten-anhaenger);
// upload keeps that address as the slug, so every page keeps its address.
const toSlug = (name) =>
  name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const prints = folders.map((folder) => {
  const slug = toSlug(folder);
  const meta = yaml.load(readFileSync(join(printedDir, folder, "meta.yaml"), "utf8"));
  const photos = readdirSync(join(printedDir, folder))
    .filter((f) => PHOTO.test(f))
    .sort();
  if (!photos.length) throw new Error(`${slug}: no photos`);
  const sources = meta.source ? (Array.isArray(meta.source) ? meta.source : [meta.source]) : [];
  return { folder, slug, meta, photos, sources, cover: photos.includes(meta.cover) ? meta.cover : photos[0] };
});
const indexAstro = readFileSync(join(site, "src", "pages", "index.astro"), "utf8");
const homeBlock = indexAstro.match(/const homePrints = \[([\s\S]*?)\]/);
if (!homeBlock) throw new Error("src/pages/index.astro: no homePrints");
const showcases = [...homeBlock[1].matchAll(/"([^"]+)"/g)]
  .map((m) => m[1])
  .filter((s) => folders.includes(s))
  .map(toSlug);
console.log(`${prints.length} prints, ${prints.reduce((n, p) => n + p.photos.length, 0)} photos, showcases: ${showcases.join(", ")}`);
if (dryRun) {
  for (const p of prints) console.log(`  ${p.slug}: ${p.photos.length} photos, cover ${p.cover}, categories ${(p.meta.categories ?? []).join(" / ") || "-"}`);
  process.exit(0);
}

// upload's REST API.
async function api(method, path, body) {
  const r = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
async function uploadPhoto(printId, folder, file) {
  const fd = new FormData();
  fd.append("photo", new File([readFileSync(join(printedDir, folder, file))], file, { type: "image/jpeg" }));
  const r = await fetch(`${base}/api/prints/${printId}/photos`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: fd });
  const text = await r.text();
  if (r.status !== 201) throw new Error(`${folder}/${file}: ${r.status} ${text}`);
  return JSON.parse(text);
}

const categoryIds = new Map((await api("GET", "/categories")).categories.map((c) => [c.name, c.id]));
for (const name of new Set(prints.flatMap((p) => p.meta.categories ?? []))) {
  if (categoryIds.has(name)) continue;
  const made = await api("POST", "/categories", { name });
  categoryIds.set(name, made.id);
  console.log(`category ${name}`);
}

const existing = new Map((await api("GET", "/prints")).prints.map((p) => [p.slug, p]));
const ids = new Map();
for (const p of prints) {
  let print = existing.get(p.slug);
  if (print?.status === "published") {
    ids.set(p.slug, print.id);
    console.log(`${p.slug}: already there`);
    continue;
  }
  const m = p.meta;
  const fields = {
    title: m.title,
    description: m.description,
    ...(m.shortTitle ? { shortTitle: m.shortTitle } : {}),
    ...(m.price !== undefined ? { price: m.price } : {}),
    ...(m.selfDesigned ? { selfDesigned: true } : {}),
    ...(m.weightGrams ? { weightGrams: m.weightGrams } : {}),
    ...(m.printTimeMinutes ? { printTimeMinutes: m.printTimeMinutes } : {}),
    ...(m.colors ? { colors: m.colors } : {}),
    categoryIds: (m.categories ?? []).map((n) => categoryIds.get(n)),
    // A source without a link (tablet-wandhalterung's) shows nothing on the site and is left out.
    sources: p.sources.filter((s) => s.url).map((s) => ({ label: s.label, url: s.url })),
  };
  if (!print) {
    print = await api("POST", "/prints", fields);
    // The slug is made from the title; the site's address is the folder's name, kept as it is.
    if (print.slug !== p.slug) print = await api("PATCH", `/prints/${print.id}`, { slug: p.slug });
  }
  // A draft from a run that stopped: its photos are sent again from the start.
  for (const ph of print.photos ?? []) await api("DELETE", `/photos/${ph.id}`);
  let coverId;
  for (const file of p.photos) {
    const added = await uploadPhoto(print.id, p.folder, file);
    if (file === p.cover) coverId = added.id;
  }
  await api("PUT", `/prints/${print.id}/cover`, { photoId: coverId });
  await api("POST", `/prints/${print.id}/publish`);
  ids.set(p.slug, print.id);
  console.log(`${p.slug}: ${p.photos.length} photos, published`);
}

// The order: the start page's showcases in theirs, then the rest by folder name, as the portfolio lists them today. Each move to the end.
for (const slug of showcases) {
  await api("PUT", `/prints/${ids.get(slug)}/showcase`, { on: true });
  await api("POST", `/showcases/${ids.get(slug)}/move`, { beforeId: null });
}
for (const p of prints) if (!showcases.includes(p.slug)) await api("POST", `/prints/${ids.get(p.slug)}/move`, { beforeId: null });
const exported = await api("GET", "/export");
console.log(`export: ${exported.prints.length} prints, ${exported.prints.reduce((n, p) => n + p.photos.length, 0)} photos`);
