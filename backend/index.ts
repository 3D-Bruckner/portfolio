// The backend as the frontend sees it: app/, components/, proxy.ts and instrumentation.ts import only from here (ESLint's boundary rule).
import { signInSettings, type MailWording } from "./accounts";
import { loadConfig } from "./config";
import { log as processLog } from "./log";
import { openRuntime, type Runtime } from "./runtime";
import { startSiteTimer } from "./site";

export { API_TOKEN_PREFIX, APP_NAME, CONSENT_PAGE, ENV_PREFIX, SIGN_IN_PAGE, type MailWording } from "./accounts";
export { createCategory, deleteCategory, listCategories, renameCategory, type Category } from "./categories";
export type { Config } from "./config";
export { siteExport, type SiteExport } from "./export";
export { healthResponse } from "./health";
export { log } from "./log";
export { MCP_INSTRUCTIONS, mcpContext } from "./mcp";
export { importFromLink, modelLink, printOfModel } from "./sources";
export { suggestForPrint, type EnhanceInput, type Suggestion } from "./enhance";
export { toGerman, type Texts } from "./translate";
export { movePrint, moveShowcase, setShowcase } from "./order";
export type { Outcome, Reason } from "./outcome";
export {
  addPhoto,
  deletePhoto,
  getPhoto,
  originalFile,
  PHOTO_TYPES,
  photoPath,
  photoThumb,
  reorderPhotos,
  setCover,
  setCrop,
  type Crop,
  type Photo,
} from "./photos";
export { PRINT_FIELDS, parsePrintInput, parsePrintPatch, printInputSchema, printPatchSchema } from "./printfields";
export {
  createPrint,
  deletePrint,
  findPrint,
  getPrint,
  listPrints,
  publishPrint,
  siteOrder,
  unpublishPrint,
  updatePrint,
  type Print,
  type PrintInput,
  type PrintPatch,
} from "./prints";
export { cardTitle, readiness, type Hint, type HintCode } from "./readiness";
export { OPEN_API, REST_OPS } from "./rest";
export type { Runtime } from "./runtime";
export { buildStatus, type BuildStatus } from "./site";
export { toSlug } from "./slug";

// One runtime per process, kept on globalThis so Next's dev server, which reloads modules, doesn't open the database twice.
const g = globalThis as { __upload?: Runtime; __uploadSiteTimer?: () => void };

/**
 * The process's runtime, opened from the environment at the first call; a bad setting throws, naming it. `mail` is the sign-in mail's
 * words and language pick, which the frontend owns (app/_lib/runtime.ts); it is read at the first call only.
 */
export function runtime(mail: MailWording): Runtime {
  if (!g.__upload) {
    const config = loadConfig(process.env);
    g.__upload = openRuntime(config, signInSettings(process.env, config.dataDir, processLog), mail);
  }
  return g.__upload;
}

/** Starts the site build's 10 s timer for the process's runtime (instrumentation.ts), once however often it is called; returns its stop. */
export function startSiteBuilds(rt: Runtime): () => void {
  g.__uploadSiteTimer ??= startSiteTimer(rt);
  return g.__uploadSiteTimer;
}
