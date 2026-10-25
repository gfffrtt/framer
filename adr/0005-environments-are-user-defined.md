# 0005. One project holds multiple, user-defined environments

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

A single repo should describe every environment of the system, and teams need
different environments (preview, QA, …), not just a fixed set.

## Decision

One project holds all of its environments. Their names are declared by the user in
the project config:

```json
{ "name": "acme", "environments": ["dev", "staging", "prod"] }
```

An entity's `<env>.json` is only valid if `<env>` is a declared environment.

## Consequences

- Not implemented yet: `framer init` writes only `name` for now.
