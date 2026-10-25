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
   first), one env file per environment, not into the repo. Entities that run
   code (apps, jobs, tasks) also have **custom envs** (`RESEND_API_KEY`…) in
   gitignored `.env.<env>` files, which `framer env` syncs to the backend.
9. **A single native binary.** framer is a standalone CLI you call directly, like
   `bun`, built with `bun build --compile`.
10. **Credentials are scoped, never shared.** Every cloud credential is for exactly
    one environment and one entity: `CLOUDFLARE_API_TOKEN_PROD_BUCKETS_UPLOADS`.
    framer reads only that exact key, with no fallback, so a dev token can never
    touch prod.

## Project layout

```
my-project/
├── framer.json             # { name, environments, backend }  (later: order)
├── .env                    # framer's own credentials, per env and entity (gitignored)
├── package.json            # bun workspaces over every entity folder
├── turbo.json
├── apps/                   # long-running services
│   └── web/
│       ├── framer.json     # { "cloud": "vercel", "envs": ["APP_WEB_URL"] }
│       ├── .env.dev        # custom envs for dev (gitignored, synced by `framer env`)
│       └── .env.prod       # custom envs for prod
├── dbs/
│   └── main/               # an entity
│       ├── framer.json     # base config: cloud, engine, …
│       ├── dev.json        # optional dev overrides
│       ├── staging.json    # optional staging overrides
│       └── prod.json       # optional prod overrides
├── buckets/                # object storage
│   └── uploads/
│       └── framer.json     # { "cloud": "cloudflare", "envs": ["BUCKET_UPLOADS_NAME", …] }
├── jobs/                   # scheduled (cron) work
└── tasks/                  # one-off / triggered work
```

## Commands

| Command                    | Status  | What it does                                        |
| -------------------------- | ------- | --------------------------------------------------- |
| `framer init [name]`       | ✅ v0    | Creates an empty framer project (Turborepo + Bun), picks the backend |
| `framer add app <name>`    | ✅ v0    | Creates the app with a create command, deploys it to Vercel per environment with the project's envs |
| `framer add db <name>`     | planned | Scaffolds `dbs/<name>` with a `framer.json`         |
| `framer add bucket <name>` | ✅ v0    | Provisions an R2 bucket per environment (Cloudflare), stores its envs in the backend |
| `framer env <type> <name>` | ✅ v0    | Pushes an app/job/task's `.env.<env>` files (custom envs) to the backend |
| `framer add job <name>`    | planned | Scaffolds `jobs/<name>`                             |
| `framer add task <name>`   | planned | Scaffolds `tasks/<name>`                            |
| `framer dev`               | idea    | Runs everything locally                             |
| `framer plan` / `deploy`   | idea    | Diff desired vs. real infra per environment, apply  |

`framer add` provisions right away, in every environment.

### The add flow

Every `framer add <type> [name]` feels the same, whatever the type or cloud:

1. **Name**: from the argument, or framer asks.
2. **Code** (apps only): framer asks for a create command (`bunx create-next-app .`,
   `bun create vite .`, …) and runs it inside `apps/<name>`.
3. **Cloud**: where the entity goes, among the clouds that support its type.
4. **Credentials, per environment**: framer reads the exact scoped keys (see
   below). For each one missing, it opens the provider's page in the browser,
   pre-filled when possible, asks only for what it can't look up itself, and
   saves it to the root `.env`.
5. **Provision**: in every environment, with that environment's credentials;
   generated envs go to the backend. The entity also receives the other entities'
   generated envs and its own custom envs.
6. **Summary**: the names of the generated envs and where they are stored.

Things framer creates are named predictably:

| What                                  | Name                                       | Example                                      |
| ------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| Credential key in the root `.env`     | `<KEY>_<ENV>_<PURPOSE>_<NAME>`             | `CLOUDFLARE_API_TOKEN_PROD_BUCKETS_UPLOADS`  |
| Token the user creates for framer     | `framer-<project>-<env>-<purpose>-<name>`  | `framer-acme-prod-buckets-uploads`           |
| Credential framer creates for a resource (replaced on every run) | `framer-<purpose>-<resource>` | `framer-buckets-acme-uploads-prod` |
| Resource                              | `<project>-<name>-<env>`                   | `acme-uploads-prod`                          |
| Generated env                         | `<TYPE>_<NAME>_<KEY>`                      | `BUCKET_UPLOADS_ENDPOINT`                    |

## Roadmap (rough)

1. **Scaffolding + provisioning**: `init` (with a backend), then `add <type>`,
   which provisions the entity in every environment. Buckets on Cloudflare and
   apps on Vercel first.
   *(we are here)*
2. **Config model**: the `framer.json` schema per entity type, plus how
   per-environment files merge into it.
3. **Ordering**: `order` in the root `framer.json` lists stages of entities.
   Stages run one after another; entities inside a stage are provisioned in
   parallel.
4. **Local dev**: `framer dev` boots apps plus local stand-ins for dbs, buckets, etc.
5. **Deploy**: cloud adapters turn the config into real infra, one cloud at a time.
