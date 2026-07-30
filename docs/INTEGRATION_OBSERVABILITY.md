# Integration Observability

System-operational measures only — never business KPIs (those remain
exclusively in the Intelligence Engine).

## What is tracked, where

| Measure | Source |
| --- | --- |
| Job throughput / latency / retries / permanent failures | `background_jobs` (+`background_job_attempts`: per-attempt worker, timings, outcome) |
| Queue depth + oldest queued + dead-letter count | `/integrations` job-queue widget (derived live from job rows) |
| Connection health + last check | `integration_connections.last_health_*` + health page |
| Sync duration / pages / records (fetched, accepted, unchanged, rejected) / cursor movement / rate-limit state | `integration_sync_runs` (run detail page) |
| Provider throttling | `rate_limit_state` per run + `consecutiveThrottles` in-engine |
| Report generation + delivery outcomes | `scheduled_report_runs`, `email_delivery_events` |
| Failures (classified, first/last seen, attempts, recommended action) | `integration_failures` (auto-resolved on a clean run) |

## Correlation

Every job and sync run carries a `correlation_id`; failures, audits,
and run rows reference it, so one incident is traceable across the
queue, the run, the failure log, and the audit trail.

## Structured logging & safe errors

Operational state lives in TABLES (queryable, RLS-scoped) rather than
stdout logs. All persisted errors pass `sanitizeErrorMessage`
(credential redaction + truncation) and use STABLE codes
(shared/failures.ts). Raw provider payloads appear only in
`integration_source_records` (immutable evidence, integration:read
scoped) — never in logs, audits, or error strings.

## Surfaces

- `/integrations` — admin health page: deterministic alerts with deep
  links (connection failed/degraded/revoked, schema drift, rate
  limited, sync failed, dead-letter created, repeated retries,
  delivery failed, integration batches awaiting review), connection
  health, queue summary, recent sync + scheduled runs.
- `/configuration/integrations/[id]/history` — per-connection run
  history; `/health` — classified failure log.
- `/integrations/jobs` — job history + manual controls (audited).
- `/integrations/deliveries` — delivery history (masked recipients).
- The worker returns a per-invocation execution summary (claimed /
  succeeded / retried / permanently failed, per-job details).

Credential expiration detection is provider-specific and unclaimed
(neither blocked provider documents expiry metadata); the test
provider's ~7-day Setmore-style token lifetime is noted in the
capability matrix for future implementation.
