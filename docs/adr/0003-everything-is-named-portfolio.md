# Everything is named portfolio

- Status: accepted
- Date: 2026-11-23
- Supersedes the naming exceptions of [ADR 0002](0002-portfolio-is-its-own-product.md)

## Context and Problem Statement

ADR 0002 kept the old name in the database file, server folder, backup jobs, secret names, token prefix and sign-in client, to avoid moving live data. But a file called `upload.sqlite` in a tool that has no such name looks like leftovers, and could be deleted by someone tidying up.

## Decision Outcome

Nothing that is operated keeps the old name: the database is `portfolio.sqlite`, the server folder `portfolio/`, the backup jobs `portfolio-dump-*`, the secrets `vault_portfolio_*`, the sign-in client `portfolio` and API tokens start with `ptf_`.

Past records, such as the plans and earlier ADRs, keep the name they were written with.

### Consequences

- Tokens starting with `upl_` stop working, so the site build gets a new token.
- The app refuses to start when it finds `upload.sqlite` without `portfolio.sqlite`, rather than creating an empty database.
