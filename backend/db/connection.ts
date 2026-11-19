// The data layer's connection (conventions: architecture/data-layer, stacks/sqlite): only backend/db/ holds better-sqlite3 and kysely;
// the rest of backend/ calls the functions here and in the store, and ESLint keeps the client and the migrations inside backend/db/.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { migrate } from "next-app-kit/migrations";
import { MIGRATIONS } from "./migrations";
import type { DB } from "./schema";

export type Connection = { db: Kysely<DB>; raw: Database.Database };

/** Opens DATA_DIR/upload.sqlite (creating the directory), in WAL mode with foreign keys on, and brings it to the last migration. */
export function openDatabase(dataDir: string): Connection {
  mkdirSync(dataDir, { recursive: true });
  const raw = new Database(join(dataDir, "upload.sqlite"));
  try {
    raw.pragma("journal_mode = WAL");
    raw.pragma("foreign_keys = ON");
    raw.pragma("busy_timeout = 5000");
    migrate(raw, MIGRATIONS);
  } catch (e) {
    raw.close();
    throw e;
  }
  return { db: new Kysely<DB>({ dialect: new SqliteDialect({ database: raw }) }), raw };
}

/** Whether the database answers a query: false once it is closed or broken. */
export function databaseAnswers(raw: Database.Database): boolean {
  try {
    return raw.prepare("select 1 as one").get() !== undefined;
  } catch {
    return false;
  }
}
