# Domain Language

The shared vocabulary of framer. Use these terms consistently in code, docs, CLI
output and conversation. If a new concept appears, define it here first.

## Project

A repository created by `framer init`. It is a Bun-workspace Turborepo that
describes every piece of infrastructure a system needs, across all environments.
It is identified by the `name` in its root `framer.json`.

## Project config (root `framer.json`)

The `framer.json` at the root of a project. It is the source of truth for the
project as a whole. Today it contains only `name`. Later it will contain
`environments` and `order`.

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
schema depends on the entity type. *(Not defined yet.)*

## Environment

A named deployment target of the whole project, e.g. `dev`, `staging`, `prod`.
One project describes all of its environments. Environment names are defined by
the user in the `environments` array of the project config. *(Not implemented yet.)*

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

## Cloud / cloud adapter

A cloud is where an entity is deployed (AWS, GCP, Fly, k8s, …). A cloud adapter is
the part of framer that turns entity config into real infrastructure on one
cloud. framer aims to support any cloud, with adapters added over time.
