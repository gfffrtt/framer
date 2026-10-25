# 0017. Every `framer add` follows the same add flow

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

`framer add bucket` (Cloudflare) settled into a sequence that felt right in use.
Every other entity type and cloud should feel the same, so users learn it once.

## Decision

Every `framer add <type> [name]` runs the **add flow**:

1. **Name.** The entity name comes from the argument, or framer asks for it.
2. **Credentials.** If the cloud's credentials are missing from the root `.env`,
   framer opens the cloud provider's page in the browser automatically, with
   everything pre-filled when the provider allows it (permissions, name), and also
   prints the link on its own line so it can be copied cleanly. It asks only for
   what cannot be derived (e.g. the token) and looks up the rest itself (e.g. the
   account ID). Everything entered is saved to the root `.env`. If the provider
   cannot pre-fill, the link still opens the right page and the steps are listed.
3. **Provision.** framer provisions the entity in every environment and merges the
   generated envs into the backend's env file per environment. The entity config
   is written last.
4. **Summary.** framer ends by listing the names of the generated envs and the
   env files they were stored in, so the user knows what to read in their code.

Naming of things framer creates in a cloud:

- Credentials the user creates for framer: `framer-<purpose>`, where the purpose
  is the entity-type folder, e.g. `framer-buckets`.
- Credentials framer creates for one resource: `framer-<purpose>-<resource>`,
  e.g. `framer-buckets-acme-uploads-dev`.
- Resources: `<project>-<name>-<env>` (ADR 0013).

## Consequences

- New entity types and cloud adapters must implement each step; a cloud with no
  browser-based setup still opens its docs page for creating credentials.
- Generalizes ADR 0016 (Cloudflare) to every cloud.
