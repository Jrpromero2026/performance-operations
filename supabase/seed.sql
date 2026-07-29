-- ============================================================================
-- Performance Operations — Seed data
-- Organizations, departments, roles, and permissions ONLY.
-- No financial data, no fake users, no fake trainers. Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Organizations
-- ----------------------------------------------------------------------------
insert into public.organizations (slug, name, timezone) values
  ('timberhill-athletic-club', 'Timberhill Athletic Club', 'America/Los_Angeles'),
  ('g3-sports-fitness',        'G3 Sports & Fitness',      'America/Los_Angeles')
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Departments
-- ----------------------------------------------------------------------------
insert into public.departments (organization_id, name)
select o.id, d.name
from public.organizations o
join (values
  ('timberhill-athletic-club', 'Personal Training'),
  ('timberhill-athletic-club', 'PACK Training'),
  ('timberhill-athletic-club', 'Nutrition Coaching'),
  ('g3-sports-fitness',        'Athlete Performance'),
  ('g3-sports-fitness',        'Adult Human Performance'),
  ('g3-sports-fitness',        'Tactical Performance'),
  ('g3-sports-fitness',        'Team Performance'),
  ('g3-sports-fitness',        'Performance Evaluations'),
  ('g3-sports-fitness',        'G3 Volleyball')
) as d(org_slug, name) on d.org_slug = o.slug
on conflict (organization_id, name) do nothing;

-- ----------------------------------------------------------------------------
-- Roles
-- ----------------------------------------------------------------------------
insert into public.roles (key, name, description, department_scoped) values
  ('platform_admin',     'Platform Admin',     'Full access across all organizations; platform configuration; payroll approval; audit access.', false),
  ('workspace_admin',    'Workspace Admin',    'Full access to assigned organizations: trainers, departments, services, imports, payroll, reports.', false),
  ('payroll_manager',    'Payroll Manager',    'Reviews imports; calculates, approves, and exports payroll; creates adjustments.', false),
  ('department_manager', 'Department Manager', 'Manages assigned departments; views trainers, appointments, and KPIs.', true),
  ('trainer',            'Trainer',            'Views own scorecard and payroll statements only.', false),
  ('viewer',             'Viewer',             'Read-only access to approved dashboards and reports.', false)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('org:read',            'View organization details'),
  ('org:read_all',        'View all organizations (All Workspaces)'),
  ('org:manage',          'Manage organization settings and locations'),
  ('org:create',          'Create new organizations'),
  ('department:read',     'View departments'),
  ('department:manage',   'Create and manage departments'),
  ('trainer:read',        'View trainers in accessible scope'),
  ('trainer:read_self',   'View own trainer identity and records'),
  ('trainer:manage',      'Manage trainers and their assignments'),
  ('client:read',         'View clients'),
  ('client:manage',       'Manage clients'),
  ('service:read',        'View services'),
  ('service:manage',      'Manage services'),
  ('import:read',         'View imports'),
  ('import:manage',       'Upload and process imports'),
  ('import:approve',      'Approve and post imports'),
  ('payroll:read',        'View payroll runs'),
  ('payroll:read_self',   'View own payroll statements'),
  ('payroll:calculate',   'Calculate payroll'),
  ('payroll:approve',     'Approve payroll'),
  ('payroll:export',      'Export payroll'),
  ('payroll:adjust',      'Create payroll adjustments'),
  ('payroll:reopen',      'Reopen locked payroll periods'),
  ('period:read',         'View reporting periods'),
  ('period:manage',       'Create and manage reporting periods'),
  ('report:read',         'View approved reports and dashboards'),
  ('report:manage',       'Create and manage reports'),
  ('audit:read',          'View audit logs for accessible organizations'),
  ('audit:read_all',      'View all audit logs platform-wide'),
  ('compensation:read',   'View compensation plans'),
  ('compensation:manage', 'Configure compensation plans'),
  ('member:read',         'View organization members'),
  ('member:manage',       'Manage organization members and roles')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Role → permission grants
-- Deny by default: only the grants listed here exist.
-- Keep this mapping in sync with src/lib/authz/permissions.ts.
-- ----------------------------------------------------------------------------
with grants(role_key, permission_key) as (
  values
  -- platform_admin: every permission
  ('platform_admin', 'org:read'), ('platform_admin', 'org:read_all'),
  ('platform_admin', 'org:manage'), ('platform_admin', 'org:create'),
  ('platform_admin', 'department:read'), ('platform_admin', 'department:manage'),
  ('platform_admin', 'trainer:read'), ('platform_admin', 'trainer:read_self'),
  ('platform_admin', 'trainer:manage'),
  ('platform_admin', 'client:read'), ('platform_admin', 'client:manage'),
  ('platform_admin', 'service:read'), ('platform_admin', 'service:manage'),
  ('platform_admin', 'import:read'), ('platform_admin', 'import:manage'),
  ('platform_admin', 'import:approve'),
  ('platform_admin', 'payroll:read'), ('platform_admin', 'payroll:read_self'),
  ('platform_admin', 'payroll:calculate'), ('platform_admin', 'payroll:approve'),
  ('platform_admin', 'payroll:export'), ('platform_admin', 'payroll:adjust'),
  ('platform_admin', 'payroll:reopen'),
  ('platform_admin', 'period:read'), ('platform_admin', 'period:manage'),
  ('platform_admin', 'report:read'), ('platform_admin', 'report:manage'),
  ('platform_admin', 'audit:read'), ('platform_admin', 'audit:read_all'),
  ('platform_admin', 'compensation:read'), ('platform_admin', 'compensation:manage'),
  ('platform_admin', 'member:read'), ('platform_admin', 'member:manage'),

  -- workspace_admin: full control of assigned organizations
  ('workspace_admin', 'org:read'), ('workspace_admin', 'org:manage'),
  ('workspace_admin', 'department:read'), ('workspace_admin', 'department:manage'),
  ('workspace_admin', 'trainer:read'), ('workspace_admin', 'trainer:manage'),
  ('workspace_admin', 'client:read'), ('workspace_admin', 'client:manage'),
  ('workspace_admin', 'service:read'), ('workspace_admin', 'service:manage'),
  ('workspace_admin', 'import:read'), ('workspace_admin', 'import:manage'),
  ('workspace_admin', 'import:approve'),
  ('workspace_admin', 'payroll:read'), ('workspace_admin', 'payroll:calculate'),
  ('workspace_admin', 'payroll:approve'), ('workspace_admin', 'payroll:export'),
  ('workspace_admin', 'payroll:adjust'),
  ('workspace_admin', 'period:read'), ('workspace_admin', 'period:manage'),
  ('workspace_admin', 'report:read'), ('workspace_admin', 'report:manage'),
  ('workspace_admin', 'audit:read'),
  ('workspace_admin', 'compensation:read'), ('workspace_admin', 'compensation:manage'),
  ('workspace_admin', 'member:read'), ('workspace_admin', 'member:manage'),

  -- payroll_manager: imports + payroll, no platform-wide settings
  ('payroll_manager', 'org:read'),
  ('payroll_manager', 'department:read'),
  ('payroll_manager', 'trainer:read'),
  ('payroll_manager', 'client:read'),
  ('payroll_manager', 'service:read'),
  ('payroll_manager', 'import:read'), ('payroll_manager', 'import:manage'),
  ('payroll_manager', 'import:approve'),
  ('payroll_manager', 'payroll:read'), ('payroll_manager', 'payroll:calculate'),
  ('payroll_manager', 'payroll:approve'), ('payroll_manager', 'payroll:export'),
  ('payroll_manager', 'payroll:adjust'),
  ('payroll_manager', 'period:read'),
  ('payroll_manager', 'report:read'),
  ('payroll_manager', 'audit:read'),
  ('payroll_manager', 'compensation:read'),
  ('payroll_manager', 'member:read'),

  -- department_manager: department-scoped visibility, no payroll
  ('department_manager', 'org:read'),
  ('department_manager', 'department:read'),
  ('department_manager', 'trainer:read'),
  ('department_manager', 'client:read'),
  ('department_manager', 'service:read'),
  ('department_manager', 'import:read'),
  ('department_manager', 'period:read'),
  ('department_manager', 'report:read'),
  ('department_manager', 'member:read'),

  -- trainer: self-scope only
  ('trainer', 'org:read'),
  ('trainer', 'trainer:read_self'),
  ('trainer', 'payroll:read_self'),
  ('trainer', 'report:read'),

  -- viewer: read-only dashboards/reports
  ('viewer', 'org:read'),
  ('viewer', 'department:read'),
  ('viewer', 'period:read'),
  ('viewer', 'report:read')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.key = g.role_key
join public.permissions p on p.key = g.permission_key
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Platform-level audit event recording the seed.
-- ----------------------------------------------------------------------------
insert into public.audit_events (organization_id, actor_id, entity_type, action, metadata)
values (null, null, 'platform', 'seed_applied',
        jsonb_build_object('scope', 'foundation', 'contains_financial_data', false));
