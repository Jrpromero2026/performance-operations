# Phase 7 Report — Period Close, Report Packages, and Export Automation

Date: 2026-07-29 · Branch: `main` · Migrations: 19–21 (applied to
`performance-operations-dev`, ref `yoolmtleaezprjmfasku`)

## 1. Executive summary

Phase 7 delivers the controlled end-of-period workflow: a readiness
checklist consuming only existing engines, a DB-enforced close
lifecycle with separation of duties, an atomic close transaction that
freezes an immutable hashed manifest, versioned hash-frozen report
packages, accounting CSV exports with verified downloads, database
guards against post-close changes, completed saved-view sharing with
defaults, and scheduled-report definitions (execution explicitly not
enabled). No new KPI formulas, no payroll recalculation path, no
external integrations, no background workers, no deployment.

## 2. Scope delivered

Everything in the phase prompt except items recorded as documented
deviations (§30) or unresolved business decisions (§38). All 51 project
tasks through Phase 7 are complete.

## 3. What the close is — and is not

The close is a workflow/packaging/control layer. It reads pipeline
states (imports, appointments, payroll) and the Intelligence Engine; it
freezes engine-rendered payloads with hashes. It never computes a
metric, never recalculates payroll, and never introduces a second
source of truth for any number.

## 4. Data model (migration 19)

`organization_close_policies` (per-org close policy),
`period_close_runs` (lifecycle + readiness snapshot + approvals +
supersession links), `period_close_events` (append-only),
`period_close_acknowledgements` (unique per run+check, frozen after
close), `report_packages` (versioned, unique per
org/period/type/department/version), `close_exports` (versioned
export manifest rows), `period_close_manifests` (one per run,
SELECT-only), `scheduled_report_definitions`
(`execution_enabled` CHECK false), plus saved-view sharing columns and
default-uniqueness indexes. All tables have RLS enabled AND forced.

## 5. Close lifecycle

`close_review → ready_to_close → closing → closed`, with
`ready_to_close → close_review` (regression), `closing →
ready_to_close` (abort), `closed → superseded` (reopen only), and
`voided` from pre-approval states. DB trigger authoritative; TS mirror
for messaging and unit tests. One active run per period via a partial
unique index (closed counts active until superseded).

## 6. Readiness architecture

`classifyCloseChecks` is pure over `CloseReadinessInputs`; the loader
(`evaluateCloseReadiness`) batches pipeline queries and opens exactly
ONE IntelligenceSession. ~29 checks across six categories, each with
code, severity, definition, source, explanation, remediation action,
deep link, waivability, and resolution state. Missing information never
passes. Checks are computed on every visit — never persisted as rows.

## 7. Readiness ↔ run coupling

The run stores the latest evaluation summary (`readiness_snapshot`
with codes + counts, `blocking_issue_count`, `warning_count`). A
re-evaluation that regresses a `ready_to_close` run reverts it to
`close_review` and clears review/approval marks (event
`readiness_revoked_by_reevaluation`).

## 8. Warning acknowledgements

Waivable warnings require an explicit acknowledgement with a note
(≥3 chars when `require_ack_note`, the default). Acknowledgements are
unique per run+check, recorded with actor and time, frozen once the run
closes, and reproduced verbatim in the manifest. Blocking checks can
never be acknowledged away.

## 9. Separation of duties

Approver ≠ initiator, enforced in the approve action AND re-validated
inside the execute RPC; fails closed when no policy row exists.
`organization_close_policies.allow_self_approval` is the explicit,
org-scoped escape hatch (true for Timberhill in DEV ONLY as documented
e2e test configuration). Reopen requires `period_close:reopen`
(platform admin only).

## 10. The close transaction (`app.execute_period_close`)

SECURITY DEFINER, all-or-nothing. Re-validates: permission, run
`ready_to_close`, approved, self-approval policy, period open +
org-match, zero blocking issues, zero pending import batches org-wide,
finalized payroll per policy when the period has active appointments,
zero unfinished payroll runs, every snapshot warning acknowledged,
manifest integrity (run id, ready package, every export id + sha256
non-superseded). Then: run→closing, package→finalized, exports linked,
manifest inserted, period→closed (GUC-gated), run→closed, two events,
audit row. Any failure rolls back everything.

## 11. Close manifest

References + hashes only — no operational datasets, no client PII.
Deterministic serialization (`stableStringify`, recursively sorted
keys; all embedded collections sorted) hashed with sha256. Volatile
fields (`closed_by/at`) stay out of the hashed payload. Includes
approvals, acknowledgements, engine versions, payroll snapshot
reference, import batch ids, package/export references, trainer
statement hashes, full readiness results, and reopen history.

## 12. Report packages

Five types (executive, department, payroll, trainer_statements,
import_reconciliation) generated through a shared harness: next
version → `generating` → payload built from engines/frozen payroll →
`ready` + sha256 (superseding the prior ready version) or `failed` +
reason. Content freezes at `ready` (DB trigger); the close finalizes
exactly one executive package version.

## 13. Executive package contents

21 catalog metrics including explicitly `unavailable`
eligible/recognized revenue (health + reason, never $0.00), readiness
metrics, department and trainer breakdowns, payroll snapshot reference,
import reconciliation rows, deterministic summaries, and an
`unavailable_metrics` list.

## 14. Accounting exports

Six export types (payroll register, payroll detail, department summary,
executive summary, trainer statement register, close manifest JSON).
Deterministic columns and row ordering; UTF-8 + CRLF; integer cents raw
alongside USD presentation; empty cells for missing values;
formula-injection protection on every cell.

## 15. Export storage strategy (documented deviation)

No storage bucket. Exports regenerate deterministically from frozen
sources; `close_exports` records identity + sha256 + row/byte counts;
the download route regenerates with the same builder and refuses to
serve on hash mismatch (HTTP 409 `integrity_mismatch`). Downloads are
counted and audited with `X-Export-Sha256`/`X-Export-Version` headers.

## 16. Formula-injection protection

`csvCell` prefixes `'` to any value starting `= + - @ TAB CR`, then
applies RFC 4180 quoting. Documented cost: negative numbers also carry
the prefix (fail-safe chosen over cosmetics). Unit-tested including
hostile trainer names end-to-end.

## 17. Post-close change guards (migrations 20–21)

Appointments (insert into closed period; material field updates),
payroll runs (insert; lifecycle transitions), manual time entries and
payroll adjustments (insert/update) are blocked in closed periods with
the dependent close-run id and a `/period-close/<id>` reopen hint in
the error. Notes/payment_status remain editable. Closed periods'
dates/type are immutable; `status='closed'` transitions happen only
inside the close RPCs.

## 18. GUC hygiene fix (migration 21)

The live SQL suite surfaced that the transaction-scoped
`app.period_close_op` GUC outlived the RPC statement inside a
multi-statement transaction, leaving the period guard bypassed. Not
exploitable through PostgREST (one transaction per RPC call), but both
RPCs now clear the GUC immediately after their period update — defense
in depth, additively migrated.

## 19. Reopen semantics

Reopen supersedes the closed run FIRST (satisfying the one-active-run
index), inserts the replacement `close_review` run with
`close_version + 1`, backfills the forward link, marks finalized
packages and linked exports superseded, and returns the period to
`open` — reason required (≥5 chars), recorded permanently, notified and
audited. Manifests are never deleted.

## 20. Void semantics

Only `close_review`/`ready_to_close` runs are voidable; authority is
`period_close:review` (documented deviation: no separate void
permission). Voided is terminal.

## 21. Permissions and roles

Eleven new close/report permission keys with a four-role matrix
(platform_admin everything incl. reopen; workspace_admin everything but
reopen; payroll_manager read/create/review/export + package generation
+ report administration; department_manager read-only). DB grants and
`src/lib/authz/permissions.ts` are in sync. See AUTHORIZATION_MODEL.md.

## 22. RLS posture

Every new table: enable + force RLS, per-command policies keyed on the
new permissions; `period_close_manifests` SELECT-only (insert via RPC);
department packages additionally gated by `app.can_access_department`;
saved-view policies rewritten for sharing scopes. Outsider/trainer
denial verified live.

## 23. Wizard UI

`/period-close` dashboard (active/completed/superseded runs, period
states, close activity timeline), `/period-close/new`, and the run hub
with six server-derived steps (`data-step`/`data-state` — nothing
marked complete from UI state), plus readiness, reports, exports,
approval (requirements checklist + actors + gated actions + two-step
execute), manifest (print-ready + raw JSON), and the verified download
route. Navigation + command palette entries are permission-gated.

## 24. Report Center completion

Saved views now list personal + organization-shared views with
scope/default/owner chips and owner attribution; sharing controls are
owner-only and permission-checked; defaults are unique per scope target
and auto-apply their reporting period (validated against the current
org's periods, fail-safe to the period prompt). New Scheduled tab with
an execution-not-enabled banner, definition list, and manager-only
create/enable/disable/delete.

## 25. Scheduled report definitions

Whitelisted types/frequencies, `Intl`-validated timezones, recipients
restricted to organization members, `delivery_channel` in-app only,
and `execution_enabled` CHECK-constrained false — no scheduler, cron,
email, or webhook code exists anywhere.

## 26. Notifications

Close lifecycle events notify permission holders in-app via the Phase 6
`notifyPermissionHolders` path: run created → reviewers, review
completed → approvers, executed → readers, reopened → warning with the
new run link, scheduled definition created → managers (with the
execution disclaimer). No email/push.

## 27. Audit trail

Every governed action writes `audit_events`: run creation, evaluation
persistence, acknowledgements, review/approve/revoke, execute (with
manifest hash + package/export references), reopen, void, package
generation (success and failure), export generation, downloads, sharing
changes, scheduled-definition mutations. Execute failures are audited
with the failure code.

## 28. Determinism guarantees

Manifest: sorted-key serialization + sorted collections → identical
inputs give identical hashes (unit-verified, including input-order
shuffles and tamper detection). Exports: deterministic columns/ordering
→ regeneration equals the recorded hash unless a frozen source changed
(the point of the verification).

## 29. Engine boundaries honored

Readiness consumes `IntelligenceSession` results; packages embed engine
metric results verbatim (health + reason preserved); exports render
frozen payroll rows and package payloads. Zero new formulas; zero
payroll recalculation; widgets still never calculate.

## 30. Documented deviations from the proposed model

(1) readiness checks computed, not persisted; (2) approvals as run
columns + events, no approvals table; (3) export manifests folded into
`close_exports`; (4) no export storage bucket — regenerate + verify;
(5) `period_close:void` folded into `period_close:review`; (6) period
status model preserved with the close lifecycle on runs; (7) PDF =
print views, XLSX = CSV, combined statement PDF/ZIP bundle deferred;
(8) payroll (and its register export) required only when the period has
activity.

## 31. Unit tests

79 new tests across five files: transition matrix, readiness
classification matrix (baseline + every mutation + acknowledgement
semantics + missing-info-never-passes), manifest determinism/hashing/
tampering, CSV injection/format/hashing, and export builders. Suite
total: 304 passing.

## 32. Live SQL suite

`tests/rls/phase7-live-checks.sql` — executed against the dev project,
rollback-safe, in an isolated throwaway organization (so org-scoped
revalidations never collide with dev data): RLS denial, one-active-run
index, DB state machine, every execute precondition in order,
separation of duties, atomic close effects, double-close, all
post-close guards (with run ids in errors), closed-run/ack/manifest/
export immutability, reopen authority + versioned cycle, void
terminality, saved-view sharing policies, scheduled execution
constraint. ALL PASSED.

## 33. Live Playwright suite

`e2e/live-close.spec.ts` (10 tests, all passing, `--workers=1`):
reset, run creation, honest readiness blockers, package generation,
export generation + hash-verified download + honest no-payroll register
failure, acknowledge-all loop with notes, review → approve → two-step
execute, frozen manifest inspection, reopen to v2, and a final void so
the dev DB keeps no active or misleading close. Uses the dedicated
zero-activity fixture period "E2E Close Window" (2099-06).

## 34. E2E fixtures added (durable, dev only)

Reporting period "E2E Close Window" (Timberhill, 2099-06-01 –
2099-06-30, no appointments) and
`organization_close_policies(Timberhill).allow_self_approval = true` —
the latter exists ONLY so the single e2e admin can exercise
approve+execute; production organizations would keep the fail-closed
default.

## 35. Full verification results

`npm run typecheck` ✅ · `npm run lint` ✅ (one pre-existing TanStack
Table compiler warning) · `npm test` ✅ 304/304 · `npm run build` ✅
(58 routes) · live SQL suite ✅ · live close e2e ✅ 10/10.

## 36. Migrations discipline

Migrations 19–21 are additive; no applied migration file was modified
(the migration-20 trigger revision and migration-21 GUC fix are
additive redefinitions, following the established Phase 4 pattern).
Local files match applied migrations.

## 37. Commits

Eight Phase 7 commits: migrations 19–20 (`f463e63`), close TS layer
(`fe54625`), wizard UI (`7a96127`), report-center sharing/scheduled UI
(`6477d03`), GUC hygiene fix (`21fc176`), unit + live SQL tests
(`312ab8e`), live e2e + conditional register requirement (`f97f2e3`),
docs (this commit). Fewer than the 11 suggested — grouped where the
pieces were inseparable; every commit builds and typechecks.

## 38. Unresolved business decisions (recorded, not guessed)

U9a–U9h in DECISION_LOG.md: payroll posted-vs-locked close policy,
approver requirements and production self-approval stance, mandatory
packages/exports, accounting column/GL mapping, retention periods,
compensation-change guarding during closed periods, failed-import
disposition, and scheduled-delivery expectations. Also still open:
eligible/recognized revenue definitions (the close acknowledges their
absence every cycle).

## 39. Known gaps and honest limitations

Combined trainer-statement PDF/ZIP bundle not built; XLSX not built
(CSV opens in Excel); department close packages are generated per
active department but have no per-department close sign-off; the
readiness "stale payroll" check depends on import timestamps (as
designed in Phase 4); compensation changes in closed periods are
unguarded (U9f); concurrent-close protection relies on row locks +
status checks (verified for double-execute, not exercised under true
parallel sessions).

## 40. Security posture

Deny-by-default RLS on all new tables; SECURITY DEFINER functions with
pinned empty search_path; permissions re-checked inside RPCs; GUC
bypass cleared immediately after use; manifests insert-only via RPC;
downloads permission-checked per request with hash verification; no
secrets, no client PII in manifests/packages beyond masked references
already established in Phase 4.

## 41. Data integrity in dev

The e2e flow leaves the fixture window OPEN (final void), with honest
superseded/voided history rows. The live SQL suite rolls back
everything. No real payroll or client data was committed to the repo or
embedded in fixtures.

## 42. Performance notes

Readiness evaluation batches its queries and uses one engine session
(~1–3 s live). Package generation is synchronous server-action work
(executive ~2–5 s on dev data). Export downloads regenerate on demand —
acceptable at current volumes; the recorded byte sizes give an early
signal if that assumption breaks.

## 43. Operational notes

To close a real period: resolve blocking checks via the deep links,
generate the executive package + required exports, acknowledge
warnings with meaningful notes (they are permanent manifest records),
complete review, have a DIFFERENT authorized person approve, execute,
and archive the manifest JSON export. Reopening requires a platform
admin and a permanent reason.

## 44. What Phase 8+ should pick up

Execution infrastructure for scheduled reports (relax the CHECK behind
a job runner), accountant-confirmed export columns/GL mapping, direct
source-system API sync, combined statement bundles, retention
enforcement, and the production hardening list (see
IMPLEMENTATION_ROADMAP.md).

## 45. Sign-off

Phase 7 is complete: all deliverables implemented or explicitly
documented as deviations/unresolved inputs; all verification gates
green against the live dev project; the repository stops here as
instructed — no deployment, no Phase 8 work started.
