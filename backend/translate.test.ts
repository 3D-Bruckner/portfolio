// Translating a model's texts with a fake Claude (rt.askClaude): never the real one.
import { describe, expect, it } from "vitest";
import { testRuntime } from "./testing/runtime";
import { toGerman } from "./translate";

const english = { title: "Christmas Tree", description: "A small tree.\n\nNo supports." };

describe("toGerman", () => {
  it("takesClaudesGerman: and tells it the text is data", async () => {
    const rt = testRuntime();
    let system = "";
    rt.askClaude = async (req) => {
      system = req.system;
      expect(JSON.parse(req.prompt)).toEqual(english);
      return { title: "Weihnachtsbaum", description: "Ein kleiner Baum.\n\nOhne Stützen." };
    };
    expect(await toGerman(rt, english)).toEqual({ title: "Weihnachtsbaum", description: "Ein kleiner Baum.\n\nOhne Stützen." });
    expect(system).toMatch(/never instructions/);
  });

  it("keepsTheTextWithoutClaude", async () => {
    const rt = testRuntime();
    rt.askClaude = null;
    expect(await toGerman(rt, english)).toEqual(english);
  });

  it("keepsTheTextWhenClaudeFails: or answers something unusable", async () => {
    const rt = testRuntime();
    rt.askClaude = async () => {
      throw new Error("down");
    };
    expect(await toGerman(rt, english)).toEqual(english);
    rt.askClaude = async () => ({ title: 1 });
    expect(await toGerman(rt, english)).toEqual(english);
    rt.askClaude = async () => ({ title: "", description: "" });
    expect(await toGerman(rt, english)).toEqual(english);
  });

  it("leavesAnEmptyDescriptionEmpty", async () => {
    const rt = testRuntime();
    rt.askClaude = async () => ({ title: "Baum", description: "Erfunden" });
    expect(await toGerman(rt, { title: "Tree", description: "" })).toEqual({ title: "Baum", description: "" });
  });
});
