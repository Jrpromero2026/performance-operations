-- ============================================================================
-- Performance Operations — Phase 9, Migration 29: goals and targets
--
-- Governed goals framework. A goal references an EXISTING catalog metric
-- (id + version + unit recorded at creation); no arbitrary formulas.
-- Progress is derived at read time by the analytics layer (engine result
-- vs approved target) — nothing here stores computed business metrics.
-- Completed goals are immutable; every transition and target change is
-- captured in performance_goal_events plus the org audit log.
-- ============================================================================

create table public.performance_goals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  -- metric reference (validated against the code catalog at the app layer;
  -- version + unit pinned so later catalog changes are detectable)
  metric_id        text not null,
  metric_version   text not null,
  metric_unit      text not null,
  -- scope (exactly one shape; org goals carry no narrower ids)
  scope_level      text not null check (scope_level in ('organization','department','trainer','service')),
  department_id    uuid references public.departments (id) on delete restrict,
  trainer_id       uuid references public.trainers (id) on delete restrict,
  service_id       uuid references public.services (id) on delete restrict,
  constraint performance_goals_scope_shape check (
    (scope_level = 'organization' and department_id is null and trainer_id is null and service_id is null)
    or (scope_level = 'department' and department_id is not null and trainer_id is null and service_id is null)
    or (scope_level = 'trainer' and trainer_id is not null and service_id is null)
    or (scope_level = 'service' and service_id is not null and trainer_id is null)
  ),
  -- target (metric-native units; currency stays integer cents)
  goal_type        text not null check (goal_type in ('minimum','maximum','exact','range','maintain','improvement')),
  target_value     bigint,
  target_low       bigint,
  target_high      bigint,
  constraint performance_goals_target_shape check (
    (goal_type in ('minimum','maximum','exact') and target_value is not null and target_low is null and target_high is null)
    or (goal_type = 'range' and target_low is not null and target_high is not null and target_low <= target_high and target_value is null)
    or (goal_type = 'maintain' and target_value is not null)
    or (goal_type = 'improvement' and target_value is not null)
  ),
  -- baseline (required for maintain/improvement; must be source-backed)
  baseline_period_id uuid references public.reporting_periods (id) on delete restrict,
  baseline_value     bigint,
  constraint performance_goals_baseline_shape check (
    goal_type not in ('maintain','improvement')
    or (baseline_period_id is not null and baseline_value is not null)
  ),
  -- window + cadence
  reporting_period_id uuid references public.reporting_periods (id) on delete restrict,
  start_date       date not null,
  end_date         date not null,
  constraint performance_goals_window check (start_date <= end_date),
  measurement_cadence text not null default 'period'
                   check (measurement_cadence in ('period','monthly','quarterly','fiscal_year')),
  -- lifecycle
  status           text not null default 'draft'
                   check (status in ('draft','active','achieved','missed','cancelled','archived')),
  owner_id         uuid references public.profiles (id) on delete set null,
  notes            text,
  created_by       uuid not null references public.profiles (id) on delete restrict,
  approved_by      uuid references public.profiles (id) on delete set null,
  approved_at      timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index performance_goals_org_idx on public.performance_goals (organization_id, status, start_date desc);
create index performance_goals_trainer_idx on public.performance_goals (trainer_id) where trainer_id is not null;
create index performance_goals_department_idx on public.performance_goals (department_id) where department_id is not null;

create trigger performance_goals_set_updated_at
  before update on public.performance_goals
  for each row execute function app.set_updated_at();

-- Domain event trail (immutable; one row per meaningful change).
create table public.performance_goal_events (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.performance_goals (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_type  text not null check (event_type in
    ('created','updated','target_changed','approved','achieved','missed','cancelled','archived')),
  from_status text,
  to_status   text,
  detail      jsonb not null default '{}'::jsonb,
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index performance_goal_events_goal_idx on public.performance_goal_events (goal_id, created_at);

-- Progress snapshots frozen into reports/packages (presentation record of
-- an engine result vs the target at a point in time — never recalculated).
create table public.performance_goal_progress_snapshots (
  id              uuid primary key default gen_random_uuid(),
  goal_id         uuid not null references public.performance_goals (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  as_of_date      date not null,
  metric_value    bigint,
  metric_health   text not null,
  progress_status text not null check (progress_status in
    ('not_started','in_progress','met','exceeded','missed','unavailable','blocked')),
  detail          jsonb not null default '{}'::jsonb,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index goal_progress_snapshots_goal_idx
  on public.performance_goal_progress_snapshots (goal_id, as_of_date desc);

-- ---------------------------------------------------------------- guards

-- Lifecycle + immutability enforcement. Completed goals (achieved/missed/
-- cancelled) accept ONLY archival; archived goals accept nothing. Approval
-- and completion transitions demand goal:approve. Definitional fields are
-- frozen after creation (metric/scope/window/type); targets may change
-- while draft (audited); active goals may change owner/notes only.
create or replace function app.protect_performance_goal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  definition_changed boolean;
  target_changed boolean;
begin
  definition_changed :=
       new.metric_id       is distinct from old.metric_id
    or new.metric_version  is distinct from old.metric_version
    or new.metric_unit     is distinct from old.metric_unit
    or new.scope_level     is distinct from old.scope_level
    or new.department_id   is distinct from old.department_id
    or new.trainer_id      is distinct from old.trainer_id
    or new.service_id      is distinct from old.service_id
    or new.goal_type       is distinct from old.goal_type
    or new.start_date      is distinct from old.start_date
    or new.end_date        is distinct from old.end_date
    or new.measurement_cadence is distinct from old.measurement_cadence
    or new.baseline_period_id  is distinct from old.baseline_period_id
    or new.baseline_value  is distinct from old.baseline_value
    or new.organization_id is distinct from old.organization_id
    or new.created_by      is distinct from old.created_by
    or new.created_at      is distinct from old.created_at;
  target_changed :=
       new.target_value is distinct from old.target_value
    or new.target_low   is distinct from old.target_low
    or new.target_high  is distinct from old.target_high;

  if old.status = 'archived' then
    raise exception 'goal_immutable: archived goals cannot change';
  end if;

  if old.status in ('achieved','missed','cancelled') then
    if new.status = 'archived'
       and not definition_changed and not target_changed
       and new.notes is not distinct from old.notes
       and new.owner_id is not distinct from old.owner_id then
      if not app.has_permission_in(old.organization_id, 'goal:archive') then
        raise exception 'goal_forbidden: goal:archive required';
      end if;
      return new;
    end if;
    raise exception 'goal_immutable: completed goals accept only archival';
  end if;

  if definition_changed then
    raise exception 'goal_immutable: metric, scope, window, and type are fixed at creation';
  end if;

  if target_changed then
    if old.status <> 'draft' then
      raise exception 'goal_immutable: targets change only while the goal is draft';
    end if;
    if not app.has_permission_in(old.organization_id, 'goal:update') then
      raise exception 'goal_forbidden: goal:update required';
    end if;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'active' then
      if not app.has_permission_in(old.organization_id, 'goal:approve') then
        raise exception 'goal_forbidden: goal:approve required to activate';
      end if;
      new.approved_by := (select auth.uid());
      new.approved_at := now();
    elsif old.status = 'draft' and new.status = 'cancelled' then
      if not app.has_permission_in(old.organization_id, 'goal:update') then
        raise exception 'goal_forbidden: goal:update required to cancel a draft';
      end if;
      new.completed_at := now();
    elsif old.status = 'active' and new.status in ('achieved','missed','cancelled') then
      if not app.has_permission_in(old.organization_id, 'goal:approve') then
        raise exception 'goal_forbidden: goal:approve required to complete';
      end if;
      new.completed_at := now();
    else
      raise exception 'goal_transition_invalid: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

create trigger performance_goals_protect
  before update on public.performance_goals
  for each row execute function app.protect_performance_goal();

-- Event trail is append-only.
create or replace function app.protect_goal_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'goal_events_append_only';
end;
$$;
create trigger performance_goal_events_protect
  before update or delete on public.performance_goal_events
  for each row execute function app.protect_goal_event();

-- Deterministic in-domain event capture for every goal change.
create or replace function app.log_performance_goal_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text;
begin
  if tg_op = 'INSERT' then
    insert into public.performance_goal_events
      (goal_id, organization_id, event_type, from_status, to_status, detail, actor_id)
    values
      (new.id, new.organization_id, 'created', null, new.status,
       jsonb_build_object('metric_id', new.metric_id, 'goal_type', new.goal_type),
       (select auth.uid()));
    return new;
  end if;
  if new.status is distinct from old.status then
    kind := case new.status
      when 'active' then 'approved'
      when 'achieved' then 'achieved'
      when 'missed' then 'missed'
      when 'cancelled' then 'cancelled'
      when 'archived' then 'archived'
      else 'updated' end;
  elsif new.target_value is distinct from old.target_value
     or new.target_low is distinct from old.target_low
     or new.target_high is distinct from old.target_high then
    kind := 'target_changed';
  else
    kind := 'updated';
  end if;
  insert into public.performance_goal_events
    (goal_id, organization_id, event_type, from_status, to_status, detail, actor_id)
  values
    (new.id, new.organization_id, kind, old.status, new.status,
     jsonb_build_object(
       'target_value_from', old.target_value, 'target_value_to', new.target_value,
       'target_low_from', old.target_low, 'target_low_to', new.target_low,
       'target_high_from', old.target_high, 'target_high_to', new.target_high),
     (select auth.uid()));
  return new;
end;
$$;
create trigger performance_goals_log_event
  after insert or update on public.performance_goals
  for each row execute function app.log_performance_goal_event();

-- -------------------------------------------------------------------- RLS

alter table public.performance_goals enable row level security;
alter table public.performance_goals force row level security;
alter table public.performance_goal_events enable row level security;
alter table public.performance_goal_events force row level security;
alter table public.performance_goal_progress_snapshots enable row level security;
alter table public.performance_goal_progress_snapshots force row level security;

-- Visibility: org-read roles see org-wide (department-scoped roles only
-- their departments' goals); trainers see exactly their own goals.
create policy performance_goals_select on public.performance_goals
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'goal:read')
    and (
      (app.has_permission_in(organization_id, 'appointment:read')
        and (not app.is_department_scoped_in(organization_id)
             or department_id in (select app.user_department_ids())))
      or trainer_id = app.current_trainer_id()
    )
  );

-- Creation: goal:create plus scope discipline — department-scoped actors
-- create only department/trainer goals inside their departments; nobody
-- department-scoped creates organization goals.
create policy performance_goals_insert on public.performance_goals
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and app.has_permission_in(organization_id, 'goal:create')
    and status = 'draft'
    and (
      not app.is_department_scoped_in(organization_id)
      or (scope_level in ('department','trainer')
          and department_id in (select app.user_department_ids()))
    )
  );

-- Updates flow through the protect trigger; RLS gates who may touch rows.
create policy performance_goals_update on public.performance_goals
  for update to authenticated
  using (
    (app.has_permission_in(organization_id, 'goal:update')
      or app.has_permission_in(organization_id, 'goal:approve')
      or app.has_permission_in(organization_id, 'goal:archive'))
    and (not app.is_department_scoped_in(organization_id)
         or department_id in (select app.user_department_ids()))
  )
  with check (
    (app.has_permission_in(organization_id, 'goal:update')
      or app.has_permission_in(organization_id, 'goal:approve')
      or app.has_permission_in(organization_id, 'goal:archive'))
    and (not app.is_department_scoped_in(organization_id)
         or department_id in (select app.user_department_ids()))
  );

-- No deletes: goals archive, never disappear.

create policy performance_goal_events_select on public.performance_goal_events
  for select to authenticated
  using (
    exists (
      select 1 from public.performance_goals g where g.id = goal_id
    )
  );
-- No client inserts on events: rows come only from the security-definer
-- trigger (deny by default — no insert policy exists).

create policy goal_progress_snapshots_select on public.performance_goal_progress_snapshots
  for select to authenticated
  using (
    exists (select 1 from public.performance_goals g where g.id = goal_id)
  );
create policy goal_progress_snapshots_insert on public.performance_goal_progress_snapshots
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and app.has_permission_in(organization_id, 'goal:read')
  );
