// The queries on site_state: the site build's trigger keeps its state there as key/value rows (backend/site.ts names the keys).
import type { Exec } from "./connection";

export function siteStateQueries({ q, all, run }: Exec) {
  return {
    /** Every site_state row, as key → value. */
    siteState: (): Record<string, string> => Object.fromEntries(all(q.selectFrom("site_state").select(["key", "value"])).map((r) => [r.key, r.value])),
    /** Sets these keys (an upsert each) and deletes the ones given as null. */
    writeSiteState: (entries: Record<string, string | null>): void => {
      for (const [key, value] of Object.entries(entries)) {
        if (value === null) run(q.deleteFrom("site_state").where("key", "=", key));
        else
          run(
            q
              .insertInto("site_state")
              .values({ key, value })
              .onConflict((oc) => oc.column("key").doUpdateSet({ value })),
          );
      }
    },
  };
}
