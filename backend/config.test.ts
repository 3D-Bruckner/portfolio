import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, VARIABLES } from "./config";

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** The variable names a text mentions; a provider's own name (GITHUB in PORTFOLIO_OIDC_GITHUB_CLIENT_ID) counts as <NAME>. */
function named(text: string): string[] {
  const names = text.match(/\b(?:PORTFOLIO_(?:[A-Z0-9]|<NAME>)(?:[A-Z0-9_]|<NAME>)*|PUBLIC_URL|DATA_DIR|PORT|TZ|PUID|PGID|NODE_EXTRA_CA_CERTS)\b/g) ?? [];
  return [
    ...new Set(
      names
        .filter((n) => !n.endsWith("_"))
        .map((n) => n.replace(/^PORTFOLIO_OIDC_(?!<NAME>)[A-Z0-9]+_(CLIENT_ID|CLIENT_SECRET|ISSUER|LABEL)$/, "PORTFOLIO_OIDC_<NAME>_$1")),
    ),
  ].sort();
}

/**
 * The variables a source reads from process.env: `process.env.X`, `process.env["X"]` (either quote) and `const { X, Y: y, Z = … } =
 * process.env` (a rest element names none).
 */
function envReads(source: string): string[] {
  const dotted = [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]!);
  const bracketed = [...source.matchAll(/process\.env\[\s*["'`]([A-Z0-9_]+)["'`]\s*\]/g)].map((m) => m[1]!);
  const destructured = [...source.matchAll(/\{([^{}]*)\}\s*=\s*process\.env\b/g)].flatMap((m) =>
    m[1]!
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith("..."))
      .map((part) => /^["']?([A-Za-z0-9_]+)/.exec(part)?.[1] ?? ""),
  );
  return [...dotted, ...bracketed, ...destructured].filter(Boolean);
}

/** The app's own source files, tests left out. */
function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|mjs)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.parentPath.includes("testing"))
    .map((e) => relative(ROOT, join(e.parentPath, e.name)));
}

const SECRET = "s".repeat(32);
const env = (extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  PUBLIC_URL: "https://portfolio.example.com",
  PORTFOLIO_SECRET: SECRET,
  ...extra,
});

describe("loadConfig", () => {
  it("refuses a secret shorter than 32 characters", () => {
    expect(() => loadConfig(env({ PORTFOLIO_SECRET: "short" }))).toThrow("PORTFOLIO_SECRET must be at least 32 characters");
  });

  it("refuses a missing secret with the same message", () => {
    expect(() => loadConfig(env({ PORTFOLIO_SECRET: undefined }))).toThrow("PORTFOLIO_SECRET must be at least 32 characters");
  });

  it("refuses a dev user in production", () => {
    expect(() => loadConfig(env({ NODE_ENV: "production", PORTFOLIO_DEV_USER: "marcel@example.com" }))).toThrow(
      "PORTFOLIO_DEV_USER is not allowed in production",
    );
  });

  it("takes a dev user outside production", () => {
    expect(loadConfig(env({ PORTFOLIO_DEV_USER: "marcel@example.com" })).devUser).toBe("marcel@example.com");
  });

  it("parses the allowlist: trimmed, empty entries dropped", () => {
    expect(loadConfig(env({ PORTFOLIO_ALLOWED_EMAILS: " a@x.de, @y.de " })).allowedEmails).toEqual(["a@x.de", "@y.de"]);
    expect(loadConfig(env({ PORTFOLIO_ALLOWED_EMAILS: " , " })).allowedEmails).toEqual([]);
  });

  it("lets nobody in when the allowlist is unset", () => {
    expect(loadConfig(env()).allowedEmails).toEqual([]);
  });

  it("requires PUBLIC_URL as a URL and drops a trailing slash", () => {
    expect(() => loadConfig(env({ PUBLIC_URL: undefined }))).toThrow("PUBLIC_URL");
    expect(() => loadConfig(env({ PUBLIC_URL: "portfolio.example.com" }))).toThrow("PUBLIC_URL");
    expect(loadConfig(env({ PUBLIC_URL: "https://portfolio.example.com/" })).publicUrl).toBe("https://portfolio.example.com");
  });

  it("has the defaults: /data, the site's repository and workflow, no SMTP, no GitHub token", () => {
    const c = loadConfig(env({ DATA_DIR: undefined }));
    expect(c).toMatchObject({ dataDir: "/data", siteRepo: "3D-Bruckner/3dbruckner", siteWorkflow: "pages.yml", maxPhotoMb: 40 });
    expect(c.smtpUrl).toBeUndefined();
    expect(c.smtpFrom).toBeUndefined();
    expect(c.githubToken).toBeUndefined();
    expect(c.devUser).toBeUndefined();
  });

  it("takes every setting from the environment", () => {
    const c = loadConfig(
      env({
        DATA_DIR: "/srv/portfolio",
        PORTFOLIO_SMTP_URL: "smtps://user:pw@mail.example.com:465",
        PORTFOLIO_SMTP_FROM: "3D Bruckner <noreply@3dbruckner.de>",
        PORTFOLIO_GITHUB_TOKEN: "github_pat_x",
        PORTFOLIO_SITE_REPO: "someone/site",
        PORTFOLIO_SITE_WORKFLOW: "build.yml",
        PORTFOLIO_SITE_URL: "https://example.org/",
        PORTFOLIO_MAX_PHOTO_MB: "25",
      }),
    );
    expect(c).toEqual({
      publicUrl: "https://portfolio.example.com",
      dataDir: "/srv/portfolio",
      secret: SECRET,
      allowedEmails: [],
      smtpUrl: "smtps://user:pw@mail.example.com:465",
      smtpFrom: "3D Bruckner <noreply@3dbruckner.de>",
      githubToken: "github_pat_x",
      siteRepo: "someone/site",
      siteWorkflow: "build.yml",
      siteUrl: "https://example.org",
      maxPhotoMb: 25,
    });
  });

  it("refuses a photo limit that isn't a whole number of megabytes, at least 1", () => {
    for (const v of ["0", "-5", "2.5", "lots"]) expect(() => loadConfig(env({ PORTFOLIO_MAX_PHOTO_MB: v })), v).toThrow("PORTFOLIO_MAX_PHOTO_MB");
  });

  it("treats an empty value as unset", () => {
    const c = loadConfig(
      env({ PORTFOLIO_SMTP_URL: "", PORTFOLIO_GITHUB_TOKEN: "", PORTFOLIO_SITE_REPO: "", PORTFOLIO_DEV_USER: "", PORTFOLIO_MAX_PHOTO_MB: "" }),
    );
    expect(c.maxPhotoMb).toBe(40);
    expect(c.smtpUrl).toBeUndefined();
    expect(c.githubToken).toBeUndefined();
    expect(c.siteRepo).toBe("3D-Bruckner/3dbruckner");
    expect(c.devUser).toBeUndefined();
  });

  it("envReads: every way of reading a variable counts, dotted, bracketed and destructured", () => {
    const src = [
      "const a = process.env.PORTFOLIO_A;",
      "const b = process.env[\"PORTFOLIO_B\"] ?? process.env['PORTFOLIO_C'];",
      'const { PORTFOLIO_D, PORTFOLIO_E: e, PORTFOLIO_F = "x", ...rest } = process.env;',
      "const {\n  PORTFOLIO_G,\n} = process.env;",
    ].join("\n");
    expect(envReads(src).sort()).toEqual(["PORTFOLIO_A", "PORTFOLIO_B", "PORTFOLIO_C", "PORTFOLIO_D", "PORTFOLIO_E", "PORTFOLIO_F", "PORTFOLIO_G"]);
  });

  it("envExampleListsEveryVariable: .env.example and docs/configuration.md name exactly the variables the app reads", () => {
    const every = Object.keys(VARIABLES).sort();
    expect(named(read(".env.example"))).toEqual(every);
    expect(named(read("docs/configuration.md"))).toEqual(every);
    // And nothing reads one that isn't listed (Next.js's own and NODE_ENV aside).
    const files = [...sources("backend"), ...sources("app"), ...sources("components"), "proxy.ts", "instrumentation.ts", "docker-entrypoint.mjs", "Dockerfile"];
    const read_ = files.flatMap((f) => envReads(read(f)));
    const unlisted = [...new Set(read_)].filter((v) => !(v in VARIABLES) && !["NODE_ENV", "NEXT_RUNTIME", "NEXT_PHASE"].includes(v));
    expect(unlisted).toEqual([]);
  });
});
