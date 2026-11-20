// What every surface works with: the settings, the store (backend/db, the only way to the database), the clock, fetch, the log, the
// hook for changes the site shows (which marks the site build pending, site.ts) and sign-in (the kit's, backend/accounts.ts), opened once per process. Tests open their own with
// openRuntime and a config of their own (or testing/runtime.ts); the process's is runtime() in backend/index.ts, which the frontend calls
// with the sign-in mail's words (app/_lib/runtime.ts).
import { personOf, type Auth, type Person, type SignInSettings } from "next-app-kit/signin";
import { restCaller, type RestCaller } from "next-app-kit/tokens";
import type { Logger } from "pino";
import { openUploadAuth, type MailWording } from "./accounts";
import type { Config } from "./config";
import { openStore, type Store } from "./db";
import { httpGet, type HttpGet } from "./httpget";
import { log } from "./log";
import type { Outcome } from "./outcome";
import { noteSiteChange } from "./site";

export type Runtime = {
  config: Config;
  store: Store;
  clock: () => Date;
  fetch: typeof fetch;
  /** A plain HTTPS GET for the pages Marcel shares to import (MakerWorld refuses fetch; httpget.ts). */
  httpGet: HttpGet;
  log: Logger;
  /**
   * Called by every mutation the site shows (a published print, a category in use, the order, the showcases), after it is stored:
   * markSiteChanged, so the site build is dispatched after a quiet minute (site.ts); a failure to mark is logged, not thrown (noteSiteChange).
   */
  onSiteChange: () => void;
  /** The kit's sign-in settings (UPLOAD_*, from signInFromEnv). */
  signIn: SignInSettings;
  /** Better Auth, opened at the first call (auth.sqlite migrated then); a failed start is tried again at the next. */
  auth: () => Promise<Auth>;
  /**
   * Who a page's or the app's own route's request is, by its session cookie: the kit's personOf, with UPLOAD_DEV_USER when it is set
   * (never in production). Tests may set a person of their own.
   */
  person: (h: Headers) => Promise<Person | null>;
  /** Who a request with an API token or an OAuth access token for /api/v1 is: the kit's restCaller. */
  apiCaller: (req: Request) => Promise<RestCaller | null>;
};

export function openRuntime(config: Config, signIn: SignInSettings, mail: MailWording): Runtime {
  let opened: Promise<Auth> | null = null;
  const auth = (): Promise<Auth> => {
    if (!opened) {
      const p = openUploadAuth(signIn, mail);
      opened = p;
      p.catch(() => {
        if (opened === p) opened = null;
      });
    }
    return opened;
  };
  const rt: Runtime = {
    config,
    store: openStore(config.dataDir),
    clock: () => new Date(),
    fetch: globalThis.fetch,
    httpGet,
    log,
    onSiteChange: () => noteSiteChange(rt),
    signIn,
    auth,
    person: async (h) => personOf(h, await auth(), signIn.devUser),
    apiCaller: async (req) => restCaller(req, await auth(), signIn),
  };
  return rt;
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
