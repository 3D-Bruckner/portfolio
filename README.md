# upload

Where 3dbruckner.de's prints are put in: their photos and details, from the phone or through Claude. Every change to what the site shows triggers the site build, which reads the published prints from this app's export. Visitors never reach this app.

A Next.js app on [next-app-kit](https://github.com/Marceltov/next-app-kit), which brings the sign-in, API tokens, MCP, REST, migrations and uploads. The design is [`docs/superpowers/specs/2026-11-19-portfolio-app-design.md`](docs/superpowers/specs/2026-11-19-portfolio-app-design.md), approved by Marcel on 2026-11-19.

## Running it

The server holds `compose.yaml` and `.env`, nothing else:

```sh
cp .env.example .env && chmod 600 .env   # then fill it in
docker compose pull && docker compose up -d
```

CI publishes `ghcr.io/3d-bruckner/upload:main` from main once the checks passed.

## Settings

Every setting is an environment variable; `.env.example` lists each one with what it does and its default.

| Variable                                   | What it does                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                               | The app's public URL. Required.                                                                     |
| `UPLOAD_SECRET`                            | At least 32 random characters that sign sessions and tokens. Required.                              |
| `UPLOAD_ALLOWED_EMAILS`                    | Who may sign in: addresses and `@domain` entries, comma-separated. Empty lets nobody in.            |
| `UPLOAD_SMTP_URL`, `UPLOAD_SMTP_FROM`      | Sign-in by email (a code or a link).                                                                |
| `UPLOAD_OIDC_<NAME>_*`                     | A sign-in provider (next-app-kit's: `GITHUB`, `GOOGLE`, `APPLE` built in, any OIDC with `_ISSUER`). |
| `UPLOAD_E2E`                               | `1` turns the end-to-end tests' sign-in route on, outside production only.                          |
| `UPLOAD_GITHUB_TOKEN`                      | Fine-grained, `actions: write` on the site's repository only: starts the site build.                |
| `UPLOAD_SITE_REPO`, `UPLOAD_SITE_WORKFLOW` | The site's repository and its build workflow. Defaults `3D-Bruckner/3dbruckner`, `pages.yml`.       |
| `UPLOAD_MAX_PHOTO_MB`                      | The largest photo an upload may send, in megabytes. Default `40`.                                   |
| `DATA_DIR`                                 | `upload.sqlite`, `auth.sqlite` and the photos. Default `/data`.                                     |
| `PORT`                                     | The port the server listens on; must be the real one (the kit checks tokens against it).            |
| `TZ`                                       | The time zone.                                                                                      |
| `UPLOAD_DEV_USER`                          | Development only: a fixed person instead of signing in. Refused under `NODE_ENV=production`.        |
| `UPLOAD_LOG_LEVEL`                         | The log's level: `debug`, `info`, `warn`, `error` or `silent`. Default `info`.                      |

## Development

```sh
nvm use && npm ci
npm run dev            # with PUBLIC_URL, UPLOAD_SECRET and DATA_DIR in .env.local
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

## Where the work stands

Four plans, in this order:

| #   | Plan                                                                                                                                                                                                    | Repository                                              | State            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------- |
| 1   | [next-app-kit](docs/superpowers/plans/2026-11-19-1-next-app-kit.md): sign-in, API tokens, MCP, REST, migrations and multipart as a library, plus its convention and one adoption issue per existing app | `Marceltov/next-app-kit`                                | done (v0.1.3)    |
| 2   | [The upload app](docs/superpowers/plans/2026-11-19-2-upload-app.md), built on the kit                                                                                                                   | this one                                                | in progress      |
| 3   | The site reads the export                                                                                                                                                                               | `3D-Bruckner/3dbruckner`                                | to write after 2 |
| 4   | Deployment on products-1 and moving the 25 prints over                                                                                                                                                  | `3D-Bruckner/stacks`, `MarcelBruckner-Business/ansible` | to write after 2 |

Decided along the way (2026-11-19):

- An own app, not notefeed tags, PocketBase, a tool that commits to GitHub, or S3: the spec's _Approaches_.
- It runs on products-1 (3D Bruckner is a product); "live within a few minutes" is enough.
- Order: newest first, reorderable, pinned showcases, which are also the start page's selection.
- Name `upload`, at `upload.3dbruckner.de`; mail from `noreply@3dbruckner.de` with `upload@` as an alias.
- What can be reused becomes a library, and a library that is a convention goes into the engineering conventions (hence plan 1); existing apps switch to it later, through one issue each.
