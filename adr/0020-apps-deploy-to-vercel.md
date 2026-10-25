# 0020. Apps deploy to Vercel, one Vercel project per environment

- **Date:** 2026-10-25
- **Status:** Accepted (credentials superseded by 0023)

## Context

`framer add app` needs a first cloud. Vercel has its own environments
(production, preview, development), but framer environments are user-defined
(ADR 0005).

## Decision

Vercel is the first cloud adapter for apps. For each framer environment,
`framer add app <name>`:

1. Creates (or reuses) a Vercel project named `<project>-<name>-<env>`.
2. Sets the generated envs of the project's other entities on it (ADR 0021),
   for all of Vercel's targets.
3. Uploads the app's files (what git would track in `apps/<name>`, never
   `node_modules`, `.git` or `.env*`) and deploys them to production, letting
   Vercel detect the framework. framer waits for the build.

Generated env: `APP_<NAME>_URL`, the production URL
(`https://<project>-<name>-<env>.vercel.app` when Vercel assigns it). The entity
config is `{ "cloud": "vercel", "envs": ["APP_<NAME>_URL"] }`.

Credentials: `VERCEL_TOKEN` and `VERCEL_TEAM_ID` in the root `.env`. Vercel can't
pre-fill a token from a link, so framer opens the tokens page and asks the user
to name it `framer-apps`. The team is looked up from the token.

## Consequences

- `add` runs a real build, so it is as slow as the app's build, and a failed
  build fails the add (the code stays, see ADR 0019).
- Only the app folder is uploaded: an app that imports other workspace packages
  of the project doesn't build on Vercel yet.
- Redeploying after `add` (new code, new envs) is not defined yet.
