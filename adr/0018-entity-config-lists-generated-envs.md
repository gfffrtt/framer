# 0018. The entity config lists its generated env names

- **Date:** 2026-10-25
- **Status:** Accepted

## Context

After `framer add`, the names of an entity's generated envs were only shown in the
CLI summary and stored, with their values, in the backend. Nothing in the repo
said which envs an entity provides.

## Decision

The entity config has an `envs` array with the **names** (never the values) of the
envs generated for that entity, the same names in every environment:

```json
{
  "cloud": "cloudflare",
  "envs": [
    "BUCKET_UPLOADS_NAME",
    "BUCKET_UPLOADS_ENDPOINT",
    "BUCKET_UPLOADS_ACCESS_KEY_ID",
    "BUCKET_UPLOADS_SECRET_ACCESS_KEY"
  ]
}
```

`framer add` writes it; values stay in the backend's env files.

## Consequences

- The repo now shows which envs each entity provides, so tooling (e.g. local dev,
  wiring envs into apps) can rely on it without reading the backend.
