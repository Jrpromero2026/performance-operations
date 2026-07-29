-- ============================================================================
-- Performance Operations — Phase 4, Migration 15: payroll RPCs + guards
--
-- Controlled security-definer functions for high-risk transitions (posting,
-- locking, reopening, voiding, supersession) and the appointment/import
-- dependency guards that Phase 3 documented as a hard obligation.
-- Every function: pinned search_path, caller authorization re-validated,
-- organization scope re-validated, minimal logic, audited.
-- ============================================================================

-- Late FKs for calculation lines → time entries / adjustments.
alter table public.payroll_calculation_lines
  add constraint payroll_lines_time_entry_fkey
  foreign key (manual_time_entry_id) references public.manual_time_entries (id) on delete restrict,
  add constraint payroll_lines_adjustment_fkey
  foreign key (payroll_adjustment_id) references public.payroll_adjustments (id) on delete restrict;

-- ----------------------------------------------------------------------------
-- app.payroll_protects_appointment(appointment_id) — is the appointment
-- referenced by an approved/posted/locked payroll run?
-- ----------------------------------------------------------------------------
create or replace function app.payroll_protects_appointment(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_calculation_lines l
    join public.payroll_runs r on r.id = l.payroll_run_id
    where l.appointment_id = p_appointment_id
      and r.status in ('approved', 'posted', 'locked')
  );
$$;
revoke all on function app.payroll_protects_appointment(uuid) from public;
grant execute on function app.payroll_protects_appointment(uuid) to authenticated;

-- Appointment guard: material changes to payroll-protected appointments are
-- blocked at the database level (correction/reversal must go through a
-- controlled payroll reopening/supersession first).
create or replace function app.protect_payroll_dependent_appointment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.canonical_status is distinct from old.canonical_status
      or new.record_state   is distinct from old.record_state
      or new.trainer_id     is distinct from old.trainer_id
      or new.department_id  is distinct from old.department_id
      or new.start_at       is distinct from old.start_at
      or new.duration_minutes is distinct from old.duration_minutes)
     and app.payroll_protects_appointment(old.id) then
    raise exception 'appointment_protected_by_payroll' using errcode = '42501',
      hint = 'Reopen or supersede the dependent payroll run first.';
  end if;
  return new;
end;
$$;

create trigger appointments_payroll_dependency_guard
  before update on public.appointments
  for each row execute function app.protect_payroll_dependent_appointment();

-- ----------------------------------------------------------------------------
-- app.reverse_import_batch — REDEFINED additively (applied migrations remain
-- untouched). Adds the payroll dependency guard: reversal fails closed when
-- any appointment of the batch is referenced by approved/posted/locked
-- payroll, and reports the dependent run ids.
-- ----------------------------------------------------------------------------
create or replace function app.reverse_import_batch(p_batch_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_batch    public.import_batches%rowtype;
  v_reversed int;
  v_dependent uuid[];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'reversal_reason_required' using errcode = 'P0008';
  end if;

  select * into v_batch from public.import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'batch_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_batch.organization_id, 'import:reverse') then
    raise exception 'not_authorized_to_reverse' using errcode = '42501';
  end if;
  if v_batch.status <> 'posted' then
    raise exception 'batch_not_posted' using errcode = 'P0003';
  end if;
  if v_batch.reversed_at is not null then
    raise exception 'batch_already_reversed' using errcode = 'P0004';
  end if;

  -- PAYROLL DEPENDENCY GUARD (Phase 4): fail closed with the dependent runs.
  select coalesce(array_agg(distinct r.id), '{}') into v_dependent
  from public.appointments a
  join public.payroll_calculation_lines l on l.appointment_id = a.id
  join public.payroll_runs r on r.id = l.payroll_run_id
  where a.import_batch_id = p_batch_id
    and r.status in ('approved', 'posted', 'locked');
  if array_length(v_dependent, 1) is not null then
    raise exception 'payroll_dependency_exists:%', array_to_string(v_dependent, ',')
      using errcode = 'P0009',
      hint = 'Reopen or supersede the dependent payroll run(s) before reversing this import.';
  end if;

  insert into public.appointment_status_history
    (appointment_id, organization_id, previous_status, new_status,
     change_source, reason, changed_by)
  select a.id, a.organization_id, a.canonical_status, a.canonical_status,
         'reversal', p_reason, v_uid
  from public.appointments a
  where a.import_batch_id = p_batch_id and a.record_state = 'active';

  update public.appointments a
  set record_state = 'reversed'
  where a.import_batch_id = p_batch_id and a.record_state = 'active';
  get diagnostics v_reversed = row_count;

  update public.import_batches
  set status = 'reversed',
      reversed_by = v_uid,
      reversed_at = now(),
      sanitized_failure_message = null
  where id = p_batch_id;

  insert into public.import_batch_events
    (import_batch_id, organization_id, from_status, to_status, actor_id, reason)
  values
    (p_batch_id, v_batch.organization_id, 'posted', 'reversed', v_uid, p_reason);

  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values
    (v_batch.organization_id, v_uid, 'import_batch', p_batch_id, 'import_batch_reversed',
     jsonb_build_object('reversed_count', v_reversed, 'reason', p_reason));

  return jsonb_build_object('reversed_count', v_reversed);
end;
$$;

-- app.payroll_dependencies_for_batch — surfaced in the UI before reversal.
create or replace function app.payroll_dependencies_for_batch(p_batch_id uuid)
returns table (payroll_run_id uuid, run_name text, run_status text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct r.id, r.name, r.status
  from public.appointments a
  join public.payroll_calculation_lines l on l.appointment_id = a.id
  join public.payroll_runs r on r.id = l.payroll_run_id
  join public.import_batches b on b.id = a.import_batch_id
  where a.import_batch_id = p_batch_id
    and app.has_permission_in(b.organization_id, 'import:read')
    and r.status in ('approved', 'posted', 'locked');
$$;
revoke all on function app.payroll_dependencies_for_batch(uuid) from public;
grant execute on function app.payroll_dependencies_for_batch(uuid) to authenticated;

create or replace function public.payroll_dependencies_for_batch(p_batch_id uuid)
returns table (payroll_run_id uuid, run_name text, run_status text)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app.payroll_dependencies_for_batch(p_batch_id);
$$;
revoke all on function public.payroll_dependencies_for_batch(uuid) from public;
grant execute on function public.payroll_dependencies_for_batch(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Posting: freeze the run (snapshot + totals) atomically.
-- ----------------------------------------------------------------------------
create or replace function app.post_payroll_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_run      public.payroll_runs%rowtype;
  v_blocking int;
  v_version  int;
  v_payload  jsonb;
  v_hash     text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if v_run.id is null then
    raise exception 'payroll_run_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_run.organization_id, 'payroll:post') then
    raise exception 'not_authorized_to_post_payroll' using errcode = '42501';
  end if;
  if v_run.status <> 'approved' then
    raise exception 'payroll_not_approved' using errcode = 'P0003';
  end if;

  select count(*) into v_blocking
  from public.payroll_issues i
  where i.payroll_run_id = p_run_id
    and i.severity = 'blocking'
    and i.resolution_status = 'open';
  if v_blocking > 0 then
    raise exception 'payroll_blocking_issues_remain' using errcode = 'P0005';
  end if;

  select coalesce(max(snapshot_version), 0) + 1 into v_version
  from public.payroll_snapshots where payroll_run_id = p_run_id;

  select jsonb_build_object(
    'run', jsonb_build_object(
      'id', v_run.id, 'name', v_run.name, 'status_at_snapshot', 'posted',
      'calculation_version', v_run.calculation_version,
      'gross_compensation_total_cents', v_run.gross_compensation_total_cents,
      'adjustment_total_cents', v_run.adjustment_total_cents,
      'final_compensation_total_cents', v_run.final_compensation_total_cents,
      'trainer_count', v_run.trainer_count,
      'appointment_count', v_run.appointment_count
    ),
    'trainer_summaries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'trainer_id', s.trainer_id,
        'plan_version_id', s.compensation_plan_version_id,
        'final_gross_compensation_cents', s.final_gross_compensation_cents,
        'adjustment_total_cents', s.adjustment_total_cents,
        'appointment_count', s.appointment_count,
        'compensated_minutes', s.compensated_minutes
      ) order by s.trainer_id)
      from public.payroll_trainer_summaries s
      where s.payroll_run_id = p_run_id
    ), '[]'::jsonb)
  ) into v_payload;

  select encode(extensions.digest(coalesce(string_agg(
    l.id::text || ':' || l.rounded_amount_cents::text, '|' order by l.id
  ), ''), 'sha256'), 'hex') into v_hash
  from public.payroll_calculation_lines l
  where l.payroll_run_id = p_run_id;

  insert into public.payroll_snapshots
    (payroll_run_id, organization_id, snapshot_version, kind, payload, lines_sha256, created_by)
  values
    (p_run_id, v_run.organization_id, v_version, 'posted', v_payload, v_hash, v_uid);

  update public.payroll_runs
  set status = 'posted', posted_by = v_uid, posted_at = now()
  where id = p_run_id;

  insert into public.payroll_run_events
    (payroll_run_id, organization_id, from_status, to_status, actor_id)
  values (p_run_id, v_run.organization_id, 'approved', 'posted', v_uid);

  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_run.organization_id, v_uid, 'payroll_run', p_run_id, 'payroll_run_posted',
          jsonb_build_object('snapshot_version', v_version,
                             'final_total_cents', v_run.final_compensation_total_cents));

  return jsonb_build_object('snapshot_version', v_version);
end;
$$;
revoke all on function app.post_payroll_run(uuid) from public;
grant execute on function app.post_payroll_run(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Locking / reopening / voiding / supersession.
-- ----------------------------------------------------------------------------
create or replace function app.lock_payroll_run(p_run_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.payroll_runs%rowtype;
begin
  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'payroll_run_not_found' using errcode = 'P0002'; end if;
  if not app.has_permission_in(v_run.organization_id, 'payroll:lock') then
    raise exception 'not_authorized_to_lock' using errcode = '42501';
  end if;
  if v_run.status <> 'posted' then
    raise exception 'payroll_lock_requires_posted' using errcode = 'P0003';
  end if;
  update public.payroll_runs
  set status = 'locked', locked_by = v_uid, locked_at = now()
  where id = p_run_id;
  insert into public.payroll_run_events (payroll_run_id, organization_id, from_status, to_status, actor_id, reason)
  values (p_run_id, v_run.organization_id, 'posted', 'locked', v_uid, p_reason);
  insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_run.organization_id, v_uid, 'payroll_run', p_run_id, 'payroll_run_locked',
          jsonb_build_object('reason', coalesce(p_reason, '')));
end;
$$;
revoke all on function app.lock_payroll_run(uuid, text) from public;
grant execute on function app.lock_payroll_run(uuid, text) to authenticated;

create or replace function app.reopen_payroll_run(p_run_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.payroll_runs%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'reopen_reason_required' using errcode = 'P0008';
  end if;
  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'payroll_run_not_found' using errcode = 'P0002'; end if;
  if not app.has_permission_in(v_run.organization_id, 'payroll:reopen') then
    raise exception 'not_authorized_to_reopen' using errcode = '42501';
  end if;
  if v_run.status not in ('posted', 'locked') then
    raise exception 'payroll_reopen_requires_posted_or_locked' using errcode = 'P0003';
  end if;
  -- The posted snapshot rows are preserved untouched; the run re-enters the
  -- mutable workflow and must be re-approved and re-posted (new snapshot
  -- version). Historical clarity: every posted state remains inspectable.
  update public.payroll_runs
  set status = 'reopened', reopened_by = v_uid, reopened_at = now(),
      reopen_reason = p_reason,
      approved_by = null, approved_at = null
  where id = p_run_id;
  insert into public.payroll_run_events (payroll_run_id, organization_id, from_status, to_status, actor_id, reason)
  values (p_run_id, v_run.organization_id, v_run.status, 'reopened', v_uid, p_reason);
  insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_run.organization_id, v_uid, 'payroll_run', p_run_id, 'payroll_run_reopened',
          jsonb_build_object('reason', p_reason, 'previous_status', v_run.status));
end;
$$;
revoke all on function app.reopen_payroll_run(uuid, text) from public;
grant execute on function app.reopen_payroll_run(uuid, text) to authenticated;

create or replace function app.void_payroll_run(p_run_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.payroll_runs%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'void_reason_required' using errcode = 'P0008';
  end if;
  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'payroll_run_not_found' using errcode = 'P0002'; end if;
  if not app.has_permission_in(v_run.organization_id, 'payroll:void') then
    raise exception 'not_authorized_to_void' using errcode = '42501';
  end if;
  if v_run.status not in ('draft', 'needs_review', 'reopened', 'failed') then
    raise exception 'payroll_void_invalid_state' using errcode = 'P0003';
  end if;
  update public.payroll_runs
  set status = 'voided', voided_by = v_uid, voided_at = now(), void_reason = p_reason
  where id = p_run_id;
  insert into public.payroll_run_events (payroll_run_id, organization_id, from_status, to_status, actor_id, reason)
  values (p_run_id, v_run.organization_id, v_run.status, 'voided', v_uid, p_reason);
  insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_run.organization_id, v_uid, 'payroll_run', p_run_id, 'payroll_run_voided',
          jsonb_build_object('reason', p_reason));
end;
$$;
revoke all on function app.void_payroll_run(uuid, text) from public;
grant execute on function app.void_payroll_run(uuid, text) to authenticated;

-- Supersession: replace a posted/locked run with a fresh draft, atomically.
create or replace function app.supersede_payroll_run(p_run_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.payroll_runs%rowtype;
  v_new uuid;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'supersede_reason_required' using errcode = 'P0008';
  end if;
  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'payroll_run_not_found' using errcode = 'P0002'; end if;
  if not app.has_permission_in(v_run.organization_id, 'payroll:reopen') then
    raise exception 'not_authorized_to_supersede' using errcode = '42501';
  end if;
  if v_run.status not in ('posted', 'locked') then
    raise exception 'payroll_supersede_requires_posted_or_locked' using errcode = 'P0003';
  end if;

  update public.payroll_runs set status = 'superseded' where id = p_run_id;

  insert into public.payroll_runs
    (organization_id, reporting_period_id, name, run_number, status,
     calculation_version, supersedes_payroll_run_id, created_by)
  values
    (v_run.organization_id, v_run.reporting_period_id,
     v_run.name || ' (superseding)', v_run.run_number + 1, 'draft',
     v_run.calculation_version, p_run_id, v_uid)
  returning id into v_new;

  update public.payroll_runs set superseded_by_payroll_run_id = v_new where id = p_run_id;

  insert into public.payroll_run_events (payroll_run_id, organization_id, from_status, to_status, actor_id, reason)
  values (p_run_id, v_run.organization_id, v_run.status, 'superseded', v_uid, p_reason);
  update public.payroll_exports set superseded = true where payroll_run_id = p_run_id;
  insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_run.organization_id, v_uid, 'payroll_run', p_run_id, 'payroll_run_superseded',
          jsonb_build_object('reason', p_reason, 'superseded_by', v_new));

  return v_new;
end;
$$;
revoke all on function app.supersede_payroll_run(uuid, text) from public;
grant execute on function app.supersede_payroll_run(uuid, text) to authenticated;

-- Public wrappers (PostgREST exposes only public).
create or replace function public.post_payroll_run(p_run_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.post_payroll_run(p_run_id); $$;
revoke all on function public.post_payroll_run(uuid) from public;
grant execute on function public.post_payroll_run(uuid) to authenticated;

create or replace function public.lock_payroll_run(p_run_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select app.lock_payroll_run(p_run_id, p_reason); $$;
revoke all on function public.lock_payroll_run(uuid, text) from public;
grant execute on function public.lock_payroll_run(uuid, text) to authenticated;

create or replace function public.reopen_payroll_run(p_run_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select app.reopen_payroll_run(p_run_id, p_reason); $$;
revoke all on function public.reopen_payroll_run(uuid, text) from public;
grant execute on function public.reopen_payroll_run(uuid, text) to authenticated;

create or replace function public.void_payroll_run(p_run_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select app.void_payroll_run(p_run_id, p_reason); $$;
revoke all on function public.void_payroll_run(uuid, text) from public;
grant execute on function public.void_payroll_run(uuid, text) to authenticated;

create or replace function public.supersede_payroll_run(p_run_id uuid, p_reason text)
returns uuid language sql security invoker set search_path = ''
as $$ select app.supersede_payroll_run(p_run_id, p_reason); $$;
revoke all on function public.supersede_payroll_run(uuid, text) from public;
grant execute on function public.supersede_payroll_run(uuid, text) to authenticated;
