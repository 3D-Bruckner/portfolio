// portfolio's settings, read once from the environment at start: PORTFOLIO_*, plus PUBLIC_URL and DATA_DIR. A bad setting stops the start with
// a message naming the variable. VARIABLES below names every variable the app and its image read, these and the ones read elsewhere (the
// kit's sign-in through signInFromEnv, the log, Node, the image's entrypoint); .env.example and docs/configuration.md list exactly those
// (envExampleListsEveryVariable in config.test.ts), so the three change together.
import * as z from "zod";

export type Config = {
  /** PUBLIC_URL without a trailing slash: links in mails and MCP results, the OAuth issuer. */
  publicUrl: string;
  /** DATA_DIR: portfolio.sqlite, auth.sqlite and photos/. */
  dataDir: string;
  /** PORTFOLIO_SECRET: signs sessions and tokens. */
  secret: string;
  /** PORTFOLIO_ALLOWED_EMAILS: addresses and @domain entries; empty lets nobody in. */
  allowedEmails: string[];
  smtpUrl?: string;
  smtpFrom?: string;
  /** PORTFOLIO_GITHUB_TOKEN: dispatches the site build; without it, no build is triggered. */
  githubToken?: string;
  /** PORTFOLIO_SITE_REPO: the site's repository, owner/name. */
  siteRepo: string;
  /** PORTFOLIO_SITE_WORKFLOW: the workflow file that builds the site. */
  siteWorkflow: string;
  /** PORTFOLIO_SITE_URL: the site itself; a published print's page there is <siteUrl>/portfolio/<slug>/. */
  siteUrl: string;
  /** PORTFOLIO_THINGIVERSE_TOKEN: an app token for Thingiverse's API; without it a Thingiverse link can't be imported. */
  thingiverseToken?: string;
  /** PORTFOLIO_CLAUDE_URL: Marcel's Claude gateway (backend/claude.ts) for "Enhance with AI"; without it and its token the button isn't shown. */
  claudeUrl?: string;
  /** PORTFOLIO_CLAUDE_TOKEN: portfolio's bearer token at the gateway. */
  claudeToken?: string;
  /** PORTFOLIO_MAX_PHOTO_MB: the largest photo an upload may send, in megabytes (default 40); what is stored is far smaller. */
  maxPhotoMb: number;
  /** PORTFOLIO_DEV_USER: development only, everyone reaching the app is this person. */
  devUser?: string;
};

// An empty value counts as unset, so a copy of .env.example with a blank line keeps the default.
const optional = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().optional());

const MAX_PHOTO = "PORTFOLIO_MAX_PHOTO_MB must be a whole number of megabytes, at least 1";

const schema = z.object({
  NODE_ENV: z.string().optional(),
  PUBLIC_URL: z.url({ protocol: /^https?$/, error: "PUBLIC_URL must be the app's public URL, such as https://portfolio.3dbruckner.de" }),
  DATA_DIR: optional,
  PORTFOLIO_SECRET: z.string({ error: "PORTFOLIO_SECRET must be at least 32 characters" }).min(32, "PORTFOLIO_SECRET must be at least 32 characters"),
  PORTFOLIO_ALLOWED_EMAILS: optional,
  PORTFOLIO_SMTP_URL: optional,
  PORTFOLIO_SMTP_FROM: optional,
  PORTFOLIO_GITHUB_TOKEN: optional,
  PORTFOLIO_THINGIVERSE_TOKEN: optional,
  PORTFOLIO_CLAUDE_URL: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.url({ protocol: /^https?$/ }).optional()),
  PORTFOLIO_CLAUDE_TOKEN: optional,
  PORTFOLIO_SITE_REPO: optional,
  PORTFOLIO_SITE_WORKFLOW: optional,
  PORTFOLIO_SITE_URL: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.url({ protocol: /^https?$/ }).optional()),
  PORTFOLIO_MAX_PHOTO_MB: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number({ error: MAX_PHOTO }).int(MAX_PHOTO).min(1, MAX_PHOTO).optional(),
  ),
  PORTFOLIO_DEV_USER: optional,
});

/** Who reads a variable that isn't loadConfig's own. */
type ReadBy = "next-app-kit" | "backend/log.ts" | "Node" | "docker-entrypoint.mjs";

/**
 * Every variable portfolio reads: loadConfig's (the schema's keys) and the rest, each with who reads it. `<NAME>` stands for a sign-in
 * provider's name (GITHUB, GOOGLE, APPLE or any OIDC one).
 */
export const VARIABLES: Record<string, "loadConfig" | ReadBy> = {
  ...(Object.fromEntries(
    Object.keys(schema.shape)
      .filter((k) => k !== "NODE_ENV")
      .map((k) => [k, "loadConfig"]),
  ) as Record<string, "loadConfig">),
  "PORTFOLIO_OIDC_<NAME>_CLIENT_ID": "next-app-kit",
  "PORTFOLIO_OIDC_<NAME>_CLIENT_SECRET": "next-app-kit",
  "PORTFOLIO_OIDC_<NAME>_ISSUER": "next-app-kit",
  "PORTFOLIO_OIDC_<NAME>_LABEL": "next-app-kit",
  PORTFOLIO_E2E: "next-app-kit",
  PORT: "next-app-kit",
  PORTFOLIO_LOG_LEVEL: "backend/log.ts",
  TZ: "Node",
  NODE_EXTRA_CA_CERTS: "Node",
  PUID: "docker-entrypoint.mjs",
  PGID: "docker-entrypoint.mjs",
};

/** The settings from `env`; throws naming every variable that is wrong. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const e = parsed.data;
  if (e.PORTFOLIO_DEV_USER && e.NODE_ENV === "production") throw new Error("PORTFOLIO_DEV_USER is not allowed in production");
  const config: Config = {
    publicUrl: e.PUBLIC_URL.replace(/\/+$/, ""),
    dataDir: e.DATA_DIR ?? "/data",
    secret: e.PORTFOLIO_SECRET,
    allowedEmails: (e.PORTFOLIO_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
    siteRepo: e.PORTFOLIO_SITE_REPO ?? "3D-Bruckner/3dbruckner",
    siteWorkflow: e.PORTFOLIO_SITE_WORKFLOW ?? "pages.yml",
    siteUrl: (e.PORTFOLIO_SITE_URL ?? "https://3dbruckner.de").replace(/\/$/, ""),
    maxPhotoMb: e.PORTFOLIO_MAX_PHOTO_MB ?? 40,
  };
  if (e.PORTFOLIO_SMTP_URL) config.smtpUrl = e.PORTFOLIO_SMTP_URL;
  if (e.PORTFOLIO_SMTP_FROM) config.smtpFrom = e.PORTFOLIO_SMTP_FROM;
  if (e.PORTFOLIO_GITHUB_TOKEN) config.githubToken = e.PORTFOLIO_GITHUB_TOKEN;
  if (e.PORTFOLIO_THINGIVERSE_TOKEN) config.thingiverseToken = e.PORTFOLIO_THINGIVERSE_TOKEN;
  if (e.PORTFOLIO_CLAUDE_URL) config.claudeUrl = e.PORTFOLIO_CLAUDE_URL.replace(/\/$/, "");
  if (e.PORTFOLIO_CLAUDE_TOKEN) config.claudeToken = e.PORTFOLIO_CLAUDE_TOKEN;
  if (e.PORTFOLIO_DEV_USER) config.devUser = e.PORTFOLIO_DEV_USER;
  return config;
}
