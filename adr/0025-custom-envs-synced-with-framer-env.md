# 0025. Custom envs live in `.env.<env>` files and are synced with `framer env`

- **Date:** 2026-10-25
- **Status:** Accepted

## Context

Entities that run code need envs framer doesn't generate, like
`RESEND_API_KEY`. They are secrets, they differ per environment, and they are
usually created after the first deploy. Anyone who deploys needs them, not just
the person who wrote them.

## Decision

Only entity types that run code have **custom envs**: apps, jobs and tasks. Dbs
and buckets don't.

- They are written in one file per environment inside the entity folder:
  `apps/web/.env.<env>` (e.g. `.env.dev`, `.env.prod`), only for declared
  environments. There is no shared `.env` base for an entity.
- The files are gitignored. `framer init` ignores `.env.*` (except
  `.env.example`). `framer env` adds that rule to the root `.gitignore` if git
  doesn't ignore the files yet.
- `framer env <type> <name>` (e.g. `framer env app web`) reads the `.env.<env>`
  file of every declared environment and pushes each one to the backend, at
  `.framer/<project>/<type-dir>/<name>/<env>.env`. The pushed file replaces what
  was there. Environments without a local file are left as they are.
- When an entity is provisioned, it receives the other entities' generated envs
  plus its own custom envs from the backend. On a name clash, the custom env wins.

## Consequences

- The backend is the shared source of truth: a teammate gets the custom envs at
  deploy time without having the local files.
- `framer env` only pushes. Pulling the files back to disk isn't defined.
- Custom envs pushed after an app is deployed reach it only when it's provisioned
  again. framer has no redeploy yet.
