# Custom Dashboards

Governed dashboard builder — migration 31, `src/lib/analytics/dashboards/`,
`/analytics/dashboards`.

## Configuration only

A dashboard is configuration: name, sharing scope, ordered widgets.
Widgets reference **existing governed objects** — catalog metric ids,
analytics query kinds, saved goals, approved benchmarks, internal app
paths. The widget schema (`widgets.ts`, zod, `.strict()`) is closed:

metric · comparison · trend · breakdown_table · breakdown_chart ·
goal_progress · benchmark_comparison · scorecard · cohort_table ·
cohort_heatmap · readiness · executive_summary · operational_alert ·
text_note · report_link

**No formula editor, no raw SQL widget, no arbitrary JavaScript, no
direct table-query widget.** The database CHECK on `widget_type` is the
floor; the zod schema validates configs on every write AND on every
render — an invalid stored config renders unavailable with the reason.
Report links accept internal app paths only.

## Rendering never bypasses permissions

`render.ts` resolves each widget **per viewer** through the analytics
service (metrics/comparisons/trends), goal-progress derivation, and
RLS-guarded reads (goals/benchmarks). A shared dashboard shows a viewer
exactly what their own role can read — inaccessible references render
"unavailable" with a reason. No aggregate implies access to unauthorized
row detail.

## Lifecycle and sharing

States: `draft | active | archived`. Sharing scopes:
`personal | department | organization`.

- Everyone with `dashboard:create` builds **personal** dashboards
  (trainers included).
- Department sharing requires `dashboard:share_department`; department
  -scoped roles can only share into their own departments
  (trigger-enforced at insert AND update).
- Organization sharing requires `dashboard:share_organization`.
- Duplicates are always personal copies — **sharing never travels with a
  copy**.
- Archive, don't destroy: report packages reference `dashboard_id`
  (migration 32) and deletes don't exist. Archived dashboards freeze and
  can be restored by their owner.
- Ownership and organization are immutable; every create / share /
  default / archive / denial writes an audit event.

## Defaults

`analytics_dashboard_defaults`: one **personal** default per member per
org (self-managed) and one **organization** default
(`dashboard:set_default`), enforced by partial unique indexes.

## RLS summary (live-verified)

Owners see and edit their own dashboards; org-shared dashboards are
visible to `analytics:read` holders; department-shared dashboards to
that department's members (and org-read roles); widgets/sections follow
their dashboard's visibility with owner-only writes; cross-organization
access denied throughout.
