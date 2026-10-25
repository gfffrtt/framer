# 0002. The root project config is `framer.json`

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

The project needs a root file that describes the project as a whole. It was first
called `environment.json`, but one project holds several environments, so that
name was misleading.

## Decision

The root file is `framer.json`, the same name as the entity config. It is called
the **project config**. Today it holds only `name`; later it will hold
`environments` and `order`.

## Consequences

- There are two kinds of `framer.json`: the project config (root) and the entity
  config (inside an entity folder). Docs and code must say which one they mean.
- Replaces `environment.json`.
