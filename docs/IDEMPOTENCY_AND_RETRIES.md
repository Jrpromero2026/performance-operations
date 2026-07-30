# Idempotency and Retries

Every automated operation is idempotent, with uniqueness enforced IN
THE DATABASE — never only "check then insert".

## Idempotency keys (DB-unique)

| Operation | Key | Enforcement |
| --- | --- | --- |
| Job enqueue | caller-supplied `idempotency_key` (e.g. `schedule:<def>:<occurrence>`, `job:delivery:<run>:<email>`, `webhook:<endpoint>:<event>`) | `background_jobs.idempotency_key UNIQUE`; conflict returns the existing job |
| Provider record ingestion | connection + data type + external id + payload sha256 | `integration_source_records` UNIQUE (content-addressed: identical payloads dedupe as `unchanged`) |
| Webhook receipt | endpoint + provider event id | `integration_webhook_events` UNIQUE (duplicate delivery → 200 `duplicate`) |
| Schedule execution | definition + intended occurrence (minute-normalized UTC) | `scheduled_report_runs` UNIQUE (duplicate fire → `skipped`) |
| Email delivery | `delivery:<run>:<recipient>` (retries: `retry:<event>:<attempt>`) | `email_delivery_events.idempotency_key UNIQUE` |

## Crash / duplicate scenarios (how each resolves)

- **Same provider page fetched twice** → all records hash-dedupe;
  `records_unchanged` counts them; no batch is created for zero new
  records (live e2e test 5).
- **Same webhook twice** → unique event id; second delivery is
  acknowledged as duplicate without a job.
- **Same schedule fired twice** → the second insert violates the
  occurrence unique and is recorded as skipped.
- **Delivery retried** → the event's status short-circuits: finalized
  events return "already processed"; manual retries create a NEW
  attempt-scoped event (finalized evidence is immutable).
- **Worker crashes after the provider responded but before completion**
  → the lease expires; the re-claimed run re-fetches the page; source
  records dedupe; the cursor was never advanced past durable data.
- **Network timeout after the provider accepted a request** → our
  providers are read-only (fetch), so a repeat is safe by construction;
  write-capable future providers must carry provider-side idempotency
  keys before implementation.

## Retry policy

Failures are classified (shared/failures.ts) with an explicit
`retryable` flag. Retryable → exponential backoff with bounded jitter
(30 s base, ×2 per attempt, 1 h cap, +0–25 %), max 5 attempts by
default, then `permanently_failed` → manual retry or dead-letter.
Non-retryable (auth, schema drift, configuration, recipient) fail
immediately with a recommended operator action. Rate limiting honors
`Retry-After` exactly — short pauses are absorbed in-run; long ones
fail retryable so the JOB backs off instead of holding a request open.

Cursor rule: **never advanced before durable persistence** — a failed
page is always safely re-fetchable (engine step 12; live-verified).
