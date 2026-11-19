import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCategory, deleteCategory, listCategories, renameCategory } from "./categories";
import type { Outcome } from "./outcome";
import { createPrint, publishPrint } from "./prints";
import { seedPhoto, testRuntime, type TestRuntime } from "./testing/runtime";

let rt: TestRuntime;
beforeEach(() => {
  rt = testRuntime();
});
afterEach(() => rt.store.close());

function value<T>(o: Outcome<T>): T {
  if (!o.ok) throw new Error(`expected ok, got ${o.reason}: ${o.message}`);
  return o.value;
}

describe("categories", () => {
  it("creates one with a slug from its name, listed with how many prints use it", () => {
    const c = value(createCategory(rt, "  Geschenkideen "));
    expect(c).toMatchObject({ name: "Geschenkideen", slug: "geschenkideen" });
    value(createPrint(rt, { title: "Vase", description: "", categoryIds: [c.id] }));
    value(createCategory(rt, "Deko"));
    expect(listCategories(rt)).toEqual([
      { id: expect.any(String), name: "Deko", slug: "deko", prints: 0 },
      { id: c.id, name: "Geschenkideen", slug: "geschenkideen", prints: 1 },
    ]);
  });

  it("refuses an empty name or one without a letter or digit", () => {
    expect(createCategory(rt, " ")).toMatchObject({ ok: false, reason: "invalid" });
    expect(createCategory(rt, "!!")).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("duplicateCategoryNameConflict: the same name, or one with the same slug, is refused", () => {
    value(createCategory(rt, "Geschenkideen"));
    expect(createCategory(rt, "Geschenkideen")).toMatchObject({ ok: false, reason: "conflict" });
    expect(createCategory(rt, "geschenkideen!")).toMatchObject({ ok: false, reason: "conflict" });
    const other = value(createCategory(rt, "Deko"));
    expect(renameCategory(rt, other.id, "Geschenkideen")).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("renameKeepsSlug", () => {
    const c = value(createCategory(rt, "Geschenkideen"));
    expect(value(renameCategory(rt, c.id, "Geschenke"))).toEqual({ id: c.id, name: "Geschenke", slug: "geschenkideen" });
  });

  it("deleteCategoryInUseRefused: refused while a print uses it, naming the prints", () => {
    const c = value(createCategory(rt, "Geschenkideen"));
    const p = value(createPrint(rt, { title: "Beyblade – Dragoon", description: "Ein Kreisel.", categoryIds: [c.id] }));
    seedPhoto(rt, p.id);
    value(publishPrint(rt, p.id));
    value(createPrint(rt, { title: "Vase", description: "", categoryIds: [c.id] }));
    const o = deleteCategory(rt, c.id);
    expect(o).toMatchObject({ ok: false, reason: "conflict" });
    if (!o.ok) {
      expect(o.message).toContain("Beyblade – Dragoon");
      expect(o.message).toContain("Vase");
    }
  });

  it("deletes an unused one; unknown ids are not_found", () => {
    const c = value(createCategory(rt, "Deko"));
    expect(deleteCategory(rt, c.id)).toEqual({ ok: true, value: undefined });
    expect(listCategories(rt)).toEqual([]);
    expect(deleteCategory(rt, c.id)).toMatchObject({ ok: false, reason: "not_found" });
    expect(renameCategory(rt, c.id, "X")).toMatchObject({ ok: false, reason: "not_found" });
  });
});
