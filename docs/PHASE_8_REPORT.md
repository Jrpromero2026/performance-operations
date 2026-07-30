# Phase 8 Report — Integration and Automation Infrastructure

Date: 2026-07-29/30 · Branch: `main` · Migrations: 22–27 (applied to
`performance-operations-dev`, ref `yoolmtleaezprjmfasku`)

## 1. Executive status

Phase 8 is complete. A governed, provider-neutral integration framework
exists end-to-end: connection lifecycle with Vault-held credentials, a
Postgres background-job system (atomic claim, lease recovery, backoff,
dead-letter), a sync pipeline that feeds the EXISTING import review
workflow with immutable source evidence, controlled scheduled-report
execution with provider-neutral (test-only) email delivery, webhook
infrastructure, operational dashboards/alerts, and full unit + live SQL
+ live Playwright verification. Setmore and Acuity are BLOCKED
providers — no native integration is claimed; manual CSV import remains
the operational path. No AI, no forecasting, no production deployment.

## 2. Baseline commit

Phase 8 started from `5f616f0` (Phase 7 docs) with a clean tree; all
Phase 1–7 history preserved; no force-pushes.

## 3. External documentation inspected (2026-07-29)

Setmore: setmore.docs.apiary.io (full reference, browser-rendered),
setmore.com/developers, the API-access support article. Acuity:
developers.acuityscheduling.com docs + reference (+
get-appointments parameter reference, webhooks). Findings with dates
and gaps: docs/SETMORE_API_FINDINGS.md, docs/ACUITY_API_FINDINGS.md.
No remembered API behavior was used; nothing unverified was encoded.

## 4. Provider credentials available

None. No Setmore beta token (application to api@setmore.com required),
no Acuity User ID/API key, no email provider keys. Consequently no real
provider was implemented or simulated as live.

## 5. Migrations created and applied

22 `integration_domain`, 23 `jobs_and_delivery`, 24
`worker_secret_access`, 25 `connection_revocation_paths`, 26
`store_secret_status_reset`, 27 `rotate_active_credentials` — all
additive, applied live, repository files matching; 25–27 are
live-suite-driven fixes (additive redefinitions, applied files never
edited).

## 6. Integration data model

`integration_providers` (catalog + verified capability matrices +
blocked reasons), `integration_connections`,
`integration_sync_definitions`, `integration_sync_runs`,
`integration_source_records`, `integration_cursors`,
`integration_webhook_endpoints/_events`, `integration_failures`,
`background_jobs` + `background_job_attempts`, `delivery_channels`,
`scheduled_report_runs`, `email_delivery_events`; `import_batches`
extended with `created_via` + integration linkage (+ source
`integration_test`). Documented deviations: no separate
`integration_connection_secrets` (Vault refs on the connection), no
`integration_sync_pages` (page stats on runs; records content-addressed
individually), no `dead_letter_jobs` table (a job STATUS),
`report_delivery_definitions` folded into Phase 7
`scheduled_report_definitions`, `integration_capabilities` as jsonb
matrices. Nothing canonical is duplicated.

## 7. Connection lifecycle

draft → awaiting_credentials → validating → active, with degraded /
disabled / failed / revoked per the DB-enforced matrix (migrations
22+25). Org-scoped, provider-explicit; validation separate from
activation; capabilities recorded at validation; health check + reason
(sanitized) recorded; disabled connections execute nothing; revoked
fails closed; re-enabling passes through re-validation; deactivation
never deletes evidence; every transition audited.

## 8. Credential-storage architecture

Supabase Vault (chosen over env secrets and homegrown encryption).
Fingerprint-only submission responses; secrets never in tables, logs,
audits, errors, test snapshots, or the browser; rotation bumps a
recorded version; revocation deletes the Vault row; retrieval is
server-exclusive (service_role, or platform-admin PLUS the Vault-held
`worker_server_key` matched against the server-only `WORKER_SECRET`).
Key rotation = update Vault value + env together. Live-verified
including denial paths. (docs/INTEGRATION_SECURITY.md)

## 9. Provider adapter contract

Typed, capability-explicit interface (validate/health, optional
fetch/fetchChanged, normalizeSourceRecord into the Phase 3 staging
shape, deterministic evidence serialization, optional webhook
verify/parse); blocked adapters fail closed with published setup
checklists. (docs/PROVIDER_ADAPTER_CONTRACT.md)

## 10. Background-job architecture

Postgres-native minimal system (docs/BACKGROUND_JOB_ARCHITECTURE.md):
8 job types, full bookkeeping columns (idempotency key, scheduling,
lease, attempts, sanitized errors, result, parent, correlation id,
creator).

## 11. Job lifecycle

queued → claimed → running → succeeded | retryable_failed (backoff,
re-claimable) | permanently_failed → dead_lettered ↔ requeue; cancelled
from waiting states; terminal states + identity trigger-protected.
(docs/JOB_STATE_MACHINE.md)

## 12. Atomic claiming

`FOR UPDATE SKIP LOCKED` over due + lease-expired rows; worker-bound
start/complete/fail; live-verified: two competing workers never share a
job, and a lease-expired claim is recovered by a third worker with the
stale attempt closed as `lease_expired`.

## 13. Retry and backoff behavior

Classified failures carry explicit retryability; retryable → 30 s·2ⁿ⁻¹
capped at 1 h with 0–25 % jitter, default 5 attempts; live-verified
progression retryable_failed → permanently_failed with attempt history.

## 14. Dead-letter handling

Manual dead-letter of permanently failed jobs; requeue requires a
reason (≥5 chars); both audited and permission-gated
(job:manage_dead_letter); exercised in live SQL and through the UI in
the live Playwright suite.

## 15. Idempotency model

DB-enforced everywhere: job keys, content-addressed source records,
webhook event ids, schedule occurrences, delivery keys; cursors advance
only after durable persistence; crash/duplicate scenarios enumerated in
docs/IDEMPOTENCY_AND_RETRIES.md and live-verified (duplicate enqueue,
repeated page, duplicate occurrence, duplicate delivery key).

## 16. Setmore findings

Verified: OAuth2 refresh→access exchange (≈7-day tokens), date-range
appointment fetch with cursor (max 150), staff/services endpoints, no
sandbox, limited-beta access. Verified ABSENT: appointment status
field, modified-since, webhooks, concrete rate limits; recurrence
identity and cost unit unverifiable without live payloads
(docs/SETMORE_API_FINDINGS.md).

## 17. Setmore implementation status

**BLOCKED — not implemented.** Registered blocked adapter with honest
capability matrix + 6-step setup checklist; every data-facing method
fails closed (`ProviderBlockedError`). Manual CSV import remains the
Setmore path. The Phase 3 occurrence-key finding is preserved and
explicitly not assumed resolved.

## 18. Acuity findings

Verified: HTTP Basic (User ID + API key), `/api/v1` endpoints with the
full GET /appointments parameter set, date-window pagination (max 100
default, no cursor), canceled-visibility flags, IANA timezones, webhook
events + base64 HMAC-SHA256 `x-acuity-signature` + retry/disable
behavior. Unverified: rate limits (page unavailable), field-level
payload shape, identifier stability, business mappings
(docs/ACUITY_API_FINDINGS.md).

## 19. Acuity implementation status

**BLOCKED — not implemented** (no credentials, no representative data;
the Phase 3 blocker persists). Blocked adapter + checklist; the
documented webhook signature verification IS implemented and
unit-tested against synthetic vectors. Generic CSV mapping remains the
fallback. Acuity is the closer of the two to implementable.

## 20. Synchronization workflow

The 15-step engine (docs/INTEGRATION_ARCHITECTURE.md): lock → cursor →
bounded pages → immutable evidence → drift gate → deterministic
evidence CSV in the SAME private bucket → import batch
(`created_via='integration'`) → Phase 3 staging/matching → cursor
advance → stats/notify. Live e2e: 6 synthetic records → batch → review
REQUIRED; re-sync → "6 already on file", no batch.

## 21. Cursor behavior

Per definition+data-type rows with previous value + advance timestamp;
advanced only after durable persistence; elevated reset
(`integration:reset_cursor`, platform admin, ≥10-char reason, impact
preview: full-window re-fetch with hash-dedup) audited with the prior
cursor preserved.

## 22. Rate-limit behavior

Observed-signal model (Retry-After / X-RateLimit-*): requests,
remaining, reset, throttle streaks tracked per run; Retry-After honored
exactly (capped 1 h), never busy-loops (≥1 s), short pauses absorbed
in-run, long ones fail retryable so the job backs off; only the
affected connection pauses. No undocumented limits hardcoded. Exercised
via the test provider's simulated throttle.

## 23. Schema-drift behavior

Per-record comparison against adapter expectations (missing required,
type changes; new fields recorded but never drift alone —
nothing discarded). Drift fails CLOSED before any batch: connection →
degraded, blocking failure recorded with remediation, operators
notified, raw evidence preserved, unrelated connections unaffected;
adapter review required (versioned). Unit-tested; simulated end-to-end
via the test provider's `fail_drift` credential.

## 24. Webhook infrastructure

Hashed-token endpoints, content-type + 64 KB limits, adapter signature
verification (Acuity HMAC contract implemented; test provider adds a
timestamp window), DB event-id idempotency with duplicate
acknowledgement, fast 202 + async `webhook_processing` job that only
triggers a standard sync. Dev limitation (no ambient session for
external posts → 503) recorded; production pairing is part of the
worker-hosting decision. (docs/WEBHOOK_SECURITY.md)

## 25. Scheduled-report execution

Enabled per definition (Phase 7 hard-off CHECK dropped in migration 23
only after the worker was verified): occurrence-unique runs,
execution-time authorization + recipient re-resolution, saved-view
periods fail safely, closed periods deliver FROZEN finalized packages
(is_final), active periods labeled NOT FINAL, artifact hashes recorded;
manual Run now + scheduler tick. Live-verified end-to-end including
worker delivery. (docs/SCHEDULED_REPORT_EXECUTION.md)

## 26. Email-delivery architecture

Provider-neutral abstraction; ONLY the test provider is executable
(test_mode channel; sends recorded, nothing leaves the system);
`none_configured` and unimplemented real providers fail closed; honest
lifecycle that never claims `delivered` without provider confirmation;
finalized events immutable (retries are new events); masked recipients;
no amounts in subjects; 2 MB attachment fallback to deep links.
(docs/EMAIL_DELIVERY_ARCHITECTURE.md)

## 27. Recipient governance

Execution-time re-resolution against active members; deactivated/
removed users excluded and recorded; cross-org rejected; external
requires the org policy (default OFF); trainer-statement email NOT
implemented (policy gate exists, default OFF); addresses never inferred
from names; Phase 7's member-only definition recipients still enforced
at creation.

## 28. Operational alerts

Deterministic derivation with deep links: connection validation
failed / credentials revoked / degraded, schema drift, provider rate
limited, sync failed, dead-letter created, repeated retries, delivery
failed, integration batch awaiting review. In-app notifications go to
permission holders and SELF-SUPPRESS for the acting user (verified in
the DB that the sync-failure notification reached the other admin; the
actor sees the pipeline alert — e2e test 12 documents this).

## 29. Integration UI

`/configuration/integrations` (+new, +[id], +history, +health,
+mapping) and `/integrations` (+runs/[id], +jobs, +deliveries), nav
"Automation" entry, permission-gated palette commands, scheduled-tab
execution controls with run history and finality labels, and the
governed batch-discard control on the run page. Responsive rendering
verified.

## 30. Permissions added

The 17 keys with the role matrix in AUTHORIZATION_MODEL.md (platform
admin everything; workspace admin org-scoped minus cursor reset;
payroll manager report-side only, NO credentials; department manager
delivery-read; trainer recipient self-scope; viewer none). DB grants
and the TS mirror are in sync.

## 31. RLS verification

All 13 new tables RLS enabled+forced; live-verified: outsider/trainer
zero visibility on connections, jobs, deliveries, source records;
trainer denied creation, credential storage, enqueue, claim, retry,
dead-letter; job table writable only through RPCs; vault schema
inaccessible to authenticated sessions.

## 32. Audit behavior

Audited: connection create / credential submit / rotate / revoke /
validate / activate / validation-failure / disable / re-enable, sync
definition create + pause/resume, manual sync success/failure (with
correlation ids), cursor reset (prior value + reason), schema drift,
job retry / cancel / dead-letter / requeue, scheduled execution, report
generation (Phase 7 harness), delivery request/acceptance/failure/
manual retry, channel + policy changes, batch discard. No secrets, auth
headers, full payloads, or report content in audit metadata.

## 33. Observability

Correlation ids end-to-end; queue depth / oldest / dead-letter widgets;
per-run page and record statistics; attempt-level history; classified
failure log with first/last seen; worker execution summaries;
sanitized stable error codes everywhere. (docs/
INTEGRATION_OBSERVABILITY.md)

## 34. Unit test counts

**347 passed / 0 failed / 0 skipped** (43 new in Phase 8 across
integration-contract, integration-test-provider, integration-shared).

## 35. Playwright counts

Offline suite: 24 tests (navigation + workspace across 2 projects) —
unchanged by Phase 8. Live suite: **68 passed / 0 failed / 0 skipped**
(setup + auth 11 + close 8 + imports 14 + integrations 13 +
intelligence 4 + operations 8 + payroll 10) in the final full run at
the final commit.

## 36. Provider-neutral live results

All framework verification is provider-neutral or test-provider-based:
live SQL phase 8 suite (15 sections, ALL PASSED, rollback-safe,
isolated org) + the 13 live integration e2e tests + full-suite
regression 68/68.

## 37. Real Setmore live results

**None — zero real Setmore tests.** No credentials exist; no live
Setmore verification is claimed.

## 38. Real Acuity live results

**None — zero real Acuity tests.** No credentials exist; no live Acuity
verification is claimed. (Acuity's documented webhook signature scheme
is unit-tested against synthetic vectors only.)

## 39. Regression results

Import, payroll, intelligence, operations, and period-close live suites
all pass at the final commit (within the 68/68 run) — including the
Phase 7 close workflow against the same database that now carries
integration activity. One genuine interaction was surfaced and
resolved: pending integration batches honestly BLOCK close readiness
(correct behavior), addressed with the governed batch-discard control +
self-cleaning e2e.

## 40. Build results

`npm run build` ✓ (73 routes incl. /api/worker + /api/webhooks/[token]);
`npm run typecheck` ✓; `npm run lint` ✓ with the one pre-existing
TanStack Table compiler warning; generated DB types extended and
typecheck-verified against live migrations.

## 41. Known limitations

Both real providers blocked (see §17/§19); no real email provider —
delivery terminates at test-mode acceptance; webhook ingestion needs a
service-role context for true external posts (503 in dev without a
session); scheduler not enabled (worker is invoke-only); `cleanup` jobs
are deliberate no-ops pending retention policies; `period_close`/
`custom` schedule frequencies record intent without wall-clock
occurrences; credential-expiry detection unclaimed; per-run dev-server
contention can drop an in-flight manual action (e2e retries once —
irrelevant under a real worker host).

## 42. Manual configuration required

To activate later: Setmore beta token / Acuity credentials via the
credential form; email provider + verified sender (then a provider
implementation); `worker_server_key` Vault value + `WORKER_SECRET` env
per environment; a production scheduler (documented options); webhook
public ingestion pairing. Dev already carries: worker key (Vault +
.env.local, uncommitted) and the durable fixture period "E2E Schedule
Window".

## 43. Unresolved provider decisions

U10a–U10m in DECISION_LOG.md: provider credentials and API access,
verified Setmore payload semantics, email provider + sender domain +
retention, external-recipient and trainer-statement policies, sync
frequency/windows, auto-review/approve/post policy, webhook enablement,
worker hosting + production scheduler, job/dead-letter/payload
retention, credential-rotation cadence. None guessed.

## 44. Git status

Working tree clean; branch `main`; no force-pushes; no credentials or
real provider payloads committed; migrations 1–21 untouched; applied
migration files never edited (fixes were additive migrations 25–27).

## 45. Commit hashes

`e981d6e` migrations 22–23 + findings docs · `aa64b42` adapter
contracts, sync pipeline, job runner, delivery (+migration 24) ·
`d0ee88f` integration operations interfaces + scheduled execution UI ·
`1a77a46` test suites + migrations 25–27 · `cce0c84` batch disposal,
regression hardening, architecture docs + doc updates · (this file)
docs: Phase 8 report.

## 46. Recommended Phase 9 scope

Provider activation & delivery hardening: implement `acuity-api-v1`
(closest to ready) then `setmore-api-v1` against verified payloads;
real email provider with bounce ingestion and signed expiring links;
production worker hosting + webhook service-role ingestion; then the
production-hardening track (security review, performance, backups,
observability, deployment pipeline). Stop here: no AI insights,
forecasting, accounting/payroll-provider integrations, tax functions,
or production deployment were started.
