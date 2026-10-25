# 0012. `framer init` declares `dev` and `prod` environments

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

ADR 0005 put `environments` in the project config but left it unimplemented.
`framer add` needs it to know what to provision.

## Decision

`framer init` writes `"environments": ["dev", "prod"]` to the project config. The
user edits the array to add or rename environments.

## Consequences

- Commands that provision read `environments` from the project config and fail
  clearly if it is missing.
