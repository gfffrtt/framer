# 0015. `framer init` asks for the first environment

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

ADR 0012 made `framer init` write `["dev", "prod"]` without asking. Environment
names belong to the user (ADR 0005), so framer should not pick them.

## Decision

`framer init` asks for the name of **one** environment, the project's first,
defaulting to `prod`. It writes `"environments": ["<name>"]` to the project config.
`--environment <name>` skips the prompt; without a terminal the default `prod` is
used. Environment names follow the same rules as project names (lowercase letters,
numbers and dashes).

## Consequences

- Supersedes 0012.
- More environments are added by editing `environments` in the project config.
  Entities that already exist are not provisioned in a newly added environment
  (see 0013).
