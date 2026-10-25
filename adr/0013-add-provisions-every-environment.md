# 0013. `framer add` provisions every environment immediately

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

`framer add` could either only scaffold files (with a later `sync`/`deploy` step
creating infra) or create the infrastructure right away.

## Decision

`framer add <type> <name>` provisions the entity for **every** declared environment
at once, stores the generated envs in the backend, and writes the entity config
last (so a failure leaves no entity behind). There is no `sync` command.

- `add` writes only the entity `framer.json`; it does not create `<env>.json`
  files. Environment configs stay optional overrides (ADR 0004).
- Resources are named `<project>-<name>-<env>`, e.g. `acme-uploads-dev`.
- Generated env keys are prefixed with the entity type and name:
  `BUCKET_UPLOADS_NAME`, `BUCKET_UPLOADS_ENDPOINT`, …

## Consequences

- `add` needs cloud credentials and a working backend.
- Re-running `add` after a failure is safe for existing resources, but may create
  extra access tokens.
- How changes to an existing entity (or new environments) are applied is not
  defined yet.
