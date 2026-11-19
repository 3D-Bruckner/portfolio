// The site build's trigger: every change the site shows marks the site changed (rt.onSiteChange → markSiteChanged); once nothing has
// changed for a quiet minute, tick() dispatches the site's workflow (UPLOAD_SITE_REPO's UPLOAD_SITE_WORKFLOW, 3D-Bruckner/3dbruckner's
// pages.yml) on GitHub with UPLOAD_GITHUB_TOKEN, so a burst of saves is one build. What is pending lives in site_state, so a restart
// inside the quiet minute still builds. A failed dispatch stays pending and is tried again after 1, 2, 4 … minutes, at most 30. Without
// a token (development) nothing is dispatched; that is logged once. The process ticks every 10 s (startSiteTimer, from
// instrumentation.ts). The token is never logged nor stored.
import * as z from "zod";
import type { Runtime } from "./runtime";

/** No change for this long, then the build is dispatched. */
export const QUIET_MS = 60_000;
/** How often the process looks whether a build is due. */
export const TICK_MS = 10_000;
const FIRST_RETRY_MS = 60_000;
const LONGEST_RETRY_MS = 30 * 60_000;
/** A GitHub request that takes longer than this has failed. */
const GITHUB_TIMEOUT_MS = 15_000;
const GITHUB_API_VERSION = "2022-11-28";

/** site_state's keys: what is pending, since when, and how the last dispatch went. */
const KEY = {
  /** The first change not yet built (after a dispatch during which changes came in: the latest of those). */
  pendingSince: "pending_since",
  /** The last change not yet built: the quiet minute counts from it. */
  lastChange: "last_change",
  lastDispatch: "last_dispatch",
  lastError: "last_error",
  /** Failed dispatches in a row, and when the next try is due. */
  failures: "failures",
  retryAt: "retry_at",
} as const;

export type BuildRun = { status: string; conclusion: string | null; url: string; startedAt: string };
export type BuildStatus = { pending: boolean; lastDispatch?: string; lastError?: string; run?: BuildRun };

/** Records a change the site shows: the build is pending, and the quiet minute starts again. */
export function markSiteChanged(rt: Runtime): void {
  const now = rt.clock().toISOString();
  rt.store.transaction(() => {
    const pending = rt.store.siteState()[KEY.pendingSince];
    rt.store.writeSiteState({ [KEY.pendingSince]: pending ?? now, [KEY.lastChange]: now });
  });
}

/**
 * rt.onSiteChange: markSiteChanged, called after a save was stored. A failure to mark is logged, never thrown, so a stored save doesn't
 * answer as an error; the build then waits for the next change the site shows.
 */
export function noteSiteChange(rt: Runtime): void {
  try {
    markSiteChanged(rt);
  } catch (e) {
    rt.log.error({ error: e instanceof Error ? e.message : String(e) }, "site change not marked: the site build may wait for the next change");
  }
}

// Per store (one per runtime): whether a dispatch is under way, whether the missing token was logged, and GitHub's latest run as last
// asked. Module state is enough: only the process's one timer ticks (startSiteTimer, from instrumentation.ts) and tests tick by hand; the
// store is the key, so each runtime (each test's) has its own.
const busy = new WeakSet<object>();
const toldNoToken = new WeakSet<object>();
const runAsked = new WeakMap<object, { at: number; run: BuildRun | undefined }>();
const runAsking = new WeakMap<object, Promise<BuildRun | undefined>>();

/** How long GitHub's answer about the latest run (or its failure to answer) is kept: the pages' build line, REST and MCP all ask. */
const RUN_KEPT_MS = 20_000;

/** Dispatches the site build when one is pending, the quiet minute has passed and no retry is waiting; otherwise does nothing. */
export async function tick(rt: Runtime): Promise<void> {
  const state = rt.store.siteState();
  const lastChange = state[KEY.lastChange];
  if (!state[KEY.pendingSince] || !lastChange) return;
  const now = rt.clock().getTime();
  if (now - Date.parse(lastChange) < QUIET_MS) return;
  const retryAt = state[KEY.retryAt];
  if (retryAt && now < Date.parse(retryAt)) return;
  const token = rt.config.githubToken;
  if (!token) {
    if (!toldNoToken.has(rt.store)) {
      toldNoToken.add(rt.store);
      rt.log.info("UPLOAD_GITHUB_TOKEN is not set: the site build is not triggered");
    }
    return;
  }
  if (busy.has(rt.store)) return;
  busy.add(rt.store);
  try {
    const error = await dispatch(rt, token);
    const at = new Date(now).toISOString();
    if (error === null) {
      rt.store.transaction(() => {
        // A change made while the dispatch was under way stays pending: it gets a build of its own after its quiet minute, and what
        // waits since then is that change (the latest made during the dispatch; markSiteChanged doesn't keep the first of them apart).
        const latest = rt.store.siteState()[KEY.lastChange] ?? null;
        const changedSince = latest !== lastChange;
        rt.store.writeSiteState({
          [KEY.lastDispatch]: at,
          [KEY.lastError]: null,
          [KEY.failures]: null,
          [KEY.retryAt]: null,
          ...(changedSince ? { [KEY.pendingSince]: latest } : { [KEY.pendingSince]: null, [KEY.lastChange]: null }),
        });
      });
      rt.log.info({ repo: rt.config.siteRepo, workflow: rt.config.siteWorkflow }, "site build dispatched");
    } else {
      const failures = Number(state[KEY.failures] ?? 0) + 1;
      const wait = Math.min(FIRST_RETRY_MS * 2 ** (failures - 1), LONGEST_RETRY_MS);
      rt.store.writeSiteState({
        [KEY.lastError]: error,
        [KEY.failures]: String(failures),
        [KEY.retryAt]: new Date(now + wait).toISOString(),
      });
      rt.log.warn({ error, failures, retryInMinutes: wait / 60_000 }, "site build dispatch failed");
    }
  } finally {
    busy.delete(rt.store);
  }
}

/** Whether a build is pending, how the last dispatch went, and the latest dispatched run of the site's workflow (when GitHub says). */
export async function buildStatus(rt: Runtime): Promise<BuildStatus> {
  const state = rt.store.siteState();
  const status: BuildStatus = { pending: Boolean(state[KEY.pendingSince]) };
  if (state[KEY.lastDispatch]) status.lastDispatch = state[KEY.lastDispatch];
  if (state[KEY.lastError]) status.lastError = state[KEY.lastError];
  const token = rt.config.githubToken;
  if (token) {
    const run = await keptRun(rt, token);
    if (run) status.run = run;
  }
  return status;
}

/** Ticks every 10 s until the returned function is called; the timer doesn't keep the process alive. */
export function startSiteTimer(rt: Runtime): () => void {
  const timer = setInterval(() => {
    tick(rt).catch((e: unknown) => rt.log.error({ error: e instanceof Error ? e.message : String(e) }, "site build tick failed"));
  }, TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}

// ---- GitHub

const workflowUrl = (rt: Runtime, rest: string) => `https://api.github.com/repos/${rt.config.siteRepo}/actions/workflows/${rt.config.siteWorkflow}${rest}`;

const githubHeaders = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  accept: "application/vnd.github+json",
  "x-github-api-version": GITHUB_API_VERSION,
  "user-agent": "3dbruckner-upload",
});

/** What went wrong with a request that threw (a timeout, no network), without anything of the request itself. */
const thrown = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 300);

/** POSTs the workflow dispatch; null when GitHub took it, else what went wrong. */
async function dispatch(rt: Runtime, token: string): Promise<string | null> {
  try {
    const r = await rt.fetch(workflowUrl(rt, "/dispatches"), {
      method: "POST",
      headers: { ...githubHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { source: "upload" } }),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    // 204 as documented; any 2xx means it was taken (GitHub may answer 200 with the run's details).
    if (r.ok) return null;
    return `GitHub answered ${r.status}${await messageOf(r)}`;
  } catch (e) {
    return `request failed: ${thrown(e)}`;
  }
}

/** GitHub's own message from an error's body, if it has one. */
async function messageOf(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { message?: unknown };
    return typeof body.message === "string" ? `: ${body.message.slice(0, 200)}` : "";
  } catch {
    return "";
  }
}

const runsSchema = z.object({
  workflow_runs: z.array(
    z.object({
      status: z.string().nullable(),
      conclusion: z.string().nullable(),
      html_url: z.string(),
      run_started_at: z.string().nullable().optional(),
      created_at: z.string(),
    }),
  ),
});

/**
 * latestRun, asked at most every 20 s: an answer is kept that long, and so is a failed ask (no run), so a GitHub that times out or
 * refuses the token costs one request per 20 s, not one per page. Asks that arrive while one is under way wait for it.
 */
function keptRun(rt: Runtime, token: string): Promise<BuildRun | undefined> {
  const now = rt.clock().getTime();
  const kept = runAsked.get(rt.store);
  if (kept && now - kept.at < RUN_KEPT_MS) return Promise.resolve(kept.run);
  const asking = runAsking.get(rt.store);
  if (asking) return asking;
  const ask = latestRun(rt, token)
    .then((run) => {
      // Kept from when the answer came, not when the ask started: a slow GitHub doesn't shorten how long it is kept.
      runAsked.set(rt.store, { at: rt.clock().getTime(), run });
      return run;
    })
    .finally(() => runAsking.delete(rt.store));
  runAsking.set(rt.store, ask);
  return ask;
}

/** The latest run of the site's workflow that a dispatch started; no run when there is none or GitHub doesn't answer. */
async function latestRun(rt: Runtime, token: string): Promise<BuildRun | undefined> {
  try {
    const r = await rt.fetch(workflowUrl(rt, "/runs?event=workflow_dispatch&per_page=1"), {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (!r.ok) {
      rt.log.warn({ status: r.status }, "site build status: GitHub didn't answer");
      return undefined;
    }
    const run = runsSchema.parse(await r.json()).workflow_runs[0];
    if (!run) return undefined;
    return { status: run.status ?? "unknown", conclusion: run.conclusion, url: run.html_url, startedAt: run.run_started_at ?? run.created_at };
  } catch (e) {
    rt.log.warn({ error: thrown(e) }, "site build status: GitHub didn't answer");
    return undefined;
  }
}
