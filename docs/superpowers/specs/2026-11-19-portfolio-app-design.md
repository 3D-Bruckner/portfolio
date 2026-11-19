# Portfolio app: prints added from the phone, without git

Date: 2026-11-19. Status: design approved by Marcel 2026-11-19, not built.

## Intent

Marcel wants to add and update the prints on 3dbruckner.de's portfolio from his phone, on the go, without touching git. A
new print should be on the site **within a few minutes**; instantly is not needed. Only 3dbruckner.de's portfolio is in
scope. The site's look stays as it is.

Today every print is a folder `src/assets/printed/<slug>/` in this repository (photos plus `meta.yaml`), read by
`src/lib/printed.ts` at build time. Adding one means compressing photos (`scripts/compress-printed-images.sh`), a
commit and a push. 25 prints, 333 photos, 180 MiB; the repository is about 770 MB because git keeps every photo ever
committed.

## Goals

- A phone-friendly form to create a print with its photos, and to edit, reorder, hide and delete prints.
- Every change reaches the live site in a few minutes, by itself.
- The print data has real types and checks: a price is a number, a category comes from a list, a broken entry can't
  break the build.
- Claude can manage the prints over MCP (texts, prices, categories, order and showcases, hide/publish), per the conventions'
  _MCP first_.
- Photos live outside git from now on.

## Non-goals

- Other sites (marcelbruckner.de) or other content (blog stays in notefeed, printer photos in `src/assets/printers` stay
  in git).
- A redesign of the portfolio pages.
- Rewriting this repository's history to remove the old photos.
- Uploading photos through Claude (a picture in a chat doesn't reach a tool); photos come in through the web form only.

## Anti-goals

- Visitors depending on the app: if the app is down, the live site keeps working and keeps its prints.
- A changed address for an existing print: `/portfolio/<path>` must stay as it is (links, search engines).
- Original photos with location data stored anywhere.
- A second login stacked in front of the app's own (business rule: a tool with its own login gets no authentik in
  front, as Invoice Ninja).
- One more general-purpose system to run (MinIO, SeaweedFS, a CMS): see Approaches.

## Constraints

- **Where it runs:** products-1, the business's server for products (3D Bruckner is one). products-1 has no public
  port: gewerbe-1's Caddy serves the public name and passes requests over the private network
  (MarcelBruckner-Business/ansible, `docs/products-1.md`, ADR 0003). Deployed like notefeed: a stacks checkout listed in
  `stacks_checkouts` (`inventory/group_vars/products/vars.yml`), image from ghcr, `compose.yaml` + `.env`.
- **Backups:** products-1's dump timers (`dump_schedule`) and restic to the business Storage Box. The app's SQLite file
  and its photo folder join them.
- **Conventions** (Marceltov/engineering-conventions): one Next.js app in one image, `backend/` domain layer, MCP first
  with `guidance`, SQLite via `better-sqlite3` + `kysely`, Better Auth with an email allowlist and its own `auth.sqlite`,
  zod at every boundary, distroless image, every secret in 1Password, repo in the product org.
- **The site stays static** on GitHub Pages, built by `.github/workflows/pages.yml` (push, hourly at :37,
  `workflow_dispatch`; a scheduled run only deploys when the output changed).
- **Astro derives every photo size itself** (`src/lib/images.ts`, widths 240/720/1000/1600 in `printed.ts`), so it needs
  the photos as local files at build time.
- **Slugs are referenced in code:** `src/pages/index.astro` (`homePrints`, 8 slugs) and `src/pages/modellierung.astro`
  (`druckplatten-griff`).
- **iPhone photos** arrive as HEIC or JPEG, with EXIF orientation and GPS.

## Approaches

| Approach | Trade-off | Outcome |
| --- | --- | --- |
| Portfolio as a second notefeed feed, fields as tags (`preis:6`) | Nothing new to run, but typed fields become free text on a phone | Rejected: Marcel wants a real form and clean data |
| PocketBase (or Directus) on a business server | Real fields; generic admin UI, one more third-party service | Rejected in favour of a tailored app |
| Own tool that commits to this repo through the GitHub API | No data store at all, git history; but photos keep growing the repo (770 MB, GitHub recommends < 1 GB) and can never leave it | Rejected: GitHub is the wrong home for photos added often |
| Self-hosted S3 (SeaweedFS, Garage, MinIO) plus a front end | A storage cluster engine for a few hundred photos, plus a separate place for the data; ADR-0046/0047 already reverted MinIO for this | Rejected |
| **Own app: SQLite for the data, photos as files, on products-1; the site build pulls from it** | Software to write and maintain; everything else (backups, sign-in, deploy) follows patterns that exist | **Chosen by Marcel** |

Why the MinIO attempt (homelab ADR-0046, reverted by ADR-0047) doesn't repeat: it failed because storing photos
elsewhere never made them appear without a rebuild. Here the app triggers the rebuild itself.

## Design

### The app

- **Repository:** `3D-Bruckner/upload`, image `ghcr.io/3d-bruckner/upload`. Deployment files in a new
  `3D-Bruckner/stacks` (`upload/compose.yaml`, `.env.example`), added to products-1's `stacks_checkouts`.
  _(Name chosen by Marcel: it is where prints are put in, matching `upload@`.)_
- **Public name:** `upload.3dbruckner.de`, a route in gewerbe-1's Caddy to products-1, DNS only.
- **Stack:** per conventions (Next.js, SQLite, Better Auth, Vitest, Playwright, Tailwind, lucide). UI in German (the
  shop's language; only Marcel uses it), code and logs in English.
- **Data dir:** `DATA_DIR` with `portfolio.sqlite`, `auth.sqlite`, `photos/<print id>/<photo id>.jpg`.

### Data

A **print** has:

| Field | Type | Today's `meta.yaml` |
| --- | --- | --- |
| `slug` | ASCII, unique, set at creation from the title, **fixed once the print was published** | folder name |
| `title` | text, required | `title` |
| `shortTitle` | text, optional | `shortTitle` |
| `description` | text, required | `description` |
| `categories` | 0..n from the category list | `categories` |
| `price` | whole euros, optional | `price` |
| `sources` | 0..n of `{label, url}` | `source` |
| `selfDesigned` | bool | `selfDesigned` |
| `weightGrams`, `printTimeMinutes`, `colors` | whole numbers ≥ 1, optional | slicer stats |
| `photos` | ordered list, one marked as cover | files + `cover` |
| `status` | `draft` or `published` | (none) |
| `position` | place in the portfolio order (see Order) | folder name, alphabetical |
| `showcase` | pinned, with its own position among the pinned | `homePrints` in `index.astro` |
| `createdAt`, `updatedAt` | | |

**Categories** are their own small table (name, and a slug fixed at creation, so `/portfolio#<slug>` anchors survive a
rename). The form picks from it; a new category is created explicitly, not by typing a new name into a print.
_(Claude's call: stops "Geschenkidee" next to "Geschenkideen".)_ The site keeps ordering them as today (most prints
first, "Sonstiges" last), so the app stores no category order. _(Claude's call: the site's look stays.)_

**Slugs are never reused** _(Claude's call)_: unpublishing or deleting a print makes its page a 404 on the next build;
its slug stays reserved so a later print can't take the address. Code that names a print (`modellierung.astro`'s
`druckplatten-griff`) copes with it missing instead of failing the build, so one unpublish can't stop every later
build.

**Drafts** _(Claude's call)_: a print starts as a draft, so photos can be uploaded at the printer and the text written
later. Only published prints reach the site. Publishing needs a title, a description and at least one photo.

**Order** (Marcel): **newest first by default, reorderable, with pinned showcases.** A new print goes to the top of
the portfolio when it is published. Marcel can drag any print to another place. Pinned prints ("Showcase") stand above
all others in their own order. The import sets the 25 prints' starting order once (by their first commit date, newest
first; `zz-ams-lite-top-mount` loses its `zz-` role but keeps its address). "Similar prints" and every other list on
the site follow this order.

**Showcase is the start page's selection too** _(Claude's call)_: the start page's hand-picked list (`homePrints`) is the
pinned prints, so one pin decides both and the list in `index.astro` goes away.

### Photos

On upload, before anything is stored: decode (HEIC and JPEG), apply EXIF orientation, cap the long edge at 2400 px,
re-encode as JPEG quality 85, **drop all metadata**. These are the parameters of `compress-printed-images.sh`. The
original is never written to disk. Upload works one photo at a time with progress, so a weak mobile connection loses one
photo, not the batch.

### Surfaces

- **Web (phone first):** list of prints (draft/published, cover thumbnail), a print's form, photo upload from the camera
  roll, drag to reorder, tap to make cover, publish/unpublish, delete (with confirmation), categories page, start-page
  order, and a line showing the last site build and its state.
- **MCP** (`/mcp`, OAuth via Better Auth): list/get prints, create a print (without photos), update fields, set
  categories, publish/unpublish, pin/unpin and order showcases, move a print in the portfolio order, reorder photos and set the cover by photo id, delete, manage
  categories, show build state. Every result carries `guidance` and the print's URL in the app.
- **REST** `/api/v1`: the same domain layer. The **export** endpoint the site build uses: every published print with
  its fields, its photos' ids, content hashes and download URLs, the categories, and the order (showcases first, then the rest). It is
  read with a read-scoped API token.

### Sign-in

Better Auth, magic link by default (needs the app's SMTP for 3dbruckner.de, conventions _Mail_), plus a passkey so the
phone signs in with Face ID. `UPLOAD_ALLOWED_EMAILS` holds Marcel's address. No authentik in front. API
tokens per conventions (hashed, shown once, scoped, expiring); the site build's token is `read` only.

### Getting changes onto the site

- **Trigger:** after a change to anything the site shows (a published print, categories, the order), the app waits
  for quiet (proposal: 60 s with no further change) and then calls `workflow_dispatch` on `pages.yml`. A fine-grained
  GitHub token with only `actions: write` on this repository, in 1Password and the app's `.env`. Changes to drafts don't
  trigger. A failed dispatch is retried and shown in the app's build line.
- **Build:** a new step in `pages.yml` before `astro build` runs `scripts/fetch-portfolio.mjs`. It reads the export and
  writes **exactly today's layout** (`src/assets/printed/<slug>/meta.yaml` plus numbered photos, which keep the app's
  order through filename order) into a git-ignored folder, so `src/lib/printed.ts` and the pages need only small
  changes (the order and the showcases from the export instead of folder names and `homePrints`). Photos are cached in the Actions cache by content
  hash, so an hourly build downloads only new photos, not 180 MiB each time. If the app can't be reached, the build fails
  and the live site stays as it was (as with notefeed).
- **Checks:** the fetch script validates the export with zod and fails on anything wrong; slugs referenced in code
  (`modellierung.astro`) are checked to exist. `check-no-gps.py` keeps running on `dist`.
- **Local development:** the same script with `PORTFOLIO_API_URL`/`PORTFOLIO_API_TOKEN`, or a small fixture export
  checked into the repo for builds without the app.

### Migration

1. A one-off import (script in the app repo) reads `src/assets/printed/*` from a checkout of this repo and creates each
   print with its slug, fields, photos in filename order and cover, as published; categories in today's order;
   the showcases from `homePrints`.
2. Compare: the site built from the app's export against today's site (same pages, same `/portfolio/<path>` addresses,
   same photo count per print).
3. One PR here: remove `src/assets/printed/`, git-ignore it, add the fetch step and secrets, take the order and the showcases
   from the export, retire `compress-printed-images.sh` for `printed/` (it still serves `printers/`) and the pre-commit
   hook's part for it.

### Operations

- **Backups:** like Gamepanion on products-1 _(Claude's call)_: a dump of `portfolio.sqlite` (`sqlite3 .backup`) plus
  `photos/` into restic, in **its own** Storage Box sub-account, restic password and healthchecks.io check, so notefeed's
  retention promise isn't touched. Creating the sub-account and installing its key is Marcel's step (sub-account
  password). Nothing personal is stored but Marcel's own sign-in, so the photos may be kept long (proposal: as the
  business stacks, 30 daily / 12 monthly).
- **Mail:** magic links are sent from `noreply@3dbruckner.de` (conventions _Mail_; Invoice Ninja's `rechnungen@` is not
  reused), with `upload@3dbruckner.de` as an alias of it (Marcel). If it doesn't exist yet, Marcel creates it before the first sign-in; the passkey is
  registered right after that first sign-in.
- **Builds the app triggers** are treated like the hourly ones: no order-form end-to-end test, so no test push to
  Marcel's phone (it stays on pushes). A failed build reaches Marcel as GitHub's failure email, and the app's build line
  shows each run's state, read from the GitHub API with the same token (`actions: write` includes read).
- **Monitoring:** an Uptime Kuma check on `upload.3dbruckner.de/health`; a failed site build already mails through
  GitHub.
- **Privacy:** visitors never reach the app; the site serves only the photos it built in. The privacy policy doesn't
  change.
- **Secrets:** API token for the build (GitHub Actions secret), dispatch token, SMTP, Better Auth secret: all in
  1Password and the vault, per conventions.

## Decided by Marcel

- The own app over notefeed, PocketBase, a GitHub wrapper or S3.
- Runs on products-1, not gewerbe-1: 3D Bruckner is a product.
- "Live within a few minutes" is enough.
- Order: newest first, reorderable, pinned showcases.
- `upload@3dbruckner.de` as an alias of `noreply@`.
- Only 3dbruckner.de's portfolio.

## Left to the builder

- The UI's exact layout, components and wording.
- The image library (sharp with HEIC support, or converting in the browser) as long as HEIC from an iPhone works.
- The quiet period before a dispatch, the cache key details, the export's exact shape.
- How `printed.ts` takes the order.

## Change 2026-11-19: originals and cutouts (Marcel)

- **Originals are kept** at full resolution, turned upright, with **all metadata removed** (GPS, camera, date). The anti-goal "original photos with location data stored anywhere" still holds; "the original is never written to disk" is replaced by "the original is written only without metadata".
- **Each photo has a cutout**, chosen freely on the phone by dragging a frame over the photo (default: the whole photo). The site gets the cutout, capped at 2400 px, JPEG quality 85, no metadata.
- **Deleting the last photo of a published print** unpublishes the print in the same step, after a warning.
