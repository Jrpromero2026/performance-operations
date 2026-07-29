-- ============================================================================
-- Performance Operations — Foundation schema
-- Migration 1: core multi-organization entities.
--
-- Rules honored here (see docs/DATA_MODEL_DRAFT.md):
--   * UUID primary keys, timestamptz, created_at/updated_at via trigger
--   * organization_id on all organization-scoped records, FK'd and indexed
--   * additive-only; this file must never be edited once applied
-- ============================================================================

create extension if not exists btree_gist; -- for reporting-period range exclusion

-- Dedicated schema for application helper functions (keeps public clean and
-- makes search_path pinning explicit).
create schema if not exists app;

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- app.set_updated_at(): trigger function; not security definer (runs with
-- invoker rights, touches only the row being written).
-- ----------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- organizations
-- ----------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  timezone    text not null default 'America/Los_Angeles',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- locations
-- ----------------------------------------------------------------------------
create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  address         text,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create index locations_organization_id_idx on public.locations (organization_id);

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- departments
-- (id, organization_id) is unique so child tables can use a composite FK and
-- guarantee a department link never crosses organizations.
-- ----------------------------------------------------------------------------
create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  description     text,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create index departments_organization_id_idx on public.departments (organization_id);

create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- profiles — one row per auth user
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null default '',
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- roles / permissions catalog
-- ----------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z_]+$'),
  name        text not null,
  description text not null default '',
  -- department_scoped roles additionally require department_memberships rows
  department_scoped boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function app.set_updated_at();

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z_]+:[a-z_]+$'),
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_id_idx on public.role_permissions (permission_id);

-- ----------------------------------------------------------------------------
-- organization_memberships — profile ↔ organization with role, effective-dated
-- ----------------------------------------------------------------------------
create table public.organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  role_id         uuid not null references public.roles (id) on delete restrict,
  is_default      boolean not null default false,
  effective_from  date not null default current_date,
  effective_to    date check (effective_to is null or effective_to > effective_from),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index organization_memberships_profile_id_idx
  on public.organization_memberships (profile_id);
create index organization_memberships_organization_id_idx
  on public.organization_memberships (organization_id);
-- one currently-open membership per profile+organization
create unique index organization_memberships_one_active_uidx
  on public.organization_memberships (profile_id, organization_id)
  where effective_to is null;
-- hot path for RLS helpers: active memberships by profile
create index organization_memberships_active_idx
  on public.organization_memberships (profile_id, organization_id)
  where effective_to is null;

create trigger organization_memberships_set_updated_at
  before update on public.organization_memberships
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- department_memberships — department scoping for department-limited roles
-- Composite FK ensures the department belongs to the stated organization.
-- ----------------------------------------------------------------------------
create table public.department_memberships (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null,
  department_id   uuid not null,
  effective_from  date not null default current_date,
  effective_to    date check (effective_to is null or effective_to > effective_from),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete restrict
);

create index department_memberships_profile_id_idx
  on public.department_memberships (profile_id);
create index department_memberships_department_id_idx
  on public.department_memberships (department_id);
create index department_memberships_organization_id_idx
  on public.department_memberships (organization_id);
create unique index department_memberships_one_active_uidx
  on public.department_memberships (profile_id, department_id)
  where effective_to is null;

create trigger department_memberships_set_updated_at
  before update on public.department_memberships
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- trainers — trainer identity, optionally linked to a login profile
-- ----------------------------------------------------------------------------
create table public.trainers (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid unique references public.profiles (id) on delete set null,
  display_name text not null,
  email        text,
  status       text not null default 'active' check (status in ('active', 'inactive')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trainers_set_updated_at
  before update on public.trainers
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- trainer_organization_assignments — effective-dated; carries per-organization
-- role/title. Compensation plan linkage is added in the payroll phase.
-- ----------------------------------------------------------------------------
create table public.trainer_organization_assignments (
  id              uuid primary key default gen_random_uuid(),
  trainer_id      uuid not null references public.trainers (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  title           text not null default 'Trainer',
  effective_from  date not null default current_date,
  effective_to    date check (effective_to is null or effective_to > effective_from),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (trainer_id, organization_id, effective_from)
);

create index trainer_org_assignments_trainer_id_idx
  on public.trainer_organization_assignments (trainer_id);
create index trainer_org_assignments_organization_id_idx
  on public.trainer_organization_assignments (organization_id);
create unique index trainer_org_assignments_one_active_uidx
  on public.trainer_organization_assignments (trainer_id, organization_id)
  where effective_to is null;

create trigger trainer_organization_assignments_set_updated_at
  before update on public.trainer_organization_assignments
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- trainer_department_assignments — effective-dated; composite FK keeps the
-- department inside the stated organization.
-- ----------------------------------------------------------------------------
create table public.trainer_department_assignments (
  id              uuid primary key default gen_random_uuid(),
  trainer_id      uuid not null references public.trainers (id) on delete cascade,
  organization_id uuid not null,
  department_id   uuid not null,
  effective_from  date not null default current_date,
  effective_to    date check (effective_to is null or effective_to > effective_from),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (trainer_id, department_id, effective_from),
  foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete restrict
);

create index trainer_dept_assignments_trainer_id_idx
  on public.trainer_department_assignments (trainer_id);
create index trainer_dept_assignments_department_id_idx
  on public.trainer_department_assignments (department_id);
create index trainer_dept_assignments_organization_id_idx
  on public.trainer_department_assignments (organization_id);
create unique index trainer_dept_assignments_one_active_uidx
  on public.trainer_department_assignments (trainer_id, department_id)
  where effective_to is null;

create trigger trainer_department_assignments_set_updated_at
  before update on public.trainer_department_assignments
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- reporting_periods — organization-scoped payroll/reporting windows.
-- Exclusion constraint prevents overlapping periods within an organization.
-- ----------------------------------------------------------------------------
create table public.reporting_periods (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  label           text not null,
  start_date      date not null,
  end_date        date not null check (end_date >= start_date),
  status          text not null default 'draft'
                  check (status in ('draft', 'open', 'closed', 'locked')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, label),
  exclude using gist (
    organization_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

create index reporting_periods_organization_id_idx
  on public.reporting_periods (organization_id);
create index reporting_periods_org_status_idx
  on public.reporting_periods (organization_id, status);

create trigger reporting_periods_set_updated_at
  before update on public.reporting_periods
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- audit_events — append-only audit trail. organization_id is nullable for
-- platform-level events (e.g., organization creation).
-- ----------------------------------------------------------------------------
create table public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete restrict,
  actor_id        uuid references public.profiles (id) on delete set null,
  entity_type     text not null,
  entity_id       uuid,
  action          text not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index audit_events_org_created_idx
  on public.audit_events (organization_id, created_at desc);
create index audit_events_actor_id_idx on public.audit_events (actor_id);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);
