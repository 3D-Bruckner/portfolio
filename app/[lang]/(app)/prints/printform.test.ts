import { describe, expect, it } from "vitest";
import { parsePrintInput, parsePrintPatch, PRINT_FIELDS } from "@/backend";
import { FORM_ORDER } from "./fieldorder";
import { fieldSpecs, formValues } from "./printform";

/** A filled-in form, as the browser posts it: every field. */
function filled(): FormData {
  const fd = new FormData();
  fd.set("title", "Beyblade – Dragoon");
  fd.set("shortTitle", "Dragoon");
  fd.set("description", "Ein Kreisel.");
  fd.set("price", "6");
  fd.set("selfDesigned", "on");
  fd.set("weightGrams", "42");
  fd.set("printTimeMinutes", "95");
  fd.set("colors", "2");
  fd.append("categoryIds", "c1");
  fd.append("categoryIds", "c2");
  fd.append("sources.label", "MakerWorld");
  fd.append("sources.url", "https://makerworld.com/x");
  fd.append("sources.label", "");
  fd.append("sources.url", "");
  fd.set("slug", "beyblade-dragoon");
  return fd;
}

describe("formTakesEveryPrintField", () => {
  it("the form shows every field of the table, once", () => {
    expect([...FORM_ORDER].sort()).toEqual(Object.keys(PRINT_FIELDS).sort());
  });

  it("an edit's parse takes every field, built from the field table", () => {
    const values = formValues(filled(), "edit");
    expect(Object.keys(values).sort()).toEqual(Object.keys(PRINT_FIELDS).sort());
    const parsed = parsePrintPatch(values);
    expect(parsed).toEqual({
      ok: true,
      value: {
        title: "Beyblade – Dragoon",
        shortTitle: "Dragoon",
        description: "Ein Kreisel.",
        price: 6,
        selfDesigned: true,
        weightGrams: 42,
        printTimeMinutes: 95,
        colors: 2,
        categoryIds: ["c1", "c2"],
        sources: [{ label: "MakerWorld", url: "https://makerworld.com/x" }],
        slug: "beyblade-dragoon",
      },
    });
  });

  it("a new print's parse takes every field create takes", () => {
    const values = formValues(filled(), "create");
    const creatable = Object.entries(PRINT_FIELDS)
      .filter(([, f]) => f.onCreate !== null)
      .map(([n]) => n);
    expect(Object.keys(values).sort()).toEqual(creatable.sort());
    expect(parsePrintInput(values).ok).toBe(true);
  });

  it("emptied fields clear: no price, no short title, unticked, no categories, no sources", () => {
    const fd = new FormData();
    for (const n of ["title", "shortTitle", "description", "price", "weightGrams", "printTimeMinutes", "colors"]) fd.set(n, "");
    fd.set("title", "T");
    expect(formValues(fd, "edit")).toEqual({
      title: "T",
      shortTitle: null,
      description: "",
      price: null,
      selfDesigned: false,
      weightGrams: null,
      printTimeMinutes: null,
      colors: null,
      categoryIds: [],
      sources: [],
    });
  });

  it("a number that isn't one reaches the table's check, which names the field", () => {
    const fd = filled();
    fd.set("price", "sechs");
    const parsed = parsePrintPatch(formValues(fd, "edit"));
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toMatch(/^price:/);
  });

  it("the form's limits come from the table", () => {
    const specs = fieldSpecs();
    expect(specs.title).toMatchObject({ kind: "text", maxLength: 200, required: true });
    expect(specs.price).toMatchObject({ kind: "integer", min: 0, max: 100000 });
    expect(specs.colors).toMatchObject({ min: 1, max: 100 });
    expect(specs.sources).toMatchObject({ kind: "sources", max: 10, labelMaxLength: 100, urlMaxLength: 2000 });
    expect(Object.keys(specs).sort()).toEqual(Object.keys(PRINT_FIELDS).sort());
  });
});
