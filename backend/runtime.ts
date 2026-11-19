// What every surface works with: the settings, the database, the clock and fetch, opened once per process. Tests open their own with
// openRuntime and a config of their own; the process's is runtime() in backend/index.ts.
import type Database from "better-sqlite3";
import type { Kysely } from "kysely";
import type { Config } from "./config";
import { openDatabase, type DB } from "./db";

export type Runtime = { config: Config; db: Kysely<DB>; raw: Database.Database; clock: () => Date; fetch: typeof fetch };

export function openRuntime(config: Config): Runtime {
  const { db, raw } = openDatabase(config.dataDir);
  return { config, db, raw, clock: () => new Date(), fetch: globalThis.fetch };
}
