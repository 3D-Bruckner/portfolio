// The printer Marcel prints on, and how a model page's slicer time translates to it. MakerWorld's profiles and Printables' G-codes are
// often sliced for faster printers (CoreXY machines such as the P1S, X1, H2D or Prusa's MK4/Core One accelerate about twice as hard as
// the A1, a bed slinger), so their times are too short for him. A time sliced for one of those is scaled by A1_FACTOR; a time sliced for
// the A1 itself or a printer of its speed stays as it is. The factor is a rough average, not a slice: the 3MF button (a file sliced for
// his printer) gives the real time.
export const OUR_PRINTER = "Bambu Lab A1";
/** How much longer the A1 takes than a CoreXY printer, on average over typical prints. */
export const A1_FACTOR = 1.3;

const FASTER = /\b(X1|X1E|X1 ?Carbon|X2D|P1S|P1P|P2S|H2D|H2S|H2C|H3C|MK4S?|Core ?One|XL|Voron)\b/i;
const OURS = /\bA1\b(?! ?mini)/i;

/** Whether a profile or G-code was sliced for the A1 itself. */
export const isOurPrinter = (printer: string | null | undefined): boolean => Boolean(printer && OURS.test(printer));

/** The print time on the A1 for a time sliced for `printer`: scaled when that printer is faster, with the factor used (1: unchanged). */
export function onOurPrinter(minutes: number, printer: string | null | undefined): { minutes: number; factor: number } {
  const factor = printer && FASTER.test(printer) ? A1_FACTOR : 1;
  return { minutes: Math.max(1, Math.round(minutes * factor)), factor };
}

/** Bambu Studio's printer codes (a 3MF's slice_info printer_model_id, MakerWorld's devModelName) and the printers they name. */
const BAMBU_MODELS: Record<string, string> = {
  N2S: "A1",
  N1: "A1 mini",
  C11: "P1P",
  C12: "P1S",
  "BL-P001": "X1 Carbon",
  "BL-P002": "X1",
  C13: "X1E",
  O1D: "H2D",
  O1S: "H2S",
};

/** The printer a Bambu printer code names; an unknown code as it is. */
export const bambuPrinter = (code: string): string => BAMBU_MODELS[code] ?? code;
