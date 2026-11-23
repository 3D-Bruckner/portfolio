# The tool is called portfolio and stays its own product

- Status: accepted; its naming exceptions are superseded by [ADR 0003](0003-everything-is-named-portfolio.md)
- Date: 2026-11-23

## Context and Problem Statement

The tool started as "upload", but it manages the prints of 3dbruckner.de's portfolio, and uploading is only one part of that. Should it get a better name, and should it move into the website?

## Considered Options

- Keep it separate and rename it to portfolio.
- Move the website into this application.
- Keep the name upload.

## Decision Outcome

Chosen: **keep it separate and rename it to portfolio.** The website keeps reading the export at build time. A separate product can later serve other 3D-printing shops, which a tool merged into one shop's website could not.

The repository, image, address, settings (`PORTFOLIO_*`) and visible name all change. Two things deliberately stay:

- API tokens keep the prefix `upl_`, so tokens already issued keep working.
- The data directory, `upload.sqlite` and the backup paths stay, because renaming them means moving live data for no visible gain.

### Consequences

- Passkeys are bound to the address and have to be added again on `portfolio.3dbruckner.de`.
- MCP clients connect again with the new address.
