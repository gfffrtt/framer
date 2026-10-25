# Domain Language

The shared vocabulary of framer. Use these terms consistently in code, docs, CLI
output and conversation. If a new concept appears, define it here first.

## Project

A repository created by `framer init`. It is a Bun-workspace Turborepo that
describes every piece of infrastructure a system needs, across all environments.
It is identified by the `name` in its root `framer.json`.

## Project config (root `framer.json`)

The `framer.json` at the root of a project. It is the source of truth for the
project as a whole. It contains `name`, `environments` and `backend`. Later it
will contain `order`.

```json
{ "name": "acme", "environments": ["prod"], "backend": { "type": "google-drive" } }
```

> There are two kinds of `framer.json`: the **project config** at the root and the
> **entity config** inside each entity folder. Say which one you mean.

## Entity

A single piece of infrastructure: one database, one app, one bucket, one job or
one task. An entity is a folder inside an entity-type folder, e.g. `dbs/main`, and
always contains a `framer.json`.

> "Entity" is the generic word. When talking about a specific one, use its type:
> "the `main` db", "the `api` app".

## Entity type

The kind of an entity. The folder an entity lives in decides its type:

| Type     | Folder     | Meaning                                                       |
| -------- | ---------- | ------------------------------------------------------------- |
| `app`    | `apps/`    | A long-running service (HTTP server, worker, frontend…). Any language. |
| `db`     | `dbs/`     | A database (engine, schema, migrations, seeds).               |
| `bucket` | `buckets/` | Object storage.                                               |
| `job`    | `jobs/`    | Work that runs **on a schedule** (cron).                      |
| `task`   | `tasks/`   | Work that runs **once or when triggered** (backfills, scripts, on-demand runs). |

Job vs task: a job is triggered by time; a task is triggered by a person or an event.

## Entity name

The folder name of an entity (`main` in `dbs/main`). Unique within its entity
type. An entity is referred to as `<type-folder>/<name>`, e.g. `dbs/main`.

## Entity config (entity `framer.json`)

The base config of an entity. It applies to every environment, and holds things
like which cloud the entity runs on and what it is (e.g. which db engine). The
schema depends on the entity type. For a bucket it is
`{ "cloud": "cloudflare", "envs": [...] }`, for an app
`{ "cloud": "vercel", "envs": [...] }`; other types are not defined yet.
`envs` lists the names of the entity's generated envs (values live in the backend).

## Environment

A named deployment target of the whole project, e.g. `dev`, `staging`, `prod`.
One project describes all of its environments. Environment names are defined by
the user in the `environments` array of the project config. `framer init` asks
for the first one (default `prod`); more are added by editing the array.
`framer add` provisions an entity in every environment.

## Environment config

An optional `<env>.json` file inside an entity folder (e.g. `dev.json`,
`prod.json`), where `<env>` is a declared environment. It overrides the entity
config for that environment only. *(Merge rules not defined yet.)*

## Order

An array in the project config that declares in what sequence entities are
provisioned. It is a list of **stages**; each stage is a list of entities:

```json
"order": [["dbs/main", "buckets/uploads"], ["apps/api"]]
```

Stages run one after another. Entities inside the same stage are provisioned in
parallel. *(Not implemented yet.)*

## Backend

Where framer stores envs: the ones it generates (bucket names, endpoints, access
keys…) and the entities' custom envs. Chosen during `framer init` and recorded as
`backend` in the project config. The only backend today is **Google Drive**, which
keeps generated envs in `.framer/<project>/<env>.env` and custom envs in
`.framer/<project>/<type-dir>/<name>/<env>.env` in the user's Drive.

In code, each kind of backend is a **backend adapter**: its credential's root
`.env` key, how to log in, and how to connect (ADR 0027).

> Say "backend" or "framer backend". Not to be confused with an app that is a
> backend service.

## Generated envs / env file

The environment variables framer creates when it provisions an entity, e.g.
`BUCKET_UPLOADS_ENDPOINT`. Keys are prefixed with the entity type and entity name.
They are stored in the backend, in one **env file** per environment
(`<env>.env`), shared by all entities of the project. When an entity is
provisioned it receives the generated envs of the project's other entities (an
app sets them on its deployment).

## Root `.env`

The gitignored `.env` at the root of a project. It holds the credentials framer
itself needs: `GOOGLE_AUTH` (base64 Google credentials for the backend) and one
set of **scoped credentials** per environment and entity. It is not where
generated envs go; those live in the backend.

## Scoped credential

A cloud credential that is valid for exactly one environment, one purpose and one
entity. Its root `.env` key is `<KEY>_<ENV>_<PURPOSE>_<NAME>`, uppercased with `-`
turned into `_`:

```
CLOUDFLARE_API_TOKEN_PROD_BUCKETS_UPLOADS
CLOUDFLARE_ACCOUNT_ID_PROD_BUCKETS_UPLOADS
VERCEL_TOKEN_DEV_APPS_WEB
VERCEL_TEAM_ID_DEV_APPS_WEB
```

framer reads only the exact key; there is no fallback to a shorter one. In the
cloud's dashboard the token is named `framer-<project>-<env>-<purpose>-<name>`.
Defined in ADR 0023.

## Custom envs

Envs an entity needs that framer doesn't generate, e.g. `RESEND_API_KEY`. Only
entity types that run code have them: apps, jobs and tasks. They are written in
gitignored files inside the entity folder, one per environment
(`apps/web/.env.prod`), and pushed to the backend with `framer env <type> <name>`,
which stores them at `.framer/<project>/<type-dir>/<name>/<env>.env`. When an
entity is provisioned it receives its custom envs, which win over generated envs
with the same name. Defined in ADR 0025.

## Cloud / cloud adapter

A cloud is where an entity is deployed (AWS, GCP, Fly, k8s, …). A cloud adapter is
the part of framer that turns entity config into real infrastructure on one
cloud. framer aims to support any cloud, with adapters added over time. Today:
**Cloudflare** (buckets become R2 buckets) and **Vercel** (apps become one Vercel
project per environment). The entity config names the cloud:
`{ "cloud": "cloudflare" }`.

In code, a cloud adapter is a **cloud** (API client plus how to get its
credentials) and one **provisioner** per entity type it supports.

## Provisioner

The part of a cloud adapter that provisions one entity type on one cloud, e.g.
"bucket on Cloudflare", "app on Vercel". It holds its cloud, declares the names
of the envs it generates and creates the infrastructure for one environment at a
time. `framer add <type>` picks one of the provisioners registered for the type.
Steps that create things must be safe to re-run (ADR 0028).

## Connection

A provisioner connected to one environment's cloud account with that
environment's scoped credentials. The add flow verifies and provisions through
one connection per environment (ADR 0026).

## Entity type traits

What sets entity types apart in framer's behaviour, recorded once per type:
whether it has custom envs, whether `framer add` asks for a create command, its
suggested name, and how the add flow asks for its cloud (ADR 0026).

## Add flow

The sequence every `framer add` follows: **name** → **code** (apps only: run the
create command) → **cloud** → **credentials**, per environment (scoped
credentials; open the cloud provider's page, pre-filled when possible, save to
the root `.env`) → **provision** in every environment → **summary** of the
generated envs. Defined in ADR 0024.

## Create command

The command that creates an app's code, e.g. `bunx create-next-app@latest .`.
`framer add app` asks for it and runs it inside the empty `apps/<name>`, so it
must target the current folder.

## Purpose

The entity-type folder a cloud credential is for (e.g. `buckets`). It is part of a
scoped credential's key (`CLOUDFLARE_API_TOKEN_PROD_BUCKETS_UPLOADS`) and token
name (`framer-acme-prod-buckets-uploads`), and of the name of credentials framer
creates for a single resource (`framer-buckets-acme-uploads-prod`). framer
replaces such a credential every time it provisions the resource (ADR 0028).

## Provision

To create the real infrastructure behind an entity, in every environment, and
store its generated envs in the backend. `framer add` provisions immediately.
