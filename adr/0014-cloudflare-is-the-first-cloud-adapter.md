# 0014. Cloudflare is the first cloud adapter, starting with R2 buckets

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

ADR 0007 left open which cloud adapter comes first.

## Decision

Cloudflare is first, starting with buckets (`framer add bucket <name>`), which
become R2 buckets. The entity config is `{ "cloud": "cloudflare" }`.

For each environment framer creates the R2 bucket and a bucket-scoped API token,
and turns that token into S3 credentials (access key id = token id, secret =
sha256 of the token value). Generated envs: `<PREFIX>NAME`, `<PREFIX>ENDPOINT`,
`<PREFIX>ACCESS_KEY_ID`, `<PREFIX>SECRET_ACCESS_KEY`.

Cloudflare has no public third-party OAuth, so `framer add` asks for
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` when they are missing and saves
them to the project's root `.env`. The token needs "Account API Tokens: Edit" and
"Workers R2 Storage: Edit".

## Consequences

- Other entity types and clouds fail with "not supported yet" until added.
