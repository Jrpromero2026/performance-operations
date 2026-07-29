# Performance Operations — Phase 3 Report

**Date:** 2026-07-30 · **Baseline:** Phase 2 head `97ddbdf` · **Branch:** `main`

## Summary

Phase 3 delivered the Import Center and canonical appointment ledger:
staged imports (file → raw rows → normalization → matching → review →
approval → transactional posting), a DB-enforced batch state machine,
private evidence storage, series-aware duplicate detection, audited
resolution workflows, an immutable posted ledger with correction and
reversal workflows, and real `/imports` + `/appointments` interfaces. No
payroll or KPI calculation, no revenue recognition, no fabricated values,
no deployment.

## Source files inspected (mandatory review)

Three REAL Setmore exports found locally, copied to gitignored
`business-inputs/`, inspected without committing or printing client data:
`Complete_December_Setmore Report.xlsx` (2,883 rows),
`JR_December_Setmore Report.xlsx` (418), `Jo August 2025 Setmore.xlsx`
(208). All share one 20-column schema → `setmore-v1`
([schemas/setmore-observed-schema.md](schemas/setmore-observed-schema.md)).
Decisive findings: trailing-space headers; `D MMM YYYY` dates; 12-hour
time ranges; `Cost` = listed price only; statuses only
`Confirmed`/`Cancelled `; **Booking ID identifies a recurring SERIES**
(204/204 duplicate-ID groups were one customer at different times) →
occurrence identity is (source, booking id, start). **No Acuity sample
exists**: the Acuity adapter is BLOCKED and support is not claimed;
Acuity files use the generic mapping adapter meanwhile. Native `.xlsx`
upload is deferred (exports are saved as CSV first — documented).

## Adapters

- `setmore-v1` — SUPPORTED (built from observed schema, fixture-tested)
- `generic-v1` (manual_csv) — SUPPORTED (column mapping; versioned,
  org-scoped, header-signature-keyed profiles)
- `acuity` — BLOCKED, not claimed (no sample)

## Migrations (applied to performance-operations-dev; 13 total now)

M11 `clients_and_status_model`, M12 `import_domain` (incl. permissions,
state-machine trigger, storage bucket + policies), M13
`appointment_ledger` (incl. posting/reversal security-definer RPCs).
Documented deviations: `import_files` folded into `import_batches`;
`import_entity_matches` folded into `import_rows` + `import_resolutions`.
Storage bucket `performance-operations-imports` verified live: private,
10 MB, CSV MIME allowlist, org-scoped path policies, NO delete policy.

## Verification (exact, all executed)

| Check | Result |
| --- | --- |
| `npm run lint` | 0 errors, 1 warning (React-Compiler informational note on TanStack `useReactTable`) |
| `npm run typecheck` | clean |
| `npm test` | 8 files, **125/125 passed** (54 new Phase 3 tests) |
| Playwright offline (:3100) | **36 passed, 2 skipped** (intentional viewport skips) |
| Playwright live (:3000, real auth + DB + storage) | **22/22 passed** — incl. the full 10-step import workflow (upload → resolve trainer/service/status/client → acknowledge → approve → post → ledger + source evidence → authorized download → reverse) |
| `npm run build` | clean; 42 routes + proxy |
| Live posting/reversal/RLS (tests/rls/phase3-live-checks.sql, executed, rolled back) | **All passed**: state-machine trigger, cross-org denial, unauthorized-post rejection, atomic posting (appointments+links+history+participants), double-post/double-reverse blocks, raw-row + appointment-evidence immutability, trainer self-scope, blocking-issue rejection with zero partial rows, reversal preserving history + audit events |
| Dev DB hygiene | 0 test batches/appointments/clients/trainers remain (fixtures cleaned) |

Bugs found and fixed by the tests themselves: duplicate classifier missed
service changes (now `conflict`); global sign-out revoked all user
sessions (now device-local scope).

## Known limitations

- Acuity: mapping-only until a sample arrives; `.xlsx` not ingested
  natively.
- Import processing is synchronous within the request (fine for ≤10k rows
  on the Node runtime); resumable chunked processing is future work.
- `source_update` rows require manual confirmation; automatic supersede
  is an open business decision (U2g).
- Client dropdown in review loads up to 500 clients alphabetically;
  revisit with real volume.
- 16 tiny synthetic e2e CSVs remain in the private storage bucket —
  storage has (by design) no delete path from the app or SQL; remove via
  the Supabase dashboard if desired.
- Playwright live suite runs with one worker (`scripts/run-e2e.mjs`)
  to respect Supabase auth rate limits and dev-server hydration timing.

## Manual actions still required

1. (Optional) Delete `e2e-run-*` objects from the imports bucket via the
   dashboard.
2. Unchanged from Phase 2: Auth URL configuration, leaked-password
   protection toggle, SMTP, bootstrap password rotation.

## Remaining business inputs

An **Acuity sample export** (unblocks the dedicated adapter), plus the new
unresolved decisions U2a–U2k in [DECISION_LOG.md](DECISION_LOG.md)
(source-notes policy, client-matching/creation rules, retention, reversal
approval, separation of duties, source-update behavior, group sessions,
multi-coach, excluded-row reopening, operational limits) and the standing
payroll rules U1a–U1i.

## Recommended Phase 4

**Payroll Engine** — payroll runs per organization + reporting period
calculating from ACTIVE posted appointments and effective-dated published
compensation versions, with per-line calculation traces, the
Draft→In Review→Approved→Posted→Locked state machine, adjustments, and the
reversal dependency guard this phase documented. Blocked primarily on the
compensation business rules (U1a–U1i).
