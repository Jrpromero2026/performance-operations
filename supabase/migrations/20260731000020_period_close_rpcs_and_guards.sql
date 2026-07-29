-- ============================================================================
-- Performance Operations — Phase 7, Migration 20: close RPCs + guards
--
-- Security-definer operations for the high-risk close transitions
-- (execute / reopen / void) and database-level post-close change guards.
-- reporting_periods.status='closed' can ONLY be set/cleared through these
-- RPCs (session GUC app.period_close_op); material operational changes in
-- a closed period are blocked with the dependent close-run id in the
-- error. Protected entities/fields: docs/POST_CLOSE_CHANGE_GUARDS.md.
-- ============================================================================

-- ADDITIVE REDEFINITION of app.protect_closed_close_run (migration 19 file
-- unchanged): supersession no longer requires the forward link at
-- transition time — the reopen RPC must supersede BEFORE inserting the
-- replacement run (one-active-run index) and backfills superseded_by after.
create or replace function app.protect_closed_close_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'closed' then
    if new.status = 'superseded'
       and new.reopened_by is not null then
      if new.organization_id is distinct from old.organization_id
         or new.reporting_period_id is distinct from old.reporting_period_id
         or new.close_version is distinct from old.close_version
         or new.manifest_sha256 is distinct from old.manifest_sha256
         or new.report_package_id is distinct from old.report_package_id
         or new.closed_by is distinct from old.closed_by
         or new.closed_at is distinct from old.closed_at
         or new.approved_by is distinct from old.approved_by
         or new.approved_at is distinct from old.approved_at then
        raise exception 'closed_run_immutable' using errcode = '42501';
      end if;
      return new;
    end if;
    raise exception 'closed_run_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- The dependent CLOSED close run covering a local date for an org (if any).
create or replace function app.closed_run_for(p_org uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.reporting_periods p
  join public.period_close_runs r
    on r.reporting_period_id = p.id and r.status = 'closed'
  where p.organization_id = p_org
    and p.status = 'closed'
    and p_date between p.start_date and p.end_date
  limit 1;
$$;
revoke all on function app.closed_run_for(uuid, date) from public;
grant execute on function app.closed_run_for(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- reporting_periods: 'closed' is a controlled state. Transitions into/out
-- of closed, and date changes while closed, require the close-RPC context.
-- ---------------------------------------------------------------------------
create or replace function app.protect_closed_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.period_close_op', true), '') = '1' then
    return new;
  end if;
  if (old.status = 'closed') is distinct from (new.status = 'closed') then
    raise exception 'period_close_controlled'
      using errcode = '42501',
      hint = 'Reporting periods are closed and reopened only through the period-close workflow (/period-close).';
  end if;
  if old.status = 'closed'
     and (new.start_date is distinct from old.start_date
          or new.end_date is distinct from old.end_date
          or new.period_type is distinct from old.period_type) then
    raise exception 'closed_period_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger reporting_periods_protect_closed
  before update on public.reporting_periods
  for each row execute function app.protect_closed_period();

-- ---------------------------------------------------------------------------
-- Appointments: no inserts into a closed period; no material changes to
-- appointments dated inside a closed period. Material fields: status,
-- record_state (reversal), trainer, department, service, schedule, source
-- amounts, date. Notes/payment_status remain editable (harmless metadata).
-- ---------------------------------------------------------------------------
create or replace function app.appointments_close_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_run uuid;
begin
  if tg_op = 'INSERT' then
    v_run := app.closed_run_for(new.organization_id, new.appointment_date);
    if v_run is not null then
      raise exception 'appointment_in_closed_period:%', v_run
        using errcode = '42501',
        hint = 'Reopen the period at /period-close/' || v_run || ' before posting appointments into it.';
    end if;
    return new;
  end if;
  if (new.canonical_status is distinct from old.canonical_status
      or new.record_state is distinct from old.record_state
      or new.trainer_id is distinct from old.trainer_id
      or new.department_id is distinct from old.department_id
      or new.service_id is distinct from old.service_id
      or new.start_at is distinct from old.start_at
      or new.duration_minutes is distinct from old.duration_minutes
      or new.appointment_date is distinct from old.appointment_date
      or new.source_listed_price_cents is distinct from old.source_listed_price_cents
      or new.source_amount_paid_cents is distinct from old.source_amount_paid_cents) then
    v_run := coalesce(
      app.closed_run_for(old.organization_id, old.appointment_date),
      app.closed_run_for(new.organization_id, new.appointment_date)
    );
    if v_run is not null then
      raise exception 'appointment_in_closed_period:%', v_run
        using errcode = '42501',
        hint = 'Reopen the period at /period-close/' || v_run || ' before changing appointments in it.';
    end if;
  end if;
  return new;
end;
$$;
create trigger appointments_period_close_guard
  before insert or update on public.appointments
  for each row execute function app.appointments_close_guard();

-- ---------------------------------------------------------------------------
-- Payroll: no new runs, no lifecycle transitions, and no time/adjustment
-- changes for a closed period. (Payroll reopening/supersession therefore
-- requires reopening the PERIOD first — coordinated, never automatic.)
-- ---------------------------------------------------------------------------
create or replace function app.payroll_close_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_period public.reporting_periods%rowtype;
  v_run uuid;
begin
  select * into v_period from public.reporting_periods
  where id = new.reporting_period_id;
  if v_period.status = 'closed'
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    select id into v_run from public.period_close_runs
    where reporting_period_id = v_period.id and status = 'closed' limit 1;
    raise exception 'payroll_in_closed_period:%', coalesce(v_run::text, 'unknown')
      using errcode = '42501',
      hint = 'Reopen the period at /period-close/' || coalesce(v_run::text, '') || ' before changing payroll for it.';
  end if;
  return new;
end;
$$;
create trigger payroll_runs_period_close_guard
  before insert or update on public.payroll_runs
  for each row execute function app.payroll_close_guard();

create or replace function app.period_scoped_close_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_period_id uuid;
  v_status text;
  v_run uuid;
begin
  v_period_id := coalesce(new.reporting_period_id, old.reporting_period_id);
  select status into v_status from public.reporting_periods where id = v_period_id;
  if v_status = 'closed' then
    select id into v_run from public.period_close_runs
    where reporting_period_id = v_period_id and status = 'closed' limit 1;
    raise exception 'record_in_closed_period:%', coalesce(v_run::text, 'unknown')
      using errcode = '42501',
      hint = 'Reopen the period at /period-close/' || coalesce(v_run::text, '') || ' first.';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger manual_time_entries_period_close_guard
  before insert or update on public.manual_time_entries
  for each row execute function app.period_scoped_close_guard();
create trigger payroll_adjustments_period_close_guard
  before insert or update on public.payroll_adjustments
  for each row execute function app.period_scoped_close_guard();

-- ---------------------------------------------------------------------------
-- app.execute_period_close — the final close transaction. All-or-nothing:
-- any raised exception rolls back every effect. DB-revalidates the race-
-- sensitive blockers; the TS coordinator re-evaluates the full checklist
-- immediately before calling.
-- ---------------------------------------------------------------------------
create or replace function app.execute_period_close(
  p_run_id uuid,
  p_manifest jsonb,
  p_manifest_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.period_close_runs%rowtype;
  v_period public.reporting_periods%rowtype;
  v_allow_self boolean;
  v_payroll_state text;
  v_pkg public.report_packages%rowtype;
  v_appt_count int;
  v_finalized_payroll int;
  v_active_payroll int;
  v_pending_imports int;
  v_unacked int;
  v_export jsonb;
  v_export_count int;
  v_manifest_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_run from public.period_close_runs where id = p_run_id for update;
  if v_run.id is null then
    raise exception 'close_run_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_run.organization_id, 'period_close:execute') then
    raise exception 'not_authorized_to_execute_close' using errcode = '42501';
  end if;
  if v_run.status <> 'ready_to_close' then
    raise exception 'close_run_not_ready' using errcode = 'P0003';
  end if;
  if v_run.approved_by is null or v_run.approved_at is null then
    raise exception 'close_not_approved' using errcode = 'P0005';
  end if;

  -- Separation of duties: fails closed unless the org explicitly allows
  -- self-approval.
  select allow_self_approval, payroll_required_state
  into v_allow_self, v_payroll_state
  from public.organization_close_policies
  where organization_id = v_run.organization_id;
  if not found then
    v_allow_self := false;
    v_payroll_state := 'posted';
  end if;
  if not v_allow_self and v_run.approved_by = v_run.initiated_by then
    raise exception 'self_approval_forbidden' using errcode = 'P0006';
  end if;

  select * into v_period from public.reporting_periods
  where id = v_run.reporting_period_id for update;
  if v_period.organization_id is distinct from v_run.organization_id then
    raise exception 'period_organization_mismatch' using errcode = 'P0007';
  end if;
  if v_period.status <> 'open' then
    raise exception 'period_not_open' using errcode = 'P0008';
  end if;

  -- DB re-validation of race-sensitive blockers -------------------------
  if coalesce(v_run.blocking_issue_count, 1) <> 0 then
    raise exception 'blocking_issues_remain' using errcode = 'P0009';
  end if;

  select count(*) into v_pending_imports from public.import_batches
  where organization_id = v_run.organization_id
    and status in ('uploaded', 'parsing', 'validating', 'needs_review', 'ready_for_approval', 'approved');
  if v_pending_imports > 0 then
    raise exception 'pending_imports_remain' using errcode = 'P0010';
  end if;

  select count(*) into v_appt_count from public.appointments
  where organization_id = v_run.organization_id
    and record_state = 'active'
    and appointment_date between v_period.start_date and v_period.end_date;

  if v_appt_count > 0 then
    select count(*) into v_finalized_payroll from public.payroll_runs
    where reporting_period_id = v_period.id
      and ((v_payroll_state = 'posted' and status in ('posted', 'locked'))
           or (v_payroll_state = 'locked' and status = 'locked'));
    if v_finalized_payroll = 0 then
      raise exception 'payroll_not_finalized' using errcode = 'P0011';
    end if;
  end if;
  select count(*) into v_active_payroll from public.payroll_runs
  where reporting_period_id = v_period.id
    and status in ('draft', 'calculating', 'needs_review', 'ready_for_approval', 'approved', 'reopened', 'failed');
  if v_active_payroll > 0 then
    raise exception 'payroll_active_run_remains' using errcode = 'P0012';
  end if;

  -- Every warning in the latest readiness snapshot must be acknowledged.
  select count(*) into v_unacked
  from jsonb_array_elements_text(coalesce(v_run.readiness_snapshot->'warning_codes', '[]'::jsonb)) w(code)
  where not exists (
    select 1 from public.period_close_acknowledgements a
    where a.period_close_run_id = v_run.id and a.check_code = w.code
  );
  if v_unacked > 0 then
    raise exception 'warnings_unacknowledged' using errcode = 'P0013';
  end if;

  -- Manifest + artifact validation --------------------------------------
  if p_manifest is null or p_manifest_sha256 is null or length(p_manifest_sha256) <> 64 then
    raise exception 'manifest_invalid' using errcode = 'P0014';
  end if;
  if (p_manifest->>'close_run_id')::uuid is distinct from v_run.id then
    raise exception 'manifest_run_mismatch' using errcode = 'P0014';
  end if;
  if v_run.report_package_id is null then
    raise exception 'report_package_missing' using errcode = 'P0015';
  end if;
  select * into v_pkg from public.report_packages
  where id = v_run.report_package_id for update;
  if v_pkg.id is null
     or v_pkg.organization_id is distinct from v_run.organization_id
     or v_pkg.reporting_period_id is distinct from v_run.reporting_period_id
     or v_pkg.status <> 'ready' then
    raise exception 'report_package_not_ready' using errcode = 'P0015';
  end if;
  if (p_manifest->>'report_package_id')::uuid is distinct from v_pkg.id then
    raise exception 'manifest_package_mismatch' using errcode = 'P0015';
  end if;

  -- Exports listed in the manifest must exist with matching hashes.
  select count(*) into v_export_count
  from jsonb_array_elements(coalesce(p_manifest->'exports', '[]'::jsonb)) e;
  if v_export_count = 0 then
    raise exception 'exports_missing' using errcode = 'P0016';
  end if;
  for v_export in
    select e from jsonb_array_elements(coalesce(p_manifest->'exports', '[]'::jsonb)) e
  loop
    if not exists (
      select 1 from public.close_exports x
      where x.id = (v_export->>'id')::uuid
        and x.organization_id = v_run.organization_id
        and x.reporting_period_id = v_run.reporting_period_id
        and x.sha256 = v_export->>'sha256'
        and x.superseded = false
    ) then
      raise exception 'export_manifest_mismatch:%', v_export->>'id' using errcode = 'P0016';
    end if;
  end loop;

  -- Execute -------------------------------------------------------------
  update public.period_close_runs set status = 'closing' where id = v_run.id;

  update public.report_packages
  set status = 'finalized', period_close_run_id = v_run.id
  where id = v_pkg.id;

  update public.close_exports
  set period_close_run_id = v_run.id
  where id in (
    select (e->>'id')::uuid
    from jsonb_array_elements(coalesce(p_manifest->'exports', '[]'::jsonb)) e
  );

  insert into public.period_close_manifests
    (period_close_run_id, organization_id, payload, manifest_sha256, created_by)
  values (v_run.id, v_run.organization_id, p_manifest, p_manifest_sha256, v_uid)
  returning id into v_manifest_id;

  perform set_config('app.period_close_op', '1', true);
  update public.reporting_periods set status = 'closed' where id = v_period.id;

  update public.period_close_runs
  set status = 'closed', closed_by = v_uid, closed_at = now(),
      manifest_sha256 = p_manifest_sha256
  where id = v_run.id;

  insert into public.period_close_events
    (period_close_run_id, organization_id, from_status, to_status, actor_id)
  values
    (v_run.id, v_run.organization_id, 'ready_to_close', 'closing', v_uid),
    (v_run.id, v_run.organization_id, 'closing', 'closed', v_uid);

  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_run.organization_id, v_uid, 'period_close_run', v_run.id, 'period_close_executed',
          jsonb_build_object(
            'close_version', v_run.close_version,
            'manifest_sha256', p_manifest_sha256,
            'report_package_id', v_pkg.id,
            'export_count', v_export_count));

  return jsonb_build_object(
    'close_run_id', v_run.id,
    'manifest_id', v_manifest_id,
    'manifest_sha256', p_manifest_sha256,
    'close_version', v_run.close_version
  );
end;
$$;
revoke all on function app.execute_period_close(uuid, jsonb, text) from public;
grant execute on function app.execute_period_close(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- app.reopen_period_close — controlled reopening: prior close preserved
-- and superseded; new close cycle created; period returns to open.
-- ---------------------------------------------------------------------------
create or replace function app.reopen_period_close(p_run_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.period_close_runs%rowtype;
  v_new uuid;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'reopen_reason_required' using errcode = 'P0008';
  end if;
  select * into v_run from public.period_close_runs where id = p_run_id for update;
  if v_run.id is null then
    raise exception 'close_run_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_run.organization_id, 'period_close:reopen') then
    raise exception 'not_authorized_to_reopen_close' using errcode = '42501';
  end if;
  if v_run.status <> 'closed' then
    raise exception 'close_run_not_closed' using errcode = 'P0003';
  end if;

  -- Supersede FIRST so the one-active-run index admits the replacement,
  -- then create the new cycle and backfill the forward link.
  update public.period_close_runs
  set status = 'superseded',
      reopened_by = v_uid, reopened_at = now(), reopen_reason = p_reason
  where id = v_run.id;

  insert into public.period_close_runs
    (organization_id, reporting_period_id, close_version, status,
     supersedes_close_run_id, initiated_by)
  values
    (v_run.organization_id, v_run.reporting_period_id, v_run.close_version + 1,
     'close_review', v_run.id, v_uid)
  returning id into v_new;

  update public.period_close_runs
  set superseded_by_close_run_id = v_new
  where id = v_run.id;

  update public.report_packages
  set status = 'superseded'
  where period_close_run_id = v_run.id and status = 'finalized';

  update public.close_exports
  set superseded = true
  where period_close_run_id = v_run.id;

  perform set_config('app.period_close_op', '1', true);
  update public.reporting_periods set status = 'open'
  where id = v_run.reporting_period_id;

  insert into public.period_close_events
    (period_close_run_id, organization_id, from_status, to_status, actor_id, reason)
  values
    (v_run.id, v_run.organization_id, 'closed', 'superseded', v_uid, p_reason),
    (v_new, v_run.organization_id, null, 'close_review', v_uid, 'reopened from v' || v_run.close_version);

  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_run.organization_id, v_uid, 'period_close_run', v_run.id, 'period_close_reopened',
          jsonb_build_object('reason', p_reason, 'new_close_run_id', v_new,
                             'new_close_version', v_run.close_version + 1));

  return v_new;
end;
$$;
revoke all on function app.reopen_period_close(uuid, text) from public;
grant execute on function app.reopen_period_close(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- app.void_period_close — abandon a pre-close run (never a closed one).
-- Void authority = period_close:review (documented deviation: no separate
-- period_close:void permission; only unfinalized runs are voidable).
-- ---------------------------------------------------------------------------
create or replace function app.void_period_close(p_run_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.period_close_runs%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'void_reason_required' using errcode = 'P0008';
  end if;
  select * into v_run from public.period_close_runs where id = p_run_id for update;
  if v_run.id is null then
    raise exception 'close_run_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_run.organization_id, 'period_close:review') then
    raise exception 'not_authorized_to_void_close' using errcode = '42501';
  end if;
  if v_run.status not in ('close_review', 'ready_to_close') then
    raise exception 'close_run_not_voidable' using errcode = 'P0003';
  end if;
  update public.period_close_runs set status = 'voided' where id = v_run.id;
  insert into public.period_close_events
    (period_close_run_id, organization_id, from_status, to_status, actor_id, reason)
  values (v_run.id, v_run.organization_id, v_run.status, 'voided', v_uid, p_reason);
  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_run.organization_id, v_uid, 'period_close_run', v_run.id, 'period_close_voided',
          jsonb_build_object('reason', p_reason));
end;
$$;
revoke all on function app.void_period_close(uuid, text) from public;
grant execute on function app.void_period_close(uuid, text) to authenticated;

-- Public wrappers (PostgREST exposes only public).
create or replace function public.execute_period_close(p_run_id uuid, p_manifest jsonb, p_manifest_sha256 text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.execute_period_close(p_run_id, p_manifest, p_manifest_sha256); $$;
revoke all on function public.execute_period_close(uuid, jsonb, text) from public;
grant execute on function public.execute_period_close(uuid, jsonb, text) to authenticated;

create or replace function public.reopen_period_close(p_run_id uuid, p_reason text)
returns uuid language sql security invoker set search_path = ''
as $$ select app.reopen_period_close(p_run_id, p_reason); $$;
revoke all on function public.reopen_period_close(uuid, text) from public;
grant execute on function public.reopen_period_close(uuid, text) to authenticated;

create or replace function public.void_period_close(p_run_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select app.void_period_close(p_run_id, p_reason); $$;
revoke all on function public.void_period_close(uuid, text) from public;
grant execute on function public.void_period_close(uuid, text) to authenticated;
