// Categories: a small list of their own, so the form picks from it and "Geschenkidee" can't appear next to "Geschenkideen". A category's
// slug is made from its name at creation and never changes, so the site's /portfolio#<slug> anchors survive a rename. The site orders
// them itself (most prints first, "Sonstiges" last), so no order is stored here.
import { randomUUID } from "node:crypto";
import { conflict, done, invalid, notFound, ok, type Outcome } from "./outcome";
import { mutation, type Runtime } from "./runtime";
import { toSlug } from "./slug";

export type Category = { id: string; name: string; slug: string };

/** The most characters a category's name has. */
export const CATEGORY_NAME_LIMIT = 60;

function checkName(name: string): Outcome<string> {
  const n = name.trim();
  if (n === "") return invalid("name: a category needs a name");
  if (n.length > CATEGORY_NAME_LIMIT) return invalid(`name: at most ${CATEGORY_NAME_LIMIT} characters`);
  if (toSlug(n) === "") return invalid("name: needs a letter or digit, since the category's address is made from it");
  return ok(n);
}

const category = (row: { id: string; name: string; slug: string }): Category => ({ id: row.id, name: row.name, slug: row.slug });

/** A new category; refused when its name, or the address made from it, is another category's. Not a site change: no print uses it yet. */
export function createCategory(rt: Runtime, name: string): Outcome<Category> {
  const checked = checkName(name);
  if (!checked.ok) return checked;
  const n = checked.value;
  const slug = toSlug(n);
  return mutation(rt, () => {
    if (rt.store.categoryByName(n)) return conflict(`A category named "${n}" exists already.`);
    const same = rt.store.categoryBySlug(slug);
    if (same) return conflict(`"${n}" would have the address "${slug}", which the category "${same.name}" has.`);
    const row = { id: randomUUID(), name: n, slug, created_at: rt.clock().toISOString() };
    rt.store.insertCategory(row);
    return ok(category(row));
  });
}

/** Renames a category; its slug stays. A site change when a published print uses it. */
export function renameCategory(rt: Runtime, id: string, name: string): Outcome<Category> {
  const checked = checkName(name);
  if (!checked.ok) return checked;
  const n = checked.value;
  return mutation(rt, (siteChange) => {
    const row = rt.store.category(id);
    if (!row) return notFound(`No category ${id}.`);
    if (row.name === n) return ok(category(row));
    const other = rt.store.categoryByName(n);
    if (other) return conflict(`A category named "${n}" exists already.`);
    rt.store.renameCategory(id, n);
    if (rt.store.printsInCategory(id).some((p) => p.status === "published")) siteChange();
    return ok({ ...category(row), name: n });
  });
}

/** Deletes a category no print uses; refused, naming the prints, while any does (drafts included). */
export function deleteCategory(rt: Runtime, id: string): Outcome<void> {
  return mutation(rt, () => {
    const row = rt.store.category(id);
    if (!row) return notFound(`No category ${id}.`);
    const prints = rt.store.printsInCategory(id);
    if (prints.length > 0) {
      const names = prints.map((p) => `"${p.title}"${p.status === "draft" ? " (draft)" : ""}`).join(", ");
      return conflict(`The category "${row.name}" is still used by ${names}; take it off ${prints.length === 1 ? "that print" : "those prints"} first.`);
    }
    rt.store.deleteCategory(id);
    return done;
  });
}

/** Every category by name, with how many prints (drafts included) use it. */
export function listCategories(rt: Runtime): (Category & { prints: number })[] {
  return rt.store.categoriesWithCounts().map((row) => ({ ...category(row), prints: row.prints }));
}
