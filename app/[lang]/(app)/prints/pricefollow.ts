// Whether a print's price follows the formula. Pure, so the form's rule is tested without a browser. Nothing is stored: a saved price
// that differs from the formula is an own price, so no existing print changes by itself.
import { suggestedPrice } from "@/backend/client";

export type PriceNumbers = {
  weightGrams?: number | null;
  printTimeMinutes?: number | null;
  colors?: number | null;
  /** The add-ons the print includes; one it only offers isn't part of its price. */
  addOns?: readonly { pricePerPiece: number; quantity: number }[];
};

/** What the formula takes from the form's numbers (PLA), or null while weight or time is missing. */
export function priceInputOf(n: PriceNumbers) {
  return n.weightGrams && n.printTimeMinutes
    ? {
        weightGrams: n.weightGrams,
        printTimeMinutes: n.printTimeMinutes,
        multicolor: (n.colors ?? 1) >= 2,
        material: "PLA" as const,
        addOns: n.addOns ?? [],
      }
    : null;
}

/** The customer price the formula gives for these numbers, or null while it can't say. */
export function formulaPrice(n: PriceNumbers): number | null {
  const input = priceInputOf(n);
  return input ? suggestedPrice(input) : null;
}

/** An empty price, or one equal to the formula's, follows the formula; any other is an own price. */
export function followsFormula(price: number | null, formula: number | null): boolean {
  return price === null || price === formula;
}

/** The price after the numbers changed: the new formula price while following, else unchanged (also while the numbers are incomplete). */
export function priceAfterNumbers(price: number | null, following: boolean, numbers: PriceNumbers): number | null {
  const formula = formulaPrice(numbers);
  return following && formula !== null ? formula : price;
}

/** The lines of the add-ons a print includes, from its choices and the add-ons' prices in cents. */
export function includedLines(
  choices: readonly { addOnId: string; quantity: number; mode: "included" | "optional" }[],
  addOns: readonly { id: string; priceCents: number }[],
): { pricePerPiece: number; quantity: number }[] {
  return choices.flatMap((c) => {
    const a = addOns.find((x) => x.id === c.addOnId);
    return a && c.mode === "included" ? [{ pricePerPiece: a.priceCents / 100, quantity: c.quantity }] : [];
  });
}

/** What the filament of a print costs and what is left of its price; null while the weight, the price or the cost is missing. */
export function marginOf(price: number | null, weightGrams: number | null | undefined, costPerKg: number | undefined) {
  if (price === null || !weightGrams || costPerKg === undefined) return null;
  const cost = Math.round((weightGrams / 1000) * costPerKg * 100) / 100;
  return { cost, margin: Math.round((price - cost) * 100) / 100 };
}
