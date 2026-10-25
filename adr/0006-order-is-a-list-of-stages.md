# 0006. Provisioning `order` is a list of stages

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

Entities depend on each other (an app needs its database to exist first), and
framer needs to know in what sequence to provision them.

## Decision

The project config holds an `order` array of **stages**. Each stage is a list of
entities:

```json
"order": [["dbs/main", "buckets/uploads"], ["apps/api"]]
```

Stages run one after another. Entities in the same stage are provisioned in
parallel.

## Consequences

- Ordering is explicit and lives in one place, not spread across entities.
- Not implemented yet.
