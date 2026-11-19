# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

upload: where 3dbruckner.de's prints are put in (their photos and details, from the phone or through Claude); the site build reads the published prints from its export. A Next.js app on [next-app-kit](https://github.com/Marceltov/next-app-kit).

## Commands

- `npm run dev`: the app on http://localhost:3000 (needs `PUBLIC_URL`, `UPLOAD_SECRET` and a `DATA_DIR` of your own, e.g. in `.env.local`; the README has one).
- `npm run format` / `npm run format:check` (Prettier, 160 columns), `npm run lint` (ESLint), `npm run typecheck` (`next typegen && tsc --noEmit`).
- `npm test` (Vitest); one file: `npm test -- backend/config.test.ts`; one test: `npm test -- -t "refuses a dev user"`.
- `npm run build`; `npm run test:e2e` (Playwright against `next dev` at a phone's 390×844, data in a temporary directory).
- `npm run generate`: writes `openapi.json` from the REST table (`scripts/generate-openapi.mjs`); commit it with any change to `backend/rest.ts` or the field table (`backend/rest.test.ts` and CI's `npm run generate -- --check` fail otherwise).
- CI (`.github/workflows/ci.yml`, job `check`) runs all of these in Microsoft's Playwright image on every push and pull request; job `image` builds and starts the image on every push and publishes `ghcr.io/3d-bruckner/upload:main` from main only.

## Architecture

The whole picture is [`docs/architecture.md`](docs/architecture.md); the tools [`docs/mcp.md`](docs/mcp.md); the settings and data directory [`docs/configuration.md`](docs/configuration.md).

- `app/` (pages under `app/[lang]/`, route handlers outside it) and `components/` import the backend only through `@/backend`; `backend/` never imports Next.js, React or the frontend. ESLint enforces both.
- `backend/db/` alone holds `better-sqlite3`, `kysely` (types excepted), the connection, the migrations and every query; domain code reaches the database only through `rt.store`, and a change runs in `mutation(rt, fn)` (one transaction, then `onSiteChange` once if the site shows it). ESLint enforces it.
- A print's fields are listed once, in `backend/printfields.ts`; the create/edit schemas, MCP, REST and the web form are built from it.
- MCP (`backend/mcp.ts`), REST (`backend/rest.ts`) and the web app's server actions call the same domain functions. Each REST operation names the MCP tool it mirrors or says why none (`checkOpsMirrorTools`); every MCP result carries `guidance` and, for a print, its `url` (`<PUBLIC_URL>/prints/<id>`).

## Rules

- Follows Marceltov/engineering-conventions; the rules here win where they differ.
- Code, logs, MCP descriptions and `guidance` are English. The UI's words live in `components/copy/en.ts` (the reference, `type Copy`) and `components/copy/de.ts` (`const de: Copy`); `react/jsx-no-literals` keeps text out of JSX. `proxy.ts` picks the language (the switch's cookie `upload_lang`, then `Accept-Language`, then English); no URL carries the language. The proxy runs on pages only: Next cuts a proxied body at 10 MB, so route handlers stay out of its matcher and call `languageOf(req.headers)` themselves (`proxy.test.ts`, `bodiesBypassProxy`).
- Settings: `UPLOAD_*`, plus `PUBLIC_URL`, `DATA_DIR`, `PORT`, `TZ` (and the image's `PUID`, `PGID`, `NODE_EXTRA_CA_CERTS`). `backend/config.ts` (`VARIABLES`), `.env.example` and `docs/configuration.md` change together (`envExampleListsEveryVariable`). `PORT` must be the port the app listens on.
- Nothing next-app-kit provides is copied here; what upload needs that another app would need too goes into the kit, as a release. The kit's peers stay at its exact versions (`backend/peers.test.ts`); no `legacy-peer-deps`.
- A migration that has shipped is never edited: a schema change is a new migration at the end of `backend/db/migrations.ts`.
- Tests keep their data in a temporary `DATA_DIR` (`backend/testing/setup.ts`, pinned by `setup.test.ts`); they never reach GitHub (a fake `rt.fetch`).
- Logs (pino, `backend/log.ts`) never hold a token, a photo's name or an email address.
- Architectural decisions go to `docs/adr/NNNN-*.md` (MADR); a changed decision gets a new ADR that supersedes the old one.
- Merge only when Marcel says so. The one exception: Dependabot's patch and minor bumps merge by themselves once CI's `check` is green (`.github/workflows/dependabot-automerge.yml`; the ruleset `main` requires `check`, with admins allowed to bypass). A merge by the workflow starts no push to main, so its image is built with the next merge.
- The design is `docs/superpowers/specs/2026-11-19-portfolio-app-design.md`; the plans are in `docs/superpowers/plans/`.
