# framer — Vision

> **Turborepo, but for infrastructure.**
> One repo describes a whole system: apps, databases, buckets, jobs and tasks,
> across every environment (dev, staging, prod). `framer` scaffolds it, knows how
> the pieces relate, and will eventually deploy it anywhere.

Terminology (project, entity, entity type, environment, …) is defined in
[DOMAIN_LANGUAGE.md](./DOMAIN_LANGUAGE.md). Decisions are recorded in [adr/](./adr/).

## The problem

Infra for a product is usually scattered: app code in one place, Terraform/Pulumi
somewhere else, cron jobs defined in a cloud console, bucket names hardcoded in env
files. Nobody can look at one folder and say "this is everything we run".

Turborepo solved the equivalent problem for JS packages: a single monorepo, a
convention for where things live, and a tool that knows the dependency graph.
framer applies the same idea to infrastructure.

## Core ideas

1. **Convention over configuration.** The folder an entity lives in says what type
   it is (`dbs/main` is a db). No giant config file listing everything.
2. **A framer project is a real Turborepo.** Bun workspaces + `turbo.json`. framer
   adds infra semantics on top; it doesn't replace Turborepo.
3. **`framer.json` everywhere.** The root `framer.json` is the source of truth for
   the project (its `name`, `environments`, `backend`, later its `order`). Every entity has
   its own `framer.json` with its base config (which cloud, which engine…).
4. **Per-environment overrides.** An entity can have one optional `<env>.json` per
   environment (`dev.json`, `prod.json`, …) that overrides its `framer.json`.
5. **Multi-environment from day one.** One repo describes all environments. The
   user defines them in the root `framer.json`.
6. **Cloud-agnostic.** The goal is to deploy anywhere (AWS, GCP, Fly, k8s, …). Clouds
   are added one at a time, not all at once.
7. **Language-agnostic entities.** An app can be anything (Bun, Go, Python, a Docker
   image…). The details come later.
8. **Generated envs live in a backend.** When framer provisions something, the
   values it creates (endpoints, keys…) go to the project's backend (Google Drive
   first), one env file per environment, not into the repo.
9. **A single native binary.** framer is a standalone CLI you call directly, like
   `bun`, built with `bun build --compile`.

## Project layout

```
my-project/
├── framer.json             # { name, environments, backend }  (later: order)
├── .env                    # framer's own credentials (gitignored)
├── package.json            # bun workspaces over every entity folder
├── turbo.json
├── apps/                   # long-running services
├── dbs/
│   └── main/               # an entity
│       ├── framer.json     # base config: cloud, engine, …
│       ├── dev.json        # optional dev overrides
│       ├── staging.json    # optional staging overrides
│       └── prod.json       # optional prod overrides
├── buckets/                # object storage
│   └── uploads/
│       └── framer.json     # { "cloud": "cloudflare" }
├── jobs/                   # scheduled (cron) work
└── tasks/                  # one-off / triggered work
```

## Commands

| Command                    | Status  | What it does                                        |
| -------------------------- | ------- | --------------------------------------------------- |
| `framer init [name]`       | ✅ v0    | Creates an empty framer project (Turborepo + Bun), picks the backend |
| `framer add app <name>`    | planned | Scaffolds `apps/<name>` with a `framer.json`        |
| `framer add db <name>`     | planned | Scaffolds `dbs/<name>` with a `framer.json`         |
| `framer add bucket <name>` | ✅ v0    | Provisions an R2 bucket per environment (Cloudflare), stores its envs in the backend |
| `framer add job <name>`    | planned | Scaffolds `jobs/<name>`                             |
| `framer add task <name>`   | planned | Scaffolds `tasks/<name>`                            |
| `framer dev`               | idea    | Runs everything locally                             |
| `framer plan` / `deploy`   | idea    | Diff desired vs. real infra per environment, apply  |

`framer add` provisions right away, in every environment.

## Roadmap (rough)

1. **Scaffolding + provisioning**: `init` (with a backend), then `add <type>`,
   which provisions the entity in every environment. Buckets on Cloudflare first.
   *(we are here)*
2. **Config model**: the `framer.json` schema per entity type, plus how
   per-environment files merge into it.
3. **Ordering**: `order` in the root `framer.json` lists stages of entities.
   Stages run one after another; entities inside a stage are provisioned in
   parallel.
4. **Local dev**: `framer dev` boots apps plus local stand-ins for dbs, buckets, etc.
5. **Deploy**: cloud adapters turn the config into real infra, one cloud at a time.
