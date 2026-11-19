// A runtime for a test: a fresh upload.sqlite and auth.sqlite in a directory of its own under the test's DATA_DIR, onSiteChange counted
// (and marking the site build pending with the test's clock; nothing is dispatched unless a test ticks, with a fake fetch), and the
// sign-in mail caught in `mail` instead of sent. `env` adds to or overrides the settings (an empty value unsets one). Close the store at
// the end (afterEach).
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { SignInMail } from "next-app-kit/signin";
import { signInSettings, type MailWording } from "../accounts";
import { loadConfig } from "../config";
import { log } from "../log";
import { openRuntime, type Runtime } from "../runtime";
import { noteSiteChange } from "../site";

export type TestRuntime = Runtime & { siteChanges: number; mail: Map<string, SignInMail> };

/** The sign-in mail in tests: the language is the request's `x-test-lang` header, else English. */
export const TEST_MAIL: MailWording = {
  texts: {
    en: { subject: (code) => `code ${code}`, body: (code, link) => `code ${code}${link ? ` link ${link}` : ""}` },
    de: { subject: (code) => `Code ${code}`, body: (code, link) => `Code ${code}${link ? ` Link ${link}` : ""}` },
  },
  languageOf: (h) => h.get("x-test-lang") ?? "en",
};

export const MARCEL = "marcel@example.com";

export function testRuntime(env: Record<string, string> = {}, mail: MailWording = TEST_MAIL): TestRuntime {
  const dataDir = mkdtempSync(join(process.env.DATA_DIR!, "rt-"));
  const all: Record<string, string | undefined> = {
    NODE_ENV: "test",
    PUBLIC_URL: "https://upload.example.com",
    UPLOAD_SECRET: "s".repeat(32),
    UPLOAD_ALLOWED_EMAILS: MARCEL,
    UPLOAD_SMTP_URL: "smtp://127.0.0.1:2525",
    DATA_DIR: dataDir,
    ...env,
  };
  for (const [k, v] of Object.entries(all)) if (v === "") delete all[k];
  const config = loadConfig(all);
  const caught = new Map<string, SignInMail>();
  const signIn = { ...signInSettings(all, config.dataDir, log), mailer: async (m: SignInMail) => void caught.set(m.to, m) };
  const rt = openRuntime(config, signIn, mail);
  const t: TestRuntime = {
    ...rt,
    siteChanges: 0,
    mail: caught,
    onSiteChange: () => {
      t.siteChanges++;
      noteSiteChange(t);
    },
  };
  return t;
}

let photoNo = 0;

/** A photo row for `printId`, as Task 3's upload would leave it (the file itself isn't needed for the domain's rules). */
export function seedPhoto(rt: Runtime, printId: string): string {
  const id = randomUUID();
  photoNo++;
  rt.store.insertPhoto({
    id,
    print_id: printId,
    position: photoNo,
    width: 2400,
    height: 1800,
    bytes: 1000,
    sha256: "0".repeat(64),
    created_at: rt.clock().toISOString(),
  });
  return id;
}
