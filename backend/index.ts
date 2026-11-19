// The backend as the frontend sees it: app/, components/, proxy.ts and instrumentation.ts import only from here (ESLint's boundary rule).
import { loadConfig } from "./config";
import { openRuntime, type Runtime } from "./runtime";

export type { Config } from "./config";
export { healthResponse } from "./health";
export { log } from "./log";
export type { Runtime } from "./runtime";

// One runtime per process, kept on globalThis so Next's dev server, which reloads modules, doesn't open the database twice.
const g = globalThis as { __upload?: Runtime };

/** The process's runtime, opened from the environment at the first call; a bad setting throws, naming it. */
export function runtime(): Runtime {
  g.__upload ??= openRuntime(loadConfig(process.env));
  return g.__upload;
}
