# 0007. framer is cloud-agnostic through cloud adapters

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

framer should be able to deploy anywhere, not lock users into one provider.

## Decision

Deployment goes through **cloud adapters**: each adapter turns entity config into
real infrastructure on one cloud (AWS, GCP, Fly, k8s, …). Adapters are added one at
a time.

## Consequences

- framer's core must not depend on any single cloud.
- Which adapter comes first is not decided yet.
