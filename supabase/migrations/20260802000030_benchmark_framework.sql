-- ============================================================================
-- Performance Operations — Phase 9, Migration 30: benchmark framework
--
-- Governed benchmarks WITHOUT invented values. Every benchmark records an
-- explicit source type and evidence; the application never seeds an
-- "industry" number. Internal-historical values are computed by the
-- analytics layer from engine results at creation time and stored WITH
-- their source citation (metric + period range). Approval is required
-- before a benchmark participates in comparisons; deprecation preserves
-- history (no deletes).
-- ============================================================================

create table public.performance_benchmarks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  metric_id        text not null,
  metric_version   text not null,
  metric_unit      text not null,
  scope_level      text not null check (scope_level in ('organization','department','trainer','service')),
  department_id    uuid references public.departments (id) on delete restrict,
  trainer_id       uuid references public.trainers (id) on delete restrict,
  service_id       uuid references public.services (id) on delete restrict,
  constraint performance_benchmarks_scope_shape check (
    (scope_level = 'organization' and department_id is null and trainer_id is null and service_id is null)
    or (scope_level = 'department' and department_id is not null and trainer_id is null and service_id is null)
    or (scope_level = 'trainer' and trainer_id is not null and service_id is null)
    or (scope_level = 'service' and service_id is not null and trainer_id is null)
  ),
  source_type      text not null check (source_type in (
    'org_historical_median',
    'org_historical_best',
    'department_historical_median',
    'trainer_historical_baseline',
    'internal_standard',
    'external_reference')),
  -- The benchmark value in metric-native units (integer cents for money).
  value            bigint not null,
  -- Evidence: internal sources cite the metric + source period range the
  -- value was computed from; external references cite the owner-provided
  -- document/source. NEVER empty.
  evidence         text not null check (char_length(evidence) between 1 and 2000),
  source_period_from date,
  source_period_to   date,
  constraint performance_benchmarks_internal_evidence check (
    source_type in ('internal_standard','external_reference')
    or (source_period_from is not null and source_period_to is not null)
  ),
  effective_from   date not null,
  effective_to     date,
  constraint performance_benchmarks_effective check (
    effective_to is null or effective_from <= effective_to
  ),
  status           text not null default 'draft'
                   check (status in ('draft','approved','deprecated','archived')),
  notes            text,
  created_by       uuid not null references public.profiles (id) on delete restrict,
  approved_by      uuid references public.profiles (id) on delete set null,
  approved_at      timestamptz,
  deprecated_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index performance_benchmarks_org_idx
  on public.performance_benchmarks (organization_id, metric_id, status);

create trigger performance_benchmarks_set_updated_at
  before update on public.performance_benchmarks
  for each row execute function app.set_updated_at();

-- Lifecycle guard: value/evidence/scope freeze at approval; approved
-- benchmarks may only be deprecated (then archived). Approval requires
-- benchmark:approve; deprecation/archival requires benchmark:archive.
create or replace function app.protect_performance_benchmark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  frozen_changed boolean;
begin
  frozen_changed :=
       new.metric_id      is distinct from old.metric_id
    or new.metric_version is distinct from old.metric_version
    or new.metric_unit    is distinct from old.metric_unit
    or new.scope_level    is distinct from old.scope_level
    or new.department_id  is distinct from old.department_id
    or new.trainer_id     is distinct from old.trainer_id
    or new.service_id     is distinct from old.service_id
    or new.source_type    is distinct from old.source_type
    or new.value          is distinct from old.value
    or new.evidence       is distinct from old.evidence
    or new.source_period_from is distinct from old.source_period_from
    or new.source_period_to   is distinct from old.source_period_to
    or new.organization_id is distinct from old.organization_id
    or new.created_by     is distinct from old.created_by
    or new.created_at     is distinct from old.created_at;

  if old.status = 'archived' then
    raise exception 'benchmark_immutable: archived benchmarks cannot change';
  end if;
  if old.status in ('approved','deprecated') and frozen_changed then
    raise exception 'benchmark_immutable: approved benchmark content is frozen — deprecate and create a new one';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'approved' then
      if not app.has_permission_in(old.organization_id, 'benchmark:approve') then
        raise exception 'benchmark_forbidden: benchmark:approve required';
      end if;
      new.approved_by := (select auth.uid());
      new.approved_at := now();
    elsif old.status = 'approved' and new.status = 'deprecated' then
      if not app.has_permission_in(old.organization_id, 'benchmark:archive') then
        raise exception 'benchmark_forbidden: benchmark:archive required';
      end if;
      new.deprecated_at := now();
    elsif old.status in ('draft','deprecated') and new.status = 'archived' then
      if not app.has_permission_in(old.organization_id, 'benchmark:archive') then
        raise exception 'benchmark_forbidden: benchmark:archive required';
      end if;
    else
      raise exception 'benchmark_transition_invalid: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

create trigger performance_benchmarks_protect
  before update on public.performance_benchmarks
  for each row execute function app.protect_performance_benchmark();

-- -------------------------------------------------------------------- RLS

alter table public.performance_benchmarks enable row level security;
alter table public.performance_benchmarks force row level security;

create policy performance_benchmarks_select on public.performance_benchmarks
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'benchmark:read')
    and (
      (app.has_permission_in(organization_id, 'appointment:read')
        and (not app.is_department_scoped_in(organization_id)
             or scope_level = 'organization'
             or department_id in (select app.user_department_ids())))
      or trainer_id = app.current_trainer_id()
    )
  );

create policy performance_benchmarks_insert on public.performance_benchmarks
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and app.has_permission_in(organization_id, 'benchmark:create')
    and status = 'draft'
  );

create policy performance_benchmarks_update on public.performance_benchmarks
  for update to authenticated
  using (
    app.has_permission_in(organization_id, 'benchmark:create')
    or app.has_permission_in(organization_id, 'benchmark:approve')
    or app.has_permission_in(organization_id, 'benchmark:archive')
  )
  with check (
    app.has_permission_in(organization_id, 'benchmark:create')
    or app.has_permission_in(organization_id, 'benchmark:approve')
    or app.has_permission_in(organization_id, 'benchmark:archive')
  );

-- No deletes: benchmarks deprecate/archive, never disappear.
