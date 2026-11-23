# Authentik is the way in, and everyone allowed sees the same portfolio

- Status: accepted
- Date: 2026-11-23

## Context and Problem Statement

Sign-in by email code, passkey and Authentik made a separate user per address, so one person ended up with two users. The portfolio has no per-person data, and it should be easy to let another person in.

## Considered Options

- Authentik only, with an allow list of email addresses.
- Keep every method and link the users.
- Build user management into the portfolio.

## Decision Outcome

Chosen: **Authentik only, with the allow list `PORTFOLIO_ALLOWED_EMAILS`.** Whoever Authentik vouches for with an address on the list gets in, and everyone in has access to everything. Letting someone in means giving them an Authentik account and adding their address.

Passkeys are removed. Sign-in by mail stays in the code for instances without an identity provider, and is off here because `PORTFOLIO_SMTP_URL` is not set.

### Consequences

- If Authentik is down, nobody can sign in until it is back. API tokens and the site build keep working.
- API tokens still belong to the person who made them, and stop working when that address leaves the list.
