// The queries on categories.
import type { Exec } from "./connection";
import type { CategoryRow } from "./schema";

export function categoryQueries({ q, all, first, run }: Exec) {
  return {
    insertCategory: (row: CategoryRow) => void run(q.insertInto("categories").values(row)),
    category: (id: string): CategoryRow | undefined => first(q.selectFrom("categories").selectAll().where("id", "=", id)),
    categoryByName: (name: string): CategoryRow | undefined => first(q.selectFrom("categories").selectAll().where("name", "=", name)),
    categoryBySlug: (slug: string): CategoryRow | undefined => first(q.selectFrom("categories").selectAll().where("slug", "=", slug)),
    /** The categories with these ids that exist. */
    categoriesById: (ids: string[]): CategoryRow[] => (ids.length === 0 ? [] : all(q.selectFrom("categories").selectAll().where("id", "in", ids))),
    /** Every category by name, with how many prints (drafts included) use it. */
    categoriesWithCounts: (): (CategoryRow & { prints: number })[] =>
      all(
        q
          .selectFrom("categories as c")
          .leftJoin("print_categories as pc", "pc.category_id", "c.id")
          .select(["c.id", "c.name", "c.slug", "c.created_at", (eb) => eb.fn.count<number>("pc.print_id").as("prints")])
          .groupBy("c.id")
          .orderBy("c.name"),
      ),
    renameCategory: (id: string, name: string): boolean => run(q.updateTable("categories").set({ name }).where("id", "=", id)) > 0,
    deleteCategory: (id: string): boolean => run(q.deleteFrom("categories").where("id", "=", id)) > 0,
    /** The prints that use the category, by title. */
    printsInCategory: (id: string): { id: string; title: string; status: "draft" | "published" }[] =>
      all(
        q
          .selectFrom("print_categories as pc")
          .innerJoin("prints as p", "p.id", "pc.print_id")
          .select(["p.id", "p.title", "p.status"])
          .where("pc.category_id", "=", id)
          .orderBy("p.title"),
      ),
  };
}
