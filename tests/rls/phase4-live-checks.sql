-- ============================================================================
-- Phase 4 live checks: payroll run state machine, posting snapshot + hash,
-- line/adjustment/time-entry immutability, appointment + import-reversal
-- dependency guards, reopen/supersede/void, RLS (cross-org denial, trainer
-- self-scope limited to posted/locked runs).
-- Requires migrations + seed. Creates throwaway fixtures, impersonates users
-- via request.jwt.claims, and ROLLS BACK — never run against production.
-- Executed against performance-operations-dev on 2026-07-29: ALL PASSED.
-- ============================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-b000-000000000001', 'p4-admin@test.local'),
  ('00000000-0000-4000-b000-000000000002', 'p4-wsadmin@test.local'),
  ('00000000-0000-4000-b000-000000000003', 'p4-outsider@test.local'),
  ('00000000-0000-4000-b000-000000000004', 'p4-trainer@test.local');
insert into public.profiles (id, email, full_name) values
  ('00000000-0000-4000-b000-000000000001', 'p4-admin@test.local', 'P4 Admin'),
  ('00000000-0000-4000-b000-000000000002', 'p4-wsadmin@test.local', 'P4 WS Admin'),
  ('00000000-0000-4000-b000-000000000003', 'p4-outsider@test.local', 'P4 Outsider'),
  ('00000000-0000-4000-b000-000000000004', 'p4-trainer@test.local', 'P4 Trainer');
insert into public.organization_memberships (profile_id, organization_id, role_id)
select u.uid, o.id, r.id from (values
  ('00000000-0000-4000-b000-000000000001'::uuid, 'platform_admin'),
  ('00000000-0000-4000-b000-000000000002'::uuid, 'workspace_admin'),
  ('00000000-0000-4000-b000-000000000004'::uuid, 'trainer')
) as u(uid, role_key)
join public.roles r on r.key = u.role_key
join public.organizations o on o.slug = 'timberhill-athletic-club';

create or replace function pg_temp.impersonate(user_id uuid)
returns void language plpgsql as $$
begin
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', user_id, 'role', 'authenticated')::text);
  set local role authenticated;
end;
$$;

do $$
declare
  th_id uuid;
  v_trainer uuid;
  v_service uuid;
  v_category uuid;
  v_client uuid;
  v_batch uuid;
  v_period uuid;
  v_plan uuid;
  v_version uuid;
  v_rule uuid;
  v_run uuid;
  v_run2 uuid;
  v_summary uuid;
  v_issue uuid;
  v_adjustment uuid;
  v_time uuid;
  v_appt1 uuid;
  n int;
  t text;
  result jsonb;
begin
  select id into strict th_id from public.organizations where slug = 'timberhill-athletic-club';

  -- ------------------------------------------------ ledger + config fixtures
  insert into public.trainers (display_name, first_name, last_name, profile_id)
  values ('P4 Fixture Trainer', 'P4', 'Trainer', '00000000-0000-4000-b000-000000000004')
  returning id into v_trainer;
  insert into public.trainer_organization_assignments (trainer_id, organization_id, title)
  values (v_trainer, th_id, 'Trainer');
  insert into public.service_categories (organization_id, name) values (th_id, 'P4 Cat')
  returning id into v_category;
  insert into public.services (organization_id, category_id, internal_name, display_name)
  values (th_id, v_category, 'p4-svc', 'P4 Service') returning id into v_service;
  insert into public.clients (display_name, email) values ('P4 Client', 'p4client@test.local')
  returning id into v_client;
  insert into public.client_organization_assignments (client_id, organization_id)
  values (v_client, th_id);

  insert into public.import_batches (organization_id, source, original_filename, storage_path,
    file_hash, file_size, mime_type, uploaded_by)
  values (th_id, 'setmore', 'p4-test.csv', 'x/p4-test.csv', 'hash-p4-1', 100, 'text/csv',
    '00000000-0000-4000-b000-000000000002')
  returning id into v_batch;
  update public.import_batches set status='parsing' where id=v_batch;
  update public.import_batches set status='validating' where id=v_batch;
  update public.import_batches set status='ready_for_approval' where id=v_batch;
  update public.import_batches set status='approved',
    approved_by='00000000-0000-4000-b000-000000000002', approved_at=now() where id=v_batch;
  insert into public.import_rows (import_batch_id, organization_id, source_row_number,
    original_row, normalized_row, row_hash, processing_status, duplicate_class,
    appointment_date, start_at, end_at, duration_minutes, canonical_status,
    external_appointment_id, listed_price_cents, matched_trainer_id, matched_service_id, matched_client_id)
  values
    (v_batch, th_id, 1, '{"a":"1"}', '{}', 'p4h1', 'ready', 'new',
     '2099-03-01', '2099-03-01T17:00:00Z', '2099-03-01T18:00:00Z', 60, 'completed',
     'P4BK1', 6400, v_trainer, v_service, v_client),
    (v_batch, th_id, 2, '{"a":"2"}', '{}', 'p4h2', 'ready', 'new',
     '2099-03-02', '2099-03-02T17:00:00Z', '2099-03-02T18:00:00Z', 60, 'completed',
     'P4BK2', 10000, v_trainer, v_service, v_client);
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000002');
  perform app.post_import_batch(v_batch);
  reset role;
  select id into strict v_appt1 from public.appointments
    where import_batch_id = v_batch and appointment_date = '2099-03-01';

  insert into public.reporting_periods (organization_id, label, period_type, start_date, end_date, status)
  values (th_id, 'P4 2099-03', 'monthly', '2099-03-01', '2099-03-31', 'open')
  returning id into v_period;

  insert into public.compensation_plans (organization_id, name) values (th_id, 'P4 Plan')
  returning id into v_plan;
  insert into public.compensation_plan_versions
    (organization_id, plan_id, compensation_method, version_number, status,
     tier_behavior, rounding_scope, effective_from)
  values (th_id, v_plan, 'percentage_of_revenue', 1, 'published',
     'not_applicable', 'per_line', '2099-01-01')
  returning id into v_version;
  insert into public.compensation_rules
    (plan_version_id, organization_id, rule_type, rate_basis_points, basis_type, criteria)
  values (v_version, th_id, 'revenue_rate', 5000, 'source_listed_amount',
    '{"conditions":[{"field":"canonical_status","op":"in","value":["completed"]}]}')
  returning id into v_rule;
  insert into public.trainer_compensation_assignments
    (trainer_id, organization_id, plan_version_id, purpose, effective_from)
  values (v_trainer, th_id, v_version, 'primary', '2099-01-01');

  -- ---------------------------------------------------- 1) state machine
  insert into public.payroll_runs (organization_id, reporting_period_id, name, created_by)
  values (th_id, v_period, 'P4 Run', '00000000-0000-4000-b000-000000000002')
  returning id into v_run;
  begin
    update public.payroll_runs set status='approved' where id=v_run;
    raise exception 'FAIL draft->approved transition allowed';
  exception when insufficient_privilege then null;
  end;

  -- 2) one active run per org+period
  begin
    insert into public.payroll_runs (organization_id, reporting_period_id, name, created_by)
    values (th_id, v_period, 'P4 Run Duplicate', '00000000-0000-4000-b000-000000000002');
    raise exception 'FAIL second active run allowed for period';
  exception when unique_violation then null;
  end;

  -- 3) valid transitions + calculation artifacts
  update public.payroll_runs set status='calculating' where id=v_run;
  update public.payroll_runs set status='needs_review' where id=v_run;
  insert into public.payroll_trainer_summaries
    (payroll_run_id, organization_id, trainer_id, compensation_plan_version_id,
     calculation_status, appointment_count, completed_session_count,
     eligible_basis_total_cents, commission_compensation_cents,
     final_gross_compensation_cents, review_status)
  values (v_run, th_id, v_trainer, v_version, 'calculated', 2, 2, 16400, 8200, 8200, 'reviewed')
  returning id into v_summary;
  insert into public.payroll_calculation_lines
    (payroll_run_id, trainer_summary_id, organization_id, trainer_id, appointment_id,
     compensation_plan_version_id, compensation_rule_id, line_type, basis_amount_cents,
     rate_basis_points, calculated_amount_cents, rounded_amount_cents)
  select v_run, v_summary, th_id, v_trainer, a.id, v_version, v_rule, 'session_percentage',
     a.source_listed_price_cents, 5000, a.source_listed_price_cents / 2, a.source_listed_price_cents / 2
  from public.appointments a where a.import_batch_id = v_batch;
  update public.payroll_runs
  set gross_compensation_total_cents = 8200, final_compensation_total_cents = 8200,
      trainer_count = 1, appointment_count = 2
  where id = v_run;

  -- 4) cross-org denial
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000003');
  select count(*) into n from public.payroll_runs;
  if n <> 0 then raise exception 'FAIL outsider sees % payroll runs', n; end if;
  select count(*) into n from public.payroll_trainer_summaries;
  if n <> 0 then raise exception 'FAIL outsider sees % summaries', n; end if;
  select count(*) into n from public.payroll_calculation_lines;
  if n <> 0 then raise exception 'FAIL outsider sees % lines', n; end if;
  reset role;

  -- 5) trainer self-scope: nothing visible while unposted
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000004');
  select count(*) into n from public.payroll_trainer_summaries;
  if n <> 0 then raise exception 'FAIL trainer sees unposted summary'; end if;
  select count(*) into n from public.payroll_calculation_lines;
  if n <> 0 then raise exception 'FAIL trainer sees unposted lines'; end if;
  reset role;

  -- 6) approval path
  update public.payroll_runs set status='ready_for_approval' where id=v_run;
  update public.payroll_runs set status='approved',
    approved_by='00000000-0000-4000-b000-000000000002', approved_at=now() where id=v_run;

  -- 7) unauthorized posting rejected
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000003');
  begin
    perform app.post_payroll_run(v_run);
    raise exception 'FAIL outsider posted payroll';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 8) blocking issue prevents posting
  insert into public.payroll_issues (payroll_run_id, organization_id, code, severity, message)
  values (v_run, th_id, 'test_blocker', 'blocking', 'live check blocker')
  returning id into v_issue;
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000002');
  begin
    perform app.post_payroll_run(v_run);
    raise exception 'FAIL posted with open blocking issue';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  update public.payroll_issues set resolution_status='resolved',
    resolution_reason='fixed for live check' where id=v_issue;

  -- 9) posting freezes the run with a versioned, hashed snapshot
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000002');
  select app.post_payroll_run(v_run) into result;
  reset role;
  if (result->>'snapshot_version')::int <> 1 then
    raise exception 'FAIL snapshot version %', result->>'snapshot_version';
  end if;
  select status into t from public.payroll_runs where id=v_run;
  if t <> 'posted' then raise exception 'FAIL run status % after post', t; end if;
  select count(*) into n from public.payroll_snapshots
    where payroll_run_id=v_run and length(lines_sha256)=64;
  if n <> 1 then raise exception 'FAIL snapshot/hash missing'; end if;
  select count(*) into n from public.audit_events
    where entity_id=v_run and action='payroll_run_posted';
  if n <> 1 then raise exception 'FAIL posting not audited'; end if;

  -- 10) double posting blocked
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000002');
  begin
    perform app.post_payroll_run(v_run);
    raise exception 'FAIL double post allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;

  -- 11) posted lines are frozen
  begin
    update public.payroll_calculation_lines set rounded_amount_cents = 1
    where payroll_run_id = v_run and basis_amount_cents = 6400;
    raise exception 'FAIL posted line mutated';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.payroll_calculation_lines where payroll_run_id = v_run;
    raise exception 'FAIL posted line deleted';
  exception when insufficient_privilege then null;
  end;

  -- 12) appointment dependency guard
  begin
    update public.appointments set canonical_status='cancelled' where id=v_appt1;
    raise exception 'FAIL payroll-protected appointment mutated';
  exception when insufficient_privilege then
    if sqlerrm not like '%appointment_protected_by_payroll%' then raise; end if;
  end;
  update public.appointments set notes='non-material note ok' where id=v_appt1; -- allowed

  -- 13) import reversal fails closed with dependent run ids
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000002');
  begin
    perform app.reverse_import_batch(v_batch, 'live check attempt');
    raise exception 'FAIL reversal allowed with payroll dependency';
  exception when others then
    if sqlerrm not like 'payroll_dependency_exists:%' then raise; end if;
    if position(v_run::text in sqlerrm) = 0 then
      raise exception 'FAIL dependency error lacks run id: %', sqlerrm;
    end if;
  end;
  select count(*) into n from public.payroll_dependencies_for_batch(v_batch);
  if n <> 1 then raise exception 'FAIL dependencies view returned % rows', n; end if;
  reset role;

  -- 14) trainer self-scope on posted run: own rows visible, others none
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000004');
  select count(*) into n from public.payroll_trainer_summaries;
  if n <> 1 then raise exception 'FAIL trainer sees % posted summaries (want 1)', n; end if;
  select count(*) into n from public.payroll_calculation_lines;
  if n <> 2 then raise exception 'FAIL trainer sees % posted lines (want 2)', n; end if;
  reset role;
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000003');
  select count(*) into n from public.payroll_snapshots;
  if n <> 0 then raise exception 'FAIL outsider sees snapshots'; end if;
  reset role;

  -- 15) locking (workspace_admin holds payroll:lock)
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000002');
  perform app.lock_payroll_run(v_run, 'live check lock');
  reset role;
  select status into t from public.payroll_runs where id=v_run;
  if t <> 'locked' then raise exception 'FAIL lock left status %', t; end if;

  -- 16) reopen authority: workspace_admin denied, platform_admin allowed;
  --     approval + posting marks cleared, snapshot preserved
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000002');
  begin
    perform app.reopen_payroll_run(v_run, 'ws admin should be denied');
    raise exception 'FAIL workspace admin reopened run';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000001');
  perform app.reopen_payroll_run(v_run, 'live check reopen');
  reset role;
  select status into t from public.payroll_runs where id=v_run;
  if t <> 'reopened' then raise exception 'FAIL reopen left status %', t; end if;
  select count(*) into n from public.payroll_runs
    where id=v_run and approved_by is null and posted_by is null and locked_by is null;
  if n <> 1 then raise exception 'FAIL reopen kept approval/posting marks'; end if;
  select count(*) into n from public.payroll_snapshots where payroll_run_id=v_run;
  if n <> 1 then raise exception 'FAIL reopen dropped snapshot'; end if;

  -- 17) reopened run releases the appointment guard
  update public.appointments set canonical_status='cancelled' where id=v_appt1;
  update public.appointments set canonical_status='completed' where id=v_appt1;

  -- 18) re-post after reopen produces snapshot v2
  update public.payroll_runs set status='calculating' where id=v_run;
  update public.payroll_runs set status='needs_review' where id=v_run;
  update public.payroll_runs set status='ready_for_approval' where id=v_run;
  update public.payroll_runs set status='approved',
    approved_by='00000000-0000-4000-b000-000000000002', approved_at=now() where id=v_run;
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000002');
  select app.post_payroll_run(v_run) into result;
  reset role;
  if (result->>'snapshot_version')::int <> 2 then
    raise exception 'FAIL re-post snapshot version %', result->>'snapshot_version';
  end if;

  -- 19) supersession creates the replacement draft atomically
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000001');
  select app.supersede_payroll_run(v_run, 'live check supersede') into v_run2;
  reset role;
  select status into t from public.payroll_runs where id=v_run;
  if t <> 'superseded' then raise exception 'FAIL supersede left status %', t; end if;
  select count(*) into n from public.payroll_runs
    where id=v_run2 and status='draft' and run_number=2 and supersedes_payroll_run_id=v_run;
  if n <> 1 then raise exception 'FAIL replacement run wrong'; end if;
  select count(*) into n from public.payroll_runs
    where id=v_run and superseded_by_payroll_run_id=v_run2;
  if n <> 1 then raise exception 'FAIL supersession backlink missing'; end if;
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000001');
  begin
    perform app.supersede_payroll_run(v_run, 'second supersede');
    raise exception 'FAIL double supersede allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;

  -- 20) superseded runs release the reversal guard
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000002');
  select app.reverse_import_batch(v_batch, 'live check reversal after supersede') into result;
  reset role;
  if (result->>'reversed_count')::int <> 2 then
    raise exception 'FAIL reversed_count %', result->>'reversed_count';
  end if;

  -- 21) approved adjustments are immutable in material fields
  insert into public.payroll_adjustments
    (organization_id, reporting_period_id, trainer_id, adjustment_type, amount_cents,
     reason, status, approved_by, approved_at)
  values (th_id, v_period, v_trainer, 'bonus', 5000, 'live check bonus', 'approved',
     '00000000-0000-4000-b000-000000000001', now())
  returning id into v_adjustment;
  begin
    update public.payroll_adjustments set amount_cents = 99999 where id = v_adjustment;
    raise exception 'FAIL approved adjustment amount mutated';
  exception when insufficient_privilege then null;
  end;

  -- 22) included time entries are immutable while the run is frozen
  insert into public.manual_time_entries
    (organization_id, trainer_id, reporting_period_id, work_date, work_category,
     description, requested_minutes, approved_minutes, status, payroll_run_id)
  values (th_id, v_trainer, v_period, '2099-03-05', 'admin', 'live check time',
     120, 120, 'included', v_run)
  returning id into v_time;
  begin
    update public.manual_time_entries set status='voided' where id=v_time;
    raise exception 'FAIL included time entry voided under frozen run';
  exception when insufficient_privilege then null;
  end;

  -- 23) voiding the replacement draft; terminal states stay terminal
  perform pg_temp.impersonate('00000000-0000-4000-b000-000000000001');
  perform app.void_payroll_run(v_run2, 'live check void');
  reset role;
  select status into t from public.payroll_runs where id=v_run2;
  if t <> 'voided' then raise exception 'FAIL void left status %', t; end if;
  begin
    update public.payroll_runs set status='draft' where id=v_run2;
    raise exception 'FAIL voided run resurrected';
  exception when insufficient_privilege then null;
  end;

  raise notice 'Phase 4 live payroll state machine / guard / RLS checks passed';
end $$;

rollback;
