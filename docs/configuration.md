# Configuration

Every setting is an environment variable, and on a server every one of them is in one `.env` file: a filled-in copy of [`.env.example`](../.env.example), `chmod 600`, each value also in 1Password. `compose.yaml` lists none of them. A bad value stops the start with a message naming the variable.

Three files name the same variables and change together: `backend/config.ts` (`loadConfig` and its `VARIABLES` list), `.env.example` and this page. `envExampleListsEveryVariable` in `backend/config.test.ts` fails when one of them names a variable the others don't, or when code reads `process.env.X` for an `X` none of them lists.

An empty value counts as unset, so a copied `.env.example` with a blank line keeps the default. A variable whose empty value would still change something (`DATA_DIR`, `PORT`, an OIDC block) stays commented out in `.env.example` until it is filled in.

## The app

| Variable                   | Required | Default                         | What it does                                                                                                                                                                              |
| -------------------------- | -------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`               | yes      |                                 | The app's public URL, such as `https://upload.3dbruckner.de`: links in sign-in mails and MCP results (`<PUBLIC_URL>/prints/<id>`), the issuer of OAuth tokens. A trailing `/` is dropped. |
| `UPLOAD_SECRET`            | yes      |                                 | At least 32 random characters (`openssl rand -base64 48`) that sign sessions and tokens. Changing it signs everyone out.                                                                  |
| `UPLOAD_ALLOWED_EMAILS`    |          | empty: nobody                   | Who may sign in: addresses and `@domain` entries, comma-separated, case ignored. An address taken off the list loses its sessions and MCP grants at the next start.                       |
| `UPLOAD_GITHUB_TOKEN`      |          | none: no build triggered        | A fine-grained GitHub token with **Actions: write** on the site's repository only. Starts the site build a minute after the last change the site shows, and reads the build line's run.   |
| `UPLOAD_THINGIVERSE_TOKEN` |          | none: Thingiverse links refused | An app token for Thingiverse's API, made at thingiverse.com/developers. Importing a print from a Thingiverse link needs it; MakerWorld and Printables links need nothing.                 |
| `UPLOAD_CLAUDE_URL`        |          | none: no AI button              | "Mit KI verbessern": Marcel's Claude gateway, `https://claude.marceltov.de` (Claude Code on his subscription for his own apps, in his homelab; `POST <url>/v1/ask`, `backend/claude.ts`). |
| `UPLOAD_CLAUDE_TOKEN`      |          |                                 | upload's bearer token at the gateway.                                                                                                                                                     |
| `UPLOAD_SITE_REPO`         |          | `3D-Bruckner/3dbruckner`        | The site's repository, `owner/name`.                                                                                                                                                      |
| `UPLOAD_SITE_URL`          |          | `https://3dbruckner.de`         | The site itself: a published print's page there is linked as `<url>/portfolio/<slug>/`.                                                                                                   |
| `UPLOAD_SITE_WORKFLOW`     |          | `pages.yml`                     | The workflow file that builds the site; it is started with `workflow_dispatch`, `{"ref":"main","inputs":{"source":"upload"}}`.                                                            |
| `UPLOAD_MAX_PHOTO_MB`      |          | `40`                            | The largest photo an upload may send, in whole megabytes (at least 1); a larger one is refused with 413. What is stored is far smaller.                                                   |
| `UPLOAD_LOG_LEVEL`         |          | `info`                          | The log's level: `debug`, `info`, `warn`, `error` or `silent` (read by `backend/log.ts`). The log is JSON on stdout and never holds a token, a photo's name or an email address.          |
| `DATA_DIR`                 |          | `/data` (in the image)          | Where the data lives (below).                                                                                                                                                             |
| `TZ`                       |          | `UTC`                           | The time zone of the log's and the app's dates, such as `Europe/Berlin`.                                                                                                                  |

## Sign-in (read by next-app-kit)

next-app-kit's `signInFromEnv` reads these under the prefix `UPLOAD` (`backend/accounts.ts`). Some way in must exist: SMTP, a provider, or (in development) a dev user.

| Variable                                                                                                                    | What it does                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UPLOAD_SMTP_URL`, `UPLOAD_SMTP_FROM`                                                                                       | Sign-in by email: a code, and in the browser a link too, sent through this SMTP server (`smtps://user:password@host:465`), from `3D Bruckner <noreply@3dbruckner.de>`. The mail speaks the sign-in page's language.                                                  |
| `UPLOAD_OIDC_<NAME>_CLIENT_ID`, `UPLOAD_OIDC_<NAME>_CLIENT_SECRET`, `UPLOAD_OIDC_<NAME>_ISSUER`, `UPLOAD_OIDC_<NAME>_LABEL` | A sign-in provider. `GITHUB`, `GOOGLE` and `APPLE` are built in and need no issuer; any other name is an OIDC provider and needs `_ISSUER`, its discovery base. `_LABEL` is the button's name. The allowlist applies to every provider.                              |
| `PORT`                                                                                                                      | **Must be the port the server really listens on** (the image sets `3000`). /mcp and /api/v1 check OAuth access tokens against the app's own key set at `http://127.0.0.1:$PORT/api/auth/jwks`; with a wrong port every MCP call answers 401 (API tokens still work). |
| `UPLOAD_E2E`                                                                                                                | `1` turns on the end-to-end tests' sign-in route (`/api/test/sign-in`), outside production only; under `NODE_ENV=production`, as in the image, the route doesn't exist. Never set on a server.                                                                       |
| `UPLOAD_DEV_USER`                                                                                                           | Development only: everyone reaching the app is this address, without signing in. Refused when `NODE_ENV=production`, as in the image.                                                                                                                                |

## The image

| Variable              | Default                                    | What it does                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUID`, `PGID`        | the owner of `/data` (1000 if that's root) | Who the server runs as. The entrypoint (`docker-entrypoint.mjs`) starts as root only to give `DATA_DIR` itself to this user and switch to it; the files in it are never chowned.                                                      |
| `NODE_EXTRA_CA_CERTS` | none                                       | A PEM file of extra certificate authorities to trust, for an SMTP server or proxy with an internal CA. The image is distroless (no shell, no `update-ca-certificates`), so this is the way to add one: mount the file and point here. |

The image itself sets `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` and `DATA_DIR=/data`, and runs Node with `--use-system-ca`.

**An API token from the server**, without a browser (the first one, or one for a script such as the site build's): next-app-kit's command, run in the container as its user, for an address in `UPLOAD_ALLOWED_EMAILS` (also one that never signed in). It prints the token once:

```sh
docker exec -u 1000 upload /nodejs/bin/node node_modules/next-app-kit/dist/cli.js token \
  --prefix UPLOAD --token-prefix upl_ --email marcel@3dbruckner.de --name "site build" --scope read --days 365
```

## The data

Everything upload keeps is in `DATA_DIR`:

```text
DATA_DIR/
  upload.sqlite                     prints, photos' rows, categories, the order, reserved slugs, the site build's state
  auth.sqlite                       next-app-kit's: people, sessions, passkeys, API tokens, MCP clients and grants
  photos/<printId>/<photoId>.jpg              the cutout: the part the site shows, long edge ≤ 2400 px, JPEG quality 85, no metadata
  photos/<printId>/<photoId>.orig.<jpg|png|webp>   the original as taken, without its metadata (orientation and colour profile kept)
  photos/<printId>/<photoId>.thumb.<sha>.jpg  the cutout's thumbnail for the lists (256 px), made on first ask; can be deleted
```

**A backup needs all of it**: both SQLite files (copied with `sqlite3 <file> ".backup <copy>"`, not `cp`, while the app runs) and the whole `photos/` folder, cutouts and originals. Without an original a photo's crop can't be changed any more; without a cutout the site build gets a 404 for it.
