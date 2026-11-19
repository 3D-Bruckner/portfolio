import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const SECRET = "s".repeat(32);
const env = (extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  PUBLIC_URL: "https://upload.example.com",
  UPLOAD_SECRET: SECRET,
  ...extra,
});

describe("loadConfig", () => {
  it("refuses a secret shorter than 32 characters", () => {
    expect(() => loadConfig(env({ UPLOAD_SECRET: "short" }))).toThrow("UPLOAD_SECRET must be at least 32 characters");
  });

  it("refuses a missing secret with the same message", () => {
    expect(() => loadConfig(env({ UPLOAD_SECRET: undefined }))).toThrow("UPLOAD_SECRET must be at least 32 characters");
  });

  it("refuses a dev user in production", () => {
    expect(() => loadConfig(env({ NODE_ENV: "production", UPLOAD_DEV_USER: "marcel@example.com" }))).toThrow("UPLOAD_DEV_USER is not allowed in production");
  });

  it("takes a dev user outside production", () => {
    expect(loadConfig(env({ UPLOAD_DEV_USER: "marcel@example.com" })).devUser).toBe("marcel@example.com");
  });

  it("parses the allowlist: trimmed, empty entries dropped", () => {
    expect(loadConfig(env({ UPLOAD_ALLOWED_EMAILS: " a@x.de, @y.de " })).allowedEmails).toEqual(["a@x.de", "@y.de"]);
    expect(loadConfig(env({ UPLOAD_ALLOWED_EMAILS: " , " })).allowedEmails).toEqual([]);
  });

  it("lets nobody in when the allowlist is unset", () => {
    expect(loadConfig(env()).allowedEmails).toEqual([]);
  });

  it("requires PUBLIC_URL as a URL and drops a trailing slash", () => {
    expect(() => loadConfig(env({ PUBLIC_URL: undefined }))).toThrow("PUBLIC_URL");
    expect(() => loadConfig(env({ PUBLIC_URL: "upload.example.com" }))).toThrow("PUBLIC_URL");
    expect(loadConfig(env({ PUBLIC_URL: "https://upload.example.com/" })).publicUrl).toBe("https://upload.example.com");
  });

  it("has the defaults: /data, the site's repository and workflow, no SMTP, no GitHub token", () => {
    const c = loadConfig(env({ DATA_DIR: undefined }));
    expect(c).toMatchObject({ dataDir: "/data", siteRepo: "3D-Bruckner/3dbruckner", siteWorkflow: "pages.yml" });
    expect(c.smtpUrl).toBeUndefined();
    expect(c.smtpFrom).toBeUndefined();
    expect(c.githubToken).toBeUndefined();
    expect(c.devUser).toBeUndefined();
  });

  it("takes every setting from the environment", () => {
    const c = loadConfig(
      env({
        DATA_DIR: "/srv/upload",
        UPLOAD_SMTP_URL: "smtps://user:pw@mail.example.com:465",
        UPLOAD_SMTP_FROM: "3D Bruckner <noreply@3dbruckner.de>",
        UPLOAD_GITHUB_TOKEN: "github_pat_x",
        UPLOAD_SITE_REPO: "someone/site",
        UPLOAD_SITE_WORKFLOW: "build.yml",
      }),
    );
    expect(c).toEqual({
      publicUrl: "https://upload.example.com",
      dataDir: "/srv/upload",
      secret: SECRET,
      allowedEmails: [],
      smtpUrl: "smtps://user:pw@mail.example.com:465",
      smtpFrom: "3D Bruckner <noreply@3dbruckner.de>",
      githubToken: "github_pat_x",
      siteRepo: "someone/site",
      siteWorkflow: "build.yml",
    });
  });

  it("treats an empty value as unset", () => {
    const c = loadConfig(env({ UPLOAD_SMTP_URL: "", UPLOAD_GITHUB_TOKEN: "", UPLOAD_SITE_REPO: "", UPLOAD_DEV_USER: "" }));
    expect(c.smtpUrl).toBeUndefined();
    expect(c.githubToken).toBeUndefined();
    expect(c.siteRepo).toBe("3D-Bruckner/3dbruckner");
    expect(c.devUser).toBeUndefined();
  });
});
