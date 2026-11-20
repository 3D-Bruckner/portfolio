// The price formula of 3dbruckner.de (its src/lib/pricing.ts, where the numbers are kept in step with Invoice Ninja): a print's rough
// price from the slicer's weight and time. upload uses it only to suggest the price field from a sliced 3MF; Marcel can change it. Change
// the numbers there first, then here.
export const PRICE_PER_KG = { PLA: 45, PETG: 50 } as const;
export const PRICE_PER_HOUR = 1;
export const ORDER_FEE = 2;
/** Added to filament and time for multi-colour prints: AMS wear and handling. */
export const MULTICOLOR_SURCHARGE = 0.1;

export type Material = keyof typeof PRICE_PER_KG;

/** The site's "ca." price in whole euros: the middle of its calculator's range, rounded. */
export function suggestedPrice(input: { weightGrams: number; printTimeMinutes: number; multicolor: boolean; material: Material }): number {
  const single = (input.weightGrams / 1000) * PRICE_PER_KG[input.material] + (input.printTimeMinutes / 60) * PRICE_PER_HOUR + ORDER_FEE;
  const price = input.multicolor ? (single - ORDER_FEE) * (1 + MULTICOLOR_SURCHARGE) + ORDER_FEE : single;
  return Math.max(1, Math.round(price));
}

/** What the site's price is made of, in euros (unrounded): filament, machine time, the multi-colour surcharge and the order fee. */
export function priceParts(input: { weightGrams: number; printTimeMinutes: number; multicolor: boolean; material: Material }): {
  material: number;
  time: number;
  multicolor: number;
  fee: number;
} {
  const material = (input.weightGrams / 1000) * PRICE_PER_KG[input.material];
  const time = (input.printTimeMinutes / 60) * PRICE_PER_HOUR;
  return { material, time, multicolor: input.multicolor ? (material + time) * MULTICOLOR_SURCHARGE : 0, fee: ORDER_FEE };
}
