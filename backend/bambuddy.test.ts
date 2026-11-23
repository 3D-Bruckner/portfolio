import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { averageCosts, filamentCosts } from "./bambuddy";
import { siteExportSchema } from "./export";
import { testRuntime, type TestRuntime } from "./testing/runtime";

let rt: TestRuntime;
beforeEach(() => {
  rt = testRuntime({ PORTFOLIO_BAMBUDDY_URL: "https://bambuddy.test", PORTFOLIO_BAMBUDDY_KEY: "bb_test" });
});
afterEach(() => rt.store.close());

const spools = [
  { material: "PLA", cost_per_kg: 15 },
  { material: "PLA", cost_per_kg: 17 },
  { material: "PLA", cost_per_kg: null },
  { material: "PLA", cost_per_kg: 90, archived_at: "2026-01-01T00:00:00Z" },
  { material: "PETG", cost_per_kg: 17.09 },
  { material: "TPU", cost_per_kg: 30 },
];

describe("filament costs", () => {
  it("averagesSpoolsInStock: one without a price or archived doesn't count", () => {
    expect(averageCosts(spools)).toEqual({ PLA: 16, PETG: 17.09 });
  });

  it("readsThemWithTheKeyAndRemembersThem", async () => {
    const asked: { url: string; key: string | null }[] = [];
    rt.fetch = (async (url: string, init?: RequestInit) => {
      asked.push({ url: String(url), key: new Headers(init?.headers).get("x-api-key") });
      return new Response(JSON.stringify(spools));
    }) as typeof fetch;
    expect(await filamentCosts(rt)).toEqual({ PLA: 16, PETG: 17.09 });
    await filamentCosts(rt);
    expect(asked).toEqual([{ url: "https://bambuddy.test/api/v1/inventory/spools", key: "bb_test" }]);
  });

  it("isNullWhenBambuddyDoesntAnswer", async () => {
    rt.fetch = (async () => new Response("no", { status: 502 })) as typeof fetch;
    expect(await filamentCosts(rt)).toBeNull();
  });

  it("isNullWithoutSettingsAndAsksNobody", async () => {
    const plain = testRuntime();
    let asked = 0;
    plain.fetch = (async () => (asked++, new Response("[]"))) as typeof fetch;
    expect(await filamentCosts(plain)).toBeNull();
    expect(asked).toBe(0);
    plain.store.close();
  });

  it("neverReachesTheSiteExport", () => {
    expect(JSON.stringify(exportedFields())).not.toMatch(/cost/i);
  });
});

const exportedFields = () => Object.keys(siteExportSchema.shape.prints.element.shape);
