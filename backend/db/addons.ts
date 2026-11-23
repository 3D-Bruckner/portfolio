// The queries on add-ons and the prints that use them.
import type { Exec } from "./connection";
import type { AddOnRow, AddOnRowPatch, PrintAddOnRow } from "./schema";

export function addOnQueries({ q, all, first, run }: Exec) {
  return {
    insertAddOn: (row: AddOnRow) => void run(q.insertInto("add_ons").values(row)),
    addOn: (id: string): AddOnRow | undefined => first(q.selectFrom("add_ons").selectAll().where("id", "=", id)),
    /** The add-on of this name, whatever its case. */
    addOnByName: (name: string): AddOnRow | undefined => first(q.selectFrom("add_ons").selectAll().where("name", "=", name)),
    addOnsById: (ids: string[]): AddOnRow[] => (ids.length === 0 ? [] : all(q.selectFrom("add_ons").selectAll().where("id", "in", ids))),
    /** Every add-on by name, with how many prints (drafts included) use it. */
    addOnsWithCounts: (): (AddOnRow & { prints: number })[] =>
      all(
        q
          .selectFrom("add_ons as a")
          .leftJoin("print_add_ons as pa", "pa.add_on_id", "a.id")
          .select([
            "a.id",
            "a.name",
            "a.price_cents",
            "a.available",
            "a.invoice_ninja_product",
            "a.created_at",
            (eb) => eb.fn.count<number>("pa.print_id").as("prints"),
          ])
          .groupBy("a.id")
          .orderBy("a.name"),
      ),
    updateAddOn: (id: string, patch: AddOnRowPatch): boolean => run(q.updateTable("add_ons").set(patch).where("id", "=", id)) > 0,
    deleteAddOn: (id: string): boolean => run(q.deleteFrom("add_ons").where("id", "=", id)) > 0,
    /** The prints that use the add-on, by title. */
    printsWithAddOn: (id: string): { id: string; title: string; status: "draft" | "published" }[] =>
      all(
        q
          .selectFrom("print_add_ons as pa")
          .innerJoin("prints as p", "p.id", "pa.print_id")
          .select(["p.id", "p.title", "p.status"])
          .where("pa.add_on_id", "=", id)
          .orderBy("p.title"),
      ),
    printAddOnLinks: (printIds: string[]): PrintAddOnRow[] =>
      printIds.length === 0 ? [] : all(q.selectFrom("print_add_ons").selectAll().where("print_id", "in", printIds).orderBy("print_id").orderBy("idx")),
    setPrintAddOns: (printId: string, addOns: { addOnId: string; quantity: number; mode: "included" | "optional" }[]) => {
      run(q.deleteFrom("print_add_ons").where("print_id", "=", printId));
      if (addOns.length > 0)
        run(
          q.insertInto("print_add_ons").values(addOns.map((a, idx) => ({ print_id: printId, add_on_id: a.addOnId, idx, quantity: a.quantity, mode: a.mode }))),
        );
    },
  };
}
