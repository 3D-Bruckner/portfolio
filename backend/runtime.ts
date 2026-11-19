// What every surface works with: the settings, the store (backend/db, the only way to the database), the clock, fetch, the log and the
// hook for changes the site shows, opened once per process. Tests open their own with openRuntime and a config of their own (or
// testing/runtime.ts); the process's is runtime() in backend/index.ts.
import type { Person } from "next-app-kit/signin";
import type { RestCaller } from "next-app-kit/tokens";
import type { Logger } from "pino";
import type { Config } from "./config";
import { openStore, type Store } from "./db";
import { log } from "./log";
import type { Outcome } from "./outcome";

export type Runtime = {
  config: Config;
  store: Store;
  clock: () => Date;
  fetch: typeof fetch;
  log: Logger;
  /**
   * Called by every mutation the site shows (a published print, a category in use, the order, the showcases), after it is stored.
   * The site build's trigger replaces it; until then it does nothing.
   */
  onSiteChange: () => void;
  /**
   * Who a page's or the app's own route's request is, by its session cookie: the kit's personOf (with UPLOAD_DEV_USER). Sign-in fills it
   * in when it is wired; until then nobody is signed in. Tests set a person of their own.
   */
  person: (h: Headers) => Promise<Person | null>;
  /** Who a request with an API or OAuth token is: the kit's restCaller. Filled in with sign-in, as `person`; until then nobody. */
  apiCaller: (req: Request) => Promise<RestCaller | null>;
};

export function openRuntime(config: Config): Runtime {
  return {
    config,
    store: openStore(config.dataDir),
    clock: () => new Date(),
    fetch: globalThis.fetch,
    log,
    onSiteChange: () => {},
    person: async () => null,
    apiCaller: async () => null,
  };
}

class Refused {
  constructor(readonly outcome: Outcome<never>) {}
}

/**
 * Runs a domain mutation in one transaction. `fn` calls `siteChange()` when what it changes is on the site; once it succeeded and is
 * stored, rt.onSiteChange runs once. A refusal rolls back whatever `fn` wrote before refusing.
 */
export function mutation<T>(rt: Runtime, fn: (siteChange: () => void) => Outcome<T>): Outcome<T> {
  let visible = false;
  let out: Outcome<T>;
  try {
    out = rt.store.transaction(() => {
      const o = fn(() => {
        visible = true;
      });
      if (!o.ok) throw new Refused(o);
      return o;
    });
  } catch (e) {
    if (e instanceof Refused) return e.outcome;
    throw e;
  }
  if (visible) rt.onSiteChange();
  return out;
}
