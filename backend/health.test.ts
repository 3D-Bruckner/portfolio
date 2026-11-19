import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { healthResponse } from "./health";
import { openRuntime } from "./runtime";

const config = () => loadConfig({ NODE_ENV: "test", PUBLIC_URL: "https://upload.example.com", UPLOAD_SECRET: "s".repeat(32), DATA_DIR: process.env.DATA_DIR });

describe("healthResponse", () => {
  it("answers 200 {status: ok} with an open database", () => {
    const rt = openRuntime(config());
    try {
      expect(healthResponse(rt)).toEqual({ status: 200, body: { status: "ok" } });
    } finally {
      rt.store.close();
    }
  });

  it("answers 503 once the database is closed", () => {
    const rt = openRuntime(config());
    rt.store.close();
    expect(healthResponse(rt)).toEqual({ status: 503, body: { status: "unavailable" } });
  });
});
