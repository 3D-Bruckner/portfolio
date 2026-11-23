// Claude for "Enhance with AI", through Marcel's Claude gateway (https://claude.marceltov.de, in his homelab): OCP, an
// OpenAI-compatible proxy that runs Claude Code on his subscription for the apps he builds, so the Claude Code program and its
// token live in one place and not in every app. portfolio asks with the OpenAI chat-completions format and a JSON schema for the answer
// (response_format json_schema), and reads the JSON back from the message. PORTFOLIO_CLAUDE_URL is the gateway's address,
// PORTFOLIO_CLAUDE_TOKEN portfolio's key there; without both, the app offers no AI. Each call counts against his plan's limits.
// Tests replace rt.askClaude: they never reach Claude.
//
//   POST <PORTFOLIO_CLAUDE_URL>/v1/chat/completions   Authorization: Bearer <token>
//   { model, messages: [{role: "system"}, {role: "user"}], response_format: {type: "json_schema", json_schema: {name, schema}} }
//   200 { choices: [{ message: { content: "<JSON matching the schema>" } }] }   anything else: the request failed
import type { Logger } from "pino";
import type { Config } from "./config";

export type AskClaude = (req: { system: string; prompt: string; schema: Record<string, unknown> }) => Promise<unknown>;

// The gateway stops an ask at 90 s (Cloudflare in front of it ends a request at 100 s).
const TIMEOUT_MS = 100_000;
const MODEL = "claude-sonnet-5-5";

/** The asker for this config, or null without PORTFOLIO_CLAUDE_URL and PORTFOLIO_CLAUDE_TOKEN (then the app offers no AI). */
export function claudeAsker(config: Config, log: Logger, fetcher: typeof fetch = globalThis.fetch): AskClaude | null {
  const { claudeUrl: url, claudeToken: token } = config;
  if (!url || !token) return null;
  return async ({ system, prompt, schema }) => {
    const started = Date.now();
    const r = await fetcher(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_schema", json_schema: { name: "answer", schema } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) {
      log.warn({ status: r.status, ms: Date.now() - started }, "claude: the gateway refused");
      throw new Error(`the Claude gateway answered ${r.status}`);
    }
    const body = (await r.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("the Claude gateway sent no message");
    log.info({ ms: Date.now() - started }, "claude: answered");
    return JSON.parse(content) as unknown;
  };
}
