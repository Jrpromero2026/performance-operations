# Integration Security

## Credential storage: Supabase Vault (chosen approach)

Evaluated options: Supabase Vault (installed, `vault` schema v0.3.1),
platform env secrets (rejected: credentials are per-organization, not
system-wide), app-table encryption with a server key (rejected:
homegrown crypto when a platform-native system exists).

Mechanics:

- Secrets are written ONLY through `app.store_connection_secret`
  (SECURITY DEFINER, `integration:manage_credentials`, state-checked).
  The application table stores the Vault id (`secret_ref`), a safe
  fingerprint (sha256 prefix + last 4), `secret_version`, and rotation
  time — never the value.
- The RPC returns the fingerprint ONLY. Secrets are never echoed to the
  browser, never logged, never in audit metadata, never in error
  messages (`sanitizeErrorMessage` additionally redacts
  credential-shaped substrings from provider errors).
- **Retrieval is server-exclusive**, two paths:
  - `app.get_connection_secret` — service_role only (production worker).
  - `app.get_connection_secret_with_key(connection, server_key)` —
    requires platform-admin/service_role AND the `worker_server_key`
    Vault value, which exists only in the server environment
    (`WORKER_SECRET`). A browser session can never present it, so even
    a platform admin's client cannot round-trip a secret.
- Rotation: re-submission updates the Vault entry and bumps
  `secret_version` (audited). Allowed in every credentialed state,
  including `active` (migration 27).
- Revocation deletes the Vault row, clears the reference, and moves the
  connection to `revoked` — every later use fails closed
  (live-verified). New credentials return it to `awaiting_credentials`.
- Key rotation strategy: `worker_server_key` is environment-scoped;
  rotate by writing a new Vault value + updating `WORKER_SECRET`
  together (documented in BACKGROUND_JOB_ARCHITECTURE.md). Encryption
  at rest is Vault's authenticated encryption (Supabase-managed keys).

## Connection lifecycle security

DB-enforced state machine (`app.integration_connection_guard`):
`draft → awaiting_credentials → validating → active`, with
`degraded/disabled/revoked/failed` per the matrix in migration 22+25.
Validation is separate from activation; re-enabling a disabled
connection must pass through re-validation; disabled connections never
execute jobs (engine checks status); revoked fails closed. Every
lifecycle change and credential action is audited.

## RLS posture

Every Phase 8 table: RLS enabled AND forced, org-scoped policies keyed
on the new permissions; `background_jobs` has SELECT-only policies (all
mutations via definer RPCs); `integration_source_records` is
insert-only (immutability trigger); delivery events allow recipient
self-scope reads. Live-verified in tests/rls/phase8-live-checks.sql.

## Webhooks

See WEBHOOK_SECURITY.md — hashed endpoint tokens, provider signature
verification, size/content-type limits, event-id idempotency, async
processing; never a generic unauthenticated ingestion endpoint.

## GUC hygiene

Phase 8 introduces NO transaction-scoped bypass GUCs. The Phase 7
lesson (set → use → clear immediately) remains the standard for any
future controlled bypass.
