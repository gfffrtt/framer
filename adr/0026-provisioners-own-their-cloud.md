# 0026. Provisioners own their cloud; the add flow picks a provisioner

- **Date:** 2026-10-25
- **Status:** Accepted

## Context

ADR 0022 split cloud adapters into clouds and provisioners, but the add flow
still handled three loosely related values: a cloud name, a map of API clients,
and a provisioner looked up by `(type, cloud)`. Nothing tied them together, so
the code needed `any`, casts and a "can't provision X on Y" check that the CLI
could never reach. Per-entity-type behaviour (apps run a create command, the
cloud question says "Deploy to") was also spread as `type === "app"` checks.

## Decision

- A **provisioner holds its cloud** (`cloud: CLOUDFLARE`), not a cloud name.
  `framer add <type>` chooses among `PROVISIONERS[type]`; `--cloud` matches the
  cloud's `name`.
- A provisioner is written against its cloud's typed client
  (`defineProvisioner`), and exposes `connect(credentials)`, which returns a
  **connection** for one environment: `verify()` and `provision()`. The add flow
  only sees connections, so it has no cloud-specific types.
- Per-entity-type behaviour lives as **traits** on `ENTITY_TYPES` (`customEnvs`,
  `createCommand`, `placeholder`, `cloudQuestion`), never as type checks in the flow.

## Consequences

- Supporting a new cloud or type means adding a cloud and a provisioner and
  registering it, plus traits for a new type; the add flow doesn't change.
- A provisioner can't be paired with clients of another cloud by construction.
- Refines ADR 0022 without changing its decision.
