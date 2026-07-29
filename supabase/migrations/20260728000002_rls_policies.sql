-- ============================================================================
-- Performance Operations — Row-Level Security
-- Migration 2: deny-by-default RLS for all foundation tables.
--
-- Model (see docs/AUTHORIZATION_MODEL.md):
--   * RLS enabled AND forced on every table; no policy => no access.
--   * Platform admins: all organizations.
--   * Workspace users: only organizations with an active membership.
--   * Department-scoped roles: further narrowed to assigned departments.
--   * Trainers: their own trainer identity and related assignments.
--   * Reference catalogs (roles/permissions): readable when authenticated,
--     writable only by platform admins.
--   * audit_events: insert+select only; nobody can update or delete.
--
-- SECURITY DEFINER FUNCTIONS
-- All helpers below are `security definer` so they can consult membership
-- tables without recursing into those tables' own RLS policies. Each:
--   * pins `search_path` to '' (fully qualified references only),
--   * reads only the calling user's own rows (keyed on auth.uid()),
--   * is stable and side-effect free.
-- ============================================================================

-- app.is_platform_admin() — true when the current user holds an active
-- platform_admin membership in any organization.
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.roles r on r.id = m.role_id
    where m.profile_id = (select auth.uid())
      and r.key = 'platform_admin'
      and m.effective_from <= current_date
      and (m.effective_to is null or m.effective_to >= current_date)
  );
$$;

-- app.user_organization_ids() — organizations where the current user has an
-- active membership.
create or replace function app.user_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_memberships m
  where m.profile_id = (select auth.uid())
    and m.effective_from <= current_date
    and (m.effective_to is null or m.effective_to >= current_date);
$$;

-- app.user_department_ids() — departments granted via active
-- department_memberships (used to narrow department-scoped roles).
create or replace function app.user_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select dm.department_id
  from public.department_memberships dm
  where dm.profile_id = (select auth.uid())
    and dm.effective_from <= current_date
    and (dm.effective_to is null or dm.effective_to >= current_date);
$$;

-- app.is_department_scoped_in(org_id) — true when the user's active role in
-- the organization is department-scoped (e.g., department_manager).
create or replace function app.is_department_scoped_in(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(r.department_scoped), false)
  from public.organization_memberships m
  join public.roles r on r.id = m.role_id
  where m.profile_id = (select auth.uid())
    and m.organization_id = org_id
    and m.effective_from <= current_date
    and (m.effective_to is null or m.effective_to >= current_date);
$$;

-- app.current_trainer_id() — the trainer row linked to the current user.
create or replace function app.current_trainer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.trainers t where t.profile_id = (select auth.uid());
$$;

-- app.has_permission_in(org_id, perm_key) — true when the user's active role
-- in the organization grants the permission, or the user is a platform admin.
create or replace function app.has_permission_in(org_id uuid, perm_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin() or exists (
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    where m.profile_id = (select auth.uid())
      and m.organization_id = org_id
      and p.key = perm_key
      and m.effective_from <= current_date
      and (m.effective_to is null or m.effective_to >= current_date)
  );
$$;

-- Lock helper functions down: only authenticated users may execute.
revoke all on function app.is_platform_admin() from public;
revoke all on function app.user_organization_ids() from public;
revoke all on function app.user_department_ids() from public;
revoke all on function app.is_department_scoped_in(uuid) from public;
revoke all on function app.current_trainer_id() from public;
revoke all on function app.has_permission_in(uuid, text) from public;
grant execute on function app.is_platform_admin() to authenticated;
grant execute on function app.user_organization_ids() to authenticated;
grant execute on function app.user_department_ids() to authenticated;
grant execute on function app.is_department_scoped_in(uuid) to authenticated;
grant execute on function app.current_trainer_id() to authenticated;
grant execute on function app.has_permission_in(uuid, text) to authenticated;
grant usage on schema app to authenticated;

-- ----------------------------------------------------------------------------
-- Enable + force RLS everywhere (deny by default)
-- ----------------------------------------------------------------------------
alter table public.organizations                    enable row level security;
alter table public.organizations                    force row level security;
alter table public.locations                        enable row level security;
alter table public.locations                        force row level security;
alter table public.departments                      enable row level security;
alter table public.departments                      force row level security;
alter table public.profiles                         enable row level security;
alter table public.profiles                         force row level security;
alter table public.roles                            enable row level security;
alter table public.roles                            force row level security;
alter table public.permissions                      enable row level security;
alter table public.permissions                      force row level security;
alter table public.role_permissions                 enable row level security;
alter table public.role_permissions                 force row level security;
alter table public.organization_memberships         enable row level security;
alter table public.organization_memberships         force row level security;
alter table public.department_memberships           enable row level security;
alter table public.department_memberships           force row level security;
alter table public.trainers                         enable row level security;
alter table public.trainers                         force row level security;
alter table public.trainer_organization_assignments enable row level security;
alter table public.trainer_organization_assignments force row level security;
alter table public.trainer_department_assignments   enable row level security;
alter table public.trainer_department_assignments   force row level security;
alter table public.reporting_periods                enable row level security;
alter table public.reporting_periods                force row level security;
alter table public.audit_events                     enable row level security;
alter table public.audit_events                     force row level security;

-- ----------------------------------------------------------------------------
-- organizations
-- ----------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (
    app.is_platform_admin()
    or id in (select app.user_organization_ids())
  );

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (app.is_platform_admin());

create policy organizations_update on public.organizations
  for update to authenticated
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- no delete policy: organizations are never deleted, only deactivated.

-- ----------------------------------------------------------------------------
-- locations
-- ----------------------------------------------------------------------------
create policy locations_select on public.locations
  for select to authenticated
  using (
    app.is_platform_admin()
    or organization_id in (select app.user_organization_ids())
  );

create policy locations_insert on public.locations
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'org:manage'));

create policy locations_update on public.locations
  for update to authenticated
  using (app.has_permission_in(organization_id, 'org:manage'))
  with check (app.has_permission_in(organization_id, 'org:manage'));

-- ----------------------------------------------------------------------------
-- departments — department-scoped roles see only their departments.
-- ----------------------------------------------------------------------------
create policy departments_select on public.departments
  for select to authenticated
  using (
    app.is_platform_admin()
    or (
      organization_id in (select app.user_organization_ids())
      and (
        not app.is_department_scoped_in(organization_id)
        or id in (select app.user_department_ids())
      )
    )
  );

create policy departments_insert on public.departments
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'department:manage'));

create policy departments_update on public.departments
  for update to authenticated
  using (app.has_permission_in(organization_id, 'department:manage'))
  with check (app.has_permission_in(organization_id, 'department:manage'));

-- ----------------------------------------------------------------------------
-- profiles — self, plus co-members of your organizations (needed to render
-- member lists); platform admins see all.
-- ----------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or app.is_platform_admin()
    or id in (
      select m.profile_id
      from public.organization_memberships m
      where m.organization_id in (select app.user_organization_ids())
    )
  );

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or app.is_platform_admin())
  with check (id = (select auth.uid()) or app.is_platform_admin());

-- ----------------------------------------------------------------------------
-- roles / permissions / role_permissions — readable catalog, admin-writable.
-- ----------------------------------------------------------------------------
create policy roles_select on public.roles
  for select to authenticated using (true);
create policy roles_write on public.roles
  for all to authenticated
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

create policy permissions_select on public.permissions
  for select to authenticated using (true);
create policy permissions_write on public.permissions
  for all to authenticated
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);
create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- ----------------------------------------------------------------------------
-- organization_memberships — own rows always; org rows with member:read;
-- managed with member:manage.
-- ----------------------------------------------------------------------------
create policy organization_memberships_select on public.organization_memberships
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or app.is_platform_admin()
    or app.has_permission_in(organization_id, 'member:read')
  );

create policy organization_memberships_insert on public.organization_memberships
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'member:manage'));

create policy organization_memberships_update on public.organization_memberships
  for update to authenticated
  using (app.has_permission_in(organization_id, 'member:manage'))
  with check (app.has_permission_in(organization_id, 'member:manage'));

-- ----------------------------------------------------------------------------
-- department_memberships
-- ----------------------------------------------------------------------------
create policy department_memberships_select on public.department_memberships
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or app.is_platform_admin()
    or app.has_permission_in(organization_id, 'member:read')
  );

create policy department_memberships_insert on public.department_memberships
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'member:manage'));

create policy department_memberships_update on public.department_memberships
  for update to authenticated
  using (app.has_permission_in(organization_id, 'member:manage'))
  with check (app.has_permission_in(organization_id, 'member:manage'));

-- ----------------------------------------------------------------------------
-- trainers — own identity; visible to members of organizations where the
-- trainer has an active assignment; managed with trainer:manage.
-- ----------------------------------------------------------------------------
create policy trainers_select on public.trainers
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or app.is_platform_admin()
    or exists (
      select 1
      from public.trainer_organization_assignments a
      where a.trainer_id = trainers.id
        and a.organization_id in (select app.user_organization_ids())
    )
  );

create policy trainers_insert on public.trainers
  for insert to authenticated
  with check (app.is_platform_admin());

create policy trainers_update on public.trainers
  for update to authenticated
  using (
    app.is_platform_admin()
    or exists (
      select 1
      from public.trainer_organization_assignments a
      where a.trainer_id = trainers.id
        and app.has_permission_in(a.organization_id, 'trainer:manage')
    )
  )
  with check (
    app.is_platform_admin()
    or exists (
      select 1
      from public.trainer_organization_assignments a
      where a.trainer_id = trainers.id
        and app.has_permission_in(a.organization_id, 'trainer:manage')
    )
  );

-- ----------------------------------------------------------------------------
-- trainer_organization_assignments
-- ----------------------------------------------------------------------------
create policy trainer_org_assignments_select on public.trainer_organization_assignments
  for select to authenticated
  using (
    app.is_platform_admin()
    or organization_id in (select app.user_organization_ids())
    or trainer_id = app.current_trainer_id()
  );

create policy trainer_org_assignments_insert on public.trainer_organization_assignments
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'trainer:manage'));

create policy trainer_org_assignments_update on public.trainer_organization_assignments
  for update to authenticated
  using (app.has_permission_in(organization_id, 'trainer:manage'))
  with check (app.has_permission_in(organization_id, 'trainer:manage'));

-- ----------------------------------------------------------------------------
-- trainer_department_assignments — department-scoped users see only their
-- departments' assignments.
-- ----------------------------------------------------------------------------
create policy trainer_dept_assignments_select on public.trainer_department_assignments
  for select to authenticated
  using (
    app.is_platform_admin()
    or trainer_id = app.current_trainer_id()
    or (
      organization_id in (select app.user_organization_ids())
      and (
        not app.is_department_scoped_in(organization_id)
        or department_id in (select app.user_department_ids())
      )
    )
  );

create policy trainer_dept_assignments_insert on public.trainer_department_assignments
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'trainer:manage'));

create policy trainer_dept_assignments_update on public.trainer_department_assignments
  for update to authenticated
  using (app.has_permission_in(organization_id, 'trainer:manage'))
  with check (app.has_permission_in(organization_id, 'trainer:manage'));

-- ----------------------------------------------------------------------------
-- reporting_periods
-- ----------------------------------------------------------------------------
create policy reporting_periods_select on public.reporting_periods
  for select to authenticated
  using (
    app.is_platform_admin()
    or organization_id in (select app.user_organization_ids())
  );

create policy reporting_periods_insert on public.reporting_periods
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'period:manage'));

create policy reporting_periods_update on public.reporting_periods
  for update to authenticated
  using (app.has_permission_in(organization_id, 'period:manage'))
  with check (app.has_permission_in(organization_id, 'period:manage'));

-- ----------------------------------------------------------------------------
-- audit_events — append-only. INSERT into own orgs as self; SELECT scoped;
-- deliberately NO update or delete policies for anyone.
-- ----------------------------------------------------------------------------
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (
    app.is_platform_admin()
    or (
      organization_id is not null
      and app.has_permission_in(organization_id, 'audit:read')
    )
  );

create policy audit_events_insert on public.audit_events
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and (
      app.is_platform_admin()
      or (
        organization_id is not null
        and organization_id in (select app.user_organization_ids())
      )
    )
  );
