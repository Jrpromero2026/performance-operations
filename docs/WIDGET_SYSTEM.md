# Widget System

`src/components/widgets/` — the reusable dashboard primitives. Widgets are
presentational: they receive engine results / derived data as props and
NEVER calculate metrics or issue queries.

| Widget | File | Purpose |
| --- | --- | --- |
| `DashboardGrid` | section.tsx | Responsive widget grid (2/3/4 columns) |
| `SectionHeader` | section.tsx | Section title + optional deep link |
| `Widget` | section.tsx | Card shell with title row + action slot |
| `WidgetEmpty` | section.tsx | Reasoned empty state (no silent blanks) |
| `MetricCard` | metric-card.tsx | THE metric tile: value, unit formatting, health badge, first reason/warning; `data-metric`/`data-health` attributes for testing |
| `ReadinessCard` | readiness-card.tsx | Readiness scorecard: %, progress bar, health badge, deep link per gap |
| `AlertListCard` | alert-list.tsx | Operational alerts with severity, detail, recommended action, deep link |
| `ListCard` | list-card.tsx | Generic label/status/value rows with links (payroll runs, import batches, shortcuts) |
| `TimelineCard` | timeline-card.tsx | Audit-backed activity feed |
| `SummaryCard` | summary-card.tsx | Executive summary items verbatim |
| `TrendIndicator` | trend-indicator.tsx | Signed change (▲/▼/→ with % of previous) |
| `StatusBadge` | ui/status-badge.tsx (Phase 1) | Status pill — reused, not duplicated |
| `KpiCard` | ui/kpi-card.tsx (Phase 1) | Honest placeholder tile (offline fallback) |

Contract of every data widget:

- **Inputs**: title, engine results (metric ids resolved by the PAGE via
  the session), optional actions/links, test id.
- **Health**: `MetricResult.health` renders as a badge with the engine's
  reason; `healthy` values render clean.
- **Empty**: `WidgetEmpty` with a human reason ("No active payroll runs…").
- **Error**: server components fail the request loudly (no fake fallback
  values); notification/save actions surface `ActionState.error` inline.
- **Loading**: server-rendered (no client fetch waterfalls); client
  islands (palette, bell, forms) show pending states on their buttons.

Consumers today: `/overview`, `/departments/[id]`, trainer profile,
`/reports` (quick report + saved views + exports). Adding a dashboard
means composing these widgets around an `IntelligenceSession` — nothing
else.
