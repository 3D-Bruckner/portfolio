// The site build's trigger (site.ts) with a fake clock and a fake fetch: never the real GitHub API.
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Outcome } from "./outcome";
import { addPhoto, setCrop } from "./photos";
import { createPrint, publishPrint, updatePrint } from "./prints";
import { buildStatus, markSiteChanged, startSiteTimer, tick } from "./site";
import { seedPhoto, testRuntime, type TestRuntime } from "./testing/runtime";

const TOKEN = "github_pat_test";
const DISPATCH = "https://api.github.com/repos/3D-Bruckner/3dbruckner/actions/workflows/pages.yml/dispatches";
const RUNS = "https://api.github.com/repos/3D-Bruckner/3dbruckner/actions/workflows/pages.yml/runs?event=workflow_dispatch&per_page=1";
const T0 = Date.parse("2026-11-19T10:00:00.000Z");

type Call = { url: string; init: RequestInit };

const opened: TestRuntime[] = [];
afterEach(() => {
  for (const rt of opened.splice(0)) rt.store.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A runtime whose clock reads `at(seconds after T0)` and whose fetch answers from `answers` in turn (204 when they run out). */
function fake(env: Record<string, string> = { UPLOAD_GITHUB_TOKEN: TOKEN }, answers: (() => Response)[] = []) {
  const rt = testRuntime(env);
  opened.push(rt);
  let now = T0;
  const calls: Call[] = [];
  rt.clock = () => new Date(now);
  rt.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = answers.shift();
    return next ? next() : new Response(null, { status: 204 });
  }) as typeof fetch;
  const dispatches = () => calls.filter((c) => c.init.method === "POST");
  return { rt, calls, dispatches, at: (seconds: number) => void (now = T0 + seconds * 1000) };
}

function value<T>(o: Outcome<T>): T {
  if (!o.ok) throw new Error(`expected ok, got ${o.reason}: ${o.message}`);
  return o.value;
}

describe("the site build's trigger", () => {
  it("debouncesBursts: changes at 0, 20 and 50 s dispatch once, a quiet minute after the last", async () => {
    const { rt, calls, at } = fake();
    for (const s of [0, 20, 50]) {
      at(s);
      markSiteChanged(rt);
    }
    at(100);
    await tick(rt);
    expect(calls).toHaveLength(0);
    at(111);
    await tick(rt);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe(DISPATCH);
    expect(call!.init.method).toBe("POST");
    expect(JSON.parse(call!.init.body as string)).toEqual({ ref: "main", inputs: { source: "upload" } });
    const headers = new Headers(call!.init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("accept")).toBe("application/vnd.github+json");
    expect(headers.get("x-github-api-version")).toBeTruthy();
    expect(call!.init.signal).toBeInstanceOf(AbortSignal);
    // Done: nothing pending, no second dispatch.
    at(200);
    await tick(rt);
    expect(calls).toHaveLength(1);
    expect(await buildStatus(rt)).toMatchObject({ pending: false, lastDispatch: new Date(T0 + 111_000).toISOString() });
  });

  it("two saves in quick succession (title, then price), and a published photo's new cutout, are one dispatch", async () => {
    const { rt, calls, at } = fake();
    const p = value(createPrint(rt, { title: "Vase", description: "A vase." }));
    const path = join(rt.config.dataDir, "in.png");
    await sharp({ create: { width: 300, height: 200, channels: 3, background: "#808080" } })
      .png()
      .toFile(path);
    const photo = value(await addPhoto(rt, p.id, { path, type: "image/png" }));
    value(publishPrint(rt, p.id));
    at(5);
    value(updatePrint(rt, p.id, { title: "Blue vase" }));
    at(8);
    value(updatePrint(rt, p.id, { price: 1200 }));
    at(30);
    value(await setCrop(rt, photo.id, { left: 0, top: 0, width: 100, height: 100 }));
    at(89);
    await tick(rt);
    expect(calls).toHaveLength(0);
    at(90);
    await tick(rt);
    expect(calls.map((c) => c.url)).toEqual([DISPATCH]);
  });

  it("a change made while the dispatch is under way stays pending and gets a build of its own", async () => {
    const { rt, dispatches, at } = fake();
    markSiteChanged(rt);
    at(60);
    const slow = rt.fetch;
    rt.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      await Promise.resolve();
      at(61);
      markSiteChanged(rt);
      return slow(url, init);
    }) as typeof fetch;
    // Two ticks at once dispatch once.
    await Promise.all([tick(rt), tick(rt)]);
    expect(dispatches()).toHaveLength(1);
    // What waits now is the change made during the dispatch, not the one the dispatch built.
    expect(rt.store.siteState()).toMatchObject({ pending_since: new Date(T0 + 61_000).toISOString(), last_change: new Date(T0 + 61_000).toISOString() });
    rt.fetch = slow;
    at(120);
    await tick(rt);
    expect(dispatches()).toHaveLength(1);
    at(121);
    await tick(rt);
    expect(dispatches()).toHaveLength(2);
    expect((await buildStatus(rt)).pending).toBe(false);
  });

  it("pendingSurvivesRestart: a change before a restart is dispatched after it", async () => {
    const first = fake();
    markSiteChanged(first.rt);
    first.rt.store.close();
    opened.splice(opened.indexOf(first.rt), 1);
    const again = fake({ UPLOAD_GITHUB_TOKEN: TOKEN, DATA_DIR: first.rt.config.dataDir });
    again.at(59);
    await tick(again.rt);
    expect(again.calls).toHaveLength(0);
    again.at(60);
    await tick(again.rt);
    expect(again.calls).toHaveLength(1);
    expect(again.calls[0]!.url).toBe(DISPATCH);
  });

  it("failureRetriesWithBackoff: a failed dispatch stays pending and is tried again after 1, 2, 4 … minutes, at most 30", async () => {
    const error = () => new Response(JSON.stringify({ message: "Server Error" }), { status: 500 });
    const { rt, dispatches, at } = fake(
      { UPLOAD_GITHUB_TOKEN: TOKEN },
      Array.from({ length: 20 }, () => error),
    );
    markSiteChanged(rt);
    at(60);
    await tick(rt);
    expect(dispatches()).toHaveLength(1);
    const status = await buildStatus(rt);
    expect(status.pending).toBe(true);
    expect(status.lastError).toContain("500");
    expect(status.lastError).not.toContain(TOKEN);
    at(90);
    await tick(rt);
    expect(dispatches()).toHaveLength(1);
    at(120);
    await tick(rt);
    expect(dispatches()).toHaveLength(2);
    // Then 2, 4, 8, 16 minutes, then 30 at most.
    let t = 120;
    for (const minutes of [2, 4, 8, 16, 30, 30]) {
      const before = dispatches().length;
      at(t + minutes * 60 - 1);
      await tick(rt);
      expect(dispatches().length, `before ${minutes} min`).toBe(before);
      at(t + minutes * 60);
      await tick(rt);
      expect(dispatches().length, `after ${minutes} min`).toBe(before + 1);
      t += minutes * 60;
    }
    // A request that never comes back counts as a failure too; the retry that works clears the error.
    const thrown = fake({ UPLOAD_GITHUB_TOKEN: TOKEN }, [
      () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    ]);
    markSiteChanged(thrown.rt);
    thrown.at(60);
    await tick(thrown.rt);
    expect((await buildStatus(thrown.rt)).lastError).toContain("TimeoutError");
    thrown.at(120);
    await tick(thrown.rt);
    expect(thrown.dispatches()).toHaveLength(2);
    const after = await buildStatus(thrown.rt);
    expect(after).toMatchObject({ pending: false, lastDispatch: new Date(T0 + 120_000).toISOString() });
    expect(after.lastError).toBeUndefined();
  });

  it("noTokenNoDispatch: without UPLOAD_GITHUB_TOKEN nothing is dispatched and it says so once", async () => {
    const { rt, calls, at } = fake({});
    const info = vi.spyOn(rt.log, "info");
    markSiteChanged(rt);
    at(60);
    await tick(rt);
    at(120);
    await tick(rt);
    expect(calls).toHaveLength(0);
    expect(info.mock.calls.filter((args) => args.some((a) => typeof a === "string" && a.includes("UPLOAD_GITHUB_TOKEN")))).toHaveLength(1);
    expect(await buildStatus(rt)).toEqual({ pending: true });
    expect(calls).toHaveLength(0);
  });

  it("buildStatusReadsLatestRun: the latest dispatched run of pages.yml", async () => {
    const run = {
      status: "completed",
      conclusion: "success",
      html_url: "https://github.com/3D-Bruckner/3dbruckner/actions/runs/42",
      run_started_at: "2026-11-19T09:58:00Z",
      created_at: "2026-11-19T09:57:59Z",
    };
    const { rt, calls } = fake({ UPLOAD_GITHUB_TOKEN: TOKEN }, [() => Response.json({ total_count: 1, workflow_runs: [run] })]);
    expect(await buildStatus(rt)).toEqual({
      pending: false,
      run: { status: "completed", conclusion: "success", url: run.html_url, startedAt: run.run_started_at },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(RUNS);
    expect(calls[0]!.init.method ?? "GET").toBe("GET");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    // No run yet, or GitHub not answering: no run, and the rest still answered.
    const none = fake({ UPLOAD_GITHUB_TOKEN: TOKEN }, [() => Response.json({ total_count: 0, workflow_runs: [] }), () => new Response("", { status: 502 })]);
    expect(await buildStatus(none.rt)).toEqual({ pending: false });
    none.at(21);
    expect(await buildStatus(none.rt)).toEqual({ pending: false });
    expect(none.calls).toHaveLength(2);
  });

  it("asks GitHub for the latest run at most every 20 s (REST and the MCP tool both poll it)", async () => {
    const run = { status: "in_progress", conclusion: null, html_url: "https://github.com/x/y/actions/runs/1", created_at: "2026-11-19T09:59:00Z" };
    const answer = () => Response.json({ total_count: 1, workflow_runs: [run] });
    const { rt, calls, at } = fake({ UPLOAD_GITHUB_TOKEN: TOKEN }, [answer, answer]);
    expect((await buildStatus(rt)).run?.status).toBe("in_progress");
    at(19);
    expect((await buildStatus(rt)).run?.status).toBe("in_progress");
    expect(calls).toHaveLength(1);
    at(20);
    expect((await buildStatus(rt)).run?.status).toBe("in_progress");
    expect(calls).toHaveLength(2);
  });

  it("failedLookupKept: a failed ask is kept for 20 s too, so a GitHub outage costs one request per 20 s, not one per page", async () => {
    const run = { status: "completed", conclusion: "success", html_url: "https://github.com/x/y/actions/runs/1", created_at: "2026-11-19T09:59:00Z" };
    const { rt, calls, at } = fake({ UPLOAD_GITHUB_TOKEN: TOKEN }, [
      () => new Response("", { status: 401 }),
      () => Response.json({ total_count: 1, workflow_runs: [run] }),
    ]);
    expect((await buildStatus(rt)).run).toBeUndefined();
    at(5);
    expect((await buildStatus(rt)).run).toBeUndefined();
    at(19.9);
    expect((await buildStatus(rt)).run).toBeUndefined();
    expect(calls).toHaveLength(1);
    at(20);
    expect((await buildStatus(rt)).run?.conclusion).toBe("success");
    expect(calls).toHaveLength(2);
  });

  it("asks that arrive while GitHub is still answering share the one request", async () => {
    const { rt, calls } = fake({ UPLOAD_GITHUB_TOKEN: TOKEN });
    let answer!: (r: Response) => void;
    rt.fetch = ((url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Promise<Response>((resolve) => (answer = resolve));
    }) as typeof fetch;
    const asks = [buildStatus(rt), buildStatus(rt), buildStatus(rt)];
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    answer(Response.json({ total_count: 0, workflow_runs: [] }));
    expect(await Promise.all(asks)).toEqual([{ pending: false }, { pending: false }, { pending: false }]);
    expect(calls).toHaveLength(1);
  });

  it("a change that can't be marked pending is logged; the save it came from still succeeds", () => {
    const { rt } = fake();
    const p = value(createPrint(rt, { title: "Vase", description: "A vase." }));
    seedPhoto(rt, p.id);
    value(publishPrint(rt, p.id));
    rt.store.writeSiteState = () => {
      throw new Error("disk full");
    };
    const logged = vi.spyOn(rt.log, "error").mockImplementation(() => {});
    expect(updatePrint(rt, p.id, { title: "Vase 2" })).toMatchObject({ ok: true, value: { title: "Vase 2" } });
    expect(logged).toHaveBeenCalledWith({ error: "disk full" }, "site change not marked: the site build may wait for the next change");
  });

  it("the timer ticks every 10 s and stops", async () => {
    vi.useFakeTimers();
    const { rt, calls, at } = fake();
    markSiteChanged(rt);
    at(60);
    const stop = startSiteTimer(rt);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    stop();
    markSiteChanged(rt);
    at(200);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
  });
});
