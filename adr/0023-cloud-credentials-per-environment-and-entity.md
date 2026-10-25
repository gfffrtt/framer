# 0023. Cloud credentials are per environment, purpose and entity, with no fallback

- **Date:** 2026-10-25
- **Status:** Accepted

## Context

One `CLOUDFLARE_API_TOKEN` (or `VERCEL_TOKEN`) for the whole project means a dev
mistake can touch prod, and one leaked token reaches everything. On clouds like
AWS, teams want a credential for exactly one job. Credentials must be isolated
by default, and their names must be predictable.

## Decision

Every credential framer reads is scoped to **one environment, one purpose and one
entity**. Its root `.env` key is:

```
<KEY>_<ENV>_<PURPOSE>_<NAME>
```

- `<KEY>` is the cloud's base key: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `VERCEL_TOKEN`, `VERCEL_TEAM_ID`.
- `<ENV>` is the environment, `<PURPOSE>` the entity-type folder, `<NAME>` the
  entity name.
- Uppercased, with `-` turned into `_`.

Examples: `CLOUDFLARE_API_TOKEN_PROD_BUCKETS_UPLOADS`,
`CLOUDFLARE_ACCOUNT_ID_PROD_BUCKETS_UPLOADS`, `VERCEL_TOKEN_DEV_APPS_WEB`.

framer reads **only that exact key**, from the root `.env` or the process
environment. There is no fallback to a less specific key (`CLOUDFLARE_API_TOKEN_PROD`,
`CLOUDFLARE_API_TOKEN`, …); those are ignored.

When a key is missing, `framer add` asks for it, once per environment: it opens the
cloud's token page (pre-filled when the provider allows it), with the token
named `framer-<project>-<env>-<purpose>-<name>` (e.g.
`framer-acme-prod-buckets-uploads`). It asks for the token, looks up the
account/team from it, and saves both keys to the root `.env`. Without a terminal
it fails, naming the exact keys and the token page.

Each environment gets its own API client, built from its own credentials.

## Consequences

- Adding an entity to a project with N environments asks for N tokens. Pasting
  the same token into several keys works, but it gives up the isolation.
- Projects with the old shared keys (`CLOUDFLARE_API_TOKEN`, …) must rename them
  to the scoped keys. framer doesn't migrate them.
- Credentials framer creates itself for a resource keep their own naming
  (`framer-<purpose>-<resource>`, e.g. `framer-buckets-acme-uploads-dev`).
- Supersedes ADR 0016, and the credential parts of ADRs 0014 and 0020.
