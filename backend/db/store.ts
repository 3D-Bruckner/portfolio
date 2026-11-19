// The Store: every query upload makes, bound to one connection. Domain code gets it as rt.store and never sees kysely or better-sqlite3.
import { databaseAnswers, openDatabase } from "./connection";
import { categoryQueries } from "./categories";
import { photoQueries } from "./photos";
import { printQueries } from "./prints";

export type Store = ReturnType<typeof printQueries> &
  ReturnType<typeof categoryQueries> &
  ReturnType<typeof photoQueries> & {
    /** Runs `fn` in one transaction (a savepoint when nested): all its writes or none. */
    transaction<T>(fn: () => T): T;
    /** Whether the database answers: false once it is closed or broken. */
    answers(): boolean;
    close(): void;
  };

/** Opens DATA_DIR/upload.sqlite, migrated to the last schema, and the queries on it. */
export function openStore(dataDir: string): Store {
  const { exec, raw } = openDatabase(dataDir);
  return {
    ...printQueries(exec),
    ...categoryQueries(exec),
    ...photoQueries(exec),
    transaction: (fn) => raw.transaction(fn)(),
    answers: () => databaseAnswers(raw),
    close: () => raw.close(),
  };
}
