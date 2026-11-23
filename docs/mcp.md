# MCP tools

portfolio's MCP server is at `<PUBLIC_URL>/mcp` (Streamable HTTP, POST only), for Claude and any MCP client. A client signs in with OAuth (next-app-kit's: the client registers itself, Marcel signs in on the app's own sign-in page and agrees on `/consent`); the allowlist (`PORTFOLIO_ALLOWED_EMAILS`) applies. The tools are in `backend/mcp.ts`.

## How the tools answer

- **The same domain functions as REST and the web app.** Each tool has a REST operation under `/api/v1` that mirrors it (`checkOpsMirrorTools` in `backend/rest.test.ts`); two operations have no tool: the site build's export and a photo's bytes.
- **Inputs are camelCase**, the same wire names as REST and the field table (`printId`, `photoIds`, `beforeId`, `categoryIds`, `expiresInDays`). `create_print` and `update_print` take the print fields of `backend/printfields.ts`, with their limits and descriptions; an unknown field is refused, not dropped.
- **Every result carries `guidance`**: English lines, built from what the call did, about what matters next (is this on the site yet, what is still missing, where Marcel adds photos). The tool descriptions say what Claude needs before a call; `guidance` what it needs after.
- **Every result that names a print carries its `url`**, its page in the web app: `<PUBLIC_URL>/prints/<id>`, with no language in it.
- **A refusal** is an MCP error with the domain's English message, what is wrong, and, where the tool knows what to do about it, the kit's refusal `guidance` (a second content item and `structuredContent: { error, guidance }`): a refused publish names what is missing, its guidance where to add each (the print's URL for photos, `update_print` for the text); a slug clash names the slug, its guidance how to choose another.
- **The server's instructions** (`MCP_INSTRUCTIONS`) say what the app is, that photos are only added in the web app, that a new print is a draft, and that a print's description is German.

A print in a result is its fields (`title`, `shortTitle`, `description`, `price`, `selfDesigned`, `weightGrams`, `printTimeMinutes`, `colors`, `categoryIds`, `sources`, `slug`), plus `id`, `status` (`draft` or `published`), `showcase`, `coverPhotoId`, `photos`, `categories`, `firstPublishedAt`, `createdAt`, `updatedAt` and `url`. A photo is its `id`, `printId`, the cutout's `width`, `height`, `bytes` and `sha256`, `original` (the original's size as shown, the space a crop is given in) and `crop` (null: the whole photo).

## The 22 tools

### Prints

| Tool              | Input                                                                                                            | Returns                                                                                 | Guidance says                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_prints`     | `status?` (`draft` or `published`)                                                                               | `prints`: drafts newest first, then the published in the site's order (showcases first) | how many drafts and published prints there are; that drafts are not on the site                                                                                                      |
| `get_print`       | `id`: the print's id or its slug                                                                                 | the print                                                                               | where it is on the site (`/portfolio/<slug>`, as a showcase or not), or that it is a draft and what publishing it still needs                                                        |
| `create_print`    | the print fields (`title` required; no slug: it is made from the title)                                          | the print, a draft                                                                      | that it is a draft, its future address, that photos are added in the web form at its `url` (a link for Marcel), and that `publish_print` follows                                     |
| `update_print`    | `id` and the fields to change (left out: unchanged; null clears an optional one; a list replaces the whole list) | the print                                                                               | whether the site shows the change with its next build or the print is a draft                                                                                                        |
| `publish_print`   | `id`                                                                                                             | the print, at the top of the portfolio                                                  | that the site updates in a few minutes and its address; or that it was published already. Refused naming what is missing (title, description, a photo) or a reserved slug            |
| `unpublish_print` | `id`                                                                                                             | the print, a draft again                                                                | that it leaves the site with the next build and `publish_print` puts it back at the top; or that it was a draft already                                                              |
| `delete_print`    | `id`                                                                                                             | `deleted`: `id`, `title`, `slug`, `wasPublished`                                        | that it leaves the site and its slug can never be used again, or that the site never showed it. The description asks Claude to confirm with Marcel before deleting a published print |

### Order

| Tool            | Input                                                                  | Returns   | Guidance says                                                                                |
| --------------- | ---------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `move_print`    | `id`, `beforeId` (a published non-showcase print, or null: to the end) | the print | that the site shows the new order with its next build                                        |
| `set_showcase`  | `id`, `on`                                                             | the print | pinned at the end of the showcases (`move_showcase` reorders), or unpinned back to its place |
| `move_showcase` | `id`, `beforeId` (a showcase, or null: to the end)                     | the print | that the site shows the showcases' new order with its next build                             |

### Photos

Photos are uploaded only in the web app (a picture in a chat doesn't reach a tool); these tools order, crop and delete them.

| Tool             | Input                                                                                                                 | Returns                  | Guidance says                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reorder_photos` | `printId`, `photoIds` (each of the print's photos exactly once)                                                       | the print                | the photos are reordered, and whether the site shows it                                                                                              |
| `set_cover`      | `printId`, `photoId`                                                                                                  | the print                | the cover is set, and whether the site shows it                                                                                                      |
| `set_photo_crop` | `photoId`, `crop`: `{left, top, width, height}` in whole pixels of the original as shown, or null for the whole photo | the photo and `printUrl` | the cutout's new size, that crops are in the original's shown size, and when the site gets the new cutout                                            |
| `delete_photo`   | `photoId`                                                                                                             | `unpublished`, `print`   | deleted; or, for a published print's last photo, that the print is now a draft and leaves the site, with where to add photos before publishing again |

### Categories

| Tool              | Input        | Returns                                        | Guidance says                                                                            |
| ----------------- | ------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `list_categories` | none         | `categories`, each with how many prints use it | that a print's categories are set with `categoryIds`, a list that replaces them all      |
| `create_category` | `name`       | the category                                   | its slug stays through renames; how to give prints the category                          |
| `rename_category` | `id`, `name` | the category                                   | the slug stays; whether published prints show the new name with the next build           |
| `delete_category` | `id`         | `deleted`: the id                              | that no print used it. Refused, naming the prints, while any print (a draft too) uses it |

### The site build

| Tool                | Input | Returns                                                                                                                    | Guidance says                                                                                                         |
| ------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `site_build_status` | none  | `pending`, `lastDispatch?`, `lastError?`, `run?` (`status`, `conclusion`, `url`, `startedAt` of the latest dispatched run) | whether changes wait for a build, a failed start and its retry, a running build, or a failed one to tell Marcel about |

### API tokens

For scripts; the site build reads the export with a `read` token. Tokens are made and revoked by an OAuth caller (an MCP client) or in the web app; over REST an API token can't make or revoke tokens (403), so a leaked token can't mint new ones.

| Tool               | Input                                                                             | Returns                                                                             | Guidance says                                                                       |
| ------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `create_api_token` | `name`, `scope` (`read` or `read+write`), `expiresInDays` (1–365, or null: never) | the token's `id`, `name`, `scope`, `start`, dates and the `token` itself, this once | hand it to Marcel once for 1Password and never repeat it; how to find and revoke it |
| `list_api_tokens`  | none                                                                              | `tokens`: names, scopes, starts and dates, never the tokens                         | a token can't be shown again; `revoke_api_token` takes one back                     |
| `revoke_api_token` | `id`                                                                              | `revoked`: the id                                                                   | whatever used it now gets 401 and needs a new token                                 |
