-- ============================================================================
-- Performance Operations — Phase 4, Migration 16: reopen clears posting marks
--
-- Bug fix: app.payroll_run_transition_guard blocks any transition to
-- 'posted' while posted_at is set (double-post guard). A reopened run keeps
-- its original posted_at, which made re-posting after reopening impossible.
-- The reopen RPC now clears posted/locked marks; the historical record is
-- fully preserved in payroll_run_events, payroll_snapshots (per-version),
-- and audit_events.
-- ============================================================================

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
  -- Snapshots are preserved untouched; the run re-enters the mutable
  -- workflow and must be re-approved and re-posted (new snapshot version).
  -- Posting/locking marks are cleared so the double-post guard applies to
  -- the NEXT posting cycle; who posted/locked previously remains recorded
  -- in run events, snapshots, and the audit log.
  update public.payroll_runs
  set status = 'reopened', reopened_by = v_uid, reopened_at = now(),
      reopen_reason = p_reason,
      approved_by = null, approved_at = null,
      posted_by = null, posted_at = null,
      locked_by = null, locked_at = null
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
