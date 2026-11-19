// A runtime for a test: a fresh upload.sqlite in a directory of its own under the test's DATA_DIR, and onSiteChange counted instead of
// starting a build. close() it at the end (afterEach).
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config";
import { openRuntime, type Runtime } from "../runtime";

export type TestRuntime = Runtime & { siteChanges: number };

export function testRuntime(): TestRuntime {
  const dataDir = mkdtempSync(join(process.env.DATA_DIR!, "rt-"));
  const rt = openRuntime(loadConfig({ NODE_ENV: "test", PUBLIC_URL: "https://upload.example.com", UPLOAD_SECRET: "s".repeat(32), DATA_DIR: dataDir }));
  const t: TestRuntime = { ...rt, siteChanges: 0, onSiteChange: () => void t.siteChanges++ };
  return t;
}

let photoNo = 0;

/** A photo row for `printId`, as Task 3's upload would leave it (the file itself isn't needed for the domain's rules). */
export function seedPhoto(rt: Runtime, printId: string): string {
  const id = `photo-${++photoNo}`;
  rt.store.insertPhoto({
    id,
    print_id: printId,
    position: photoNo,
    width: 2400,
    height: 1800,
    bytes: 1000,
    sha256: "0".repeat(64),
    created_at: rt.clock().toISOString(),
  });
  return id;
}
