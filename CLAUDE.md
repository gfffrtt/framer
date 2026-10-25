## Project docs

- `VISION.md`: what framer is and where it's going. Keep it clean: no decision logs, no open questions, no changelog.
- `DOMAIN_LANGUAGE.md`: the shared vocabulary (project, entity, entity type, environment, …). Use these terms in code and docs. When a new concept appears, define it there.
- `adr/`: one Architecture Decision Record per decision. Format and rules are in `adr/README.md`.

## Recording decisions

Whenever the user makes a decision during a conversation (answers a design question, picks an option, changes direction), extract it into a new ADR in `adr/` (next number, `NNNN-short-slug.md`) before finishing the task. If it changes an earlier decision, mark the old ADR `Superseded by NNNN` instead of editing its content. Then update `VISION.md` and `DOMAIN_LANGUAGE.md` if the decision affects them. Don't put questions in the docs; ask the user directly.

ALWAYS: use `bun` not `pnpm`
ALWAYS: read `VISION.md` to understand core project goals
ALWAYS: read `DOMAIN_LANGUAGE.md` to make sure all terms used are aligned with their actual project meaning
## Code rules

Layout: `src/commands/` plans work as `Step[]` and never prompts; `src/cli/` does all
prompting, spinners and output; `src/clouds/`, `src/provisioners/`, `src/backends/`
are the adapters; `src/naming.ts`, `src/entities.ts`, `src/dotenv.ts`, `src/files.ts`,
`src/steps.ts` are the shared helpers.

ALWAYS: run `bunx tsc --noEmit -p .` and `bun test` before finishing
ALWAYS: reuse the canonical helpers instead of writing near-duplicates:
  - prompts: `ask`, `choose`, `option`, `given`, `answer`, `runWithSpinner` (`src/cli/prompts.ts`)
  - steps: `Step`, `runSteps` (`src/steps.ts`)
  - entities: `ENTITY_TYPES`, `parseEntityType`, `entityAt`, `newEntity`, `entityExists` (`src/entities.ts`)
  - names of things framer creates: `src/naming.ts` (one function per row of VISION's naming table)
  - files: `isEmptyDir`, `json` (`src/files.ts`); custom env files: `customEnvFile`, `CUSTOM_ENV_IGNORE` (`src/dotenv.ts`)
  - where envs live, for messages: `backend.location()`
ALWAYS: put per-entity-type behaviour in `ENTITY_TYPES` traits, not in `type === "…"` checks
ALWAYS: validate flags before the first prompt or side effect
ALWAYS: make provisioning steps safe to re-run (`ensure…`, `replace…`): a failed `framer add` gets retried
ALWAYS: let API clients take an injected `fetch`, and test them against the fakes in `src/testing/`
ALWAYS: put a test next to the module it covers (`x.ts` → `x.test.ts`)

SHOULD: add a cloud as a `Cloud` in `src/clouds/<cloud>.ts` plus a `defineProvisioner` in `src/provisioners/`, registered in `PROVISIONERS`, without touching the add flow
SHOULD: add a backend as a `BackendAdapter` in `BACKENDS`
SHOULD: model a new concept as a typed trait, adapter or record rather than a boolean flag or a new branch in a busy function
SHOULD: split a file by concern before it grows past ~400 lines
SHOULD: delete complexity (branches, layers, wrappers) rather than move it around

NEVER: use `any`, or casts outside a parse boundary (`parseEntityType`, `isBackendType`, JSON from disk/network)
NEVER: import one command from another (`commands/a.ts` → `commands/b.ts`); move shared code to a shared module
NEVER: prompt, spin or print from `src/commands/`, `src/clouds/`, `src/provisioners/` or `src/backends/`
NEVER: hardcode a backend's layout (`.framer/…`) or a credential key outside its owner
NEVER: name an unscoped credential key (`CLOUDFLARE_API_TOKEN`) in messages; clients don't know the scoped key, the add flow names it (ADR 0023)
NEVER: add a wrapper that only forwards its arguments, or a silent fallback that hides an unclear invariant
