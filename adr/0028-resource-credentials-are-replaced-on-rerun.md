# 0028. Credentials framer creates for a resource are replaced on every run

- **Date:** 2026-10-25
- **Status:** Accepted

## Context

`framer add` provisions one environment after another and writes the entity
config last, so a failed add can be retried (ADR 0013). Resources are created
idempotently, but the bucket-scoped R2 token was created anew on every run: a
retry left the earlier token live, with write access to the bucket and recorded
nowhere.

## Decision

A credential framer creates for one resource (`framer-<purpose>-<resource>`,
ADR 0023) is **replaced**: tokens with that exact name are deleted before the
new one is created. Every provisioning step must be safe to re-run.

## Consequences

- Re-running `framer add` after a failure leaves exactly one credential per
  resource, and the backend holds its values.
- Between the delete and the create, the resource has no credential; the next
  run fixes it.
