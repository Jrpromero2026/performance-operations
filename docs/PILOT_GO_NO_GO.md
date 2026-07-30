# Pilot Go / No-Go

Internal pilot readiness assessment — 2026-07-30.

1. **Executive status**: the platform is software-ready for the internal
   pilot. No code defects blocking pilot use were found; every blocker
   is a configuration or owner-decision item. **Zero code changes were
   required in this engagement** (deliverables are documents, one
   owner-triggered seed script, and sandbox data hygiene).
2. **Baseline commit**: `a422470` (Phase 9 complete).
3. **Final commit**: see git log — this engagement adds docs +
   `supabase/pilot/seed-pilot-organizations.sql` only; no `src/`,
   migration, or test changes.
4. **Audit findings**: 8 (full detail in
   [PILOT_READINESS_AUDIT.md](PILOT_READINESS_AUDIT.md)): 1 BLOCKER
   (F-1 fixture-only data → resolved by the Option 2 pilot-org path),
   3 MAJOR (F-2 self-approval decision, F-3 test-mode email
   expectation, F-4 unconfigured payroll rules — all owner
   decisions/inputs, none code defects), 3 MINOR (F-5 placeholder
   routes, F-6 sandbox strays — cleaned, F-8 no org-create UI),
   1 COSMETIC (F-7 phase chips).
5. **Blockers fixed**: F-1 mitigated — pilot seed script prepared
   (execution awaits JR's name confirmation).
6. **Major issues fixed**: none required code; F-2/F-3/F-4 are recorded
   owner decisions in [PILOT_INPUTS_REQUIRED.md](PILOT_INPUTS_REQUIRED.md).
7. **Remaining minor**: F-5 (placeholder `/revenue`, `/clients` — NOT
   REQUIRED FOR PILOT), F-8 (org creation by seed only).
8. **Remaining cosmetic**: F-7 (dev-phase chips in empty states).
9. **Recommended pilot environment**: **Option 2** — two new "(Pilot)"
   organizations in `performance-operations-dev`; sandbox orgs stay as
   test fixtures (evidence in
   [PILOT_CONFIGURATION_INVENTORY.md](PILOT_CONFIGURATION_INVENTORY.md)).
10. **Timberhill readiness**: structure ready; requires roster,
    services + aliases, confirmed commission ladder (incl. the
    cliff-vs-marginal decision U1c), periods, approval policy.
11. **G3 readiness**: structure ready; requires name confirmation,
    roster, services (incl. Initial Performance Evaluation), package
    decisions, coach payout model, multi-coach rule, periods.
12. **Import readiness**: READY — Setmore adapter verified; Acuity/
    manual CSV column mapping verified; duplicate/reversal governance
    e2e-tested; runbook written.
13. **Payroll readiness**: engine READY (regression green incl.
    dependency guards); READY WITH CONFIGURATION for real use; first
    run governed by [FIRST_PAYROLL_VALIDATION.md](FIRST_PAYROLL_VALIDATION.md).
14. **Reporting readiness**: READY (Operations Center, Reports,
    Analytics/scorecards/presentation all live-verified same-week).
15. **Close readiness**: READY WITH CONFIGURATION (approval policy
    decision required for a single-operator close).
16. **Data contamination risk**: LOW under Option 2 — synthetic data is
    org-isolated (RLS live-verified); residual risk is platform-admin
    "All Workspaces" views showing sandbox + pilot orgs side by side
    (mitigated by "(Pilot)" naming).
17. **Owner actions required**: confirm pilot org names → run seed;
    change bootstrap password; enter all PILOT_INPUTS_REQUIRED items;
    decide self-approval policy; export historical source files; run
    the first-payroll validation.
18. **External credentials required**: none for the pilot (CSV path).
    Setmore/Acuity API and a real email provider remain optional,
    honestly-blocked upgrades.
19. **Test results (this engagement's runs)**: lint 0 errors (1
    pre-existing TanStack warning) · typecheck clean · unit **411/411**
    · offline Playwright **24/24** · live Playwright **82/82** ·
    build clean (85 routes) · 0 failed, 0 skipped.
20. **Security results**: fresh RLS spot-check passed (all public
    tables RLS-enabled; stranger sessions see zero rows in goals/
    appointments/payroll/dashboards; completed-goal immutability
    enforced); full live SQL suites (phases 3/4/7/8/9) last executed
    2026-07-30 against this identical schema — ALL PASSED; migrations
    1–32 unchanged since. Committed-secrets scan clean; `.env.local`
    untracked.
21. **Git status**: working tree clean after the docs commit; branch
    `main`; no deployment.
22. **Verdict: CONDITIONAL GO.** The software is ready for internal
    pilot use today. Conditions JR must complete, in order:
    1. Confirm pilot organization names → seed script runs.
    2. Change the bootstrap admin password.
    3. Enter Timberhill configuration (roster, services, confirmed
       commission ladder + tier behavior, periods).
    4. Decide the close approval / self-approval policy per org.
    5. Complete the Timberhill first-payroll validation to GO criteria
       before approving any real payroll or closing any period.
    6. Repeat 3–5 for G3 (name, catalog, payout model, multi-coach
       rule) before its first payroll.

    Not production-ready: production configuration, real-data
    validation, provider credentials, and deployment have not occurred
    and are out of scope here.
