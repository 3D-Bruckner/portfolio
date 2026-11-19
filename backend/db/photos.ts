// The queries on photos' rows (the files are the domain's, under DATA_DIR/photos/<printId>/).
import type { Exec } from "./connection";
import type { NewPhotoRow, PhotoRow } from "./schema";

export function photoQueries({ q, all, run }: Exec) {
  return {
    insertPhoto: (row: NewPhotoRow) => void run(q.insertInto("photos").values(row)),
    /** The photos of these prints, each print's in its order. */
    photosOf: (printIds: string[]): PhotoRow[] =>
      printIds.length === 0 ? [] : all(q.selectFrom("photos").selectAll().where("print_id", "in", printIds).orderBy("print_id").orderBy("position")),
  };
}
