# Saved Report Views

Phase 6 introduced personal saved views; Phase 7 completes sharing,
defaults, and auto-apply.

## Sharing scopes

`saved_views.shared_scope`: `personal` (default), `organization`,
`department` (requires `department_id`). Constraints force an
`organization_id` on any non-personal view.

- **Visibility** (RLS `saved_views_select`): owner always; org-shared →
  members with `report:read` in that org; department-shared →
  additionally `app.can_access_department`.
- **Sharing authority**: only the OWNER changes a view's scope, and any
  non-personal scope requires `saved_report:share` (platform/workspace
  admin, payroll manager). Trainers can never share org-wide — enforced
  in RLS and re-checked in the `shareSavedView` action.
- Scope changes reset `is_default` (a personal default should not
  silently become the org default).

## Defaults and auto-apply

Partial unique indexes allow ONE default per scope target: per
owner+page (personal), per org+page (organization), per
org+department+page (department). `setDefaultView` clears the previous
default for the same target before setting the new one.

Auto-apply (Reports page): when no reporting period is selected, the
page looks up the actor's personal default first, then the organization
default, and applies the stored `reportingPeriodId` **only if that
period still exists in the current organization** (validated against
`getPeriodContext` options — stale or cross-org configs fall through to
the period prompt, fail-safe). The header notes which default was
applied. `last_used_at` records usage.

## UI

`/reports?tab=saved` lists personal + organization-shared views with
scope/default/owner chips and owner attribution; sharing and default
controls render per row (`SavedViewSharingControls`), with
rename/pin/delete restricted to the owner.

Verified by live SQL section 16 (policy enforcement, default
uniqueness, outsider denial) and the live operations/close e2e specs.
