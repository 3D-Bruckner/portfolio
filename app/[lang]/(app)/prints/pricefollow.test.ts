import { describe, expect, it } from "vitest";
import { followsFormula, formulaPrice, includedLines, priceAfterNumbers } from "./pricefollow";

// 50 g PLA 2.25 € + 2 h 2 € + 2 € fee = 6.25, rounded up.
const numbers = { weightGrams: 50, printTimeMinutes: 120, colors: 1 };

describe("priceFollowsFormula", () => {
  it("gives no formula price while weight or time is missing", () => {
    expect(formulaPrice(numbers)).toBe(7);
    expect(formulaPrice({ ...numbers, weightGrams: null })).toBeNull();
    expect(formulaPrice({ ...numbers, printTimeMinutes: null })).toBeNull();
  });

  it("an empty price and the formula's price follow, any other is an own price", () => {
    expect(followsFormula(null, 7)).toBe(true);
    expect(followsFormula(7, 7)).toBe(true);
    expect(followsFormula(12, 7)).toBe(false);
    expect(followsFormula(12, null)).toBe(false);
  });

  it("a following price takes the new formula price", () => {
    expect(priceAfterNumbers(7, true, { ...numbers, weightGrams: 200 })).toBe(formulaPrice({ ...numbers, weightGrams: 200 }));
    expect(priceAfterNumbers(null, true, numbers)).toBe(7);
  });

  it("an own price stays when the numbers change", () => {
    expect(priceAfterNumbers(12, false, { ...numbers, weightGrams: 200 })).toBe(12);
  });

  it("counts the add-ons a print includes, not the ones it only offers", () => {
    const addOns = [
      { id: "feet", priceCents: 25 },
      { id: "ring", priceCents: 500 },
    ];
    const lines = includedLines(
      [
        { addOnId: "feet", quantity: 4, mode: "included" },
        { addOnId: "ring", quantity: 1, mode: "optional" },
      ],
      addOns,
    );
    expect(lines).toEqual([{ pricePerPiece: 0.25, quantity: 4 }]);
    expect(formulaPrice({ ...numbers, addOns: lines })).toBe(8); // 6.25 + 1.00 = 7.25
  });

  it("keeps the price while a number is being retyped", () => {
    expect(priceAfterNumbers(7, true, { ...numbers, weightGrams: null })).toBe(7);
  });
});
