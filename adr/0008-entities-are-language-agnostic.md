# 0008. Entities can be written in any language

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

Real systems mix Bun, Go, Python, plain Docker images, etc.

## Decision

An app (or job, or task) can be written in anything. framer does not assume
TypeScript or Bun for entity code.

## Consequences

- How non-JS entities take part in the Turbo workspace is not decided yet.
