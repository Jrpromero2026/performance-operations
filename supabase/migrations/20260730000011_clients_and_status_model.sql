-- ============================================================================
-- Performance Operations — Phase 3, Migration 11: client identity + status model
--
-- Minimal client identity needed for imports: one person-level record,
-- org assignments (a client may train at both organizations), and source-
-- and organization-aware external identifiers. Plus the configurable
-- canonical appointment-status model and per-org source-status mappings.
-- Also: trainer source aliases for name-based trainer matching.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null default '',
  last_name    text not null default '',
  display_name text not null,
  email        text,
  phone        text,
  status       text not null default 'active' check (status in ('active', 'inactive')),
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index clients_email_lower_idx on public.clients (lower(email));
create index clients_display_name_lower_idx on public.clients (lower(display_name));

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function app.set_updated_at();

create table public.client_organization_assignments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  effective_from  date not null default current_date,
  effective_to    date check (effective_to is null or effective_to > effective_from),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index client_org_assignments_client_id_idx
  on public.client_organization_assignments (client_id);
create index client_org_assignments_organization_id_idx
  on public.client_organization_assignments (organization_id);
create unique index client_org_assignments_one_active_uidx
  on public.client_organization_assignments (client_id, organization_id)
  where effective_to is null;

create trigger client_organization_assignments_set_updated_at
  before update on public.client_organization_assignments
  for each row execute function app.set_updated_at();

-- Source- and organization-aware external ids (e.g. a future Acuity client id).
create table public.client_source_identifiers (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  source          text not null check (source in ('setmore', 'acuity', 'manual_csv')),
  external_id     text not null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organization_id, source, external_id)
);

create index client_source_identifiers_client_id_idx
  on public.client_source_identifiers (client_id);

-- ----------------------------------------------------------------------------
-- trainer_source_aliases — approved alternate names per org+source
-- (trainers.source_identifiers JSONB already covers external IDs).
-- ----------------------------------------------------------------------------
create table public.trainer_source_aliases (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  trainer_id       uuid not null references public.trainers (id) on delete cascade,
  source           text not null check (source in ('setmore', 'acuity', 'manual_csv')),
  alias            text not null,
  alias_normalized text generated always as (lower(btrim(alias))) stored,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (organization_id, source, alias_normalized)
);

create index trainer_source_aliases_trainer_id_idx
  on public.trainer_source_aliases (trainer_id);
create index trainer_source_aliases_organization_id_idx
  on public.trainer_source_aliases (organization_id);

-- ----------------------------------------------------------------------------
-- Canonical appointment statuses (configurable catalog, seeded below) and
-- per-organization source-status mappings. Mapping changes never rewrite
-- posted history (appointments store their status value at posting time;
-- corrections go through the correction workflow).
-- ----------------------------------------------------------------------------
create table public.appointment_status_definitions (
  key        text primary key check (key ~ '^[a-z_]+$'),
  label      text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.appointment_status_definitions (key, label, sort_order) values
  ('scheduled',      'Scheduled',       1),
  ('completed',      'Completed',       2),
  ('cancelled',      'Cancelled',       3),
  ('late_cancelled', 'Late cancelled',  4),
  ('no_show',        'No show',         5),
  ('rescheduled',    'Rescheduled',     6),
  ('deleted',        'Deleted',         7),
  ('unknown',        'Unknown',         8);

create table public.source_status_mappings (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete restrict,
  source                  text not null check (source in ('setmore', 'acuity', 'manual_csv')),
  source_value_normalized text not null,
  canonical_status        text not null references public.appointment_status_definitions (key),
  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (organization_id, source, source_value_normalized)
);

create index source_status_mappings_org_idx
  on public.source_status_mappings (organization_id, source);

create trigger source_status_mappings_set_updated_at
  before update on public.source_status_mappings
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.clients force row level security;
alter table public.client_organization_assignments enable row level security;
alter table public.client_organization_assignments force row level security;
alter table public.client_source_identifiers enable row level security;
alter table public.client_source_identifiers force row level security;
alter table public.trainer_source_aliases enable row level security;
alter table public.trainer_source_aliases force row level security;
alter table public.appointment_status_definitions enable row level security;
alter table public.appointment_status_definitions force row level security;
alter table public.source_status_mappings enable row level security;
alter table public.source_status_mappings force row level security;

-- Clients are visible to members of any organization the client is assigned
-- to (client:read); managed with client:manage in such an organization.
create policy clients_select on public.clients
  for select to authenticated
  using (
    app.is_platform_admin()
    or exists (
      select 1 from public.client_organization_assignments a
      where a.client_id = clients.id
        and app.has_permission_in(a.organization_id, 'client:read')
    )
  );

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    app.is_platform_admin()
    or exists (
      select 1 from app.user_organization_ids() as org(id)
      where app.has_permission_in(org.id, 'client:manage')
    )
  );

create policy clients_update on public.clients
  for update to authenticated
  using (
    app.is_platform_admin()
    or exists (
      select 1 from public.client_organization_assignments a
      where a.client_id = clients.id
        and app.has_permission_in(a.organization_id, 'client:manage')
    )
  )
  with check (
    app.is_platform_admin()
    or exists (
      select 1 from public.client_organization_assignments a
      where a.client_id = clients.id
        and app.has_permission_in(a.organization_id, 'client:manage')
    )
  );

create policy client_org_assignments_select on public.client_organization_assignments
  for select to authenticated
  using (app.has_permission_in(organization_id, 'client:read'));
create policy client_org_assignments_insert on public.client_organization_assignments
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'client:manage'));
create policy client_org_assignments_update on public.client_organization_assignments
  for update to authenticated
  using (app.has_permission_in(organization_id, 'client:manage'))
  with check (app.has_permission_in(organization_id, 'client:manage'));

create policy client_source_identifiers_select on public.client_source_identifiers
  for select to authenticated
  using (app.has_permission_in(organization_id, 'client:read'));
create policy client_source_identifiers_insert on public.client_source_identifiers
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'client:manage'));
create policy client_source_identifiers_delete on public.client_source_identifiers
  for delete to authenticated
  using (app.has_permission_in(organization_id, 'client:manage'));

create policy trainer_source_aliases_select on public.trainer_source_aliases
  for select to authenticated
  using (app.has_permission_in(organization_id, 'trainer:read'));
create policy trainer_source_aliases_insert on public.trainer_source_aliases
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'import:manage'));
create policy trainer_source_aliases_delete on public.trainer_source_aliases
  for delete to authenticated
  using (app.has_permission_in(organization_id, 'import:manage'));

-- Status catalog: readable by all authenticated; platform-admin writable.
create policy appointment_status_definitions_select on public.appointment_status_definitions
  for select to authenticated using (true);
create policy appointment_status_definitions_write on public.appointment_status_definitions
  for all to authenticated
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

create policy source_status_mappings_select on public.source_status_mappings
  for select to authenticated
  using (app.has_permission_in(organization_id, 'import:read'));
create policy source_status_mappings_insert on public.source_status_mappings
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'import:manage'));
create policy source_status_mappings_update on public.source_status_mappings
  for update to authenticated
  using (app.has_permission_in(organization_id, 'import:manage'))
  with check (app.has_permission_in(organization_id, 'import:manage'));
