// "Enhance with AI" with a fake Claude (rt.askClaude): never the real one.
import { describe, expect, it } from "vitest";
import { claudeAsker } from "./claude";
import { createCategory } from "./categories";
import { loadConfig } from "./config";
import { suggestForPrint, type EnhanceInput } from "./enhance";
import { log } from "./log";
import { testRuntime } from "./testing/runtime";

const input = (over: Partial<EnhanceInput> = {}): EnhanceInput => ({
  printId: null,
  title: "ESP32 Plane Radar — Live ADS-B on a Round Display",
  shortTitle: "",
  description: "A round screen that shows planes near your house.",
  categoryIds: [],
  sources: [{ label: "MakerWorld", url: "https://makerworld.com/en/models/2872376" }],
  weightGrams: 9,
  printTimeMinutes: 35,
  colors: null,
  ...over,
});

describe("suggestForPrint", () => {
  it("returnsTheSuggestion: known categories only, a short title only when it fits a card", async () => {
    const rt = testRuntime();
    const deko = createCategory(rt, "Gadgets");
    expect(deko.ok).toBe(true);
    const id = deko.ok ? deko.value.id : "";
    const asked: { system: string; prompt: string }[] = [];
    rt.askClaude = async (req) => {
      asked.push(req);
      return {
        title: "Flugradar mit rundem Display",
        shortTitle: "Flugradar",
        description: "Ein kleines Radar für Flugzeuge.",
        categoryIds: [id, "made-up"],
        notes: ["Displaygröße prüfen."],
      };
    };
    const got = await suggestForPrint(rt, input());
    expect(got).toEqual({
      ok: true,
      value: {
        title: "Flugradar mit rundem Display",
        shortTitle: "Flugradar",
        description: "Ein kleines Radar für Flugzeuge.",
        categoryIds: [id],
        notes: ["Displaygröße prüfen."],
      },
    });
    expect(asked[0]!.prompt).toContain("Gadgets");
    expect(asked[0]!.prompt).toContain("ESP32 Plane Radar");
  });

  it("refusesWithoutClaude: no gateway set up", async () => {
    const rt = testRuntime();
    rt.askClaude = null;
    expect(await suggestForPrint(rt, input())).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("refusesWhatCantBeUsed: nothing to start from, Claude failing, an answer of another shape", async () => {
    const rt = testRuntime();
    rt.askClaude = async () => ({ title: "x" });
    expect(await suggestForPrint(rt, input({ title: " ", description: "" }))).toMatchObject({ ok: false, reason: "invalid" });
    expect(await suggestForPrint(rt, input())).toMatchObject({ ok: false, reason: "invalid" });
    rt.askClaude = async () => {
      throw new Error("down");
    };
    expect(await suggestForPrint(rt, input())).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("claudeAsker", () => {
  const config = (env: Record<string, string>) =>
    loadConfig({ NODE_ENV: "test", PUBLIC_URL: "https://upload.example.com", UPLOAD_SECRET: "s".repeat(32), DATA_DIR: "/tmp", ...env });

  it("isOffWithoutUrlAndToken", () => {
    expect(claudeAsker(config({}), log)).toBeNull();
    expect(claudeAsker(config({ UPLOAD_CLAUDE_URL: "https://claude.example.org" }), log)).toBeNull();
  });

  it("asksTheGateway: POST /v1/ask with the bearer token, the output back", async () => {
    const seen: { url: string; auth: string | null; body: unknown }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ output: { ok: 1 } }));
    }) as unknown as typeof fetch;
    const ask = claudeAsker(config({ UPLOAD_CLAUDE_URL: "https://claude.example.org/", UPLOAD_CLAUDE_TOKEN: "t0k" }), log, fake)!;
    expect(await ask({ system: "s", prompt: "p", schema: { type: "object" } })).toEqual({ ok: 1 });
    expect(seen).toEqual([{ url: "https://claude.example.org/v1/ask", auth: "Bearer t0k", body: { system: "s", prompt: "p", schema: { type: "object" } } }]);
  });

  it("throwsWhenTheGatewayRefuses", async () => {
    const fake = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    const ask = claudeAsker(config({ UPLOAD_CLAUDE_URL: "https://claude.example.org", UPLOAD_CLAUDE_TOKEN: "t" }), log, fake)!;
    await expect(ask({ system: "s", prompt: "p", schema: {} })).rejects.toThrow("401");
  });
});
