# upload

Where 3dbruckner.de's prints are put in: their photos and details, from the phone or through Claude. Every change to
what the site shows triggers the site build, which reads the published prints from this app's export. Visitors never
reach this app.

Not built yet. The design is
[`docs/superpowers/specs/2026-11-19-portfolio-app-design.md`](docs/superpowers/specs/2026-11-19-portfolio-app-design.md),
approved by Marcel on 2026-11-19.

## Where the work stands

Four plans, in this order:

| # | Plan | Repository | State |
|---|---|---|---|
| 1 | [next-app-kit](docs/superpowers/plans/2026-11-19-1-next-app-kit.md): sign-in, API tokens, MCP, REST, migrations and multipart as a library, plus its convention and one adoption issue per existing app | `Marceltov/next-app-kit` (to be created) | written, not started |
| 2 | [The upload app](docs/superpowers/plans/2026-11-19-2-upload-app.md), built on the kit | this one | written, not started |
| 3 | The site reads the export | `3D-Bruckner/3dbruckner` | to write after 2 |
| 4 | Deployment on products-1 and moving the 25 prints over | `3D-Bruckner/stacks`, `MarcelBruckner-Business/ansible` | to write after 2 |

To resume: on the development box (CT 116 `development`), run plan 1, then plan 2, with
`superpowers:subagent-driven-development` (Marcel's choice).

Decided along the way (2026-11-19):

- An own app, not notefeed tags, PocketBase, a tool that commits to GitHub, or S3: the spec's *Approaches*.
- It runs on products-1 (3D Bruckner is a product); "live within a few minutes" is enough.
- Order: newest first, reorderable, pinned showcases, which are also the start page's selection.
- Name `upload`, at `upload.3dbruckner.de`; mail from `noreply@3dbruckner.de` with `upload@` as an alias.
- What can be reused becomes a library, and a library that is a convention goes into the engineering conventions
  (hence plan 1); existing apps switch to it later, through one issue each.
