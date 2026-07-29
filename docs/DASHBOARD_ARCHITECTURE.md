# Dashboard Architecture

## Data flow

```
request → app shell (workspace + period, validated cookies)
        → loadOperationsSnapshot(actor, org, period)   [ONE batched load]
            ├─ pipeline states (payroll runs, import batches, audit, unread)
            ├─ IntelligenceSession.create(...)          [ONE dataset load]
            │    └─ readiness metrics (engine)
            └─ deriveAlerts(readiness + states)         [pure]
        → page composes WIDGETS from the snapshot/session
        → widgets render engine results verbatim
```

Rules enforced across every dashboard:

1. **No dashboard-specific SQL.** Pages read from `loadOperationsSnapshot`
   and `IntelligenceSession` only; the loader and the intelligence
   datasets module are the only query sites.
2. **No calculations in the UI.** `format.ts` converts units for display
   (cents→$, bp→%, minutes→h); everything else arrives computed with a
   health state.
3. **No duplicate requests.** One session per page; widgets receive
   results as props. Breakdowns/trends reuse the session's pooled facts.
4. **Role awareness = capability gating + service narrowing.** Pages gate
   SECTIONS on permissions; the service narrows SCOPE (org/departments/
   self); RLS enforces ROWS. Three layers, one behavior.
5. **Honest states.** Widgets have explicit empty/loading(skeleton via
   Suspense-ready server rendering)/health/error presentations; a missing
   pipeline shows "waiting for imports/payroll", never zero.

## Pages and their snapshots

- `/overview`: full snapshot (session + pipeline + alerts + timeline).
- `/departments/[id]`: session only, department scope; trends via
  `getTrend` (weekly) with previous-period comparison.
- Trainer profile performance section: session only, trainer scope.
- `/reports`: session only (quick report tab) + saved_views/export tables
  for their tabs.
- `/notifications`: recipient-scoped notification rows only.

## Persistence added in Phase 6 (migration 18)

- `notifications` — in-app notification store (content immutable;
  recipient controls read/pin/archive).
- `saved_views` — per-user saved reports/filters (pin/rename/delete;
  sharing is a declared future placeholder).
- `export_events` — audited export history (actor, time, format, engine
  version, source page).

Nothing duplicates appointment or payroll data; dashboards remain
compute-on-read over the canonical stores.
