# 0010. A framer backend stores generated envs

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

`framer add` provisions real infrastructure, which produces values the system
needs at runtime: bucket names, endpoints, access keys. They are secrets or
environment-specific, so they must not live in the repo, yet the whole team needs
them.

## Decision

Every project has a **backend**: the place where framer stores the envs it
generates. It is chosen during `framer init` and recorded in the project config:

```json
{ "backend": { "type": "google-drive" } }
```

Google Drive is the first (and for now only) backend. Envs are stored as one env
file per environment, under a `.framer` folder:

```
.framer/
└── <project>/
    ├── dev.env
    └── prod.env
```

framer merges into these files: adding an entity only sets that entity's keys and
keeps everything else. Drive folders are looked up by name; no Drive IDs are stored
in config.

## Consequences

- Backends sit behind one interface (`ensureProject`, `readEnv`, `writeEnv`), so
  more can be added later.
- How apps consume the generated envs (local dev, deploy) is not defined yet.
