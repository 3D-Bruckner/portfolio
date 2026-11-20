// Claude for "Enhance with AI", through Marcel's Claude gateway (https://claude.marceltov.de, in his homelab): one service of his own that runs Claude Code on his subscription for
// his apps, so the Claude Code program and its token live in one place and not in every app. upload sends it one request: a system
// prompt, a prompt and the JSON schema of the answer; the gateway answers with that JSON. UPLOAD_CLAUDE_URL is the gateway's address,
// UPLOAD_CLAUDE_TOKEN the bearer token it gave upload; without both, the app offers no AI. Each call counts against his plan's limits.
// Tests replace rt.askClaude: they never reach Claude.
//
//   POST <UPLOAD_CLAUDE_URL>/v1/ask   Authorization: Bearer <token>
//   { "system": "...", "prompt": "...", "schema": { ...JSON schema... } }
//   200 { "output": { ...matching the schema... } }   anything else: the request failed
import type { Logger } from "pino";
import type { Config } from "./config";

export type AskClaude = (req: { system: string; prompt: string; schema: Record<string, unknown> }) => Promise<unknown>;

// The gateway stops an ask at 90 s (Cloudflare in front of it ends a request at 100 s).
const TIMEOUT_MS = 100_000;

/** The asker for this config, or null without UPLOAD_CLAUDE_URL and UPLOAD_CLAUDE_TOKEN (then the app offers no AI). */
export function claudeAsker(config: Config, log: Logger, fetcher: typeof fetch = globalThis.fetch): AskClaude | null {
  const { claudeUrl: url, claudeToken: token } = config;
  if (!url || !token) return null;
  return async (req) => {
    const started = Date.now();
    const r = await fetcher(`${url}/v1/ask`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) {
      log.warn({ status: r.status, ms: Date.now() - started }, "claude: the gateway refused");
      throw new Error(`the Claude gateway answered ${r.status}`);
    }
    const body = (await r.json()) as { output?: unknown };
    log.info({ ms: Date.now() - started }, "claude: answered");
    return body.output;
  };
}
