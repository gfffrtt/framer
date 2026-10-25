# 0024. The add flow gets credentials per environment

- **Date:** 2026-10-25
- **Status:** Accepted

## Context

ADR 0023 scopes cloud credentials to one environment and entity, which changes
the credentials step of the add flow (ADR 0019).

## Decision

Every `framer add <type> [name]` runs the **add flow**:

1. **Name.** From the argument, or framer asks.
2. **Code** (apps only). framer asks for a create command (or `--create`) and runs
   it inside an empty `apps/<name>`, attached to the terminal. The command must
   target `.`. A `.git` it creates is removed. If `apps/<name>` already has files
   and no entity config (left by an earlier failed run), framer offers to use
   them and skips the command.
3. **Cloud.** framer asks where the entity goes, among the clouds that can
   provision its type (`--cloud` skips the question).
4. **Credentials, per environment.** For each environment, framer reads the
   exact keys from ADR 0023. If they are missing, it opens the provider's page
   (pre-filled when possible) for a token named
   `framer-<project>-<env>-<purpose>-<name>`, prints the link, asks only for the
   token, looks up the account/team itself, and saves both keys to the root `.env`.
5. **Provision.** In every environment, with that environment's credentials.
   Generated envs are merged into the backend's env file per environment. The
   entity receives the other entities' generated envs and its own custom envs
   (ADR 0025). The entity config is written last.
6. **Summary.** The names of the generated envs and the env files they went to.

Resources are named `<project>-<name>-<env>` (ADR 0013).

## Consequences

- Supersedes ADR 0019.
