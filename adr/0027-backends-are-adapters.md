# 0027. Backends are adapters, like clouds

- **Date:** 2026-10-25
- **Status:** Accepted

## Context

The backend was described in three places that didn't agree: a type in the
project config, a list of labels, and a `switch` that always built Google
Drive. `framer init` let the user pick a backend, then ran the Google login
whatever the choice. Google Drive's folder layout (`.framer/<project>/…`) was
also hardcoded in CLI output.

## Decision

Every backend is a **backend adapter** registered in `BACKENDS`: its label, the
root `.env` key holding its credential (`GOOGLE_AUTH`), how to log in in the
browser, and how to connect. The backend itself also reports where an env file
lives (`location`), for messages.

## Consequences

- `framer init`, loading the backend and validating the project config are all
  driven by `BACKENDS`; adding a backend means adding an adapter.
- The project config's `backend.type` must be a key of `BACKENDS`.
- Refines the "one interface" consequence of ADR 0010.
