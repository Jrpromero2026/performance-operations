-- ============================================================================
-- Performance Operations — Phase 2, Migration 5: service configuration
--
-- Services are the internal normalized appointment/revenue categories that
-- future Setmore/Acuity rows map into. Classification flags describe what a
-- service *represents*; they are configuration inputs, not calculation logic —
-- revenue-recognition and payroll fields arrive in later phases.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- service_categories — org-scoped catalog headings.
-- ----------------------------------------------------------------------------
create table public.service_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create index service_categories_organization_id_idx
  on public.service_categories (organization_id);

create trigger service_categories_set_updated_at
  before update on public.service_categories
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- services
-- ----------------------------------------------------------------------------
create table public.services (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  category_id               uuid not null,
  internal_name             text not null,
  display_name              text not null,
  description               text not null default '',
  default_duration_minutes  int not null default 60
                            check (default_duration_minutes > 0 and default_duration_minutes <= 24 * 60),
  status                    text not null default 'active' check (status in ('active', 'inactive')),
  effective_from            date not null default current_date,
  effective_to              date check (effective_to is null or effective_to > effective_from),
  -- classification flags (configuration, not calculation)
  counts_as_session         boolean not null default true,
  counts_as_coaching_hours  boolean not null default true,
  payroll_eligible          boolean not null default true,
  revenue_eligible          boolean not null default true,
  is_evaluation             boolean not null default false,
  is_team_training          boolean not null default false,
  is_nutrition              boolean not null default false,
  is_group_training         boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (organization_id, internal_name),
  unique (id, organization_id),
  -- category must belong to the same organization
  foreign key (category_id, organization_id)
    references public.service_categories (id, organization_id) on delete restrict
);

create index services_organization_id_idx on public.services (organization_id);
create index services_category_id_idx on public.services (category_id);
create index services_active_idx on public.services (organization_id, status)
  where status = 'active';

create trigger services_set_updated_at
  before update on public.services
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- service_department_assignments — effective-dated department linkage.
-- ----------------------------------------------------------------------------
create table public.service_department_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  service_id      uuid not null,
  department_id   uuid not null,
  effective_from  date not null default current_date,
  effective_to    date check (effective_to is null or effective_to > effective_from),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (service_id, organization_id)
    references public.services (id, organization_id) on delete cascade,
  foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete restrict
);

create index service_dept_assignments_service_id_idx
  on public.service_department_assignments (service_id);
create index service_dept_assignments_department_id_idx
  on public.service_department_assignments (department_id);
create index service_dept_assignments_organization_id_idx
  on public.service_department_assignments (organization_id);
create unique index service_dept_assignments_one_active_uidx
  on public.service_department_assignments (service_id, department_id)
  where effective_to is null;

create trigger service_department_assignments_set_updated_at
  before update on public.service_department_assignments
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- service_source_aliases — source-specific names that future imports match.
-- ----------------------------------------------------------------------------
create table public.service_source_aliases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  service_id      uuid not null,
  source          text not null check (source in ('setmore', 'acuity', 'manual_csv')),
  alias           text not null,
  alias_normalized text generated always as (lower(btrim(alias))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (service_id, organization_id)
    references public.services (id, organization_id) on delete cascade,
  -- an alias may map to only one service per source within an organization
  unique (organization_id, source, alias_normalized)
);

create index service_source_aliases_service_id_idx
  on public.service_source_aliases (service_id);
create index service_source_aliases_organization_id_idx
  on public.service_source_aliases (organization_id);

create trigger service_source_aliases_set_updated_at
  before update on public.service_source_aliases
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — deny by default; read for organization members (department-scoped
-- roles still see services; service:manage required for writes).
-- ----------------------------------------------------------------------------
alter table public.service_categories enable row level security;
alter table public.service_categories force row level security;
alter table public.services enable row level security;
alter table public.services force row level security;
alter table public.service_department_assignments enable row level security;
alter table public.service_department_assignments force row level security;
alter table public.service_source_aliases enable row level security;
alter table public.service_source_aliases force row level security;

create policy service_categories_select on public.service_categories
  for select to authenticated
  using (app.is_platform_admin() or organization_id in (select app.user_organization_ids()));
create policy service_categories_insert on public.service_categories
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'service:manage'));
create policy service_categories_update on public.service_categories
  for update to authenticated
  using (app.has_permission_in(organization_id, 'service:manage'))
  with check (app.has_permission_in(organization_id, 'service:manage'));

create policy services_select on public.services
  for select to authenticated
  using (app.is_platform_admin() or organization_id in (select app.user_organization_ids()));
create policy services_insert on public.services
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'service:manage'));
create policy services_update on public.services
  for update to authenticated
  using (app.has_permission_in(organization_id, 'service:manage'))
  with check (app.has_permission_in(organization_id, 'service:manage'));

create policy service_dept_assignments_select on public.service_department_assignments
  for select to authenticated
  using (app.is_platform_admin() or organization_id in (select app.user_organization_ids()));
create policy service_dept_assignments_insert on public.service_department_assignments
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'service:manage'));
create policy service_dept_assignments_update on public.service_department_assignments
  for update to authenticated
  using (app.has_permission_in(organization_id, 'service:manage'))
  with check (app.has_permission_in(organization_id, 'service:manage'));

create policy service_source_aliases_select on public.service_source_aliases
  for select to authenticated
  using (app.is_platform_admin() or organization_id in (select app.user_organization_ids()));
create policy service_source_aliases_insert on public.service_source_aliases
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'service:manage'));
create policy service_source_aliases_update on public.service_source_aliases
  for update to authenticated
  using (app.has_permission_in(organization_id, 'service:manage'))
  with check (app.has_permission_in(organization_id, 'service:manage'));
create policy service_source_aliases_delete on public.service_source_aliases
  for delete to authenticated
  using (app.has_permission_in(organization_id, 'service:manage'));
