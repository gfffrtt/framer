# 0001. `framer init` scaffolds a Bun Turborepo

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

A framer project should be a real Turborepo, so users get workspaces, caching and
task pipelines for free. framer adds infrastructure meaning on top of it.

## Decision

`framer init [name]` creates a folder `<name>/` containing:

- a root `framer.json` with only `{ "name": "<name>" }`
- `package.json` with Bun workspaces over `apps/*`, `dbs/*`, `buckets/*`, `jobs/*`, `tasks/*`
- `turbo.json` with `build`, `dev`, `lint` and `test` tasks
- the five entity folders: `apps/`, `dbs/`, `buckets/`, `jobs/`, `tasks/`

It runs `git init` and `bun install` by default; `--skip-git` and `--skip-install`
turn them off. The name must be lowercase letters, numbers and dashes. `init` fails
if the target folder exists and is not empty.

## Consequences

- Every entity is a workspace package, so Turbo can run tasks across entities.
- Project names are valid npm package names.
