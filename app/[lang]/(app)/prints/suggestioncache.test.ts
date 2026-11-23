import { describe, expect, it, vi } from "vitest";
import { suggestionCache } from "./suggestioncache";

const answer = (value: string) => vi.fn(async () => ({ ok: true as const, value }));

describe("suggestionCache", () => {
  it("anotherBlockReusesTheAnswer: text, then categories, is one ask", async () => {
    const cache = suggestionCache<string>();
    const load = answer("a");
    await cache.ask("form1", ["title", "description"], load);
    cache.applied(["title", "description"], "form1", "form2");
    expect(await cache.ask("form2", ["categories"], load)).toEqual({ ok: true, value: "a" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("theSameBlockAgainAsksAnew: it means another version", async () => {
    const cache = suggestionCache<string>();
    await cache.ask("form1", ["categories"], answer("a"));
    cache.applied(["categories"], "form1", "form2");
    const again = answer("b");
    expect(await cache.ask("form2", ["categories"], again)).toEqual({ ok: true, value: "b" });
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("anEditedFormAsksAnew", async () => {
    const cache = suggestionCache<string>();
    await cache.ask("form1", ["title"], answer("a"));
    cache.applied(["title"], "form1", "form2");
    const again = answer("b");
    expect(await cache.ask("edited", ["categories"], again)).toEqual({ ok: true, value: "b" });
  });

  it("dropsAnAnswerTheFormMovedAwayFrom: edited while Claude was writing", async () => {
    const cache = suggestionCache<string>();
    await cache.ask("form1", ["title"], answer("a"));
    cache.applied(["title"], "edited meanwhile", "form2");
    const again = answer("b");
    await cache.ask("form2", ["categories"], again);
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("twoBlocksAtOnceShareOneAsk", async () => {
    const cache = suggestionCache<string>();
    const load = answer("a");
    const [one, two] = await Promise.all([cache.ask("form1", ["title"], load), cache.ask("form1", ["categories"], load)]);
    expect([one, two]).toEqual([
      { ok: true, value: "a" },
      { ok: true, value: "a" },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keepsNoFailure: the next tap asks again", async () => {
    const cache = suggestionCache<string>();
    await cache.ask("form1", ["title"], async () => ({ ok: false, error: "down" }));
    const again = answer("a");
    expect(await cache.ask("form1", ["title"], again)).toEqual({ ok: true, value: "a" });
  });
});
