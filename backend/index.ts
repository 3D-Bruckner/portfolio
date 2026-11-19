// The backend as the frontend sees it: app/, components/, proxy.ts and instrumentation.ts import only from here (ESLint's boundary rule).
import { loadConfig } from "./config";
import { openRuntime, type Runtime } from "./runtime";

export { createCategory, deleteCategory, listCategories, renameCategory, type Category } from "./categories";
export type { Config } from "./config";
export { healthResponse } from "./health";
export { log } from "./log";
export { movePrint, moveShowcase, setShowcase } from "./order";
export type { Outcome, Reason } from "./outcome";
export { PRINT_FIELDS, parsePrintInput, parsePrintPatch, printInputSchema, printPatchSchema } from "./printfields";
export {
  createPrint,
  deletePrint,
  getPrint,
  listPrints,
  publishPrint,
  siteOrder,
  unpublishPrint,
  updatePrint,
  type Photo,
  type Print,
  type PrintInput,
  type PrintPatch,
} from "./prints";
export type { Runtime } from "./runtime";
export { toSlug } from "./slug";

// One runtime per process, kept on globalThis so Next's dev server, which reloads modules, doesn't open the database twice.
const g = globalThis as { __upload?: Runtime };

/** The process's runtime, opened from the environment at the first call; a bad setting throws, naming it. */
export function runtime(): Runtime {
  g.__upload ??= openRuntime(loadConfig(process.env));
  return g.__upload;
}
