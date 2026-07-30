# Background Job Architecture

A minimal, production-oriented job system in Postgres — no external
queue, no distributed orchestration platform.

## Model

`background_jobs` (org, type, payload+version, UNIQUE idempotency key,
scheduling/availability times, claim + lease columns, attempt counters,
sanitized last error, result, parent job, correlation id) with
append-only `background_job_attempts`. Job types: connection
validation, appointment/metadata sync, webhook processing, scheduled
report generation, report/notification email delivery, cleanup
(no-op until retention policies are approved — nothing is deleted).

## Execution primitives (SECURITY DEFINER RPCs, migration 23)

- `enqueue_background_job` — per-type permission map; idempotent on the
  key (`ON CONFLICT DO NOTHING` + return existing id).
- `claim_background_jobs(worker, limit, lease)` — **atomic claim** via
  `FOR UPDATE SKIP LOCKED` over due `queued`/`retryable_failed` rows
  AND lease-expired `claimed`/`running` rows (crash recovery closes the
  stale attempt as `lease_expired`). Claiming requires service_role or
  platform admin. Two workers can never take the same job
  (live-verified with competing claims).
- `start/complete/fail_background_job` — worker-bound (claimed_by must
  match); fail applies **exponential backoff with bounded jitter**
  (30 s · 2^(n−1), capped 1 h, +0–25 %) until `max_attempts`, then
  `permanently_failed`.
- Manual operations (org-permission-checked, audited):
  `retry` (job:retry), `cancel` (job:cancel), `dead_letter` +
  `requeue_dead_letter` (job:manage_dead_letter, reason ≥5 chars).
- A trigger protects terminal states and job identity even from
  privileged sessions; authenticated users have NO direct write
  policies on the jobs table.

## Execution strategy

**Development**: `POST /api/worker` — double-gated (server-held
`WORKER_SECRET` header AND an authenticated platform-admin session;
the DB RPCs re-verify authority). Each invocation is bounded: one
scheduler tick (enqueue due report occurrences idempotently) + up to
`limit` (≤20) claimed jobs, each isolated (one failure never stops the
batch), returning a JSON execution summary. Timeouts/crashes leave
jobs recoverable via lease expiry.

**Production (documented, NOT enabled)**: either
- a Supabase scheduled Edge Function calling the claim/execute loop
  with the service-role key, or
- Vercel Cron invoking `/api/worker` with `WORKER_SECRET` (service-role
  Supabase client inside the route).

Enabling requires: provisioning `worker_server_key` in the target
environment's Vault + `WORKER_SECRET` env, choosing the scheduler
(unresolved decision U10i), and setting a cadence. No scheduler is
active in this phase; jobs execute only when the worker is invoked.

## Observability

Every job carries a correlation id; sync runs, failures, deliveries,
and scheduled runs link back to their jobs. Queue depth, oldest queued,
dead-letter count, and per-run statistics surface on `/integrations`
(INTEGRATION_OBSERVABILITY.md).
