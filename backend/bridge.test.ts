import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filamentCosts } from "./bridge";
import { siteExport, siteExportSchema } from "./export";
import { testRuntime, type TestRuntime } from "./testing/runtime";

let rt: TestRuntime;
beforeEach(() => {
  rt = testRuntime({ PORTFOLIO_BRIDGE_URL: "https://bridge.test/", PORTFOLIO_BRIDGE_TOKEN: "bridge_test" });
});
afterEach(() => rt.store.close());

const answer = { version: 1, costs: { PLA: 16, PETG: 17.09 } };

describe("filament costs", () => {
  it("readsThemWithItsTokenAndRemembersThem", async () => {
    const asked: { url: string; auth: string | null }[] = [];
    rt.fetch = (async (url: string, init?: RequestInit) => {
      asked.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify(answer));
    }) as typeof fetch;
    expect(await filamentCosts(rt)).toEqual({ PLA: 16, PETG: 17.09 });
    await filamentCosts(rt);
    expect(asked).toEqual([{ url: "https://bridge.test/costs", auth: "Bearer bridge_test" }]);
  });

  it("isNullWhenTheBridgeDoesntAnswer", async () => {
    rt.fetch = (async () => new Response("no", { status: 502 })) as typeof fetch;
    expect(await filamentCosts(rt)).toBeNull();
  });

  it("isNullForAnAnswerItDoesntKnow", async () => {
    rt.fetch = (async () => new Response(JSON.stringify({ version: 2, costs: {} }))) as typeof fetch;
    expect(await filamentCosts(rt)).toBeNull();
  });

  it("isNullWithoutSettingsAndAsksNobody", async () => {
    const plain = testRuntime();
    let asked = 0;
    plain.fetch = (async () => (asked++, new Response("{}"))) as typeof fetch;
    expect(await filamentCosts(plain)).toBeNull();
    expect(asked).toBe(0);
    plain.store.close();
  });

  it("neverReachesTheSiteExport", () => {
    expect(JSON.stringify(Object.keys(siteExportSchema.shape.prints.element.shape))).not.toMatch(/cost/i);
    expect(JSON.stringify(siteExport(rt))).not.toMatch(/cost|filamentColors/i);
  });
});
