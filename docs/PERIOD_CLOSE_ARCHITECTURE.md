# Period Close Architecture

Phase 7 adds a controlled end-of-period workflow on top of the existing
engines. The close **consumes** — it never computes: readiness reads
pipeline states and the Intelligence Engine; packages freeze
engine-rendered payloads; exports render frozen payroll/package data. No
new metric formula or payroll calculation path exists anywhere in the
close domain.

## Components

| Layer | Location | Responsibility |
| --- | --- | --- |
| Domain tables | migration 19 | `organization_close_policies`, `period_close_runs`, `period_close_events`, `period_close_acknowledgements`, `report_packages`, `close_exports`, `period_close_manifests`, `scheduled_report_definitions`, saved-view sharing columns |
| RPCs + guards | migrations 20–21 | `app.execute_period_close`, `app.reopen_period_close`, `app.void_period_close`, post-close change guards, GUC-controlled `reporting_periods.status='closed'` |
| Readiness | `src/lib/close/checks.ts` (pure) + `readiness.ts` (loader) | ~29 structured checks over batched pipeline state + ONE `IntelligenceSession` |
| Manifest | `src/lib/close/manifest.ts` | deterministic payload construction + sha256 (`stableStringify`) |
| Packages | `src/lib/close/packages.ts` | versioned, hash-frozen report packages (executive, department, payroll, trainer statements, import reconciliation) |
| Exports | `src/lib/close/csv.ts`, `exports.ts`, `export-data.ts` | accounting CSVs from frozen sources, injection-protected, hash-verified downloads |
| Actions | `src/lib/actions/close.ts` | create/evaluate/acknowledge/review/approve/execute/reopen/void/generate |
| UI | `src/app/(app)/period-close/**` | dashboard, wizard hub, readiness, reports, exports, approval, manifest, verified download route |

## Close cycle

1. **Create** (`period_close:create`) — one active run per period
   (partial unique index; `closed` counts as active until superseded).
2. **Readiness** — every visit re-evaluates live state; results are
   *never* persisted as rows (no stale checklists). The latest summary is
   stamped on the run (`readiness_snapshot`, `blocking_issue_count`,
   `warning_count`); full results freeze into the manifest at close.
   A regression on a `ready_to_close` run **revokes** readiness and
   clears review/approval marks.
3. **Warnings** — waivable checks require explicit acknowledgement with
   a note (policy `require_ack_note`); acknowledgements freeze once the
   run closes.
4. **Packages / exports** — generated as versioned artifacts; the close
   finalizes exactly one executive package version and links the export
   versions listed in the manifest.
5. **Review → approval** — separation of duties fails closed:
   approver ≠ initiator unless `organization_close_policies.
   allow_self_approval = true` (enforced in the action AND the RPC).
6. **Execute** — a single all-or-nothing SECURITY DEFINER transaction
   that re-validates every race-sensitive blocker, freezes the manifest,
   flips the period to `closed` (GUC-gated), and marks the run closed.
7. **Reopen** (`period_close:reopen`, platform admin only) — the prior
   close is preserved and superseded, its packages/exports marked
   superseded, the period returns to `open`, and a new `close_review`
   cycle is created with `close_version + 1`.

## Period status model (preserved)

`reporting_periods.status` keeps its Phase 2 values
(`draft/open/closed/locked`). The fine-grained close lifecycle lives on
`period_close_runs.status`. Transitions into/out of `closed` are possible
**only** inside the close RPCs via the transaction-local GUC
`app.period_close_op` — which the RPCs clear immediately after use
(migration 21) so the bypass never outlives its statement.

## Documented deviations

- Readiness checks are computed, not persisted (`period_close_checks`
  table dropped from the proposed model).
- Approvals are run columns + append-only events + audit rows (no
  separate approvals table).
- Export manifests are folded into `close_exports` rows.
- No storage bucket: exports regenerate deterministically from frozen
  sources and downloads verify the recorded sha256 (see
  EXPORT_MANIFEST.md).
- `period_close:void` authority is folded into `period_close:review`
  (only unfinalized runs are voidable).

Related: PERIOD_CLOSE_STATE_MACHINE.md, PERIOD_CLOSE_READINESS.md,
CLOSE_MANIFEST.md, REPORT_PACKAGE_ARCHITECTURE.md, ACCOUNTING_EXPORTS.md,
POST_CLOSE_CHANGE_GUARDS.md.
