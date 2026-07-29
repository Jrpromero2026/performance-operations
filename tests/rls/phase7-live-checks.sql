-- ============================================================================
-- Phase 7 live checks: period-close state machine, execute preconditions
-- (fail-closed), separation of duties, atomic close transaction, post-close
-- change guards, closed-run/manifest/ack immutability, reopen + versioned
-- re-close cycle, void, RLS (cross-org denial), saved-view sharing policies,
-- scheduled-definition execution constraint.
-- Runs in an ISOLATED throwaway organization so org-scoped revalidations
-- (e.g. pending import batches) never collide with dev data. Impersonates
-- users via request.jwt.claims and ROLLS BACK — never run against production.
-- Executed against performance-operations-dev on 2026-07-29: ALL PASSED.
-- ============================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-b700-000000000001', 'p7-admin@test.local'),
  ('00000000-0000-4000-b700-000000000002', 'p7-wsadmin@test.local'),
  ('00000000-0000-4000-b700-000000000003', 'p7-outsider@test.local'),
  ('00000000-0000-4000-b700-000000000004', 'p7-trainer@test.local');
insert into public.profiles (id, email, full_name) values
  ('00000000-0000-4000-b700-000000000001', 'p7-admin@test.local', 'P7 Admin'),
  ('00000000-0000-4000-b700-000000000002', 'p7-wsadmin@test.local', 'P7 WS Admin'),
  ('00000000-0000-4000-b700-000000000003', 'p7-outsider@test.local', 'P7 Outsider'),
  ('00000000-0000-4000-b700-000000000004', 'p7-trainer@test.local', 'P7 Trainer');

insert into public.organizations (slug, name) values ('p7-close-test', 'P7 Close Test Org');

insert into public.organization_memberships (profile_id, organization_id, role_id)
select u.uid, o.id, r.id from (values
  ('00000000-0000-4000-b700-000000000001'::uuid, 'platform_admin'),
  ('00000000-0000-4000-b700-000000000002'::uuid, 'workspace_admin'),
  ('00000000-0000-4000-b700-000000000004'::uuid, 'trainer')
) as u(uid, role_key)
join public.roles r on r.key = u.role_key
join public.organizations o on o.slug = 'p7-close-test';

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
  org_id uuid;
  c_admin   constant uuid := '00000000-0000-4000-b700-000000000001';
  c_wsadmin constant uuid := '00000000-0000-4000-b700-000000000002';
  c_outsider constant uuid := '00000000-0000-4000-b700-000000000003';
  c_trainer constant uuid := '00000000-0000-4000-b700-000000000004';
  v_trainer uuid;
  v_service uuid;
  v_category uuid;
  v_client uuid;
  v_batch uuid;
  v_period uuid;
  v_plan uuid;
  v_version uuid;
  v_rule uuid;
  v_payroll uuid;
  v_run uuid;
  v_run2 uuid;
  v_summary uuid;
  v_pkg uuid;
  v_export uuid;
  v_export_sha text;
  v_manifest jsonb;
  v_sha text;
  v_appt uuid;
  v_row3 uuid;
  v_view uuid;
  n int;
  t text;
  result jsonb;
begin
  select id into strict org_id from public.organizations where slug = 'p7-close-test';

  -- ------------------------------------------------ ledger + payroll fixtures
  insert into public.trainers (display_name, first_name, last_name, profile_id)
  values ('P7 Fixture Trainer', 'P7', 'Trainer', c_trainer)
  returning id into v_trainer;
  insert into public.trainer_organization_assignments (trainer_id, organization_id, title)
  values (v_trainer, org_id, 'Trainer');
  insert into public.service_categories (organization_id, name) values (org_id, 'P7 Cat')
  returning id into v_category;
  insert into public.services (organization_id, category_id, internal_name, display_name)
  values (org_id, v_category, 'p7-svc', 'P7 Service') returning id into v_service;
  insert into public.clients (display_name, email) values ('P7 Client', 'p7client@test.local')
  returning id into v_client;
  insert into public.client_organization_assignments (client_id, organization_id)
  values (v_client, org_id);

  insert into public.import_batches (organization_id, source, original_filename, storage_path,
    file_hash, file_size, mime_type, uploaded_by)
  values (org_id, 'setmore', 'p7-test.csv', 'x/p7-test.csv', 'hash-p7-1', 100, 'text/csv', c_wsadmin)
  returning id into v_batch;
  update public.import_batches set status='parsing' where id=v_batch;
  update public.import_batches set status='validating' where id=v_batch;
  update public.import_batches set status='ready_for_approval' where id=v_batch;
  update public.import_batches set status='approved', approved_by=c_wsadmin, approved_at=now()
  where id=v_batch;
  insert into public.import_rows (import_batch_id, organization_id, source_row_number,
    original_row, normalized_row, row_hash, processing_status, duplicate_class,
    appointment_date, start_at, end_at, duration_minutes, canonical_status,
    external_appointment_id, listed_price_cents, matched_trainer_id, matched_service_id, matched_client_id)
  values
    (v_batch, org_id, 1, '{"a":"1"}', '{}', 'p7h1', 'ready', 'new',
     '2097-05-01', '2097-05-01T17:00:00Z', '2097-05-01T18:00:00Z', 60, 'completed',
     'P7BK1', 6400, v_trainer, v_service, v_client),
    (v_batch, org_id, 2, '{"a":"2"}', '{}', 'p7h2', 'ready', 'new',
     '2097-05-02', '2097-05-02T17:00:00Z', '2097-05-02T18:00:00Z', 60, 'completed',
     'P7BK2', 10000, v_trainer, v_service, v_client);
  perform pg_temp.impersonate(c_wsadmin);
  perform app.post_import_batch(v_batch);
  reset role;
  select id into strict v_appt from public.appointments
  where import_batch_id = v_batch and appointment_date = '2097-05-01';
  -- Spare staged row: appointments.import_row_id is NOT NULL (ledger accepts
  -- imported rows only), so the guard tests below need a real row to cite.
  insert into public.import_rows (import_batch_id, organization_id, source_row_number,
    original_row, normalized_row, row_hash, processing_status, duplicate_class,
    appointment_date, start_at, end_at, duration_minutes, canonical_status,
    external_appointment_id, listed_price_cents, matched_trainer_id, matched_service_id, matched_client_id)
  values (v_batch, org_id, 3, '{"a":"3"}', '{}', 'p7h3', 'ready', 'new',
     '2097-05-10', '2097-05-10T17:00:00Z', '2097-05-10T18:00:00Z', 60, 'completed',
     'P7LATE', 5000, v_trainer, v_service, v_client)
  returning id into v_row3;

  insert into public.reporting_periods (organization_id, label, period_type, start_date, end_date, status)
  values (org_id, 'P7 2097-05', 'monthly', '2097-05-01', '2097-05-31', 'open')
  returning id into v_period;

  insert into public.compensation_plans (organization_id, name) values (org_id, 'P7 Plan')
  returning id into v_plan;
  insert into public.compensation_plan_versions
    (organization_id, plan_id, compensation_method, version_number, status,
     tier_behavior, rounding_scope, effective_from)
  values (org_id, v_plan, 'percentage_of_revenue', 1, 'published',
     'not_applicable', 'per_line', '2097-01-01')
  returning id into v_version;
  insert into public.compensation_rules
    (plan_version_id, organization_id, rule_type, rate_basis_points, basis_type, criteria)
  values (v_version, org_id, 'revenue_rate', 5000, 'source_listed_amount',
    '{"conditions":[{"field":"canonical_status","op":"in","value":["completed"]}]}')
  returning id into v_rule;
  insert into public.trainer_compensation_assignments
    (trainer_id, organization_id, plan_version_id, purpose, effective_from)
  values (v_trainer, org_id, v_version, 'primary', '2097-01-01');

  -- Payroll run to APPROVED but intentionally NOT posted yet: the close
  -- must fail closed on payroll_not_finalized further below.
  insert into public.payroll_runs (organization_id, reporting_period_id, name, created_by)
  values (org_id, v_period, 'P7 Payroll', c_wsadmin)
  returning id into v_payroll;
  update public.payroll_runs set status='calculating' where id=v_payroll;
  update public.payroll_runs set status='needs_review' where id=v_payroll;
  insert into public.payroll_trainer_summaries
    (payroll_run_id, organization_id, trainer_id, compensation_plan_version_id,
     calculation_status, appointment_count, completed_session_count,
     eligible_basis_total_cents, commission_compensation_cents,
     final_gross_compensation_cents, review_status)
  values (v_payroll, org_id, v_trainer, v_version, 'calculated', 2, 2, 16400, 8200, 8200, 'reviewed')
  returning id into v_summary;
  insert into public.payroll_calculation_lines
    (payroll_run_id, trainer_summary_id, organization_id, trainer_id, appointment_id,
     compensation_plan_version_id, compensation_rule_id, line_type, basis_amount_cents,
     rate_basis_points, calculated_amount_cents, rounded_amount_cents)
  select v_payroll, v_summary, org_id, v_trainer, a.id, v_version, v_rule, 'session_percentage',
     a.source_listed_price_cents, 5000, a.source_listed_price_cents / 2, a.source_listed_price_cents / 2
  from public.appointments a where a.import_batch_id = v_batch;
  update public.payroll_runs
  set gross_compensation_total_cents = 8200, final_compensation_total_cents = 8200,
      trainer_count = 1, appointment_count = 2
  where id = v_payroll;
  update public.payroll_runs set status='ready_for_approval' where id=v_payroll;
  update public.payroll_runs set status='approved', approved_by=c_wsadmin, approved_at=now()
  where id=v_payroll;

  -- ------------------------------------------------- 1) close-run RLS + insert
  perform pg_temp.impersonate(c_wsadmin);
  insert into public.period_close_runs (organization_id, reporting_period_id, initiated_by)
  values (org_id, v_period, c_wsadmin) returning id into v_run;
  reset role;

  perform pg_temp.impersonate(c_outsider);
  select count(*) into n from public.period_close_runs;
  if n <> 0 then raise exception 'FAIL outsider sees % close runs', n; end if;
  reset role;
  perform pg_temp.impersonate(c_trainer);
  select count(*) into n from public.period_close_runs;
  if n <> 0 then raise exception 'FAIL trainer sees % close runs', n; end if;
  begin
    insert into public.period_close_runs (organization_id, reporting_period_id, initiated_by)
    values (org_id, v_period, c_trainer);
    raise exception 'FAIL trainer created a close run';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 2) one active close run per period
  begin
    insert into public.period_close_runs (organization_id, reporting_period_id, initiated_by)
    values (org_id, v_period, c_wsadmin);
    raise exception 'FAIL second active close run allowed';
  exception when unique_violation then null;
  end;

  -- 3) state machine: no skipping ahead
  begin
    update public.period_close_runs set status='closed' where id=v_run;
    raise exception 'FAIL close_review -> closed allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.period_close_runs set status='closing' where id=v_run;
    raise exception 'FAIL close_review -> closing allowed';
  exception when insufficient_privilege then null;
  end;

  -- 4) execute preconditions fail closed, in order --------------------------
  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.execute_period_close(v_run, '{}'::jsonb, repeat('0', 64));
    raise exception 'FAIL executed from close_review';
  exception when others then
    if sqlerrm not like '%close_run_not_ready%' then raise; end if;
  end;
  reset role;

  update public.period_close_runs
  set status='ready_to_close', reviewed_by=c_wsadmin, reviewed_at=now(),
      readiness_snapshot = jsonb_build_object('warning_codes', jsonb_build_array('p7_warning'))
  where id=v_run;

  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.execute_period_close(v_run, '{}'::jsonb, repeat('0', 64));
    raise exception 'FAIL executed without approval';
  exception when others then
    if sqlerrm not like '%close_not_approved%' then raise; end if;
  end;
  reset role;

  -- 5) separation of duties fails closed (no policy row -> defaults deny)
  update public.period_close_runs set approved_by=c_wsadmin, approved_at=now() where id=v_run;
  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.execute_period_close(v_run, '{}'::jsonb, repeat('0', 64));
    raise exception 'FAIL self-approval accepted';
  exception when others then
    if sqlerrm not like '%self_approval_forbidden%' then raise; end if;
  end;
  reset role;
  update public.period_close_runs set approved_by=c_admin where id=v_run;

  -- 6) payroll must be finalized (approved-but-unposted blocks the close)
  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.execute_period_close(v_run, '{}'::jsonb, repeat('0', 64));
    raise exception 'FAIL closed with unposted payroll';
  exception when others then
    if sqlerrm not like '%payroll_not_finalized%' then raise; end if;
  end;
  -- Post the payroll, then continue down the precondition chain.
  perform app.post_payroll_run(v_payroll);
  reset role;

  -- 7) unacknowledged snapshot warnings block execution
  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.execute_period_close(v_run, '{}'::jsonb, repeat('0', 64));
    raise exception 'FAIL executed with unacknowledged warnings';
  exception when others then
    if sqlerrm not like '%warnings_unacknowledged%' then raise; end if;
  end;
  reset role;
  insert into public.period_close_acknowledgements
    (period_close_run_id, organization_id, check_code, close_version, note, acknowledged_by)
  values (v_run, org_id, 'p7_warning', 1, 'reviewed for live check', c_wsadmin);

  -- 8) manifest + artifact integrity checks
  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.execute_period_close(v_run,
      jsonb_build_object('close_run_id', gen_random_uuid()), repeat('0', 64));
    raise exception 'FAIL wrong-run manifest accepted';
  exception when others then
    if sqlerrm not like '%manifest_run_mismatch%' then raise; end if;
  end;
  begin
    perform app.execute_period_close(v_run,
      jsonb_build_object('close_run_id', v_run), repeat('0', 64));
    raise exception 'FAIL executed without report package';
  exception when others then
    if sqlerrm not like '%report_package_missing%' then raise; end if;
  end;
  reset role;

  insert into public.report_packages
    (organization_id, reporting_period_id, package_type, generated_by,
     payload, package_sha256, intelligence_version)
  values (org_id, v_period, 'executive', c_wsadmin,
     '{"p7":"frozen"}'::jsonb, repeat('b', 64), 'intel-v1')
  returning id into v_pkg;
  update public.report_packages set status='ready' where id=v_pkg;
  update public.period_close_runs set report_package_id=v_pkg where id=v_run;

  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.execute_period_close(v_run,
      jsonb_build_object('close_run_id', v_run, 'report_package_id', v_pkg,
                         'exports', '[]'::jsonb),
      repeat('0', 64));
    raise exception 'FAIL executed without exports';
  exception when others then
    if sqlerrm not like '%exports_missing%' then raise; end if;
  end;
  reset role;

  v_export_sha := repeat('c', 64);
  insert into public.close_exports
    (organization_id, reporting_period_id, export_type, file_name, sha256,
     row_count, byte_size, generated_by)
  values (org_id, v_period, 'payroll_register_csv', 'p7-register.csv', v_export_sha,
     1, 100, c_wsadmin)
  returning id into v_export;

  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.execute_period_close(v_run,
      jsonb_build_object('close_run_id', v_run, 'report_package_id', v_pkg,
        'exports', jsonb_build_array(jsonb_build_object('id', v_export, 'sha256', repeat('d', 64)))),
      repeat('0', 64));
    raise exception 'FAIL tampered export hash accepted';
  exception when others then
    if sqlerrm not like '%export_manifest_mismatch%' then raise; end if;
  end;
  reset role;

  -- 9) atomic execution
  v_manifest := jsonb_build_object(
    'close_run_id', v_run, 'report_package_id', v_pkg,
    'exports', jsonb_build_array(jsonb_build_object('id', v_export, 'sha256', v_export_sha)));
  v_sha := encode(sha256(convert_to(v_manifest::text, 'UTF8')), 'hex');
  perform pg_temp.impersonate(c_wsadmin);
  select app.execute_period_close(v_run, v_manifest, v_sha) into result;
  reset role;
  if (result->>'close_version')::int <> 1 then
    raise exception 'FAIL close_version %', result->>'close_version';
  end if;
  select status into t from public.period_close_runs where id=v_run;
  if t <> 'closed' then raise exception 'FAIL run status % after close', t; end if;
  select status into t from public.reporting_periods where id=v_period;
  if t <> 'closed' then raise exception 'FAIL period status % after close', t; end if;
  select status into t from public.report_packages where id=v_pkg;
  if t <> 'finalized' then raise exception 'FAIL package status % after close', t; end if;
  select count(*) into n from public.period_close_manifests
  where period_close_run_id=v_run and manifest_sha256=v_sha;
  if n <> 1 then raise exception 'FAIL manifest row missing'; end if;
  select count(*) into n from public.period_close_events
  where period_close_run_id=v_run and to_status in ('closing', 'closed');
  if n <> 2 then raise exception 'FAIL close events %', n; end if;
  select count(*) into n from public.audit_events
  where entity_id=v_run and action='period_close_executed';
  if n <> 1 then raise exception 'FAIL close not audited'; end if;

  -- 10) double execution blocked
  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.execute_period_close(v_run, v_manifest, v_sha);
    raise exception 'FAIL double close allowed';
  exception when others then
    if sqlerrm not like '%close_run_not_ready%' then raise; end if;
  end;
  reset role;

  -- 11) post-close change guards --------------------------------------------
  begin
    insert into public.appointments
      (organization_id, trainer_id, service_id, client_id, appointment_date,
       start_at, end_at, duration_minutes, canonical_status, source,
       external_appointment_id, import_batch_id, import_row_id, timezone)
    values (org_id, v_trainer, v_service, v_client, '2097-05-10',
       '2097-05-10T17:00:00Z', '2097-05-10T18:00:00Z', 60, 'completed', 'setmore',
       'P7LATE', v_batch, v_row3, 'America/Los_Angeles');
    raise exception 'FAIL appointment inserted into closed period';
  exception when insufficient_privilege then
    if sqlerrm not like 'appointment_in_closed_period:%' then raise; end if;
    if position(v_run::text in sqlerrm) = 0 then
      raise exception 'FAIL guard error lacks close-run id: %', sqlerrm;
    end if;
  end;
  begin
    update public.appointments set canonical_status='cancelled' where id=v_appt;
    raise exception 'FAIL material appointment change in closed period';
  exception when insufficient_privilege then null; -- close or payroll guard
  end;
  update public.appointments set notes='non-material note ok' where id=v_appt;
  begin
    insert into public.payroll_runs (organization_id, reporting_period_id, name, created_by)
    values (org_id, v_period, 'P7 After Close', c_wsadmin);
    raise exception 'FAIL payroll run created for closed period';
  exception when insufficient_privilege then
    if sqlerrm not like 'payroll_in_closed_period:%' then raise; end if;
  end;
  begin
    insert into public.manual_time_entries
      (organization_id, trainer_id, reporting_period_id, work_date, work_category,
       description, requested_minutes, status)
    values (org_id, v_trainer, v_period, '2097-05-15', 'admin', 'p7 late time', 60, 'submitted');
    raise exception 'FAIL time entry created for closed period';
  exception when insufficient_privilege then
    if sqlerrm not like 'record_in_closed_period:%' then raise; end if;
  end;
  begin
    insert into public.payroll_adjustments
      (organization_id, reporting_period_id, trainer_id, adjustment_type, amount_cents, reason)
    values (org_id, v_period, v_trainer, 'bonus', 100, 'p7 late bonus');
    raise exception 'FAIL adjustment created for closed period';
  exception when insufficient_privilege then
    if sqlerrm not like 'record_in_closed_period:%' then raise; end if;
  end;
  begin
    update public.reporting_periods set status='open' where id=v_period;
    raise exception 'FAIL period reopened outside close workflow';
  exception when insufficient_privilege then
    if sqlerrm not like '%period_close_controlled%' then raise; end if;
  end;
  begin
    update public.reporting_periods set end_date='2097-06-30' where id=v_period;
    raise exception 'FAIL closed period dates changed';
  exception when insufficient_privilege then
    if sqlerrm not like '%closed_period_immutable%' then raise; end if;
  end;

  -- 12) closed-run, acknowledgement, and manifest immutability
  begin
    update public.period_close_runs set close_notes='tamper' where id=v_run;
    raise exception 'FAIL closed run mutated';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.period_close_acknowledgements set note='tamper'
    where period_close_run_id=v_run;
    raise exception 'FAIL frozen acknowledgement mutated';
  exception when insufficient_privilege then
    if sqlerrm not like '%acknowledgements_frozen%' then raise; end if;
  end;
  -- Manifests: authenticated users have SELECT only — writes affect 0 rows.
  perform pg_temp.impersonate(c_wsadmin);
  update public.period_close_manifests set manifest_sha256=repeat('e', 64)
  where period_close_run_id=v_run;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL manifest updated via RLS (% rows)', n; end if;
  delete from public.period_close_manifests where period_close_run_id=v_run;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL manifest deleted via RLS (% rows)', n; end if;
  reset role;
  -- Export records: identity fields immutable (trigger).
  begin
    update public.close_exports set sha256=repeat('f', 64) where id=v_export;
    raise exception 'FAIL export hash mutated';
  exception when insufficient_privilege then
    if sqlerrm not like '%export_record_immutable%' then raise; end if;
  end;

  -- 13) reopen: authority + versioned new cycle ------------------------------
  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.reopen_period_close(v_run, 'ws admin must be denied');
    raise exception 'FAIL workspace admin reopened close';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform pg_temp.impersonate(c_admin);
  begin
    perform app.reopen_period_close(v_run, 'x');
    raise exception 'FAIL trivial reopen reason accepted';
  exception when others then
    if sqlerrm not like '%reopen_reason_required%' then raise; end if;
  end;
  select app.reopen_period_close(v_run, 'live check reopen') into v_run2;
  reset role;

  select status into t from public.period_close_runs where id=v_run;
  if t <> 'superseded' then raise exception 'FAIL reopen left old run %', t; end if;
  select count(*) into n from public.period_close_runs
  where id=v_run and superseded_by_close_run_id=v_run2 and reopened_by=c_admin
    and reopen_reason='live check reopen' and manifest_sha256=v_sha;
  if n <> 1 then raise exception 'FAIL old run supersession record wrong'; end if;
  select count(*) into n from public.period_close_runs
  where id=v_run2 and status='close_review' and close_version=2
    and supersedes_close_run_id=v_run;
  if n <> 1 then raise exception 'FAIL replacement close cycle wrong'; end if;
  select status into t from public.reporting_periods where id=v_period;
  if t <> 'open' then raise exception 'FAIL period % after reopen', t; end if;
  select status into t from public.report_packages where id=v_pkg;
  if t <> 'superseded' then raise exception 'FAIL package % after reopen', t; end if;
  select count(*) into n from public.close_exports where id=v_export and superseded;
  if n <> 1 then raise exception 'FAIL export not superseded after reopen'; end if;
  select count(*) into n from public.period_close_manifests where period_close_run_id=v_run;
  if n <> 1 then raise exception 'FAIL reopen dropped the manifest'; end if;

  -- 14) reopened period accepts operational changes again
  insert into public.appointments
    (organization_id, trainer_id, service_id, client_id, appointment_date,
     start_at, end_at, duration_minutes, canonical_status, source,
     external_appointment_id, import_batch_id, import_row_id, timezone)
  values (org_id, v_trainer, v_service, v_client, '2097-05-10',
     '2097-05-10T17:00:00Z', '2097-05-10T18:00:00Z', 60, 'completed', 'setmore',
     'P7LATE', v_batch, v_row3, 'America/Los_Angeles');

  -- 15) void the replacement; terminal stays terminal
  perform pg_temp.impersonate(c_wsadmin);
  perform app.void_period_close(v_run2, 'live check void');
  reset role;
  select status into t from public.period_close_runs where id=v_run2;
  if t <> 'voided' then raise exception 'FAIL void left status %', t; end if;
  begin
    update public.period_close_runs set status='close_review' where id=v_run2;
    raise exception 'FAIL voided close run resurrected';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.void_period_close(v_run2, 'double void');
    raise exception 'FAIL double void allowed';
  exception when others then
    if sqlerrm not like '%close_run_not_voidable%' then raise; end if;
  end;
  reset role;

  -- 16) saved-view sharing policies ------------------------------------------
  perform pg_temp.impersonate(c_trainer);
  insert into public.saved_views (owner_id, page, kind, name, config)
  values (c_trainer, 'reports', 'report', 'P7 personal view', '{}');
  begin
    insert into public.saved_views
      (owner_id, page, kind, name, config, shared_scope, organization_id)
    values (c_trainer, 'reports', 'report', 'P7 trainer org view', '{}', 'organization', org_id);
    raise exception 'FAIL trainer shared a view org-wide';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform pg_temp.impersonate(c_wsadmin);
  insert into public.saved_views
    (owner_id, page, kind, name, config, shared_scope, organization_id, is_default)
  values (c_wsadmin, 'reports', 'report', 'P7 org view', '{}', 'organization', org_id, true)
  returning id into v_view;
  begin
    insert into public.saved_views
      (owner_id, page, kind, name, config, shared_scope, organization_id, is_default)
    values (c_wsadmin, 'reports', 'report', 'P7 org view 2', '{}', 'organization', org_id, true);
    raise exception 'FAIL two org defaults for one page allowed';
  exception when unique_violation then null;
  end;
  reset role;
  perform pg_temp.impersonate(c_outsider);
  select count(*) into n from public.saved_views where id=v_view;
  if n <> 0 then raise exception 'FAIL outsider sees org-shared view'; end if;
  reset role;

  -- 17) scheduled definitions can never be marked executable
  begin
    insert into public.scheduled_report_definitions
      (organization_id, owner_id, report_type, frequency, execution_enabled)
    values (org_id, c_wsadmin, 'quick_report', 'monthly', true);
    raise exception 'FAIL execution_enabled=true accepted';
  exception when check_violation then null;
  end;

  raise notice 'Phase 7 live close state machine / guard / RLS checks passed';
end $$;

rollback;
