---
status: accepted
date: 2026-11-19
decision-makers: Marcel Bruckner
---

# The portfolio's prints live in an own app: SQLite and photo files on products-1, and the site build pulls them from its export

## Context and Problem Statement

Every print on 3dbruckner.de's portfolio was a folder `src/assets/printed/<slug>/` in the site's repository: photos plus a `meta.yaml`, read by `src/lib/printed.ts` at build time. Adding one meant compressing photos with a script, a commit and a push, which can't be done from a phone on the go. 25 prints, 333 photos, 180 MiB, and a repository of about 770 MB because git keeps every photo ever committed.

Marcel wants to add and change prints from his phone, without git, and have them on the site within a few minutes. The site stays static on GitHub Pages and keeps its look; visitors must never depend on the new part. The design is [`docs/superpowers/specs/2026-11-19-portfolio-app-design.md`](../superpowers/specs/2026-11-19-portfolio-app-design.md).

## Decision Drivers

- A real phone form with typed, checked fields: a price is a number, a category comes from a list, a broken entry can't break the build.
- On the site within a few minutes, by itself; instantly is not needed.
- Photos out of git from now on.
- Claude manages the prints over MCP (conventions: MCP first).
- No visitor depends on it: if it is down, the site keeps its prints. No changed address for an existing print.
- No original photo with its location stored anywhere.
- Nothing general-purpose to run (no MinIO, no CMS); backups, sign-in and deployment follow patterns that exist.

## Considered Options

1. The portfolio as a second notefeed feed, its fields as tags (`preis:6`).
2. PocketBase or Directus on a business server.
3. An own tool that commits to the site's repository through the GitHub API.
4. Self-hosted S3 (SeaweedFS, Garage, MinIO) plus a front end.
5. **An own app: SQLite for the data, photos as files, on products-1; it triggers the site build, which pulls from its export.**

## Decision Outcome

Chosen: option 5, by Marcel. Notefeed's tags turn typed fields into free text on a phone; PocketBase and Directus bring a generic admin UI and one more third-party service; committing through GitHub keeps photos growing a repository they can never leave; an S3 cluster is far too much for a few hundred photos, and the homelab's MinIO attempt (ADR-0046, reverted by ADR-0047) failed because stored photos never appeared on the site without a rebuild. Here the app starts the rebuild itself.

What was built (repository `3D-Bruckner/upload`, image `ghcr.io/3d-bruckner/upload`, at `upload.3dbruckner.de`):

- **One Next.js app** on [next-app-kit](https://github.com/Marceltov/next-app-kit), which brings sign-in (Better Auth in its own `auth.sqlite`: an allowlist, a code or link by mail, passkeys, OAuth for MCP clients), API tokens, the MCP and REST plumbing, migrations and multipart uploads. The domain is `backend/`; its data layer `backend/db/` (SQLite through `better-sqlite3` and `kysely`) in `DATA_DIR/upload.sqlite`.
- **Three surfaces on one domain layer:** the web app for the phone (prints, a print's form with its photos and crop frame, the order with showcases, categories, settings), 22 MCP tools ([`docs/mcp.md`](../mcp.md)), and REST under `/api/v1` with the same operations plus the site build's export. A print's fields are listed once (`backend/printfields.ts`) and every surface is built from that list.
- **Drafts and publishing:** a print starts as a draft; publishing needs a title, a description and a photo, puts it at the top of the portfolio and fixes its slug. A slug that was ever published is never used again, and a clash is refused naming it, never suffixed silently.
- **The site build:** a change to anything the site shows marks a build pending; 60 s after the last such change the app dispatches `pages.yml` on `3D-Bruckner/3dbruckner` with a fine-grained token (`actions: write` on that repository only), retried after 1, 2, 4 … minutes when GitHub refuses; the pending mark is in the database, so a restart doesn't lose it. The site build reads the export with a `read` API token (plan 3).
- **Deployment:** the image is distroless, published by CI from main; a server holds `compose.yaml` and `.env` only (plan 4, in `3D-Bruckner/stacks` on products-1).

### Changed while building (2026-11-19)

Decided by Marcel:

- **Originals are kept, and each photo has a cutout.** The spec stored only a re-encoded 2400 px JPEG and never wrote the original. Now the original is stored as taken, without its metadata: a JPEG's image data byte for byte, its segments filtered without decoding (`backend/jpegmeta.ts`: GPS, camera, date, XMP and comments go; the orientation flag and the colour profile stay, since they only say how to show the picture); a PNG or WebP re-encoded losslessly with its colour profile only. The site gets a cutout, a frame Marcel drags over the photo on his phone (the whole photo by default): long edge at most 2400 px, JPEG quality 85, no metadata. The anti-goal "no original with location data stored anywhere" still holds.
- **Deleting the last photo of a published print unpublishes it** in the same step, after a warning (in the web app's dialog and in `delete_photo`'s guidance). Before that, the delete was refused.

Rulings made while building, within the spec:

- **The data file is `upload.sqlite`**, not the spec's `portfolio.sqlite` (conventions: `<app>.sqlite`). Plan 4's backup docs use the new name.
- **HEIC is refused** with "please upload as JPEG" instead of being converted. The file input's `accept="image/jpeg,image/png,image/webp"` makes iOS convert a photo picked from the library; sharp's prebuilt binaries can't read HEIC. The spec left the library to the builder "as long as HEIC from an iPhone works": it works when picked, not when shared as a file.
- **The UI speaks German and English** (conventions: language, which came after the spec's "UI in German"): one copy module per language, the browser's language or the header's switch; Marcel's browser asks for German. Code, logs, MCP descriptions and `guidance` are English.
- **The runtime image is distroless** (`gcr.io/distroless/nodejs26-debian13`, conventions: Next.js), not the alpine image the sibling apps use; sharp and better-sqlite3 load in it (checked in CI by starting the image). A small Node entrypoint takes over what a shell script would do (dropping root to the owner of `/data`).
- **MCP tool inputs are camelCase** (`printId`, `photoIds`, `beforeId`), the field table's wire names, not the plan's snake_case: one name per field on every surface.
- **An API token can't make or revoke API tokens** (REST answers 403); the web app and OAuth callers (MCP clients) can. A leaked token can't mint never-expiring ones; a script can't rotate its own token.
- **Re-publishing puts a print on top again**; unpublishing takes it out of the order and the showcases.
- **Dependabot's pull requests are merged by hand.** The repository is private on GitHub Free, which has no auto-merge and no rulesets, and refuses secret scanning and CodeQL; the conventions' auto-merge workflow and ruleset come back when the repository goes public or the plan changes. Dependabot alerts and security updates, and the daily `audit.yml` (npm audit and an image scan), are on.
- **The kit grew where the app needed it**, in releases rather than copies: v0.1.2 (a code on multipart refusals, the sign-in mail in the app's language pick) and v0.1.3 (a refused upload no longer hangs the request). The app pins v0.1.3 with every peer at the kit's exact version.

### Consequences

- Good, because Marcel adds a print from his phone (photos at the printer, text later as a draft) or through Claude, and the site follows within a few minutes without a commit.
- Good, because photos leave git: the site's repository stops growing by every photo.
- Good, because the fields are typed and checked once, for the form, MCP and REST alike; the site build validates the export again and fails rather than publishing something broken.
- Good, because the site doesn't depend on the app at visit time: if the app is down, builds fail and the live site stays as it was.
- Good, because originals are kept without their metadata, so a cutout can be changed at any time and nothing personal is stored.
- Bad, because it is software of our own to write and maintain (a Next.js app, its dependencies, its image), where a tag in notefeed would have been none.
- Bad, because there are now two places to back up for one portfolio: both SQLite files and the photos, cutouts and originals, on products-1 with its own restic repository.
- Bad, because the site build now needs the app reachable and a token: an outage of products-1 blocks every site build, including ones that don't touch the portfolio.
- Bad, because the originals take more space than the spec's capped JPEGs (full-size, as taken).
- Bad, because a HEIC shared as a file (not picked) is refused, and Marcel has to convert it once.
- Bad, because Dependabot's pull requests wait for a hand merge while the repository is private on GitHub Free.
- Bad, because a slug is never reused: a print deleted by mistake can't get its old address back by being created again.
