# 0003. Entities are typed by the folder they live in

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

framer needs to know what kind of infrastructure each piece is, without a central
list of everything.

## Decision

An **entity** is one piece of infrastructure: a folder inside an entity-type
folder, e.g. `dbs/main`. Its type comes from that folder:

| Type     | Folder     |
| -------- | ---------- |
| `app`    | `apps/`    |
| `db`     | `dbs/`     |
| `bucket` | `buckets/` |
| `job`    | `jobs/`    |
| `task`   | `tasks/`   |

A **job** runs on a schedule (cron). A **task** runs once or when triggered by a
person or an event.

## Consequences

- Entities are referred to as `<type-folder>/<name>`, e.g. `dbs/main`.
- Entity names are unique within their type.
