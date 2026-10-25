# 0019. The add flow asks for an app's code and for the cloud

- **Date:** 2026-10-25
- **Status:** Superseded by 0024

## Context

`framer add app` needs code to deploy, and apps can go to more than one cloud. The
add flow from ADR 0017 had neither step.

## Decision

Every `framer add <type> [name]` runs the **add flow**:

1. **Name.** From the argument, or framer asks.
2. **Code** (apps only). framer asks for a **create command** (e.g.
   `bunx create-next-app@latest .`, or `--create "<command>"`) and runs it inside
   an empty `apps/<name>`, attached to the terminal so the user can answer the
   command's own questions. The command must target the current folder (`.`). A
   `.git` the command creates is removed, because the project is already a repo.
   If `apps/<name>` already has files and no entity config (left by an earlier
   run that failed later), framer offers to use them and skips the command.
3. **Cloud.** framer asks where the entity goes, listing the clouds that can
   provision that entity type (`--cloud` skips the question).
4. **Credentials.** Unchanged from ADR 0017: if the cloud's credentials are missing
   from the root `.env`, framer opens the provider's page (pre-filled when
   possible), prints the link, asks only for the token, looks up the account/team
   itself, and saves both to the root `.env`.
5. **Provision.** In every environment; generated envs are merged into the
   backend's env file per environment. The entity config is written last.
6. **Summary.** The names of the generated envs and the env files they went to.

Naming is unchanged from ADR 0017: `framer-<purpose>` for credentials the user
creates, `framer-<purpose>-<resource>` for credentials framer creates,
`<project>-<name>-<env>` for resources.

## Consequences

- The code is created before the credentials are checked, so failing credentials
  or provisioning leave `apps/<name>` behind without an entity config; re-running
  `framer add app <name>` picks it up.
- Supersedes ADR 0017.
