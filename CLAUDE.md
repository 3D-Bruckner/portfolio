# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

upload: where 3dbruckner.de's prints are put in (their photos and details, from the phone or through Claude); the site build reads the published prints from its export. A Next.js app on [next-app-kit](https://github.com/Marceltov/next-app-kit).

## Commands

- `npm run dev`: the app on http://localhost:3000 (needs `PUBLIC_URL`, `UPLOAD_SECRET` and a `DATA_DIR` of your own, e.g. in `.env.local`).
- `npm run format` / `npm run format:check` (Prettier, 160 columns), `npm run lint` (ESLint), `npm run typecheck` (`next typegen && tsc --noEmit`).
- `npm test` (Vitest); one file: `npm test -- backend/config.test.ts`; one test: `npm test -- -t "refuses a dev user"`.
- `npm run build`; `npm run test:e2e` (Playwright against `next dev`, data in a temporary directory).
- CI (`.github/workflows/ci.yml`, job `check`) runs all of these in Microsoft's Playwright image on every push and pull request; job `image` builds and starts the image on every push and publishes `ghcr.io/3d-bruckner/upload:main` from main only.

## Architecture

- `app/` (pages under `app/[lang]/`, route handlers outside it), `components/`, `backend/` (framework-free domain), `e2e/`.
- The frontend (`app/`, `components/`, `proxy.ts`, `instrumentation.ts`) imports the backend only through `@/backend` (`backend/index.ts`); `backend/` never imports Next.js, React or the frontend. ESLint's `@typescript-eslint/no-restricted-imports` enforces both.
- The data layer is `backend/db/`: it alone holds `better-sqlite3`, `kysely` (types excepted elsewhere), the connection (`connection.ts`), the schema types (`schema.ts`), the migrations (`migrations.ts`, run by the kit's `migrate`) and every query (one file per table group, joined into the `Store` in `store.ts`). Everything else takes it from `backend/db/index.ts`; ESLint enforces it. One portfolio per instance: no tenant scope.
- `backend/runtime.ts`: the `Runtime` (config, `store`, clock, fetch, log, `onSiteChange`); `runtime()` in `backend/index.ts` is the process's, opened from the environment. Domain code reaches the database only through `rt.store` (`openStore` in `backend/db/store.ts`: kysely builds the queries, better-sqlite3 runs them synchronously). A mutation runs in `mutation(rt, fn)`: one transaction, rolled back on a refusal, then `onSiteChange` once if `fn` said the site shows the change.
- Domain functions return an `Outcome` (`backend/outcome.ts`): the value, or `not_found` / `invalid` / `conflict` (REST 404/400/409) with an English message.
- A print's fields are listed once, in `backend/printfields.ts` (conventions: architecture/one-field-list): create and edit schemas, MCP, REST and the form are built from it.
- Sign-in, API tokens, MCP, REST, migrations and multipart come from next-app-kit; nothing it provides is copied here. What upload needs that another app would need too goes into the kit.
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
