-- ============================================================================
-- Performance Operations — Phase 4, Migration 17: trainer self-scope fix
--
-- Bug fix (caught by live checks): the trainer self-scope policies on
-- payroll_trainer_summaries and payroll_calculation_lines tested run status
-- with a plain EXISTS on payroll_runs, which is itself RLS-protected —
-- trainers cannot see runs, so the branch never granted. Status is now read
-- through a SECURITY DEFINER helper (status only; no amounts).
-- ============================================================================

create or replace function app.payroll_run_is_finalized(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payroll_runs r
    where r.id = p_run_id and r.status in ('posted', 'locked')
  );
$$;
revoke all on function app.payroll_run_is_finalized(uuid) from public;
grant execute on function app.payroll_run_is_finalized(uuid) to authenticated;

drop policy payroll_trainer_summaries_select on public.payroll_trainer_summaries;
create policy payroll_trainer_summaries_select on public.payroll_trainer_summaries
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'payroll:read')
    or (
      trainer_id = app.current_trainer_id()
      and app.payroll_run_is_finalized(payroll_run_id)
    )
  );

drop policy payroll_lines_select on public.payroll_calculation_lines;
create policy payroll_lines_select on public.payroll_calculation_lines
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'payroll:read')
    or (
      trainer_id = app.current_trainer_id()
      and app.payroll_run_is_finalized(payroll_run_id)
    )
  );
