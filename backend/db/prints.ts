// The queries on prints and what hangs off them: their categories, sources and reserved slugs.
import type { Exec } from "./connection";
import type { NewPrintRow, PrintRow, PrintRowPatch, PrintSourceRow, ReservedSlugRow } from "./schema";

export function printQueries({ q, all, first, run }: Exec) {
  return {
    insertPrint: (row: NewPrintRow) => void run(q.insertInto("prints").values(row)),
    print: (id: string): PrintRow | undefined => first(q.selectFrom("prints").selectAll().where("id", "=", id)),
    printBySlug: (slug: string): PrintRow | undefined => first(q.selectFrom("prints").selectAll().where("slug", "=", slug)),
    /** Every print, or those with `status`; in no particular order (the domain orders them). */
    prints: (status?: PrintRow["status"]): PrintRow[] => {
      let query = q.selectFrom("prints").selectAll();
      if (status) query = query.where("status", "=", status);
      return all(query);
    },
    /** Updates the print's columns in `patch`; false when there is no such print. */
    updatePrint: (id: string, patch: PrintRowPatch): boolean => run(q.updateTable("prints").set(patch).where("id", "=", id)) > 0,
    /** Deletes the print; its categories, sources and photo rows go with it. False when there was none. */
    deletePrint: (id: string): boolean => run(q.deleteFrom("prints").where("id", "=", id)) > 0,
    /** The lowest position of any published print, or null when none is published. */
    minPosition: (): number | null =>
      first(
        q
          .selectFrom("prints")
          .select((eb) => eb.fn.min<number | null>("position").as("min"))
          .where("status", "=", "published"),
      )?.min ?? null,

    printCategoryLinks: (printIds: string[]): { print_id: string; category_id: string }[] =>
      printIds.length === 0 ? [] : all(q.selectFrom("print_categories").select(["print_id", "category_id"]).where("print_id", "in", printIds)),
    setPrintCategories: (printId: string, categoryIds: string[]) => {
      run(q.deleteFrom("print_categories").where("print_id", "=", printId));
      if (categoryIds.length > 0) run(q.insertInto("print_categories").values(categoryIds.map((category_id) => ({ print_id: printId, category_id }))));
    },
    printSources: (printIds: string[]): PrintSourceRow[] =>
      printIds.length === 0 ? [] : all(q.selectFrom("print_sources").selectAll().where("print_id", "in", printIds).orderBy("print_id").orderBy("idx")),
    setPrintSources: (printId: string, sources: { label: string; url: string }[]) => {
      run(q.deleteFrom("print_sources").where("print_id", "=", printId));
      if (sources.length > 0) run(q.insertInto("print_sources").values(sources.map((s, idx) => ({ print_id: printId, idx, label: s.label, url: s.url }))));
    },

    reservedSlug: (slug: string): ReservedSlugRow | undefined => first(q.selectFrom("reserved_slugs").selectAll().where("slug", "=", slug)),
    reserveSlug: (row: ReservedSlugRow) =>
      void run(
        q
          .insertInto("reserved_slugs")
          .values(row)
          .onConflict((oc) => oc.column("slug").doNothing()),
      ),
  };
}
