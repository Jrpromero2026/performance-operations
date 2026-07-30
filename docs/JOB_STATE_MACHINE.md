# Job State Machine

```
queued ── claim ──▶ claimed ── start ──▶ running ─┬─▶ succeeded (terminal)
  ▲                    │                          ├─▶ retryable_failed ──▶ (claimable again after backoff)
  │                    └── lease expired ─────────┘         │ attempts exhausted / non-retryable
  │                        (re-claimable; stale             ▼
  │                         attempt closed)        permanently_failed
  │                                                    │ manual
  ├──── manual retry ◀─────────────────────────────────┤
  │                                                    ▼
  ├──── manual requeue (reason) ◀──────────────  dead_lettered
  │
queued/retryable_failed ── manual cancel ──▶ cancelled (terminal)
```

Rules (all DB-enforced through the RPCs + guard trigger):

- Claiming selects only DUE rows (`available_at <= now()`) plus
  lease-expired claimed/running rows; `FOR UPDATE SKIP LOCKED` makes
  concurrent claims disjoint.
- `attempt_count` increments at CLAIM; an attempt ROW is written at
  START (a claimed-but-never-started worker crash therefore shows as a
  lease-expired claim, not a phantom attempt).
- `retryable_failed` is a waiting state: backoff sets `available_at`;
  the next claim re-enters `claimed`.
- `permanently_failed` = non-retryable error OR attempts exhausted.
  Operators may `retry` (re-queue with raised max) or `dead_letter` it.
- `dead_lettered` is parked evidence; `requeue` (reason required)
  returns it to `queued`.
- `succeeded` and `cancelled` are immutable (trigger `job_terminal`);
  job identity (org/type/idempotency key) is immutable in every state.
- Idempotent execution: handlers re-check their own domain state (e.g.
  a re-run delivery job finds its event finalized and completes as a
  no-op), so a job that crashed after the side effect completes safely.

Verified: unit (occurrence/backoff helpers) + live SQL sections 6–12
(atomic claim, competing workers, lease recovery, backoff progression,
terminal protection, dead-letter/requeue/cancel with audit) + the live
Playwright job-queue workflow.
