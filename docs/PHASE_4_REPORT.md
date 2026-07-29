# Phase 4 Report — Payroll Engine

Date: 2026-07-29 · Project: `performance-operations-dev`
(yoolmtleaezprjmfasku) · Engine version: `calc-v1`

## Business rules & evidence

1. **Real payroll evidence inspected before any rule was encoded**: twelve
   Timberhill monthly "Personal Training Payroll Tracker" PDF exports and
   the real `G3 Payroll (7-11_7-24).pdf` biweekly workbook, read locally in
   gitignored `business-inputs/`. No identifiable amounts were committed,
   printed, or recorded anywhere.
2. **G3 confirmed rules** recorded in
   `docs/business-rules/g3-payroll-observed.md`: biweekly period, PT
   variable split 50–70% by trainer tier, S&C fixed 60% of "Acuity Approved
   Value", flat-rate services, approved hourly work, adjustments with
   reason + approver, category-subtotal final pay, **no revenue-tier
   ladder**.
3. **Timberhill limits honestly documented**
   (`timberhill-payroll-observed.md`): the exports contain only summary
   sheets; per-trainer derivation, cancellation/no-show pay, PACK/Nutrition
   compensation, and cliff-vs-marginal (U1c) remain OPEN with the exact
   owner inputs needed to unblock.
4. **20-item intake checklist** (`payroll-rule-gaps.md`) marks every rule
   confirmed / structure-only / blocked, and states the engine policy: no
   ❌/🟡 item is encoded.
5. **Fail-closed policy enforced in code, not prose**: percentage/tier
   rules must declare basis type, eligible statuses, and rounding scope or
   the affected lines become blocking 0¢ lines. Neither organization's
   official plans are seeded; nothing is claimed production-validated.
6. **Spreadsheet formulas treated as evidence**: observed G3 rounding
   inconsistencies (implied sub-cent rates) and the hybrid-line question
   are recorded as open confirmations, not silently replicated.

## Data model & state machine (migrations 14–17, applied live)

7. Complete payroll domain: runs, run events, trainer summaries,
   calculation lines, issues, manual time entries, adjustments, snapshots,
   exports, and multi-trainer appointment assignments — additive to all
   prior migrations.
8. Run lifecycle enforced by a database trigger with the full matrix
   (draft→calculating→needs_review→ready_for_approval→approved→posted→
   locked, plus reopened/superseded/failed/voided); invalid jumps raise at
   the DB level regardless of application code.
9. One active run per organization + period via partial unique index
   (superseded/voided/failed excluded); verified live (unique_violation).
10. Calculation lines freeze when the run leaves mutable states —
    update AND delete blocked by trigger; verified against a posted run.
11. Approved adjustments freeze amount/type/trainer; included
    time/adjustments are immutable while their run is frozen; both
    verified live.
12. Posting RPC writes a **versioned snapshot** with sha256 over ordered
    `line_id:amount` pairs; snapshots have no user write policies and
    survive reopening (history per posting cycle).
13. Two real defects were caught by verification and fixed **additively**:
    migration 16 (reopen clears posting/locking marks so re-posting is
    possible; events/snapshots/audit keep the history) and migration 17
    (trainer self-scope needed a security-definer status helper — the
    plain EXISTS was RLS-filtered to never grant).

## Calculation engine

14. Pure, deterministic, versioned engine (`src/lib/payroll/engine.ts`):
    identical inputs produce identical results; input order is irrelevant
    (unit-tested with shuffled inputs).
15. Integer-rational rounding module with six methods
    (half_away_from_zero default, half_up, half_even, floor, ceiling,
    truncate) — no floats near money; negative-value behavior tested.
16. Rounding scope per plan version: per_line, or per_trainer where the
    trainer total equals round(Σ exact) with the last percentage line
    absorbing the difference (trace-documented; unit-tested 1502 vs 1503).
17. Structured eligibility criteria (fields × operators, AND semantics)
    that fail closed on malformed input; revenue rules must positively
    constrain canonical_status — unresolved cancellation/no-show policy
    can never pay implicitly.
18. Typed per-method evaluators — flat, hourly (with per-participant
    compensated-minute overrides), percentage-of-basis, tiered commission,
    team roles, evaluation bonus — plus engine-level manual time and
    signed adjustments. No giant untyped rule interpreter exists.
19. **Cliff AND marginal tier engines** implemented and unit-proven to
    differ on identical inputs (600000¢ basis → 300000 cliff vs 250000
    marginal); tier gaps block; marginal slices sum exactly and round
    once.
20. Multi-trainer sessions: explicit role assignments (primary,
    head/assistant coach compensated; observer/non_compensated never;
    unknown roles blocked), coach roles resolved against team_training
    purpose plans, flat or percentage role rates.
21. Every line carries a transparent JSON trace (version, method, steps
    with values) including exclusions and reconciliation adjustments;
    traces are visible in the UI only with
    `payroll:view_calculation_trace`.
22. Per-trainer and per-run totals reconcile exactly with the line sums; a
    mismatch throws and fails the run rather than presenting wrong
    totals (engine self-check + unit tests).
23. Compensation basis is explicit per rule (`source_listed_amount` /
    `source_paid_amount`); missing basis amounts on imported rows block
    the specific line with the appointment identified.
24. Late-arriving appointments: cutoff frozen at first calculation,
    late rows surfaced as a warning with an explicit audited
    "recalculate with refreshed cutoff" path.

## Workflows

25. Run creation (org + non-locked period + name) with friendly handling
    of the one-active-run constraint.
26. Calculation loads only canonical ledger data (never staging tables),
    chunks all writes at 500 rows, keeps recalculation stable (included
    time/adjustments released and re-included), and records sanitized
    failure codes on error — no partial results presented as complete.
27. Structured review: per-trainer review marks, issues panel with
    severity, reasoned resolve/acknowledge (blocking issues cannot be
    acknowledged), run counters kept honest.
28. Submission requires zero open blocking issues AND all trainers
    reviewed; approval records identity; return-to-review requires a
    reason and clears approval.
29. Posting/locking/reopening/voiding/supersession run as security-definer
    RPCs that re-validate permission and state inside the transaction;
    supersession atomically creates the linked replacement draft and flags
    prior exports.
30. Manual time entries: draft→submitted→approved(minutes may be adjusted
    at approval)→included lifecycle with rejection reasons, voiding rules,
    and period-boundary validation; trainers submit their own only.
31. Adjustments: typed (bonus/deduction/correction/reimbursement/
    carry_forward/other), positive amounts with sign-by-type, mandatory
    reasons, optional supporting reference, independent approval;
    corrections after approval are new adjustments by design.
32. Separation of duties enforced: no self-approval of time or
    adjustments; reopening posted payroll is platform-admin only;
    lock/void are admin-tier.

## UI

33. `/payroll` run list with status filter and per-status badges; trainers
    without `payroll:read` get a self-service list of their own
    posted/locked statements instead.
34. `/payroll/new`, `/payroll/[runId]` (totals, lifecycle actions gated by
    permission × status, snapshot list with hashes, full event history),
    `/payroll/[runId]/review` (issues + per-trainer line tables with
    expandable traces), `/payroll/[runId]/statements` (+ per-trainer
    printable statement), `/payroll/time`, `/payroll/adjustments`.
35. Import batch page surfaces payroll dependencies BEFORE reversal (runs
    linked by name/status) and hides the reverse action while protected.
36. Statements/exports: department summary + trainer statements with
    category totals, DRAFT banners until posted, print/save-PDF view,
    CSV route handlers for both levels, export events recorded with
    snapshot versions. XLSX judged not practical this phase (CSV covers
    it); PDF via browser print by design.
37. **Masked client references everywhere**: statements, CSVs, and traces
    identify sessions by date/time and service only.
38. Every payroll surface shows explicit empty/blocked states; no
    fabricated numbers anywhere (charter rule upheld).

## Security

39. 10 new permissions granted per role exactly as documented
    (payroll_manager: everything except lock/void/reopen; trainer:
    manage_time + read_self); TS catalog mirrors the DB and is
    unit-tested.
40. RLS enabled + FORCED on all ten payroll tables, org-scoped; snapshots
    are RPC-only; trainer self-scope requires posted/locked runs
    (migration 17) — verified live from four principals.
41. Cross-organization denial verified live (outsider sees zero runs,
    summaries, lines, snapshots); unauthorized posting/reopening rejected
    at the RPC layer.
42. Full audit trail: creation, calculation, issue resolutions, approval,
    posting (with snapshot version), locking, reopening, voiding,
    supersession, exports, assignment changes — all with actor identity;
    failure messages sanitized.
43. Supabase security advisors: no new findings for the payroll schema
    (only the pre-existing auth dashboard setting documented since
    Phase 2).

## Dependency guards (Phase 3 obligation)

44. Material appointment mutations are DB-blocked while approved/posted/
    locked payroll references the appointment
    (`appointment_protected_by_payroll`); non-material fields stay
    editable.
45. `app.reverse_import_batch` redefined **additively** (applied Phase 3
    migrations untouched): reversal fails closed with
    `payroll_dependency_exists:<run ids>` and a remediation hint;
    `payroll_dependencies_for_batch` powers the UI warning. Reopen or
    supersession releases the guard — the full cycle verified in BOTH the
    live SQL suite and the browser workflow.

## Testing & verification

46. **164 unit tests** (11 files) including 39 new payroll tests:
    rounding methods incl. negatives/ties, eligibility fail-closed
    matrix, every evaluator, cliff-vs-marginal divergence, tier gaps,
    rounding scopes, multi-trainer roles, adjustment signs, determinism
    under input shuffle, totals reconciliation.
47. **Live SQL suite** `tests/rls/phase4-live-checks.sql`: 23 steps,
    executed against the dev project (impersonation, rolled back) — all
    passed after catching the two defects fixed by migrations 16–17.
48. **Live Playwright workflow** (`e2e/live-payroll.spec.ts`, 10 serial
    tests, run-unique data, self-cleaning): import → run → calculate
    (50% split verified to the cent, cancelled session excluded) → review
    with traces → submit → approve → post (hashed snapshot) → statements
    + CSV download → dependency guard block → lock → supersede → void →
    reversal released. Full suites green: **36 offline e2e, 32 live e2e**;
    typecheck, lint, and production build clean. (Time/adjustment
    approval is exercised in unit + SQL tests; the e2e suite runs as one
    admin and self-approval is correctly rejected.)
49. E2E prerequisites documented and seeded via MCP (trainer "Payton E2E
    Payroll", plan "E2E Payroll 50% Split", period "E2E Payroll Window",
    service "E2E Signature 60"); synthetic run artifacts cleaned from the
    dev database after verification.

## Boundaries & next

50. Out of scope honored: no KPI calculations, no tax/net-pay logic, no
    external integrations, no deployment. **Blocked on owner inputs**
    (see business-rules docs): Timberhill per-trainer rules + U1c,
    per-trainer G3 tier percentages and rates, cancellation/no-show and
    package/nutrition policies, rounding-scope confirmations. Suggested
    Phase 5: reporting/KPIs on top of posted payroll + the revenue
    recognition layer, once those confirmations land.

## Commits (Phase 4)

| Commit | Content |
| --- | --- |
| 61ad257 | docs: record observed payroll rules and intake gaps |
| 65bf213 | feat: payroll data model and state machine (M14–15) |
| c96be13 | feat: calculation engine with typed evaluators and traces |
| 8a3fdfe | feat: run orchestration, manual time, adjustments |
| eb593d1 | feat: payroll UI, statements, CSV exports |
| 869bd86 | test: live SQL checks + fix migrations 16–17 |
| e7c6935 | test: live payroll e2e + self-join link fix |
| (this) | docs: Phase 4 documentation and report |
