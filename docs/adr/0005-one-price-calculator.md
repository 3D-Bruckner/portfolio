# One price calculator, shared with the website

- Status: accepted
- Date: 2026-11-23

## Context and Problem Statement

The portfolio and 3dbruckner.de each held a copy of the price formula, kept in step by hand. Add-ons change the formula, and the website's calculator runs in the visitor's browser, so it needs the formula's code and not only its results.

## Considered Options

- A small package, `3D-Bruckner/print-pricing` (until 2026-11-27 `Marceltov/print-pricing`), that both install from a release tag.
- The formula stays in the portfolio, which exports its rates. The website would still need its own copy of the code.
- Only the rates are shared, and each side keeps its own formula.

## Decision Outcome

Chosen: **the package.** It has no dependencies and runs on a server and in a browser. The selling rates live in it for now. Every function also takes rates as an argument, so they can become settings later.

Add-ons are outside the multi-colour surcharge, which covers AMS wear and handling of the print. A print can include an add-on, which is part of its price, or offer it for the customer to choose when ordering. Only the price is kept, no stock. An add-on can name its Invoice Ninja product.

### Consequences

- A change to the formula or its rates is a release of `print-pricing`, then a version bump in both repositories.
- Purchase costs are not part of this package. They stay in Bambuddy, and customer prices don't follow them.
- A saved print's price doesn't change when an add-on's price does. It takes the new price the next time it is edited on the formula.
