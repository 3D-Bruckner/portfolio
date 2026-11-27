// What a print's form can be filled with from a Bambu Studio 3MF. The reader is model-readers (3D-Bruckner/model-readers), shared with
// 3dbruckner.de since 2026-11-27; this adds the site's rough price to its reading. Pure, so the web app runs it in the browser on the
// phone's own file: only the few kilobytes it needs are read.
import { materialOf, readThreeMf as read, type ByteSource, type ThreeMfReading as Reading } from "model-readers";
import { suggestedPrice } from "./pricing";

export { bytesSource, materialOf, plainText, type ByteSource, type Filament } from "model-readers";

export type ThreeMfReading = Reading & {
  /** The site's rough price from weight and time (backend/pricing.ts). */
  price?: number;
};

export type ThreeMfResult = { ok: true; value: ThreeMfReading } | { ok: false; reason: "not_3mf" | "unreadable" };

/** Reads what a print's form can be filled with from a 3MF, with the price the site would show for a sliced one. */
export async function readThreeMf(src: ByteSource): Promise<ThreeMfResult> {
  const got = await read(src);
  if (!got.ok) return got;
  const r: ThreeMfReading = got.value;
  if (r.weightGrams && r.printTimeMinutes)
    r.price = suggestedPrice({
      weightGrams: r.weightGrams,
      printTimeMinutes: r.printTimeMinutes,
      multicolor: (r.colors ?? 0) >= 2,
      material: materialOf(r.filaments),
    });
  return { ok: true, value: r };
}
