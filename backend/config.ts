// upload's settings, read once from the environment at start: UPLOAD_*, plus PUBLIC_URL and DATA_DIR. A bad setting stops the start with
// a message naming the variable. VARIABLES below names every variable the app and its image read, these and the ones read elsewhere (the
// kit's sign-in through signInFromEnv, the log, Node, the image's entrypoint); .env.example and docs/configuration.md list exactly those
// (envExampleListsEveryVariable in config.test.ts), so the three change together.
import * as z from "zod";

export type Config = {
  /** PUBLIC_URL without a trailing slash: links in mails and MCP results, the OAuth issuer. */
  publicUrl: string;
  /** DATA_DIR: upload.sqlite, auth.sqlite and photos/. */
  dataDir: string;
  /** UPLOAD_SECRET: signs sessions and tokens. */
  secret: string;
  /** UPLOAD_ALLOWED_EMAILS: addresses and @domain entries; empty lets nobody in. */
  allowedEmails: string[];
  smtpUrl?: string;
  smtpFrom?: string;
  /** UPLOAD_GITHUB_TOKEN: dispatches the site build; without it, no build is triggered. */
  githubToken?: string;
  /** UPLOAD_SITE_REPO: the site's repository, owner/name. */
  siteRepo: string;
  /** UPLOAD_SITE_WORKFLOW: the workflow file that builds the site. */
  siteWorkflow: string;
  /** UPLOAD_SITE_URL: the site itself; a published print's page there is <siteUrl>/portfolio/<slug>/. */
  siteUrl: string;
  /** UPLOAD_MAX_PHOTO_MB: the largest photo an upload may send, in megabytes (default 40); what is stored is far smaller. */
  maxPhotoMb: number;
  /** UPLOAD_DEV_USER: development only, everyone reaching the app is this person. */
  devUser?: string;
};

// An empty value counts as unset, so a copy of .env.example with a blank line keeps the default.
const optional = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().optional());

const MAX_PHOTO = "UPLOAD_MAX_PHOTO_MB must be a whole number of megabytes, at least 1";

const schema = z.object({
  NODE_ENV: z.string().optional(),
  PUBLIC_URL: z.url({ protocol: /^https?$/, error: "PUBLIC_URL must be the app's public URL, such as https://upload.3dbruckner.de" }),
  DATA_DIR: optional,
  UPLOAD_SECRET: z.string({ error: "UPLOAD_SECRET must be at least 32 characters" }).min(32, "UPLOAD_SECRET must be at least 32 characters"),
  UPLOAD_ALLOWED_EMAILS: optional,
  UPLOAD_SMTP_URL: optional,
  UPLOAD_SMTP_FROM: optional,
  UPLOAD_GITHUB_TOKEN: optional,
  UPLOAD_SITE_REPO: optional,
  UPLOAD_SITE_WORKFLOW: optional,
  UPLOAD_SITE_URL: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.url({ protocol: /^https?$/ }).optional()),
  UPLOAD_MAX_PHOTO_MB: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number({ error: MAX_PHOTO }).int(MAX_PHOTO).min(1, MAX_PHOTO).optional(),
  ),
  UPLOAD_DEV_USER: optional,
});

/** Who reads a variable that isn't loadConfig's own. */
type ReadBy = "next-app-kit" | "backend/log.ts" | "Node" | "docker-entrypoint.mjs";

/**
 * Every variable upload reads: loadConfig's (the schema's keys) and the rest, each with who reads it. `<NAME>` stands for a sign-in
 * provider's name (GITHUB, GOOGLE, APPLE or any OIDC one).
 */
export const VARIABLES: Record<string, "loadConfig" | ReadBy> = {
  ...(Object.fromEntries(
    Object.keys(schema.shape)
      .filter((k) => k !== "NODE_ENV")
      .map((k) => [k, "loadConfig"]),
  ) as Record<string, "loadConfig">),
  "UPLOAD_OIDC_<NAME>_CLIENT_ID": "next-app-kit",
  "UPLOAD_OIDC_<NAME>_CLIENT_SECRET": "next-app-kit",
  "UPLOAD_OIDC_<NAME>_ISSUER": "next-app-kit",
  "UPLOAD_OIDC_<NAME>_LABEL": "next-app-kit",
  UPLOAD_E2E: "next-app-kit",
  PORT: "next-app-kit",
  UPLOAD_LOG_LEVEL: "backend/log.ts",
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
  if (e.UPLOAD_DEV_USER && e.NODE_ENV === "production") throw new Error("UPLOAD_DEV_USER is not allowed in production");
  const config: Config = {
    publicUrl: e.PUBLIC_URL.replace(/\/+$/, ""),
    dataDir: e.DATA_DIR ?? "/data",
    secret: e.UPLOAD_SECRET,
    allowedEmails: (e.UPLOAD_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
    siteRepo: e.UPLOAD_SITE_REPO ?? "3D-Bruckner/3dbruckner",
    siteWorkflow: e.UPLOAD_SITE_WORKFLOW ?? "pages.yml",
    siteUrl: (e.UPLOAD_SITE_URL ?? "https://3dbruckner.de").replace(/\/$/, ""),
    maxPhotoMb: e.UPLOAD_MAX_PHOTO_MB ?? 40,
  };
  if (e.UPLOAD_SMTP_URL) config.smtpUrl = e.UPLOAD_SMTP_URL;
  if (e.UPLOAD_SMTP_FROM) config.smtpFrom = e.UPLOAD_SMTP_FROM;
  if (e.UPLOAD_GITHUB_TOKEN) config.githubToken = e.UPLOAD_GITHUB_TOKEN;
  if (e.UPLOAD_DEV_USER) config.devUser = e.UPLOAD_DEV_USER;
  return config;
}
