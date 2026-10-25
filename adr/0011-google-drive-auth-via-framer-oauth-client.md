# 0011. Google Drive auth uses framer's own OAuth client and `GOOGLE_AUTH`

- **Date:** 2026-10-24
- **Status:** Accepted

## Context

The Google Drive backend needs credentials. Asking every user to create their own
GCP OAuth client, or a service account, is too much setup.

## Decision

- framer ships its own OAuth "Desktop app" client and asks only for the
  `drive.file` scope (access to files framer created, nothing else).
- `framer init` logs the user in through the browser (loopback redirect + PKCE).
- The result is stored in the project's root `.env` (gitignored) as
  `GOOGLE_AUTH`: the base64 of an `authorized_user` JSON
  (`client_id`, `client_secret`, `refresh_token`).
- A user can instead set `GOOGLE_AUTH` by hand (root `.env` or the shell
  environment); framer then skips the login. Both paths use the same code.

## Consequences

- Someone has to own framer's GCP project and OAuth client; its ID and secret are
  compiled into the binary (Google treats desktop client secrets as
  non-confidential). `FRAMER_GOOGLE_CLIENT_ID` / `FRAMER_GOOGLE_CLIENT_SECRET`
  override them.
- With `drive.file`, framer only sees `.framer` folders it created itself.
