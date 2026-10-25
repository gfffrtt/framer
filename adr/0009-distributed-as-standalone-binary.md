# 0009. framer ships as a standalone binary

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

framer should be called directly like `bun`, without needing a package manager
or a project-local install.

## Decision

framer is compiled into a single executable with `bun build --compile`
(`bun run build` → `dist/framer`).

## Consequences

- The binary bundles the Bun runtime (about 59 MB).
- During development, `bun run framer` or `bun link` still work.
