import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { openRuntime } from "./runtime";

describe("openRuntime", () => {
  it("opens DATA_DIR/upload.sqlite, creating the directory, and runs the migrations", () => {
    const dataDir = join(process.env.DATA_DIR!, "nested", "data");
    const rt = openRuntime(loadConfig({ NODE_ENV: "test", PUBLIC_URL: "https://upload.example.com", UPLOAD_SECRET: "s".repeat(32), DATA_DIR: dataDir }));
    try {
      expect(existsSync(join(dataDir, "upload.sqlite"))).toBe(true);
      expect(rt.raw.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(rt.raw.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(rt.clock()).toBeInstanceOf(Date);
      expect(rt.fetch).toBe(globalThis.fetch);
    } finally {
      rt.raw.close();
    }
  });
});
