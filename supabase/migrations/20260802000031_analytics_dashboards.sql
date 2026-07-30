-- ============================================================================
-- Performance Operations — Phase 9, Migration 31: custom analytics dashboards
--
-- Governed dashboard builder. A dashboard is CONFIGURATION ONLY: widgets
-- reference catalog metric ids, analytics query types, saved goals and
-- benchmarks — never formulas, SQL, or scripts (config is JSONB validated
-- by the application against a closed widget-type schema; the widget_type
-- CHECK is the DB-side floor). Shared dashboards never bypass live
-- permissions: rendering re-resolves every widget through the analytics
-- service per viewer.
-- ============================================================================

create table public.analytics_dashboards (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  description      text,
  status           text not null default 'active'
                   check (status in ('draft','active','archived')),
  shared_scope     text not null default 'personal'
                   check (shared_scope in ('personal','department','organization')),
  -- department sharing requires the department
  department_id    uuid references public.departments (id) on delete restrict,
  constraint analytics_dashboards_share_shape check (
    (shared_scope = 'department') = (department_id is not null)
  ),
  -- presentation config (period selection mode, filters) — validated app-side
  config           jsonb not null default '{}'::jsonb,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, owner_id, name)
);
create index analytics_dashboards_org_idx
  on public.analytics_dashboards (organization_id, status, shared_scope);

create trigger analytics_dashboards_set_updated_at
  before update on public.analytics_dashboards
  for each row execute function app.set_updated_at();

create table public.analytics_dashboard_sections (
  id            uuid primary key default gen_random_uuid(),
  dashboard_id  uuid not null references public.analytics_dashboards (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title         text not null default '',
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);
create index analytics_dashboard_sections_dash_idx
  on public.analytics_dashboard_sections (dashboard_id, position);

-- Closed widget-type list — no custom formula, raw SQL, or script widgets.
create table public.analytics_dashboard_widgets (
  id            uuid primary key default gen_random_uuid(),
  dashboard_id  uuid not null references public.analytics_dashboards (id) on delete cascade,
  section_id    uuid references public.analytics_dashboard_sections (id) on delete set null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  widget_type   text not null check (widget_type in (
    'metric','comparison','trend','breakdown_table','breakdown_chart',
    'goal_progress','benchmark_comparison','scorecard','cohort_table',
    'cohort_heatmap','readiness','executive_summary','operational_alert',
    'text_note','report_link')),
  position      integer not null default 0,
  width         integer not null default 1 check (width between 1 and 4),
  height        integer not null default 1 check (height between 1 and 4),
  -- References to EXISTING governed objects; validated app-side per type.
  metric_id     text,
  goal_id       uuid references public.performance_goals (id) on delete set null,
  benchmark_id  uuid references public.performance_benchmarks (id) on delete set null,
  config        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index analytics_dashboard_widgets_dash_idx
  on public.analytics_dashboard_widgets (dashboard_id, position);

create trigger analytics_dashboard_widgets_set_updated_at
  before update on public.analytics_dashboard_widgets
  for each row execute function app.set_updated_at();

-- Default dashboard per actor (personal) or organization (admin-set).
create table public.analytics_dashboard_defaults (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scope           text not null check (scope in ('personal','organization')),
  profile_id      uuid references public.profiles (id) on delete cascade,
  dashboard_id    uuid not null references public.analytics_dashboards (id) on delete cascade,
  set_by          uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint analytics_dashboard_defaults_shape check (
    (scope = 'personal') = (profile_id is not null)
  )
);
create unique index analytics_dashboard_defaults_personal_uq
  on public.analytics_dashboard_defaults (organization_id, profile_id)
  where scope = 'personal';
create unique index analytics_dashboard_defaults_org_uq
  on public.analytics_dashboard_defaults (organization_id)
  where scope = 'organization';

-- ---------------------------------------------------------------- guards

-- Sharing governance: personal dashboards are free; department sharing
-- requires dashboard:share_department (and, for department-scoped roles,
-- one of their own departments); organization sharing requires
-- dashboard:share_organization. Archived dashboards freeze except
-- unarchive by their owner.
create or replace function app.protect_analytics_dashboard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.owner_id is distinct from old.owner_id then
    raise exception 'dashboard_immutable: ownership and organization are fixed';
  end if;

  if new.shared_scope is distinct from old.shared_scope
     or new.department_id is distinct from old.department_id then
    if new.shared_scope = 'department' then
      if not app.has_permission_in(new.organization_id, 'dashboard:share_department') then
        raise exception 'dashboard_forbidden: dashboard:share_department required';
      end if;
      if app.is_department_scoped_in(new.organization_id)
         and new.department_id not in (select app.user_department_ids()) then
        raise exception 'dashboard_forbidden: cannot share outside your departments';
      end if;
    elsif new.shared_scope = 'organization' then
      if not app.has_permission_in(new.organization_id, 'dashboard:share_organization') then
        raise exception 'dashboard_forbidden: dashboard:share_organization required';
      end if;
    end if;
  end if;

  if new.status = 'archived' and old.status <> 'archived' then
    new.archived_at := now();
  end if;

  return new;
end;
$$;

create trigger analytics_dashboards_protect
  before update on public.analytics_dashboards
  for each row execute function app.protect_analytics_dashboard();

-- Same sharing floor at creation time.
create or replace function app.protect_analytics_dashboard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shared_scope = 'department' then
    if not app.has_permission_in(new.organization_id, 'dashboard:share_department') then
      raise exception 'dashboard_forbidden: dashboard:share_department required';
    end if;
    if app.is_department_scoped_in(new.organization_id)
       and new.department_id not in (select app.user_department_ids()) then
      raise exception 'dashboard_forbidden: cannot share outside your departments';
    end if;
  elsif new.shared_scope = 'organization' then
    if not app.has_permission_in(new.organization_id, 'dashboard:share_organization') then
      raise exception 'dashboard_forbidden: dashboard:share_organization required';
    end if;
  end if;
  return new;
end;
$$;

create trigger analytics_dashboards_protect_insert
  before insert on public.analytics_dashboards
  for each row execute function app.protect_analytics_dashboard_insert();

-- -------------------------------------------------------------------- RLS

alter table public.analytics_dashboards enable row level security;
alter table public.analytics_dashboards force row level security;
alter table public.analytics_dashboard_sections enable row level security;
alter table public.analytics_dashboard_sections force row level security;
alter table public.analytics_dashboard_widgets enable row level security;
alter table public.analytics_dashboard_widgets force row level security;
alter table public.analytics_dashboard_defaults enable row level security;
alter table public.analytics_dashboard_defaults force row level security;

-- Visibility: own dashboards; department-shared within my departments
-- (or org-read roles); organization-shared to analytics readers.
create policy analytics_dashboards_select on public.analytics_dashboards
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      app.has_permission_in(organization_id, 'analytics:read')
      and status <> 'draft'
      and (
        (shared_scope = 'organization')
        or (shared_scope = 'department'
            and (
              (app.has_permission_in(organization_id, 'appointment:read')
                and not app.is_department_scoped_in(organization_id))
              or department_id in (select app.user_department_ids())
            ))
      )
    )
  );

create policy analytics_dashboards_insert on public.analytics_dashboards
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and app.has_permission_in(organization_id, 'dashboard:create')
    and organization_id in (select app.user_organization_ids())
  );

create policy analytics_dashboards_update on public.analytics_dashboards
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and app.has_permission_in(organization_id, 'dashboard:update')
  )
  with check (owner_id = (select auth.uid()));

-- Sections/widgets follow their dashboard's visibility; writes are
-- owner-only (dashboard:update).
create policy analytics_dashboard_sections_select on public.analytics_dashboard_sections
  for select to authenticated
  using (exists (select 1 from public.analytics_dashboards d where d.id = dashboard_id));
create policy analytics_dashboard_sections_write on public.analytics_dashboard_sections
  for all to authenticated
  using (exists (
    select 1 from public.analytics_dashboards d
    where d.id = dashboard_id and d.owner_id = (select auth.uid())
      and app.has_permission_in(d.organization_id, 'dashboard:update')))
  with check (exists (
    select 1 from public.analytics_dashboards d
    where d.id = dashboard_id and d.owner_id = (select auth.uid())
      and app.has_permission_in(d.organization_id, 'dashboard:update')));

create policy analytics_dashboard_widgets_select on public.analytics_dashboard_widgets
  for select to authenticated
  using (exists (select 1 from public.analytics_dashboards d where d.id = dashboard_id));
create policy analytics_dashboard_widgets_write on public.analytics_dashboard_widgets
  for all to authenticated
  using (exists (
    select 1 from public.analytics_dashboards d
    where d.id = dashboard_id and d.owner_id = (select auth.uid())
      and app.has_permission_in(d.organization_id, 'dashboard:update')))
  with check (exists (
    select 1 from public.analytics_dashboards d
    where d.id = dashboard_id and d.owner_id = (select auth.uid())
      and app.has_permission_in(d.organization_id, 'dashboard:update')));

-- Defaults: personal defaults are self-managed; organization defaults
-- require dashboard:set_default. The referenced dashboard must be visible
-- to the setter (RLS subquery re-checks).
create policy analytics_dashboard_defaults_select on public.analytics_dashboard_defaults
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (scope = 'organization'
        and app.has_permission_in(organization_id, 'analytics:read'))
  );
create policy analytics_dashboard_defaults_write on public.analytics_dashboard_defaults
  for all to authenticated
  using (
    (scope = 'personal' and profile_id = (select auth.uid()))
    or (scope = 'organization'
        and app.has_permission_in(organization_id, 'dashboard:set_default'))
  )
  with check (
    set_by = (select auth.uid())
    and exists (select 1 from public.analytics_dashboards d where d.id = dashboard_id)
    and (
      (scope = 'personal' and profile_id = (select auth.uid()))
      or (scope = 'organization'
          and app.has_permission_in(organization_id, 'dashboard:set_default'))
    )
  );
