import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAddOn, deleteAddOn, listAddOns, updateAddOn } from "./addons";
import { siteExport } from "./export";
import type { Outcome } from "./outcome";
import { createPrint, deletePrint, publishPrint, updatePrint } from "./prints";
import { seedPhoto, testRuntime, type TestRuntime } from "./testing/runtime";

let rt: TestRuntime;
beforeEach(() => {
  rt = testRuntime();
});
afterEach(() => rt.store.close());

function value<T>(o: Outcome<T>): T {
  if (!o.ok) throw new Error(`expected ok, got ${o.reason}: ${o.message}`);
  return o.value;
}

describe("add-ons", () => {
  it("createdOnceUsedOnSeveralPrints: listed with how many prints use it", () => {
    const a = value(createAddOn(rt, { name: " Dämpferfuß ", priceCents: 25 }));
    expect(a).toMatchObject({ name: "Dämpferfuß", priceCents: 25, available: true, invoiceNinjaProduct: null });
    for (const title of ["Vase", "Halter"]) value(createPrint(rt, { title, description: "", addOns: [{ addOnId: a.id, quantity: 4, mode: "included" }] }));
    expect(listAddOns(rt)[0]).toMatchObject({ id: a.id, prints: 2 });
  });

  it("refusesASecondOfTheSameName, whatever its case", () => {
    value(createAddOn(rt, { name: "Ring", priceCents: 50 }));
    expect(createAddOn(rt, { name: "ring", priceCents: 60 })).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("refusesAPriceThatIsNoWholeCent", () => {
    expect(createAddOn(rt, { name: "Ring", priceCents: 1.5 })).toMatchObject({ ok: false, reason: "invalid" });
    expect(createAddOn(rt, { name: "Ring", priceCents: Number.NaN })).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("deletesOnlyOnceNoPrintUsesIt", () => {
    const a = value(createAddOn(rt, { name: "Ring", priceCents: 50 }));
    const p = value(createPrint(rt, { title: "Vase", description: "", addOns: [{ addOnId: a.id, quantity: 1, mode: "optional" }] }));
    expect(deleteAddOn(rt, a.id)).toMatchObject({ ok: false, reason: "conflict" });
    value(deletePrint(rt, p.id));
    value(deleteAddOn(rt, a.id));
    expect(listAddOns(rt)).toEqual([]);
  });

  it("aPrintRefusesAnUnknownOrRepeatedAddOn", () => {
    const a = value(createAddOn(rt, { name: "Ring", priceCents: 50 }));
    const line = { addOnId: a.id, quantity: 1, mode: "included" as const };
    expect(createPrint(rt, { title: "A", description: "", addOns: [{ ...line, addOnId: "nope" }] })).toMatchObject({ ok: false, reason: "invalid" });
    expect(createPrint(rt, { title: "B", description: "", addOns: [line, line] })).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("anEditReplacesThePrintsAddOns", () => {
    const a = value(createAddOn(rt, { name: "Ring", priceCents: 50 }));
    const p = value(createPrint(rt, { title: "Vase", description: "" }));
    expect(value(updatePrint(rt, p.id, { addOns: [{ addOnId: a.id, quantity: 2, mode: "optional" }] })).addOns).toEqual([
      { addOnId: a.id, quantity: 2, mode: "optional" },
    ]);
    expect(value(updatePrint(rt, p.id, { addOns: [] })).addOns).toEqual([]);
  });

  it("theExportCarriesThemAndLeavesOutAnOptionalOneNoLongerAvailable", () => {
    const feet = value(createAddOn(rt, { name: "Fuß", priceCents: 25, invoiceNinjaProduct: "foot" }));
    const ring = value(createAddOn(rt, { name: "Ring", priceCents: 50 }));
    const p = value(
      createPrint(rt, {
        title: "Vase",
        description: "Eine Vase.",
        addOns: [
          { addOnId: feet.id, quantity: 4, mode: "included" },
          { addOnId: ring.id, quantity: 1, mode: "optional" },
        ],
      }),
    );
    seedPhoto(rt, p.id);
    value(publishPrint(rt, p.id));
    expect(siteExport(rt).prints[0]!.addOns).toEqual([
      { name: "Fuß", pricePerPiece: 0.25, quantity: 4, mode: "included", invoiceNinjaProduct: "foot" },
      { name: "Ring", pricePerPiece: 0.5, quantity: 1, mode: "optional" },
    ]);
    value(updateAddOn(rt, ring.id, { available: false }));
    expect(siteExport(rt).prints[0]!.addOns?.map((a) => a.name)).toEqual(["Fuß"]);
  });
});
