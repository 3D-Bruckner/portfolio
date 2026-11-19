// Prints: created as drafts (photos can come at the printer, the text later), published onto the site, unpublished, deleted. A print's
// slug is made from its title at creation, can change while it is a draft, is fixed once it was first published and is never reused
// after a delete (reserved_slugs). Every write goes through one check (checkWrite) after the field table's parse (printfields.ts).
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import type { Category } from "./categories";
import type { PrintRow, PrintRowPatch } from "./db";
import { siteSort } from "./order";
import { conflict, done, invalid, notFound, ok, type Outcome } from "./outcome";
import { photoOf, photosDir, type Photo } from "./photos";
import { parsePrintInput, parsePrintPatch, type PrintInput, type PrintPatch } from "./printfields";
import { mutation, type Runtime } from "./runtime";
import { toSlug } from "./slug";

export type { PrintInput, PrintPatch } from "./printfields";

/** A print's fields, with nothing left out. */
export type PrintValues = Required<PrintInput>;

export type Print = PrintValues & {
  id: string;
  slug: string;
  status: "draft" | "published";
  /** Pinned above the rest of the portfolio (and on the start page). */
  showcase: boolean;
  coverPhotoId: string | null;
  photos: Photo[];
  categories: Category[];
  /** When it was first published; its slug is fixed from then on. */
  firstPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---- rows ↔ values

function valuesOf(row: PrintRow, categoryIds: string[], sources: { label: string; url: string }[]): PrintValues {
  return {
    title: row.title,
    shortTitle: row.short_title,
    description: row.description,
    price: row.price,
    selfDesigned: row.self_designed === 1,
    weightGrams: row.weight_grams,
    printTimeMinutes: row.print_time_minutes,
    colors: row.colors,
    categoryIds,
    sources,
  };
}

/** The columns for the fields in `v` (categories and sources are tables of their own). */
function columns(v: Partial<PrintValues>): PrintRowPatch {
  const c: PrintRowPatch = {};
  if (v.title !== undefined) c.title = v.title;
  if (v.shortTitle !== undefined) c.short_title = v.shortTitle || null;
  if (v.description !== undefined) c.description = v.description;
  if (v.price !== undefined) c.price = v.price;
  if (v.selfDesigned !== undefined) c.self_designed = v.selfDesigned ? 1 : 0;
  if (v.weightGrams !== undefined) c.weight_grams = v.weightGrams;
  if (v.printTimeMinutes !== undefined) c.print_time_minutes = v.printTimeMinutes;
  if (v.colors !== undefined) c.colors = v.colors;
  return c;
}

/** Whether `fields` would store what `current` already holds: compared as stored (an empty short title is none; categories are a set). */
function unchanged(current: PrintValues, fields: Partial<PrintValues>): boolean {
  const asked = columns(fields);
  const held = columns(current) as Record<string, unknown>;
  const sameColumns = Object.entries(asked).every(([k, v]) => held[k] === v);
  // The order counts: the first category is the print's main one.
  const sameCategories = !fields.categoryIds || JSON.stringify(fields.categoryIds) === JSON.stringify(current.categoryIds);
  const sameSources = !fields.sources || JSON.stringify(fields.sources) === JSON.stringify(current.sources);
  return sameColumns && sameCategories && sameSources;
}

/** The prints of these rows, in the rows' order, with their categories, sources and photos. */
function assemble(rt: Runtime, rows: PrintRow[]): Print[] {
  const ids = rows.map((r) => r.id);
  const links = rt.store.printCategoryLinks(ids);
  const categories = new Map(rt.store.categoriesById([...new Set(links.map((l) => l.category_id))]).map((c) => [c.id, c]));
  const sources = rt.store.printSources(ids);
  const photos = rt.store.photosOf(ids);
  return rows.map((row) => {
    const cats = links.filter((l) => l.print_id === row.id).map((l) => categories.get(l.category_id)!);
    const srcs = sources.filter((s) => s.print_id === row.id).map((s) => ({ label: s.label, url: s.url }));
    return {
      id: row.id,
      slug: row.slug,
      status: row.status,
      ...valuesOf(
        row,
        cats.map((c) => c.id),
        srcs,
      ),
      showcase: row.showcase_position !== null,
      coverPhotoId: row.cover_photo_id,
      photos: photos.filter((p) => p.print_id === row.id).map(photoOf),
      categories: cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      firstPublishedAt: row.first_published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

const load = (rt: Runtime, id: string): Print => assemble(rt, [rt.store.print(id)!])[0]!;

// ---- the one write-path check

/**
 * What create and edit both check beyond the field table: the categories exist, the slug is usable and no other print's, a reserved
 * slug isn't chosen by hand (a draft made from a deleted print's title may carry one; publishing refuses it), a published print keeps a
 * description.
 */
function checkWrite(rt: Runtime, id: string | null, v: PrintValues & { slug: string }, o: { published: boolean; slugChosen: boolean }): Outcome<void> {
  const known = new Set(rt.store.categoriesById(v.categoryIds).map((c) => c.id));
  const unknown = v.categoryIds.filter((c) => !known.has(c));
  if (unknown.length > 0) return invalid(`categoryIds: no category ${unknown.join(", ")}; create a category before using it`);
  if (v.slug === "") return invalid("title: needs a letter or digit, since the print's address (slug) is made from it");
  const other = rt.store.printBySlug(v.slug);
  if (other && other.id !== id) return conflict(`The slug "${v.slug}" is taken by the print "${other.title}"; choose another title or slug.`);
  if (o.slugChosen) {
    const reserved = rt.store.reservedSlug(v.slug);
    if (reserved) return conflict(`The slug "${v.slug}" is reserved: ${reserved.reason}, and a published print's address is never reused.`);
  }
  if (o.published && v.description.trim() === "") return invalid("description: a published print needs one");
  return done;
}

// ---- reads

export function getPrint(rt: Runtime, id: string): Outcome<Print> {
  const row = rt.store.print(id);
  return row ? ok(assemble(rt, [row])[0]!) : notFound(`No print ${id}.`);
}

/** A print by its id or, failing that, its slug (what a person or an assistant may name it by). */
export function findPrint(rt: Runtime, idOrSlug: string): Outcome<Print> {
  const row = rt.store.print(idOrSlug) ?? rt.store.printBySlug(idOrSlug);
  return row ? ok(assemble(rt, [row])[0]!) : notFound(`No print with the id or slug ${idOrSlug}.`);
}

/** Drafts newest first, then the published prints in the site's order; or only one of them. */
export function listPrints(rt: Runtime, filter: { status?: "draft" | "published" } = {}): Print[] {
  const rows = rt.store.prints(filter.status);
  const drafts = rows.filter((r) => r.status === "draft").sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  return assemble(rt, [...drafts, ...siteSort(rows.filter((r) => r.status === "published"))]);
}

/** The published prints as the site shows them: the showcases in their order, then the rest by position. */
export function siteOrder(rt: Runtime): Print[] {
  return assemble(rt, siteSort(rt.store.prints("published")));
}

// ---- writes

/** A new draft; its slug is made from the title. Not a site change. */
export function createPrint(rt: Runtime, input: PrintInput): Outcome<Print> {
  const parsed = parsePrintInput(input);
  if (!parsed.ok) return parsed;
  const v: PrintValues = {
    shortTitle: null,
    price: null,
    selfDesigned: false,
    weightGrams: null,
    printTimeMinutes: null,
    colors: null,
    categoryIds: [],
    sources: [],
    // zod keeps a key that is present but undefined; it means "left out", so it must not overwrite a default.
    ...(Object.fromEntries(Object.entries(parsed.value).filter(([, v]) => v !== undefined)) as PrintInput),
  };
  v.categoryIds = [...new Set(v.categoryIds)];
  const slug = toSlug(v.title);
  return mutation(rt, () => {
    const checked = checkWrite(rt, null, { ...v, slug }, { published: false, slugChosen: false });
    if (!checked.ok) return checked;
    const id = randomUUID();
    const now = rt.clock().toISOString();
    rt.store.insertPrint({
      ...columns(v),
      id,
      slug,
      title: v.title,
      description: v.description,
      self_designed: v.selfDesigned ? 1 : 0,
      status: "draft",
      created_at: now,
      updated_at: now,
    });
    rt.store.setPrintCategories(id, v.categoryIds);
    rt.store.setPrintSources(id, v.sources);
    return ok(load(rt, id));
  });
}

/** Changes the fields `patch` names. The slug only until the print was first published. A site change when the print is published. */
export function updatePrint(rt: Runtime, id: string, patch: PrintPatch): Outcome<Print> {
  const parsed = parsePrintPatch(patch);
  if (!parsed.ok) return parsed;
  const changes = Object.fromEntries(Object.entries(parsed.value).filter(([, v]) => v !== undefined)) as PrintPatch;
  if (changes.categoryIds) changes.categoryIds = [...new Set(changes.categoryIds)];
  return mutation(rt, (siteChange) => {
    const row = rt.store.print(id);
    if (!row) return notFound(`No print ${id}.`);
    const { slug, ...fields } = changes;
    const slugChosen = slug !== undefined && slug !== row.slug;
    if (slugChosen && row.first_published_at)
      return conflict(`The slug "${row.slug}" is fixed: the print was published (${row.first_published_at}), and its address stays.`);
    const current = assemble(rt, [row])[0]!;
    const merged: PrintValues = { ...current, ...fields } as PrintValues;
    const checked = checkWrite(rt, id, { ...merged, slug: slug ?? row.slug }, { published: row.status === "published", slugChosen });
    if (!checked.ok) return checked;
    // A form saved as it was ("Speichern" without an edit) changes nothing: nothing is written and no build is started.
    if (!slugChosen && unchanged(current, fields)) return ok(current);
    rt.store.updatePrint(id, { ...columns(fields), ...(slugChosen ? { slug } : {}), updated_at: rt.clock().toISOString() });
    if (fields.categoryIds) rt.store.setPrintCategories(id, fields.categoryIds);
    if (fields.sources) rt.store.setPrintSources(id, fields.sources);
    if (row.status === "published") siteChange();
    return ok(load(rt, id));
  });
}

/** What a print still lacks before it can be published: a title, a description, at least one photo; empty when nothing. */
export function missingToPublish(p: { title: string; description: string; photos: unknown[] }): ("a title" | "a description" | "at least one photo")[] {
  const missing: ("a title" | "a description" | "at least one photo")[] = [];
  if (p.title.trim() === "") missing.push("a title");
  if (p.description.trim() === "") missing.push("a description");
  if (p.photos.length === 0) missing.push("at least one photo");
  return missing;
}

/**
 * Puts a draft on the site, at the top of the portfolio. Needs a title, a description and a photo; refused when its slug is reserved
 * (a deleted print's), naming the slug. Sets firstPublishedAt the first time only.
 */
export function publishPrint(rt: Runtime, id: string): Outcome<Print> {
  return mutation(rt, (siteChange) => {
    const row = rt.store.print(id);
    if (!row) return notFound(`No print ${id}.`);
    if (row.status === "published") return ok(load(rt, id));
    const missing = missingToPublish({ title: row.title, description: row.description, photos: rt.store.photosOf([id]) });
    if (missing.length > 0) return invalid(`Publishing needs ${missing.join(" and ")}.`);
    // Only a reserved slug can stand in the way: another print can't have this one (prints.slug is UNIQUE, and checkWrite refuses it).
    const reserved = rt.store.reservedSlug(row.slug);
    if (reserved)
      return conflict(
        `The slug "${row.slug}" is reserved: ${reserved.reason}, and a published print's address is never reused. Change this print's slug first.`,
      );
    const now = rt.clock().toISOString();
    rt.store.updatePrint(id, {
      status: "published",
      first_published_at: row.first_published_at ?? now,
      position: (rt.store.minPosition() ?? 1) - 1,
      showcase_position: null,
      updated_at: now,
    });
    siteChange();
    return ok(load(rt, id));
  });
}

/** What taking a print off the site writes: back to a draft, out of the portfolio order and the showcases. */
export const OFF_THE_SITE = { status: "draft", position: null, showcase_position: null } as const satisfies PrintRowPatch;

/** Takes a print off the site, back to a draft; it leaves the portfolio order and the showcases. */
export function unpublishPrint(rt: Runtime, id: string): Outcome<Print> {
  return mutation(rt, (siteChange) => {
    const row = rt.store.print(id);
    if (!row) return notFound(`No print ${id}.`);
    if (row.status === "draft") return ok(load(rt, id));
    rt.store.updatePrint(id, { ...OFF_THE_SITE, updated_at: rt.clock().toISOString() });
    siteChange();
    return ok(load(rt, id));
  });
}

/** Deletes a print and its photos (rows and files). A slug that was ever published is reserved, so no later print takes the address. */
export function deletePrint(rt: Runtime, id: string): Outcome<void> {
  // The folder to remove is named by the stored id, never by the one asked for.
  let folder: string | null = null;
  const out = mutation(rt, (siteChange) => {
    const row = rt.store.print(id);
    if (!row) return notFound(`No print ${id}.`);
    folder = photosDir(rt, row.id);
    if (row.first_published_at)
      rt.store.reserveSlug({ slug: row.slug, reason: `it was the address of the deleted print "${row.title}"`, created_at: rt.clock().toISOString() });
    rt.store.deletePrint(id);
    if (row.status === "published") siteChange();
    return done;
  });
  if (out.ok && folder) rmSync(folder, { recursive: true, force: true });
  return out;
}
