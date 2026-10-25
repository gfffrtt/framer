# 0021. Apps receive the generated envs of the project's other entities

- **Date:** 2026-10-25
- **Status:** Accepted

## Context

An app needs to reach the project's buckets, dbs, etc. Their generated envs live
in the backend (ADR 0010), and each entity config lists their names (ADR 0018).

## Decision

When an entity is provisioned, framer hands its provisioner the generated envs of
every **other** entity in that environment: the names come from the `envs` of
each entity config, the values from the backend's env file. Keys in the env file
that no entity config lists are not passed. An app on Vercel sets them as the
Vercel project's env vars before deploying.

## Consequences

- An app added after a bucket gets the bucket's envs. A bucket added after an app
  does not reach the app until there is a way to redeploy or sync apps.
- Every app gets every entity's envs; per-app selection is not defined.
