# next-app-kit — Implementation Plan (1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript library, `Marceltov/next-app-kit`, that holds the infrastructure every one of Marcel's Next.js apps carries today as its own copy — sign-in, API tokens, the MCP endpoint and its OAuth, the REST route table with its OpenAPI document, the migrations runner, multipart uploads and the test sign-in — so that upload (plan 2) is built on it and noticebox, freundebuch and Gamepanion switch to it later.

**Architecture:** Extracted from noticebox (`github.com/noticebox/noticebox`, `main`, the most complete copy: `backend/accounts.ts`, `auth.ts`, `tokens.ts`, `mail.ts`, `signin.ts`, `mcp.ts` (wiring only), `rest.ts` (table machinery only), `migrations.ts` (runner only), `testutil.ts`, `app/.well-known/*`, `app/api/auth/*`, `app/consent/*`). Framework-free where noticebox's `backend/` is; the Next.js route handlers are thin factories. No app domain in it: an app passes its env prefix, its token prefix, its tools and its operations.

**Tech Stack:** TypeScript strict, Better Auth 1.7.21 (+ `@better-auth/api-key`, `cimd`, `mcp`, `oauth-provider`, `passkey`), `@modelcontextprotocol/server` 2.4.0, better-sqlite3 13.0.3, kysely 0.29.8, zod 4, nodemailer; as **peer dependencies** with exact versions, so an app and the kit never carry two copies. Vitest. Built to `dist/` with `tsc`; published like `astro-notefeed`: a `vX.Y.Z` tag, installed as `https://github.com/Marceltov/next-app-kit/archive/refs/tags/vX.Y.Z.tar.gz` (no npm, no key in CI).

**Spec:** `docs/superpowers/specs/2026-11-19-portfolio-app-design.md` in `3D-Bruckner/upload`, and Marcel's rule of 2026-11-19: *what can be reused becomes a library, and a library that is a convention goes into the engineering conventions.* Existing apps switch later, through one issue each.

## Global Constraints

- Repository `Marceltov/next-app-kit` (a library without its own brand lives in the personal account — conventions *Where a repository lives*), public, license as `astro-notefeed`.
- Work on the development box (CT 116 `development`), not on a hypervisor.
- Behaviour stays noticebox's unless this plan says otherwise; noticebox's tests for these modules come along and keep passing.
- Every setting an app reads is `<PREFIX>_*` with the app's prefix (`UPLOAD`, `NOTICEBOX`, …), plus `PUBLIC_URL`, `DATA_DIR`, `PORT`, `TZ` (conventions *Next.js app*).
- MCP results carry `guidance: string[]` (conventions *MCP first*; noticebox's `next` is the old name and is not carried over).
- Sign-in per conventions *Sign-in*: allowlist (empty = nobody), emailed code during MCP/script sign-in and code or link in the browser, OIDC providers from env, **passkeys** (new here: noticebox has none), `auth.sqlite` of its own, API tokens hashed, scoped `read`/`read+write`, 90 days default, at most 365, refused on `/mcp`; MCP tokens refused on REST; a dev user refused in production.
- The kit never imports `next` in its core modules; only `next-app-kit/next` (the route-handler factories) may.

## Review Focus

1. **An app upgrading Better Auth alone** → install fails on the peer-dependency mismatch instead of running two Better Auth copies (test: `package.json` declares exact peers; README says they move together).
2. **The allowlist shrinks while a session is live** → the next request with that session is refused (noticebox behaviour; test `removedAddressLosesSession`).
3. **An app forgets `guidance` on a tool** → `defineTool` makes it a type error and a runtime refusal (test `toolWithoutGuidanceRejected`).
4. **A REST operation names no MCP tool** → `checkOpsMirrorTools(ops, tools)` fails the app's test (test in the kit with a fixture app).
5. **An env prefix typo** (`UPLAOD_SECRET`) → start-up fails naming the missing `UPLOAD_SECRET`, not a vague Better Auth error (test `missingSecretNamed`).

---

### Task 1: Repository and package

**Files:** `package.json` (name `next-app-kit`, `type: module`, `exports` for `.`, `./signin`, `./tokens`, `./mcp`, `./rest`, `./multipart`, `./migrations`, `./next`, `./testing`; peer deps exact), `tsconfig.json`, `.prettierrc.json` (from conventions), `eslint.config.mjs` (rule: no `next` import outside `src/next/`), `vitest.config.ts`, `.github/workflows/ci.yml` (format, lint, typecheck, test, build), `.github/dependabot.yml` (one group for Better Auth + MCP SDK), `README.md`, `CLAUDE.md`, `LICENSE`, `src/index.ts`.

- [ ] **Step 1:** `gh repo create Marceltov/next-app-kit --public`; clone on the dev box; add the files.
- [ ] **Step 2:** Failing test `src/package.test.ts`: every peer dependency in `package.json` is an exact version (no `^`/`~`); every `exports` entry has a built file after `npm run build`.
- [ ] **Step 3:** Make it pass. `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build` → all succeed.
- [ ] **Step 4:** Commit `Package skeleton`, push over SSH (workflow files), CI green.

### Task 2: Migrations runner (`next-app-kit/migrations`)

**Produces:** `type Migration = { name: string; sql: string }`; `migrate(db: Connection, migrations: Migration[]): number` (noticebox `backend/migrations.ts` runner: each once, own transaction, count in `PRAGMA user_version`); `type Connection` as noticebox.

- [ ] **Step 1:** Move noticebox's runner tests (`appliesInOrder`, `eachOnce`, `failureRollsBackThatMigration`, `refusesDatabaseNewerThanCode`). → FAIL. **Step 2:** Move the runner. → PASS. **Step 3:** Commit `Migrations runner`.

### Task 3: Sign-in (`next-app-kit/signin`)

**Produces:**
- `type SignInSettings` (noticebox's, plus `passkey: { rpName: string }`)
- `signInFromEnv(env: NodeJS.ProcessEnv, opts: { prefix: string; file: string; appName: string; log: (line: string) => void }): SignInSettings` — reads `<PREFIX>_SECRET`, `<PREFIX>_ALLOWED_EMAILS`, `<PREFIX>_SMTP_URL`, `<PREFIX>_SMTP_FROM`, `<PREFIX>_OIDC_<NAME>_*`, `<PREFIX>_DEV_USER`, `PUBLIC_URL`
- `openAuth(s: SignInSettings, opts: { apiTokenPrefix: string }): Promise<Auth>` (Better Auth with email OTP + magic link, generic OAuth providers, JWT, OAuth provider + MCP + CIMD, api-key, **passkey**)
- `emailAllowed(allowed, email)`, `safeNext(next)`, `personOf(h: Headers, auth: Auth, devUser?: string): Promise<Person | null>`, `type Person = { id: string; email: string }`
- `smtpMailer(smtp)`, `type Mailer` (from `mail.ts`; German and English mail texts passed in by the app: `opts.texts`)

- [ ] **Step 1:** Move noticebox's tests for accounts/auth/signin/mail, parametrised on prefix `TEST`; add `passkeyRegistrationOptions` (a signed-in session gets registration options), `missingSecretNamed`, `removedAddressLosesSession`. → FAIL.
- [ ] **Step 2:** Move and generalise the modules (prefix, app name, token prefix, mail texts as parameters). → PASS.
- [ ] **Step 3:** Commit `Sign-in with allowlist, email, providers and passkeys`.

### Task 4: API tokens (`next-app-kit/tokens`)

**Produces:** noticebox's `tokens.ts` API: `type Scope`, `type ApiToken`, `type RestCaller`, `createApiToken(auth, person, { name, scope, expiresInDays })`, `listApiTokens`, `revokeApiToken`, `restCaller(req, auth, signIn): Promise<RestCaller | null>`.

- [ ] **Step 1:** Move tests (`shownOnce`, `storedHashed`, `expiryDefault90Max365`, `readCannotWrite`, `apiTokenRefusedOnMcp`, `mcpTokenRefusedOnRest`, `revokedRefused`). → FAIL. **Step 2:** Move. → PASS. **Step 3:** Commit `API tokens`.

### Task 5: MCP endpoint (`next-app-kit/mcp`)

**Produces:**
- `defineTool<I, O>({ name, description, input: z.ZodType<I>, output: z.ZodObject<O>, handle: (input: I, who: Who) => Promise<O & { guidance: string[] }> })` — adds `guidance: z.array(z.string())` to the output schema; a result without `guidance` throws
- `type Who = { actor: string; person: string; clientId: string; base: string }`
- `mcpRoute(req: Request, ctx: { auth: Auth; signIn: SignInSettings; tools: Tool[]; serverInfo: { name: string; version: string }; instructions: string }): Promise<Response>` (noticebox's origin check, token check, `whoFor`, connection revocation)
- `callTool(ctx, who, name, input)` for tests

- [ ] **Step 1:** Tests: noticebox's mcp wiring tests (`foreignOriginRefused`, `revokedConnectionRefused`, `deletedPersonRefused`), plus `toolWithoutGuidanceRejected`, `outputSchemaHasGuidance`. → FAIL. **Step 2:** Move the wiring from `backend/mcp.ts` (not its tools). → PASS. **Step 3:** Commit `MCP endpoint with guidance`.

### Task 6: REST route table (`next-app-kit/rest`)

**Produces:** noticebox's `Op` type made generic over the app's context `Op<Ctx>` (`ctx` replaces `rt`); `restRoute<Ctx>(req, ops: Op<Ctx>[], ctx: Ctx, caller: RestCaller | null): Promise<Response>` (caller checked first, `read` may only GET, 256 KiB body cap, zod validation, error JSON `{error, code}`); `openApiDocument(ops, { title, version, serverUrl })`; `checkOpsMirrorTools(ops, tools)`.

- [ ] **Step 1:** Tests with a two-operation fixture: `unauthorizedFirst`, `readOnlyGet`, `bodyTooLarge413`, `invalidBody400`, `openApiListsEveryOp`, `opNamingUnknownToolFails`, `toolWithoutOpFails`. → FAIL. **Step 2:** Extract. → PASS. **Step 3:** Commit `REST route table and OpenAPI`.

### Task 6b: Multipart uploads (`next-app-kit/multipart`)

**Produces:** noticebox's `backend/multipart.ts` (busboy) generalised: `readMultipart(req: Request, opts: { maxFileBytes: number; maxFiles: number; tmpDir?: string; types?: string[] }): Promise<{ fields: Record<string, string>; files: { field: string; name: string; type: string; path: string; size: number }[] }>`; temp files removed by `cleanup()` and on any error.

- [ ] **Step 1:** Move noticebox's multipart tests, plus `abortedRequestLeavesNoTempFile`, `oversizeRefused413`. → FAIL. **Step 2:** Move. → PASS. **Step 3:** Commit `Multipart uploads`.

### Task 7: Next.js handlers and testing helpers (`next-app-kit/next`, `next-app-kit/testing`)

**Produces:** `authHandler(getAuth)` for `app/api/auth/[...all]/route.ts`; `wellKnownHandlers(getAuth)` → `{ authorizationServer, protectedResource, openidConfiguration }` for the three `.well-known` routes; `mcpHandler(getCtx)`, `restHandler(getCtx)`; a `ConsentPage` component source documented as copy-in (UI stays the app's); `testing`: `freshAuth(prefix)`, `signedInCookie(auth, email)`, `testSignInRoute` (only when `<PREFIX>_E2E=1` and `NODE_ENV !== "production"`; test `testRouteAbsentInProduction`).

- [ ] **Step 1:** Tests for the handlers against a fake request, and `testRouteAbsentInProduction`. → FAIL. **Step 2:** Implement. → PASS.
- [ ] **Step 3:** Prove it in a real app: a minimal Next.js fixture app in `examples/minimal/` (one tool, one op) built in CI, with a Playwright test that signs in through `testSignInRoute` and calls the REST op with a token.
- [ ] **Step 4:** Commit `Next.js handlers, testing helpers, example app`.

### Task 8: Release, convention, follow-up issues

- [ ] **Step 1:** README: what is in it, install from tag, the env variables per prefix, how an app wires it (copy-paste from `examples/minimal/`), peers move together. Tag `v0.1.0`, `package.json` at `0.1.0`.
- [ ] **Step 2:** Convention: with the `engineering-conventions:add-convention` skill, a new page `stacks/next-app-kit.md` (*Every Next.js app takes sign-in, API tokens, MCP, REST and migrations from next-app-kit; it never copies them*), linked from `stacks/nextjs.md`, `architecture/sign-in.md` and `architecture/mcp-first.md`; PR to `Marceltov/engineering-conventions`.
- [ ] **Step 3:** One issue each in `noticebox/noticebox`, `Marceltov/freundebuch`, `Gamepanion/gamepanion`: *Use next-app-kit for sign-in, tokens, MCP, REST and migrations*, naming the modules that move and linking the convention PR.
- [ ] **Step 4:** ADR 0001 in the kit: what was extracted, from where, what changed on the way (`next` → `guidance`, passkeys, prefix parameters).

---

## Conventions check (2026-11-19, engineering-conventions 0.35.0)

Binding amendments; where they and a task above differ, these win.

- **C1 Tests in temp dirs** (*code/tests-temp-dirs*): `src/testing/setup.ts` in Vitest's `setupFiles` makes a temp dir and sets `DATA_DIR` to it before every test, removed after; pinned by `setup.test.ts`. No test writes outside a temp dir (auth.sqlite included). Task 1.
- **C2 Security setup for a public repo** (*repo-setup/security*): private vulnerability reporting, secret scanning with push protection, CodeQL default setup (the `gh api` calls on that page); `SECURITY.md` with its four sections; `.github/workflows/audit.yml` daily `npm audit --omit=dev --audit-level=high` (no image, so no image scan). Task 1.
- **C3 Dependabot with auto-merge** (*repo-setup/dependabot*): alerts and security fixes on; `.github/dependabot.yml` for `npm` and `github-actions`, weekly Monday 05:00 Europe/Berlin, `cooldown: default-days: 14`, a first group for the peers that move together (`better-auth`, `@better-auth/*`, `@modelcontextprotocol/server`, `next`), then one minor+patch group, prefix `Dependencies`, label `dependencies`, limit 5; `allow_auto_merge`, a ruleset requiring the CI job(s) on `~DEFAULT_BRANCH` with admin bypass, and `dependabot-automerge.yml`. `CLAUDE.md` names it as the exception to "merge only when I say so". Task 1.
- **C4 Formatting** (*code/formatting*): Prettier at print width 160 from the shared config, `eslint-config-prettier`, `format:check` in CI. Task 1.
- **C5 Better Auth stricter than its defaults** (*stacks/better-auth*): magic link always on plus email OTP, `storeToken: "hashed"`, `storeOTP: "hashed"`; no `bearer`, no `device-authorization` plugin; telemetry never enabled; secret passed in from `<PREFIX>_SECRET`; during an MCP/script sign-in the mail holds only a code; built-in providers for Google/Apple/GitHub plus `genericOAuth` from `<PREFIX>_OIDC_<NAME>_*`; a provider's refusal reaches the sign-in page as `?error=` and is logged with the provider's name. Tests in Task 3: `otpStoredHashed`, `noBearerPlugin`, `refusedProviderLogged`.
- **C6 Releases** (*repo-setup/releases*): `v0.1.0` is an annotated tag whose first line is a headline (e.g. "Sign-in, tokens, MCP and REST for Next.js apps"); `.github/workflows/release.yml` on tags checks the tag equals `package.json`'s version, runs the checks and build, writes `next-app-kit-X.Y.Z-npm.cdx.json` (`npm sbom --package-lock-only --omit dev --sbom-format cyclonedx`) and creates the GitHub release with generated notes and the SBOM attached. `CLAUDE.md` names the release command. Task 8.
- **C7 Migrations location**: apps keep their list in `backend/db/migrations.ts` (*stacks/sqlite*); the kit's README says so.
- **C8 Logs** (*stacks/nextjs*): the kit logs through a `log` function the app passes in (pino in apps), English, never a token, code, link or email body.
