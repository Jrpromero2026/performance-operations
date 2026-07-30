-- ============================================================================
-- Performance Operations — Phase 9, Migration 28: analytics permissions
--
-- Permission catalog for the analytics/BI layer (scorecards, goals,
-- benchmarks, dashboards, cohorts, presentation, dataset exports).
-- Additive only: no existing permission or grant changes. Tables follow
-- in later Phase 9 migrations; permissions land first so every RLS
-- policy those migrations create can reference them.
-- ============================================================================

insert into public.permissions (key, description) values
  ('analytics:read',          'View analytics surfaces (scope narrowed per metric by the engine)'),
  ('analytics:compare',       'Run multi-period and cross-scope comparisons'),
  ('analytics:export',        'Export analytics views and presentation artifacts'),
  ('analytics:presentation',  'Use presentation mode and board packages'),
  ('analytics_dataset:export','Export governed forecast-ready historical datasets'),
  ('dashboard:create',        'Create personal analytics dashboards'),
  ('dashboard:update',        'Update own analytics dashboards'),
  ('dashboard:share_department',   'Share dashboards within authorized departments'),
  ('dashboard:share_organization', 'Share dashboards organization-wide'),
  ('dashboard:set_default',   'Set organization or department default dashboards'),
  ('scorecard:manage',        'Manage scorecard definitions'),
  ('goal:read',               'View performance goals in scope'),
  ('goal:create',             'Create performance goals in scope'),
  ('goal:update',             'Update draft or active goals in scope'),
  ('goal:approve',            'Approve, activate, and complete goals'),
  ('goal:archive',            'Archive or cancel goals'),
  ('benchmark:read',          'View benchmarks in scope'),
  ('benchmark:create',        'Create benchmark definitions and values'),
  ('benchmark:approve',       'Approve benchmarks for display'),
  ('benchmark:archive',       'Deprecate or archive benchmarks'),
  ('cohort:read',             'View client cohort analytics (privacy-suppressed)')
on conflict (key) do nothing;

-- Role matrix (documented in docs/ANALYTICS_SECURITY.md and
-- docs/AUTHORIZATION_MODEL.md):
--   platform_admin     → everything (platform-wide)
--   workspace_admin    → full analytics governance for the organization
--   payroll_manager    → payroll analytics + org summaries + dataset export;
--                        no cohort client detail, no presentation governance
--   department_manager → department analytics, department goals,
--                        department dashboards + sharing, department cohorts
--   trainer            → own scorecard/goals, personal dashboards
--   viewer             → read-only analytics when granted membership
with grants(role_key, permission_key) as (
  values
  ('platform_admin','analytics:read'),('platform_admin','analytics:compare'),
  ('platform_admin','analytics:export'),('platform_admin','analytics:presentation'),
  ('platform_admin','analytics_dataset:export'),
  ('platform_admin','dashboard:create'),('platform_admin','dashboard:update'),
  ('platform_admin','dashboard:share_department'),('platform_admin','dashboard:share_organization'),
  ('platform_admin','dashboard:set_default'),('platform_admin','scorecard:manage'),
  ('platform_admin','goal:read'),('platform_admin','goal:create'),
  ('platform_admin','goal:update'),('platform_admin','goal:approve'),
  ('platform_admin','goal:archive'),
  ('platform_admin','benchmark:read'),('platform_admin','benchmark:create'),
  ('platform_admin','benchmark:approve'),('platform_admin','benchmark:archive'),
  ('platform_admin','cohort:read'),

  ('workspace_admin','analytics:read'),('workspace_admin','analytics:compare'),
  ('workspace_admin','analytics:export'),('workspace_admin','analytics:presentation'),
  ('workspace_admin','analytics_dataset:export'),
  ('workspace_admin','dashboard:create'),('workspace_admin','dashboard:update'),
  ('workspace_admin','dashboard:share_department'),('workspace_admin','dashboard:share_organization'),
  ('workspace_admin','dashboard:set_default'),('workspace_admin','scorecard:manage'),
  ('workspace_admin','goal:read'),('workspace_admin','goal:create'),
  ('workspace_admin','goal:update'),('workspace_admin','goal:approve'),
  ('workspace_admin','goal:archive'),
  ('workspace_admin','benchmark:read'),('workspace_admin','benchmark:create'),
  ('workspace_admin','benchmark:approve'),('workspace_admin','benchmark:archive'),
  ('workspace_admin','cohort:read'),

  ('payroll_manager','analytics:read'),('payroll_manager','analytics:compare'),
  ('payroll_manager','analytics:export'),('payroll_manager','analytics_dataset:export'),
  ('payroll_manager','dashboard:create'),('payroll_manager','dashboard:update'),
  ('payroll_manager','goal:read'),('payroll_manager','benchmark:read'),

  ('department_manager','analytics:read'),('department_manager','analytics:compare'),
  ('department_manager','dashboard:create'),('department_manager','dashboard:update'),
  ('department_manager','dashboard:share_department'),
  ('department_manager','goal:read'),('department_manager','goal:create'),
  ('department_manager','goal:update'),
  ('department_manager','benchmark:read'),('department_manager','cohort:read'),

  ('trainer','analytics:read'),('trainer','goal:read'),
  ('trainer','dashboard:create'),('trainer','dashboard:update'),

  ('viewer','analytics:read')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.key = g.role_key
join public.permissions p on p.key = g.permission_key
on conflict do nothing;
