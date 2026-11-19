# upload

Where 3dbruckner.de's prints are put in: their photos and details, from the phone or through Claude. Every change to what the site shows triggers the site build, which reads the published prints from this app's export. Visitors never reach this app.

A Next.js app on [next-app-kit](https://github.com/Marceltov/next-app-kit), which brings the sign-in, API tokens, MCP, REST, migrations and uploads. The design is [`docs/superpowers/specs/2026-11-19-portfolio-app-design.md`](docs/superpowers/specs/2026-11-19-portfolio-app-design.md), approved by Marcel on 2026-11-19.

## Running it locally

Node 26 (`.nvmrc`):

```sh
nvm use && npm ci
cat > .env.local <<'ENV'
PUBLIC_URL=http://localhost:3000
UPLOAD_SECRET=a-development-secret-of-at-least-32-characters
DATA_DIR=./data
UPLOAD_DEV_USER=you@example.org
ENV
npm run dev            # http://localhost:3000, signed in as UPLOAD_DEV_USER
```

`UPLOAD_DEV_USER` skips the sign-in in development (refused in production; it can't make API tokens, passkeys or MCP connections); set `UPLOAD_SMTP_URL` instead to sign in by mail. Without `UPLOAD_GITHUB_TOKEN` nothing starts the site build. The checks CI runs:

```sh
npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build && npm run generate -- --check
```

## On the iPhone

Open the app in Safari, tap Share, then "Add to Home Screen". It then opens full-screen like an app, with the 3D Bruckner mark as its icon; it is the same web app, with no service worker and no offline mode (an upload needs the server anyway). Sign in with the code from the mail, which is the first thing the sign-in page offers: a link in a mail opens in Safari, not in the Home Screen app, and the code keeps the sign-in inside it. A passkey works there too. The icons are made by `node scripts/generate-icons.mjs` from `app/icon.svg`.

## Deploying it

CI publishes `ghcr.io/3d-bruckner/upload:main` from main once the checks passed. The server runs it from `compose.yaml` and `.env` alone ([`compose.yaml`](compose.yaml) here is that file); upload's deployment on products-1, behind gewerbe-1's Caddy, lives in [`3D-Bruckner/stacks`](https://github.com/3D-Bruckner/stacks) (`upload/`, written with plan 4).

## Docs

- [Configuration](docs/configuration.md): every setting, the data directory and what a backup must hold.
- [MCP tools](docs/mcp.md): the 22 tools Claude uses, their inputs, results and guidance.
- [ADR 0001](docs/adr/0001-own-app-for-the-portfolio.md): why an own app, and what changed while building it.
- REST: `/api/v1/openapi.json`, committed as [`openapi.json`](openapi.json).

## Where the work stands

Four plans, in this order:

| #   | Plan                                                                                                                                                                                                    | Repository                                              | State            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------- |
| 1   | [next-app-kit](docs/superpowers/plans/2026-11-19-1-next-app-kit.md): sign-in, API tokens, MCP, REST, migrations and multipart as a library, plus its convention and one adoption issue per existing app | `Marceltov/next-app-kit`                                | done (v0.1.3)    |
| 2   | [The upload app](docs/superpowers/plans/2026-11-19-2-upload-app.md), built on the kit                                                                                                                   | this one                                                | in progress      |
| 3   | The site reads the export                                                                                                                                                                               | `3D-Bruckner/3dbruckner`                                | to write after 2 |
| 4   | Deployment on products-1 and moving the 25 prints over                                                                                                                                                  | `3D-Bruckner/stacks`, `MarcelBruckner-Business/ansible` | to write after 2 |

What was decided along the way, and why, is in [ADR 0001](docs/adr/0001-own-app-for-the-portfolio.md).
