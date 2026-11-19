// The queries on photos' rows (the files are the domain's, under DATA_DIR/photos/<printId>/).
import type { Exec } from "./connection";
import type { NewPhotoRow, PhotoRow } from "./schema";

export function photoQueries({ q, all, first, run }: Exec) {
  return {
    insertPhoto: (row: NewPhotoRow) => void run(q.insertInto("photos").values(row)),
    photo: (id: string): PhotoRow | undefined => first(q.selectFrom("photos").selectAll().where("id", "=", id)),
    /** The photos of these prints, each print's in its order. */
    photosOf: (printIds: string[]): PhotoRow[] =>
      printIds.length === 0 ? [] : all(q.selectFrom("photos").selectAll().where("print_id", "in", printIds).orderBy("print_id").orderBy("position")),
    /** The highest position among the print's photos, or null when it has none. */
    maxPhotoPosition: (printId: string): number | null =>
      first(
        q
          .selectFrom("photos")
          .select((eb) => eb.fn.max<number | null>("position").as("max"))
          .where("print_id", "=", printId),
      )?.max ?? null,
    setPhotoPosition: (id: string, position: number) => void run(q.updateTable("photos").set({ position }).where("id", "=", id)),
    deletePhoto: (id: string): boolean => run(q.deleteFrom("photos").where("id", "=", id)) > 0,
  };
}
