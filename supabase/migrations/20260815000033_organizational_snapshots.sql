-- ============================================================================
-- Performance Operations — Phase G, Migration 33: organizational snapshots
--
-- Timberhill runs on external club software (Gym Management Solutions).
-- Performance Operations does NOT integrate with it and does not intend to:
-- the values PT intelligence needs from GMS change slowly, are aggregate
-- only, and take a minute to type. This migration adds the smallest model
-- that makes those values first-class, governed data.
--
-- The design rule that matters most (and the reason this is a three-table
-- model rather than a column on organizations):
--
--   NEVER store `current_members = 5000` and overwrite it every month.
--
-- Every entry is an IMMUTABLE, dated observation carrying its own
-- provenance — source, as-of date, who entered it, when. That is what makes
-- month-over-month and year-over-year comparison, utilization history and
-- auditability possible at all, and it is what lets a future PT Director say
-- "based on the latest GMS snapshot from August 31" instead of presenting a
-- stale manual number as if it were live.
--
-- Corrections do not mutate history: a later snapshot SUPERSEDES an earlier
-- one for the same period, and both rows survive.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('org_snapshot:read',   'View organizational (external-source) snapshots and their history'),
  ('org_snapshot:enter',  'Record a new organizational snapshot from an external source'),
  ('org_snapshot:manage', 'Supersede or void organizational snapshots')
on conflict (key) do nothing;

-- Role matrix. Entering club-level figures is an owner/manager act, not a
-- trainer one: trainers and viewers get nothing here, because a manual
-- denominator entered by the wrong person silently distorts every
-- utilization number derived from it.
--   platform_admin     → all
--   workspace_admin    → all (the owner-facing role)
--   payroll_manager    → read + enter (needs the denominators for reporting)
--   department_manager → read only
with grants(role_key, permission_key) as (
  values
  ('platform_admin','org_snapshot:read'),
  ('platform_admin','org_snapshot:enter'),
  ('platform_admin','org_snapshot:manage'),
  ('workspace_admin','org_snapshot:read'),
  ('workspace_admin','org_snapshot:enter'),
  ('workspace_admin','org_snapshot:manage'),
  ('payroll_manager','org_snapshot:read'),
  ('payroll_manager','org_snapshot:enter'),
  ('department_manager','org_snapshot:read')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.key = g.role_key
join public.permissions p on p.key = g.permission_key
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- External sources
--
-- A snapshot always names where its numbers came from. The vocabulary is
-- code-controlled so "source" can never degrade into free text that the
-- intelligence layer cannot reason about.
-- ----------------------------------------------------------------------------
create table public.external_data_sources (
  key         text primary key check (key ~ '^[a-z_]+$'),
  label       text not null,
  /**
   * 'manual_snapshot' — a human reads the external system and types
   * aggregates here. 'automated' — a machine integration writes the data.
   * The intelligence layer uses this to qualify every number it reports.
   */
  ingest_mode text not null check (ingest_mode in ('manual_snapshot','automated')),
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.external_data_sources (key, label, ingest_mode, description, sort_order) values
  ('gym_management_solutions', 'Gym Management Solutions (GMS)', 'manual_snapshot',
   'Club membership system of record. Aggregate values are entered manually and periodically; there is no GMS integration.', 1),
  ('other_manual', 'Other (manual)', 'manual_snapshot',
   'Any other external system whose aggregate values are entered by hand. The note field must identify it.', 90)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Metric definitions
--
-- Deliberately DATA, not a hardcoded form. The set below was chosen by
-- comparing against the existing deterministic metric catalog and keeping
-- only values that (a) the catalog genuinely cannot compute from
-- Performance Operations data, and (b) unlock a calculation the PT
-- department actually needs. Nothing here duplicates a catalog metric.
-- ----------------------------------------------------------------------------
create table public.organizational_metric_definitions (
  key          text primary key check (key ~ '^[a-z_]+$'),
  label        text not null,
  /** Matches the intelligence layer's unit vocabulary. */
  unit         text not null check (unit in ('count','currency_cents','rate_bp','minutes')),
  definition   text not null,
  /**
   * Why this value cannot be derived internally. Recorded so nobody later
   * adds a manual field that duplicates a deterministic metric.
   */
  rationale    text not null,
  source_key   text not null references public.external_data_sources (key),
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger organizational_metric_definitions_set_updated_at
  before update on public.organizational_metric_definitions
  for each row execute function app.set_updated_at();

insert into public.organizational_metric_definitions
  (key, label, unit, definition, rationale, source_key, sort_order) values
  ('club_active_members',
   'Total active club members',
   'count',
   'Count of active club memberships at the as-of date, as reported by GMS.',
   'Performance Operations only ever sees people who booked a PT appointment. The club-wide membership population is invisible to it and cannot be derived from any catalog metric.',
   'gym_management_solutions', 1),
  ('club_pt_eligible_members',
   'PT-eligible members',
   'count',
   'Count of active members eligible for personal training at the as-of date, as defined by the club.',
   'Deliberately distinct from total active members: the denominator for PT penetration is an owner-defined population, and guessing it would invent a business rule. Left unentered until the owner defines eligibility.',
   'gym_management_solutions', 2),
  ('club_new_memberships',
   'New memberships in period',
   'count',
   'Memberships that started within the reporting period, as reported by GMS.',
   'The inflow of prospective PT clients. `new_clients` in the catalog counts new PT clients only and cannot see membership sales.',
   'gym_management_solutions', 3),
  ('club_cancelled_memberships',
   'Cancelled memberships in period',
   'count',
   'Memberships that ended within the reporting period, as reported by GMS.',
   'Club-level churn context for PT retention. `client_retention_rate_bp` measures PT retention only and cannot see membership cancellations.',
   'gym_management_solutions', 4)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Snapshots (header)
--
-- One snapshot = one dated reading of an external system for one reporting
-- window. Immutable once recorded.
-- ----------------------------------------------------------------------------
create table public.organizational_snapshots (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  source_key       text not null references public.external_data_sources (key),

  -- Reporting window. A period row is preferred (it ties the snapshot to the
  -- same calendar the payroll and analytics layers use) but plain dates are
  -- accepted so history can be back-filled before periods exist.
  reporting_period_id uuid references public.reporting_periods (id) on delete restrict,
  period_start     date not null,
  period_end       date not null,
  constraint organizational_snapshots_window check (period_start <= period_end),

  /**
   * The date the external system was actually read. This is NOT the same as
   * the period end (a snapshot taken on Sep 3 for August is normal) and NOT
   * the same as entered_at (data can be entered late). Reporting must quote
   * this date, which is why it is mandatory.
   */
  as_of_date       date not null,
  constraint organizational_snapshots_as_of check (as_of_date >= period_start),

  status           text not null default 'recorded'
                   check (status in ('recorded','superseded','voided')),
  /** Set when a later snapshot replaces this one; never a hard delete. */
  superseded_by_id uuid references public.organizational_snapshots (id) on delete restrict,
  constraint organizational_snapshots_supersede_shape check (
    (status = 'superseded' and superseded_by_id is not null)
    or (status <> 'superseded' and superseded_by_id is null)
  ),
  void_reason      text,
  constraint organizational_snapshots_void_shape check (
    status <> 'voided' or (void_reason is not null and char_length(void_reason) between 3 and 500)
  ),

  note             text check (note is null or char_length(note) <= 1000),
  entered_by       uuid not null references public.profiles (id) on delete restrict,
  entered_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index organizational_snapshots_org_idx
  on public.organizational_snapshots (organization_id, source_key, period_start desc);
create index organizational_snapshots_current_idx
  on public.organizational_snapshots (organization_id, source_key, period_end desc)
  where status = 'recorded';
create index organizational_snapshots_superseded_by_idx
  on public.organizational_snapshots (superseded_by_id)
  where superseded_by_id is not null;

create trigger organizational_snapshots_set_updated_at
  before update on public.organizational_snapshots
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- Snapshot values
--
-- Integer-only. Currency stays in cents and rates in basis points, matching
-- the rest of the platform; no floating point ever enters the ledger.
-- ----------------------------------------------------------------------------
create table public.organizational_snapshot_values (
  id              uuid primary key default gen_random_uuid(),
  snapshot_id     uuid not null references public.organizational_snapshots (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  metric_key      text not null references public.organizational_metric_definitions (key),
  value           bigint not null check (value >= 0),
  created_at      timestamptz not null default now(),
  unique (snapshot_id, metric_key)
);

create index organizational_snapshot_values_metric_idx
  on public.organizational_snapshot_values (organization_id, metric_key);

-- ----------------------------------------------------------------------------
-- Immutability guard
--
-- A snapshot is a historical observation. Once recorded it may only change
-- lifecycle state (superseded / voided) — never its numbers, its window, its
-- as-of date, or its provenance. Correcting a figure means entering a NEW
-- snapshot, which is exactly the behaviour that preserves history.
-- ----------------------------------------------------------------------------
create or replace function app.protect_organizational_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Organizational snapshots are immutable history and cannot be deleted; void the snapshot instead.'
      using errcode = 'check_violation';
  end if;

  if old.status <> 'recorded' then
    raise exception 'Snapshot % is already %; it cannot be changed further.', old.id, old.status
      using errcode = 'check_violation';
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.source_key is distinct from old.source_key
     or new.reporting_period_id is distinct from old.reporting_period_id
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.as_of_date is distinct from old.as_of_date
     or new.entered_by is distinct from old.entered_by
     or new.entered_at is distinct from old.entered_at
     or new.note is distinct from old.note then
    raise exception 'Snapshot provenance and values are immutable. Record a new snapshot to correct a figure.'
      using errcode = 'check_violation';
  end if;

  if new.status not in ('superseded','voided') then
    raise exception 'A recorded snapshot may only move to superseded or voided.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger organizational_snapshots_protect
  before update or delete on public.organizational_snapshots
  for each row execute function app.protect_organizational_snapshot();

-- Values are write-once: they exist only as part of their snapshot.
create or replace function app.protect_organizational_snapshot_value()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  raise exception 'Snapshot values are immutable. Record a new snapshot to correct a figure.'
    using errcode = 'check_violation';
end;
$$;

create trigger organizational_snapshot_values_protect
  before update or delete on public.organizational_snapshot_values
  for each row execute function app.protect_organizational_snapshot_value();

-- ----------------------------------------------------------------------------
-- Supersede
--
-- Security-definer so the state change and its back-reference happen
-- atomically, but permission is re-checked inside rather than assumed.
-- ----------------------------------------------------------------------------
create or replace function public.supersede_organizational_snapshot(
  p_old_snapshot_id uuid,
  p_new_snapshot_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_old public.organizational_snapshots;
  v_new public.organizational_snapshots;
begin
  select * into v_old from public.organizational_snapshots where id = p_old_snapshot_id;
  select * into v_new from public.organizational_snapshots where id = p_new_snapshot_id;
  if v_old.id is null or v_new.id is null then
    raise exception 'Snapshot not found.' using errcode = 'no_data_found';
  end if;
  if v_old.organization_id <> v_new.organization_id then
    raise exception 'Snapshots belong to different organizations.' using errcode = 'check_violation';
  end if;
  if not app.has_permission_in(v_old.organization_id, 'org_snapshot:manage') then
    raise exception 'Not authorized to supersede organizational snapshots.' using errcode = 'insufficient_privilege';
  end if;
  if v_old.id = v_new.id then
    raise exception 'A snapshot cannot supersede itself.' using errcode = 'check_violation';
  end if;

  update public.organizational_snapshots
  set status = 'superseded', superseded_by_id = p_new_snapshot_id
  where id = p_old_snapshot_id;
end;
$$;

-- `anon` is revoked explicitly, not just via PUBLIC: an unauthenticated
-- caller must never reach a security-definer function, and the default
-- grant survives a bare `revoke ... from public`.
revoke all on function public.supersede_organizational_snapshot(uuid, uuid) from public;
revoke all on function public.supersede_organizational_snapshot(uuid, uuid) from anon;
grant execute on function public.supersede_organizational_snapshot(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.external_data_sources enable row level security;
alter table public.external_data_sources force row level security;
alter table public.organizational_metric_definitions enable row level security;
alter table public.organizational_metric_definitions force row level security;
alter table public.organizational_snapshots enable row level security;
alter table public.organizational_snapshots force row level security;
alter table public.organizational_snapshot_values enable row level security;
alter table public.organizational_snapshot_values force row level security;

-- Reference vocabularies are readable by any authenticated user; they carry
-- no organization data. They are migration-controlled: no write policies.
create policy external_data_sources_select on public.external_data_sources
  for select to authenticated using (true);
create policy organizational_metric_definitions_select on public.organizational_metric_definitions
  for select to authenticated using (true);

-- Snapshots are organization data behind an explicit permission. Note there
-- is no self-scope escape hatch: a trainer has no business reading club
-- membership figures.
create policy organizational_snapshots_select on public.organizational_snapshots
  for select to authenticated
  using (app.has_permission_in(organization_id, 'org_snapshot:read'));

create policy organizational_snapshots_insert on public.organizational_snapshots
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'org_snapshot:enter')
    and entered_by = (select auth.uid())
    and status = 'recorded'
    and superseded_by_id is null
  );

-- Updates are lifecycle-only (the guard trigger enforces which fields may
-- move); RLS decides who may attempt one.
create policy organizational_snapshots_update on public.organizational_snapshots
  for update to authenticated
  using (app.has_permission_in(organization_id, 'org_snapshot:manage'))
  with check (app.has_permission_in(organization_id, 'org_snapshot:manage'));

-- No delete policy: history does not disappear.

create policy organizational_snapshot_values_select on public.organizational_snapshot_values
  for select to authenticated
  using (app.has_permission_in(organization_id, 'org_snapshot:read'));

create policy organizational_snapshot_values_insert on public.organizational_snapshot_values
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'org_snapshot:enter')
    and exists (
      select 1
      from public.organizational_snapshots s
      where s.id = snapshot_id
        and s.organization_id = organizational_snapshot_values.organization_id
        and s.status = 'recorded'
    )
  );
