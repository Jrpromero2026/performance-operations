-- ============================================================================
-- Performance Operations — Phase 4, Migration 14: payroll domain
--
-- Payroll PREPARATION (gross trainer compensation) — explicitly NOT a tax,
-- withholding, benefits, or net-pay system.
--
-- Documented deviations from the proposed entity list:
--   * payroll_line_inputs + payroll_line_rule_traces are folded into
--     payroll_calculation_lines.calculation_trace (structured JSONB).
--   * payroll_adjustment_approvals + manual_time_entry_approvals are folded
--     into approval fields on the records themselves + audit events.
--   * payroll_approvals folds into run approval fields + immutable
--     payroll_snapshots; payroll_supersessions folds into supersedes /
--     superseded_by columns + payroll_run_events.
-- Additive compensation extensions: rounding_scope on plan versions;
-- basis_type + criteria on compensation_rules (engine fails closed when a
-- percentage/tier rule lacks basis, statuses, or rounding scope).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Compensation extensions (additive; nullable so existing rows are untouched;
-- the ENGINE requires them for percentage/tier methods — fail closed).
-- ----------------------------------------------------------------------------
alter table public.compensation_plan_versions
  add column rounding_scope text
    check (rounding_scope is null or rounding_scope in ('per_line', 'per_trainer'));

alter table public.compensation_rules
  add column basis_type text
    check (basis_type is null or basis_type in (
      'source_listed_amount', 'source_paid_amount', 'session_count',
      'coached_minutes', 'manual'
    )),
  add column criteria jsonb not null default '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- appointment_trainer_assignments — trainer roles on an appointment,
-- separate from client participants. The Phase-3 imported primary trainer
-- populates the initial assignment at calculation time (source 'import').
-- ----------------------------------------------------------------------------
create table public.appointment_trainer_assignments (
  id                 uuid primary key default gen_random_uuid(),
  appointment_id     uuid not null references public.appointments (id) on delete cascade,
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  trainer_id         uuid not null references public.trainers (id) on delete restrict,
  role               text not null default 'primary' check (role in (
    'primary', 'head_coach', 'assistant_coach', 'support_coach', 'observer', 'non_compensated'
  )),
  compensated_minutes int check (compensated_minutes is null or compensated_minutes >= 0),
  allocation_basis   text,
  source             text not null default 'import' check (source in ('import', 'manual')),
  confirmed_by       uuid references public.profiles (id) on delete set null,
  confirmed_at       timestamptz,
  status             text not null default 'active' check (status in ('active', 'removed')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (appointment_id, trainer_id, role)
);

create index appt_trainer_assignments_appointment_idx
  on public.appointment_trainer_assignments (appointment_id);
create index appt_trainer_assignments_trainer_idx
  on public.appointment_trainer_assignments (trainer_id);
create index appt_trainer_assignments_org_idx
  on public.appointment_trainer_assignments (organization_id);

create trigger appointment_trainer_assignments_set_updated_at
  before update on public.appointment_trainer_assignments
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- payroll_runs
-- ----------------------------------------------------------------------------
create table public.payroll_runs (
  id                           uuid primary key default gen_random_uuid(),
  organization_id              uuid not null references public.organizations (id) on delete restrict,
  reporting_period_id          uuid not null references public.reporting_periods (id) on delete restrict,
  name                         text not null,
  run_number                   int not null default 1 check (run_number >= 1),
  status                       text not null default 'draft' check (status in (
    'draft', 'calculating', 'needs_review', 'ready_for_approval', 'approved',
    'posted', 'locked', 'reopened', 'superseded', 'failed', 'voided'
  )),
  calculation_version          text not null default 'calc-v1',
  source_appointment_cutoff_at timestamptz,
  calculation_started_at       timestamptz,
  calculation_completed_at     timestamptz,
  reviewed_by                  uuid references public.profiles (id) on delete set null,
  reviewed_at                  timestamptz,
  approved_by                  uuid references public.profiles (id) on delete set null,
  approved_at                  timestamptz,
  posted_by                    uuid references public.profiles (id) on delete set null,
  posted_at                    timestamptz,
  locked_by                    uuid references public.profiles (id) on delete set null,
  locked_at                    timestamptz,
  reopened_by                  uuid references public.profiles (id) on delete set null,
  reopened_at                  timestamptz,
  reopen_reason                text,
  voided_by                    uuid references public.profiles (id) on delete set null,
  voided_at                    timestamptz,
  void_reason                  text,
  supersedes_payroll_run_id    uuid references public.payroll_runs (id) on delete restrict,
  superseded_by_payroll_run_id uuid references public.payroll_runs (id) on delete restrict,
  gross_compensation_total_cents bigint not null default 0,
  adjustment_total_cents       bigint not null default 0,
  final_compensation_total_cents bigint not null default 0,
  trainer_count                int not null default 0,
  appointment_count            int not null default 0,
  blocking_issue_count         int not null default 0,
  warning_count                int not null default 0,
  failure_code                 text,
  sanitized_failure_message    text,
  metadata                     jsonb not null default '{}'::jsonb,
  created_by                   uuid references public.profiles (id) on delete set null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create index payroll_runs_org_idx on public.payroll_runs (organization_id);
create index payroll_runs_period_idx on public.payroll_runs (reporting_period_id);
create index payroll_runs_org_status_idx on public.payroll_runs (organization_id, status);
-- one working/final run per org+period; superseded/voided/failed step aside
create unique index payroll_runs_one_active_uidx
  on public.payroll_runs (organization_id, reporting_period_id)
  where status not in ('superseded', 'voided', 'failed');

create trigger payroll_runs_set_updated_at
  before update on public.payroll_runs
  for each row execute function app.set_updated_at();

-- State machine (DB-enforced; RPCs and engine follow the same matrix).
create or replace function app.payroll_run_transition_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;
  allowed := case old.status
    when 'draft'              then new.status in ('calculating', 'voided')
    when 'calculating'        then new.status in ('needs_review', 'ready_for_approval', 'failed')
    when 'needs_review'       then new.status in ('calculating', 'ready_for_approval', 'voided', 'failed')
    when 'ready_for_approval' then new.status in ('approved', 'needs_review', 'calculating')
    when 'approved'           then new.status in ('posted', 'needs_review')
    when 'posted'             then new.status in ('locked', 'reopened', 'superseded')
    when 'locked'             then new.status in ('reopened', 'superseded')
    when 'reopened'           then new.status in ('calculating', 'needs_review', 'voided')
    when 'failed'             then new.status in ('calculating', 'voided')
    when 'superseded'         then false
    when 'voided'             then false
    else false
  end;
  if not allowed then
    raise exception 'invalid_payroll_transition_%_to_%', old.status, new.status
      using errcode = '42501';
  end if;
  if new.status = 'posted' and old.posted_at is not null then
    raise exception 'payroll_already_posted' using errcode = '42501';
  end if;
  if new.status = 'locked' and old.status <> 'posted' then
    raise exception 'payroll_lock_requires_posted' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger payroll_runs_transition_guard
  before update on public.payroll_runs
  for each row execute function app.payroll_run_transition_guard();

-- payroll_run_events — append-only transition + action history.
create table public.payroll_run_events (
  id              uuid primary key default gen_random_uuid(),
  payroll_run_id  uuid not null references public.payroll_runs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  from_status     text,
  to_status       text not null,
  actor_id        uuid references public.profiles (id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now()
);
create index payroll_run_events_run_idx on public.payroll_run_events (payroll_run_id);

-- ----------------------------------------------------------------------------
-- payroll_trainer_summaries — every amount reconciles to lines+adjustments.
-- ----------------------------------------------------------------------------
create table public.payroll_trainer_summaries (
  id                          uuid primary key default gen_random_uuid(),
  payroll_run_id              uuid not null references public.payroll_runs (id) on delete cascade,
  organization_id             uuid not null references public.organizations (id) on delete restrict,
  trainer_id                  uuid not null references public.trainers (id) on delete restrict,
  compensation_assignment_id  uuid references public.trainer_compensation_assignments (id) on delete set null,
  compensation_plan_version_id uuid references public.compensation_plan_versions (id) on delete set null,
  calculation_status          text not null default 'pending' check (calculation_status in (
    'pending', 'calculated', 'blocked'
  )),
  appointment_count           int not null default 0,
  completed_session_count     int not null default 0,
  compensated_minutes         int not null default 0,
  eligible_basis_total_cents  bigint not null default 0,
  commission_compensation_cents bigint not null default 0,
  flat_rate_compensation_cents bigint not null default 0,
  hourly_compensation_cents   bigint not null default 0,
  team_compensation_cents     bigint not null default 0,
  bonus_total_cents           bigint not null default 0,
  deduction_total_cents       bigint not null default 0,
  adjustment_total_cents      bigint not null default 0,
  final_gross_compensation_cents bigint not null default 0,
  blocking_issue_count        int not null default 0,
  warning_count               int not null default 0,
  review_status               text not null default 'unreviewed' check (review_status in (
    'unreviewed', 'reviewed'
  )),
  reviewed_by                 uuid references public.profiles (id) on delete set null,
  reviewed_at                 timestamptz,
  notes                       text not null default '',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (payroll_run_id, trainer_id)
);

create index payroll_trainer_summaries_run_idx
  on public.payroll_trainer_summaries (payroll_run_id);
create index payroll_trainer_summaries_trainer_idx
  on public.payroll_trainer_summaries (trainer_id);

create trigger payroll_trainer_summaries_set_updated_at
  before update on public.payroll_trainer_summaries
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- payroll_calculation_lines — transparent, traceable, immutable once the run
-- leaves mutable states (trigger below).
-- ----------------------------------------------------------------------------
create table public.payroll_calculation_lines (
  id                           uuid primary key default gen_random_uuid(),
  payroll_run_id               uuid not null references public.payroll_runs (id) on delete cascade,
  trainer_summary_id           uuid not null references public.payroll_trainer_summaries (id) on delete cascade,
  organization_id              uuid not null references public.organizations (id) on delete restrict,
  trainer_id                   uuid not null references public.trainers (id) on delete restrict,
  appointment_id               uuid references public.appointments (id) on delete restrict,
  appointment_trainer_assignment_id uuid references public.appointment_trainer_assignments (id) on delete set null,
  manual_time_entry_id         uuid,
  payroll_adjustment_id        uuid,
  compensation_plan_version_id uuid references public.compensation_plan_versions (id) on delete set null,
  compensation_rule_id         uuid references public.compensation_rules (id) on delete set null,
  line_type                    text not null check (line_type in (
    'session_flat', 'session_percentage', 'commission_tier', 'hourly',
    'team_role', 'evaluation_bonus', 'manual_time', 'adjustment', 'carry_forward'
  )),
  calculation_status           text not null default 'calculated' check (calculation_status in (
    'calculated', 'blocked', 'excluded'
  )),
  input_quantity               bigint,
  input_unit                   text,
  basis_amount_cents           bigint,
  rate_amount_cents            bigint,
  rate_basis_points            int,
  calculated_amount_cents      bigint not null default 0,
  rounded_amount_cents         bigint not null default 0,
  rounding_method              text not null default 'half_away_from_zero',
  eligibility_result           text not null default 'eligible' check (eligibility_result in (
    'eligible', 'ineligible', 'blocked'
  )),
  exclusion_reason             text,
  calculation_formula_version  text not null default 'calc-v1',
  calculation_trace            jsonb not null default '{}'::jsonb,
  created_at                   timestamptz not null default now()
);

create index payroll_lines_run_idx on public.payroll_calculation_lines (payroll_run_id);
create index payroll_lines_summary_idx on public.payroll_calculation_lines (trainer_summary_id);
create index payroll_lines_appointment_idx on public.payroll_calculation_lines (appointment_id);
create index payroll_lines_org_idx on public.payroll_calculation_lines (organization_id);

-- Mutable only while the run is in a recalculable state.
create or replace function app.payroll_run_is_mutable(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payroll_runs r
    where r.id = p_run_id
      and r.status in ('draft', 'calculating', 'needs_review', 'ready_for_approval', 'reopened', 'failed')
  );
$$;
revoke all on function app.payroll_run_is_mutable(uuid) from public;
grant execute on function app.payroll_run_is_mutable(uuid) to authenticated;

create or replace function app.protect_payroll_line()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.payroll_run_is_mutable(coalesce(old.payroll_run_id, new.payroll_run_id)) then
    raise exception 'payroll_lines_frozen' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger payroll_lines_protect_update
  before update or delete on public.payroll_calculation_lines
  for each row execute function app.protect_payroll_line();

-- ----------------------------------------------------------------------------
-- payroll_issues
-- ----------------------------------------------------------------------------
create table public.payroll_issues (
  id                   uuid primary key default gen_random_uuid(),
  payroll_run_id       uuid not null references public.payroll_runs (id) on delete cascade,
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  trainer_id           uuid references public.trainers (id) on delete set null,
  appointment_id       uuid references public.appointments (id) on delete set null,
  compensation_rule_id uuid references public.compensation_rules (id) on delete set null,
  code                 text not null,
  severity             text not null check (severity in ('blocking', 'warning', 'info')),
  entity_type          text,
  entity_id            uuid,
  message              text not null,
  suggested_action     text,
  resolution_status    text not null default 'open' check (resolution_status in (
    'open', 'resolved', 'acknowledged'
  )),
  resolution_reason    text,
  resolved_by          uuid references public.profiles (id) on delete set null,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index payroll_issues_run_sev_idx
  on public.payroll_issues (payroll_run_id, severity, resolution_status);
create index payroll_issues_trainer_idx on public.payroll_issues (trainer_id);

create trigger payroll_issues_set_updated_at
  before update on public.payroll_issues
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- manual_time_entries (approval fields inline; audited)
-- ----------------------------------------------------------------------------
create table public.manual_time_entries (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  trainer_id           uuid not null references public.trainers (id) on delete restrict,
  reporting_period_id  uuid not null references public.reporting_periods (id) on delete restrict,
  work_date            date not null,
  work_category        text not null check (work_category in (
    'admin', 'programming', 'meeting', 'facility_support', 'floor_shift', 'training', 'other'
  )),
  description          text not null,
  requested_minutes    int not null check (requested_minutes > 0 and requested_minutes <= 24 * 60),
  approved_minutes     int check (approved_minutes is null or (approved_minutes >= 0 and approved_minutes <= 24 * 60)),
  compensation_purpose text not null default 'administrative' check (compensation_purpose in (
    'primary', 'team_training', 'evaluations', 'nutrition', 'administrative'
  )),
  status               text not null default 'draft' check (status in (
    'draft', 'submitted', 'approved', 'rejected', 'included', 'voided'
  )),
  submitted_by         uuid references public.profiles (id) on delete set null,
  submitted_at         timestamptz,
  approved_by          uuid references public.profiles (id) on delete set null,
  approved_at          timestamptz,
  rejected_by          uuid references public.profiles (id) on delete set null,
  rejected_at          timestamptz,
  rejection_reason     text,
  payroll_run_id       uuid references public.payroll_runs (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index manual_time_entries_org_period_idx
  on public.manual_time_entries (organization_id, reporting_period_id);
create index manual_time_entries_trainer_idx on public.manual_time_entries (trainer_id);
create index manual_time_entries_status_idx
  on public.manual_time_entries (organization_id, status);

create trigger manual_time_entries_set_updated_at
  before update on public.manual_time_entries
  for each row execute function app.set_updated_at();

-- Included entries freeze; approval edits are guarded in actions + here.
create or replace function app.protect_time_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'included'
     and not (new.status = 'included' and new.payroll_run_id is not distinct from old.payroll_run_id) then
    -- allow release back to approved ONLY while the run is mutable (recalc)
    if not (new.status = 'approved' and app.payroll_run_is_mutable(old.payroll_run_id)) then
      raise exception 'included_time_entry_immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger manual_time_entries_protect
  before update on public.manual_time_entries
  for each row execute function app.protect_time_entry();

-- ----------------------------------------------------------------------------
-- payroll_adjustments (approval fields inline; supersession supported)
-- ----------------------------------------------------------------------------
create table public.payroll_adjustments (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  payroll_run_id            uuid references public.payroll_runs (id) on delete set null,
  reporting_period_id       uuid not null references public.reporting_periods (id) on delete restrict,
  trainer_id                uuid not null references public.trainers (id) on delete restrict,
  adjustment_type           text not null check (adjustment_type in (
    'bonus', 'deduction', 'correction', 'reimbursement', 'carry_forward', 'other'
  )),
  amount_cents              bigint not null check (amount_cents >= 0),
  reason                    text not null,
  supporting_reference      text,
  status                    text not null default 'draft' check (status in (
    'draft', 'submitted', 'approved', 'rejected', 'included', 'voided'
  )),
  requested_by              uuid references public.profiles (id) on delete set null,
  requested_at              timestamptz,
  approved_by               uuid references public.profiles (id) on delete set null,
  approved_at               timestamptz,
  rejected_by               uuid references public.profiles (id) on delete set null,
  rejected_at               timestamptz,
  rejection_reason          text,
  supersedes_adjustment_id  uuid references public.payroll_adjustments (id) on delete restrict,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index payroll_adjustments_org_period_idx
  on public.payroll_adjustments (organization_id, reporting_period_id);
create index payroll_adjustments_trainer_idx on public.payroll_adjustments (trainer_id);
create index payroll_adjustments_run_idx on public.payroll_adjustments (payroll_run_id);

create trigger payroll_adjustments_set_updated_at
  before update on public.payroll_adjustments
  for each row execute function app.set_updated_at();

create or replace function app.protect_adjustment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'included'
     and not (new.status = 'included' and new.payroll_run_id is not distinct from old.payroll_run_id) then
    if not (new.status = 'approved' and app.payroll_run_is_mutable(old.payroll_run_id)) then
      raise exception 'included_adjustment_immutable' using errcode = '42501';
    end if;
  end if;
  -- amounts/type/trainer frozen once approved (corrections supersede)
  if old.status in ('approved', 'included')
     and (new.amount_cents is distinct from old.amount_cents
          or new.adjustment_type is distinct from old.adjustment_type
          or new.trainer_id is distinct from old.trainer_id) then
    raise exception 'approved_adjustment_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger payroll_adjustments_protect
  before update on public.payroll_adjustments
  for each row execute function app.protect_adjustment();

-- ----------------------------------------------------------------------------
-- payroll_snapshots — immutable frozen state at posting (and reposts).
-- ----------------------------------------------------------------------------
create table public.payroll_snapshots (
  id               uuid primary key default gen_random_uuid(),
  payroll_run_id   uuid not null references public.payroll_runs (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  snapshot_version int not null check (snapshot_version >= 1),
  kind             text not null default 'posted' check (kind in ('posted', 'reopen_backup')),
  payload          jsonb not null,
  lines_sha256     text not null,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (payroll_run_id, snapshot_version)
);
create index payroll_snapshots_run_idx on public.payroll_snapshots (payroll_run_id);

-- ----------------------------------------------------------------------------
-- payroll_exports — audit of generated exports/statements.
-- ----------------------------------------------------------------------------
create table public.payroll_exports (
  id               uuid primary key default gen_random_uuid(),
  payroll_run_id   uuid not null references public.payroll_runs (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  export_type      text not null check (export_type in (
    'department_csv', 'trainer_statement_csv', 'statement_view', 'summary_view'
  )),
  trainer_id       uuid references public.trainers (id) on delete set null,
  snapshot_version int,
  generated_by     uuid references public.profiles (id) on delete set null,
  superseded       boolean not null default false,
  created_at       timestamptz not null default now()
);
create index payroll_exports_run_idx on public.payroll_exports (payroll_run_id);

-- ----------------------------------------------------------------------------
-- Permissions (additive; intentional grants — see docs/PAYROLL_SECURITY.md)
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('payroll:create',            'Create payroll runs'),
  ('payroll:review',            'Review trainer payroll summaries'),
  ('payroll:post',              'Post approved payroll runs'),
  ('payroll:lock',              'Lock posted payroll runs'),
  ('payroll:void',              'Void unposted payroll runs'),
  ('payroll:view_calculation_trace', 'View payroll calculation traces'),
  ('payroll:manage_adjustments', 'Create and submit payroll adjustments'),
  ('payroll:approve_adjustments', 'Approve or reject payroll adjustments'),
  ('payroll:manage_time',       'Create and submit manual time entries'),
  ('payroll:approve_time',      'Approve or reject manual time entries')
on conflict (key) do nothing;

with grants(role_key, permission_key) as (
  values
  ('platform_admin', 'payroll:create'), ('platform_admin', 'payroll:review'),
  ('platform_admin', 'payroll:post'), ('platform_admin', 'payroll:lock'),
  ('platform_admin', 'payroll:void'), ('platform_admin', 'payroll:view_calculation_trace'),
  ('platform_admin', 'payroll:manage_adjustments'), ('platform_admin', 'payroll:approve_adjustments'),
  ('platform_admin', 'payroll:manage_time'), ('platform_admin', 'payroll:approve_time'),
  ('workspace_admin', 'payroll:create'), ('workspace_admin', 'payroll:review'),
  ('workspace_admin', 'payroll:post'), ('workspace_admin', 'payroll:lock'),
  ('workspace_admin', 'payroll:void'), ('workspace_admin', 'payroll:view_calculation_trace'),
  ('workspace_admin', 'payroll:manage_adjustments'), ('workspace_admin', 'payroll:approve_adjustments'),
  ('workspace_admin', 'payroll:manage_time'), ('workspace_admin', 'payroll:approve_time'),
  ('payroll_manager', 'payroll:create'), ('payroll_manager', 'payroll:review'),
  ('payroll_manager', 'payroll:post'), ('payroll_manager', 'payroll:view_calculation_trace'),
  ('payroll_manager', 'payroll:manage_adjustments'), ('payroll_manager', 'payroll:approve_adjustments'),
  ('payroll_manager', 'payroll:manage_time'), ('payroll_manager', 'payroll:approve_time'),
  -- trainers may submit their own time (RLS narrows to self); no approvals
  ('trainer', 'payroll:manage_time')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.key = g.role_key
join public.permissions p on p.key = g.permission_key
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS — deny by default; trainer self-scope on summaries/lines/statements
-- limited to posted/locked runs; no broad write policies.
-- ----------------------------------------------------------------------------
alter table public.appointment_trainer_assignments enable row level security;
alter table public.appointment_trainer_assignments force row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_runs force row level security;
alter table public.payroll_run_events enable row level security;
alter table public.payroll_run_events force row level security;
alter table public.payroll_trainer_summaries enable row level security;
alter table public.payroll_trainer_summaries force row level security;
alter table public.payroll_calculation_lines enable row level security;
alter table public.payroll_calculation_lines force row level security;
alter table public.payroll_issues enable row level security;
alter table public.payroll_issues force row level security;
alter table public.manual_time_entries enable row level security;
alter table public.manual_time_entries force row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.payroll_adjustments force row level security;
alter table public.payroll_snapshots enable row level security;
alter table public.payroll_snapshots force row level security;
alter table public.payroll_exports enable row level security;
alter table public.payroll_exports force row level security;

create policy appt_trainer_assignments_select on public.appointment_trainer_assignments
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'appointment:read')
    or trainer_id = app.current_trainer_id()
  );
create policy appt_trainer_assignments_insert on public.appointment_trainer_assignments
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'payroll:calculate'));
create policy appt_trainer_assignments_update on public.appointment_trainer_assignments
  for update to authenticated
  using (app.has_permission_in(organization_id, 'payroll:calculate'))
  with check (app.has_permission_in(organization_id, 'payroll:calculate'));

create policy payroll_runs_select on public.payroll_runs
  for select to authenticated
  using (app.has_permission_in(organization_id, 'payroll:read'));
create policy payroll_runs_insert on public.payroll_runs
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'payroll:create')
    and created_by = (select auth.uid())
  );
create policy payroll_runs_update on public.payroll_runs
  for update to authenticated
  using (app.has_permission_in(organization_id, 'payroll:calculate'))
  with check (app.has_permission_in(organization_id, 'payroll:calculate'));

create policy payroll_run_events_select on public.payroll_run_events
  for select to authenticated
  using (app.has_permission_in(organization_id, 'payroll:read'));
create policy payroll_run_events_insert on public.payroll_run_events
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'payroll:calculate'));

create policy payroll_trainer_summaries_select on public.payroll_trainer_summaries
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'payroll:read')
    or (
      trainer_id = app.current_trainer_id()
      and exists (
        select 1 from public.payroll_runs r
        where r.id = payroll_run_id and r.status in ('posted', 'locked')
      )
    )
  );
create policy payroll_trainer_summaries_write on public.payroll_trainer_summaries
  for all to authenticated
  using (app.has_permission_in(organization_id, 'payroll:calculate'))
  with check (app.has_permission_in(organization_id, 'payroll:calculate'));

create policy payroll_lines_select on public.payroll_calculation_lines
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'payroll:read')
    or (
      trainer_id = app.current_trainer_id()
      and exists (
        select 1 from public.payroll_runs r
        where r.id = payroll_run_id and r.status in ('posted', 'locked')
      )
    )
  );
create policy payroll_lines_insert on public.payroll_calculation_lines
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'payroll:calculate'));
create policy payroll_lines_update on public.payroll_calculation_lines
  for update to authenticated
  using (app.has_permission_in(organization_id, 'payroll:calculate'))
  with check (app.has_permission_in(organization_id, 'payroll:calculate'));
create policy payroll_lines_delete on public.payroll_calculation_lines
  for delete to authenticated
  using (app.has_permission_in(organization_id, 'payroll:calculate'));

create policy payroll_issues_select on public.payroll_issues
  for select to authenticated
  using (app.has_permission_in(organization_id, 'payroll:read'));
create policy payroll_issues_insert on public.payroll_issues
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'payroll:calculate'));
create policy payroll_issues_update on public.payroll_issues
  for update to authenticated
  using (app.has_permission_in(organization_id, 'payroll:review'))
  with check (app.has_permission_in(organization_id, 'payroll:review'));
create policy payroll_issues_delete on public.payroll_issues
  for delete to authenticated
  using (app.has_permission_in(organization_id, 'payroll:calculate'));

create policy manual_time_entries_select on public.manual_time_entries
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'payroll:read')
    or trainer_id = app.current_trainer_id()
  );
create policy manual_time_entries_insert on public.manual_time_entries
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'payroll:manage_time')
    and (
      app.has_permission_in(organization_id, 'payroll:approve_time')
      or trainer_id = app.current_trainer_id()
    )
  );
create policy manual_time_entries_update on public.manual_time_entries
  for update to authenticated
  using (
    app.has_permission_in(organization_id, 'payroll:approve_time')
    or (
      trainer_id = app.current_trainer_id()
      and app.has_permission_in(organization_id, 'payroll:manage_time')
    )
  )
  with check (
    app.has_permission_in(organization_id, 'payroll:approve_time')
    or (
      trainer_id = app.current_trainer_id()
      and app.has_permission_in(organization_id, 'payroll:manage_time')
    )
  );

create policy payroll_adjustments_select on public.payroll_adjustments
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'payroll:read')
    or trainer_id = app.current_trainer_id()
  );
create policy payroll_adjustments_insert on public.payroll_adjustments
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'payroll:manage_adjustments'));
create policy payroll_adjustments_update on public.payroll_adjustments
  for update to authenticated
  using (app.has_permission_in(organization_id, 'payroll:manage_adjustments'))
  with check (app.has_permission_in(organization_id, 'payroll:manage_adjustments'));

create policy payroll_snapshots_select on public.payroll_snapshots
  for select to authenticated
  using (app.has_permission_in(organization_id, 'payroll:read'));
-- snapshots inserted only via security-definer RPCs; no user insert policy.

create policy payroll_exports_select on public.payroll_exports
  for select to authenticated
  using (app.has_permission_in(organization_id, 'payroll:read'));
create policy payroll_exports_insert on public.payroll_exports
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'payroll:export')
    or (
      trainer_id = app.current_trainer_id()
      and export_type in ('statement_view', 'trainer_statement_csv')
    )
  );
