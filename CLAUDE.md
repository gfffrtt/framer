## Project docs

- `VISION.md`: what framer is and where it's going. Keep it clean: no decision logs, no open questions, no changelog.
- `DOMAIN_LANGUAGE.md`: the shared vocabulary (project, entity, entity type, environment, …). Use these terms in code and docs. When a new concept appears, define it there.
- `adr/`: one Architecture Decision Record per decision. Format and rules are in `adr/README.md`.

## Recording decisions

Whenever the user makes a decision during a conversation (answers a design question, picks an option, changes direction), extract it into a new ADR in `adr/` (next number, `NNNN-short-slug.md`) before finishing the task. If it changes an earlier decision, mark the old ADR `Superseded by NNNN` instead of editing its content. Then update `VISION.md` and `DOMAIN_LANGUAGE.md` if the decision affects them. Don't put questions in the docs; ask the user directly.

ALWAYS: use `bun` not `pnpm`
ALWAYS: read `VISION.md` to understand core project goals
ALWAYS: read `DOMAIN_LANGUAGE.md` to make sure all terms used are aligned with their actual project meaning