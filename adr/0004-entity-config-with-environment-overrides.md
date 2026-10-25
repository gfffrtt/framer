# 0004. Entity config is `framer.json` with per-environment overrides

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

Each entity needs a general config (which cloud, which engine…) and the ability to
differ between environments, e.g. a bigger database in prod.

## Decision

Every entity folder contains a `framer.json` with its base config. It may also
contain one optional `<env>.json` per environment (e.g. `dev.json`, `staging.json`,
`prod.json`) that overrides the base config for that environment.

```
dbs/main/
├── framer.json    # base config
├── dev.json       # optional
├── staging.json   # optional
└── prod.json      # optional
```

## Consequences

- The schema of `framer.json` per entity type is not defined yet.
- The rules for how `<env>.json` overrides `framer.json` are not defined yet.
