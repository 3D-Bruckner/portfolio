# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

upload: where 3dbruckner.de's prints are put in (their photos and details, from the phone or through Claude); the site build reads the published prints from its export. A Next.js app on [next-app-kit](https://github.com/Marceltov/next-app-kit).

## Commands

- `npm run dev`: the app on http://localhost:3000 (needs `PUBLIC_URL`, `UPLOAD_SECRET` and a `DATA_DIR` of your own, e.g. in `.env.local`).
- `npm run format` / `npm run format:check` (Prettier, 160 columns), `npm run lint` (ESLint), `npm run typecheck` (`next typegen && tsc --noEmit`).
- `npm test` (Vitest); one file: `npm test -- backend/config.test.ts`; one test: `npm test -- -t "refuses a dev user"`.
- `npm run build`; `npm run test:e2e` (Playwright against `next dev`, data in a temporary directory).
- `npm run generate`: writes `openapi.json` from the REST table (`scripts/generate-openapi.mjs`); commit it with any change to `backend/rest.ts` or the field table (`backend/rest.test.ts` and CI's `npm run generate -- --check` fail otherwise).
- CI (`.github/workflows/ci.yml`, job `check`) runs all of these in Microsoft's Playwright image on every push and pull request; job `image` builds and starts the image on every push and publishes `ghcr.io/3d-bruckner/upload:main` from main only.

## Architecture

- `app/` (pages under `app/[lang]/`, route handlers outside it), `components/`, `backend/` (framework-free domain), `e2e/`.
- The frontend (`app/`, `components/`, `proxy.ts`, `instrumentation.ts`) imports the backend only through `@/backend` (`backend/index.ts`); `backend/` never imports Next.js, React or the frontend. ESLint's `@typescript-eslint/no-restricted-imports` enforces both.
- The data layer is `backend/db/`: it alone holds `better-sqlite3`, `kysely` (types excepted elsewhere), the connection (`connection.ts`), the schema types (`schema.ts`), the migrations (`migrations.ts`, run by the kit's `migrate`) and every query (one file per table group, joined into the `Store` in `store.ts`). Everything else takes it from `backend/db/index.ts`; ESLint enforces it. One portfolio per instance: no tenant scope.
- `backend/runtime.ts`: the `Runtime` (config, `store`, clock, fetch, log, `onSiteChange`, sign-in's `signIn`, `auth()`, `person`, `apiCaller`); the process's is `runtime()` from `app/_lib/runtime.ts`, which hands `backend/index.ts`'s `runtime(mail)` the sign-in mail's words and language pick from the copy modules (backend never imports the frontend). It lives on `globalThis`, so `next.config.ts` keeps next-app-kit in `serverExternalPackages` (one copy of the kit for instrumentation and every route). Domain code reaches the database only through `rt.store` (`openStore` in `backend/db/store.ts`: kysely builds the queries, better-sqlite3 runs them synchronously). A mutation runs in `mutation(rt, fn)`: one transaction, rolled back on a refusal, then `onSiteChange` once if `fn` said the site shows the change.
- The site build's trigger (`backend/site.ts`): `onSiteChange` marks the build pending in `site_state` (`backend/db/site.ts`); a 10 s timer (started in `instrumentation.ts`, not during `next build`) dispatches the site's `pages.yml` with `UPLOAD_GITHUB_TOKEN` once nothing changed for 60 s; a failure is retried after 1, 2, 4 … minutes, at most 30. Without the token nothing is dispatched (logged once). `GET /api/v1/site/build` (tool `site_build_status`) tells whether a build is pending and the latest run. Tests never reach GitHub: a fake `rt.fetch` and clock.
- Domain functions return an `Outcome` (`backend/outcome.ts`): the value, or `not_found` / `invalid` / `conflict` (REST 404/400/409) with an English message.
- A print's fields are listed once, in `backend/printfields.ts` (conventions: architecture/one-field-list): create and edit schemas, MCP, REST and the form are built from it.
- Photos (`backend/photos.ts`): each photo is two files under `DATA_DIR/photos/<printId>/`. The original, `<photoId>.orig.<jpg|png|webp>`, is kept as taken without its metadata: a JPEG's image data byte for byte, its segments filtered by `backend/jpegmeta.ts` (no decode; a whitelist: what a decoder needs, the orientation and the colour profile stay, other APPn and comments go, any other marker refuses the file), a PNG or WebP re-encoded losslessly, upright, with its colour profile only. The cutout, `<photoId>.jpg`, is the crop chosen with `setCrop` (in the original as shown; the whole photo by default), long edge capped at 2400 px, JPEG quality 85, no metadata; a photo's `width`, `height`, `bytes` and `sha256` are the cutout's. The upload itself stays in the request's temporary file. Upload `POST /api/prints/[id]/photos` (one file, session cookie); the cutout `GET /photos/[id]` (session or API token, ETag = sha256, `no-cache` since a new crop changes it); the original `GET /photos/[id]/original` (session only, for the crop frame). Who is asking comes from `rt.person(headers)` and `rt.apiCaller(req)`, which sign-in fills in.
- REST (`backend/rest.ts`): the kit's table of operations under `/api/v1` (route `app/api/v1/[...path]`, `/api/v1/openapi.json`, the committed `openapi.json`). Each operation names the MCP tool it mirrors, or says why none (`GET /export`, the site build's read, `backend/export.ts`; `GET /photos/{id}`, a cutout's bytes); the print bodies are the field table's schemas. The site build reads the export with a `read` token. Tokens are made and revoked in the web app or by an OAuth caller, never with an API token (403).
- Sign-in, API tokens, MCP, REST, migrations and multipart come from next-app-kit; nothing it provides is copied here. What upload needs that another app would need too goes into the kit. `backend/accounts.ts` wires sign-in (prefix `UPLOAD`, token prefix `upl_`, pages `/signin` and `/consent` under `app/[lang]/`); the route files under `app/api/auth`, `app/.well-known` and `app/api/test/sign-in` are one line each over the kit's handlers. Pages that need someone signed in call `requirePerson(path)` (`app/_lib/signin.ts`); e2e tests sign in through the kit's test route (`e2e/signin.ts`).
- Data: `DATA_DIR/upload.sqlite`, `DATA_DIR/auth.sqlite` (the kit's), `DATA_DIR/photos/`.
- Logs: pino (`backend/log.ts`), English, never a token, a photo's name or an email address.

## Rules

- Follows Marceltov/engineering-conventions; the rules here win where they differ.
- Code, logs, MCP descriptions and `guidance` are English. The UI's words live in `components/copy/en.ts` (the reference, `type Copy`) and `components/copy/de.ts` (`const de: Copy`); `react/jsx-no-literals` keeps text out of JSX. `proxy.ts` picks the language (the switch's cookie `upload_lang`, then `Accept-Language`, then English) and rewrites to `app/[lang]/`; no URL carries the language.
- Settings: `UPLOAD_*`, plus `PUBLIC_URL`, `DATA_DIR`, `PORT`, `TZ`. `backend/config.ts`, `.env.example` and the README's settings change together. `PORT` must be the port the app listens on.
- The kit's peers stay at its exact versions (`backend/peers.test.ts`); no `legacy-peer-deps`. They move together with a kit release.
- A migration that has shipped is never edited: a schema change is a new migration at the end of `backend/db/migrations.ts`.
- Tests keep their data in a temporary `DATA_DIR` (`backend/testing/setup.ts`, pinned by `setup.test.ts`).
- Merge only when Marcel says so, Dependabot's pull requests included: they are merged by hand until the repository gets auto-merge (a private repository on the free plan has neither auto-merge nor rulesets); then the auto-merge workflow and the ruleset from the conventions' repo-setup/dependabot.md come back.
- The design is `docs/superpowers/specs/2026-11-19-portfolio-app-design.md`; the plans are in `docs/superpowers/plans/`.
