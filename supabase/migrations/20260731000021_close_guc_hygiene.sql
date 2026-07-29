-- ============================================================================
-- Performance Operations — Phase 7, Migration 21: close-GUC hygiene
--
-- Defense-in-depth fix surfaced by the Phase 7 live SQL suite:
-- set_config('app.period_close_op', '1', true) is TRANSACTION-scoped, so a
-- caller that executes further statements inside the same transaction as a
-- close RPC would retain the bypass and could mutate closed reporting
-- periods directly. PostgREST runs each RPC in its own transaction, so
-- this was not exploitable through the API — but the RPCs now clear the
-- GUC immediately after their controlled reporting_periods update, making
-- the guard robust in any calling context (scripts, pooled sessions,
-- future in-transaction composition).
--
-- ADDITIVE redefinitions of app.execute_period_close and
-- app.reopen_period_close (migration 20 files unchanged, per the
-- never-modify-applied-migrations rule). Bodies are identical except for
-- the GUC clear after the period update.
-- ============================================================================

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
  perform set_config('app.period_close_op', '', true);

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
  perform set_config('app.period_close_op', '', true);

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
