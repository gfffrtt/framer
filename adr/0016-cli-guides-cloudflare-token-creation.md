# 0016. The CLI guides the user to create Cloudflare credentials

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

ADR 0014 has `framer add` prompt for `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, but users don't know where to get them or which
permissions the token needs.

## Decision

When the Cloudflare credentials are missing, `framer add`:

1. Explains the steps and automatically opens, in the browser, a Cloudflare
   "token template" link: the create-account-API-token page with the needed
   permissions pre-filled (`workers_r2: edit`, `account_api_tokens: edit`) and the
   token name set to `framer-<purpose>`, where the purpose is the entity-type
   folder being added (e.g. `framer-buckets`). The link is also printed in case
   the browser doesn't open.
2. Asks for the token only.
3. Finds the account ID from the token (`GET /accounts`): one account is used
   directly, several are offered as a choice, none falls back to asking.
4. Saves both to the root `.env`.

Without a terminal it fails with the same link in the error.

## Consequences

- The token is account-owned by default, matching the account token endpoints
  framer tries first.
