# 0022. Cloud adapters are built from clouds and provisioners

- **Date:** 2026-10-25
- **Status:** Accepted

## Context

With apps on Vercel next to buckets on Cloudflare, and more entity types and
clouds coming, `framer add` must not grow a branch per type and cloud.

## Decision

A cloud adapter (ADR 0007) is split in two:

- A **cloud** (`src/clouds/`) is an API client plus a description of its
  credentials: the root `.env` keys of its token and account/team, the page
  where the token is created, the steps shown, and how to list the
  accounts/teams a token can access. The add flow's credentials step is generic
  over it.
- A **provisioner** (`src/provisioners/`) provisions one entity type on one cloud:
  the names of the envs it generates, validation that runs before anything is
  created, and a `provision` function that creates the infrastructure for one
  environment and returns the generated envs.

`framer add` only orchestrates: it runs a provisioner in every environment,
merges its envs into the backend, and writes the entity config. Supporting a new
type or cloud means adding a provisioner (and a cloud, if it's new) and
registering it.

## Consequences

- The clouds an entity type supports are whatever provisioners are registered
  for it; the CLI's cloud question and `--cloud` validation come from that list.
