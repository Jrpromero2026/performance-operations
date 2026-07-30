# Integration Architecture

Phase 8 adds a governed, provider-neutral integration framework. Its
non-negotiable invariant:

```
External provider → connection → sync job → immutable source payload
  → provider adapter → EXISTING import staging → matching → review
  → approval → posting → canonical appointment ledger
```

**An automated sync never writes canonical appointments.** Synced data
becomes an ordinary import batch (`created_via='integration'`) staged
through the Phase 3 pipeline; auto-approve and auto-post are
CHECK-constrained OFF at the database (`integration_sync_definitions`).
External systems provide source EVIDENCE; the ledger stays canonical.

## Modules (`src/lib/integrations/`)

| Module | Responsibility |
| --- | --- |
| `shared/contract.ts` | Typed adapter contract, explicit capabilities, `ProviderBlockedError` |
| `shared/failures.ts` | Stable failure codes, retryability, credential-sanitized messages |
| `shared/rate-limit.ts` | Observed rate-limit state (Retry-After honored; no hardcoded limits) |
| `shared/drift.ts` | Schema-drift detection (missing/typed/new fields) |
| `providers/` | `setmore.ts` (BLOCKED), `acuity.ts` (BLOCKED), `test-provider.ts` (synthetic) |
| `registry.ts` | key → adapter lookup (code/migration-controlled) |
| `sync/engine.ts` | The 15-step sync run (below) |
| `jobs/runner.ts` | Job execution + scheduler tick |
| `reports/execute.ts` | Scheduled-report execution + delivery queueing |
| `delivery/` | Provider-neutral email abstraction + recipient governance |
| `alerts.ts` | Deterministic operational alerts with deep links |

## Sync run sequence

1. Load definition + connection; re-check `integration:sync`.
2. Connection must be `active`/`degraded`; blocked providers fail closed.
3. Execution lock: one `running` sync per connection.
4. Load the last safe cursor (incremental mode).
5. Resolve the credential SERVER-SIDE (Vault, worker-key gate).
6. Fetch bounded pages (≤20/run) honoring rate-limit observations;
   long throttles fail retryable so the job system backs off.
7. Preserve every raw record in `integration_source_records` —
   immutable, content-addressed (connection+type+external id+payload
   sha256), so re-fetching identical data is a no-op (`unchanged`).
8. Schema drift fails CLOSED before any batch exists: connection →
   `degraded`, failure recorded, operators notified, evidence kept.
9. Build a deterministic evidence CSV from the NEW records, store it in
   the same private imports bucket (hash + size recorded), create the
   import batch, and stage/match through the Phase 3 pipeline.
10. Advance the cursor ONLY after durable persistence.
11. Record statistics (pages/fetched/accepted/unchanged/rejected,
    rate-limit state, correlation id), bookkeep the definition and
    connection health, resolve outstanding failures, audit, notify.

A failed page never advances the cursor and is safely re-fetchable.

## Provider status

- `setmore_api` — **BLOCKED** (docs/SETMORE_API_FINDINGS.md): limited
  beta with no credentials, no documented status field, unverified
  recurrence identity. Manual CSV remains the Setmore path.
- `acuity_api` — **BLOCKED** (docs/ACUITY_API_FINDINGS.md): contract
  documented and ready, but no credentials and no representative data.
  Generic CSV mapping remains the Acuity fallback.
- `test_provider` — synthetic, deterministic, clearly labeled; exists
  ONLY to verify the framework (never presented as an external system).

## Future provider foundation

QuickBooks / payroll-provider integrations are OUT of scope and
unclaimed. The contract they would use already exists: a new adapter
implements `ProviderAdapter`, declares capabilities, and plugs into the
same connection/credential/job/sync machinery — no schema changes
anticipated beyond a provider catalog row.
