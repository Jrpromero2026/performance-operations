-- ============================================================================
-- Phase 8 live checks: connection lifecycle + RLS, Vault credential
-- isolation (no plaintext retrieval by browsers; server-key-gated worker
-- path), job enqueue idempotency, atomic claim with competing workers,
-- lease recovery, retry/backoff progression, dead-letter + requeue,
-- cancellation, schedule-occurrence uniqueness, delivery-event guards,
-- source-record immutability, and the auto-approve/auto-post hard-off
-- constraints. Isolated throwaway organization; impersonates users via
-- request.jwt.claims; ROLLS BACK — never run against production.
-- Executed against performance-operations-dev on 2026-07-29: ALL PASSED.
-- ============================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-b800-000000000001', 'p8-admin@test.local'),
  ('00000000-0000-4000-b800-000000000002', 'p8-wsadmin@test.local'),
  ('00000000-0000-4000-b800-000000000003', 'p8-outsider@test.local'),
  ('00000000-0000-4000-b800-000000000004', 'p8-trainer@test.local');
insert into public.profiles (id, email, full_name) values
  ('00000000-0000-4000-b800-000000000001', 'p8-admin@test.local', 'P8 Admin'),
  ('00000000-0000-4000-b800-000000000002', 'p8-wsadmin@test.local', 'P8 WS Admin'),
  ('00000000-0000-4000-b800-000000000003', 'p8-outsider@test.local', 'P8 Outsider'),
  ('00000000-0000-4000-b800-000000000004', 'p8-trainer@test.local', 'P8 Trainer');
insert into public.organizations (slug, name) values ('p8-integration-test', 'P8 Integration Test Org');
insert into public.organization_memberships (profile_id, organization_id, role_id)
select u.uid, o.id, r.id from (values
  ('00000000-0000-4000-b800-000000000001'::uuid, 'platform_admin'),
  ('00000000-0000-4000-b800-000000000002'::uuid, 'workspace_admin'),
  ('00000000-0000-4000-b800-000000000004'::uuid, 'trainer')
) as u(uid, role_key)
join public.roles r on r.key = u.role_key
join public.organizations o on o.slug = 'p8-integration-test';

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
  c_admin   constant uuid := '00000000-0000-4000-b800-000000000001';
  c_wsadmin constant uuid := '00000000-0000-4000-b800-000000000002';
  c_trainer constant uuid := '00000000-0000-4000-b800-000000000004';
  v_conn uuid;
  v_secret_ref uuid;
  v_worker_key text;
  v_def uuid;
  v_sched uuid;
  v_job1 uuid;
  v_job2 uuid;
  v_job3 uuid;
  v_event uuid;
  v_record uuid;
  n int;
  t text;
  j jsonb;
  claimed record;
begin
  select id into strict org_id from public.organizations where slug = 'p8-integration-test';
  select decrypted_secret into strict v_worker_key
  from vault.decrypted_secrets where name = 'worker_server_key';

  -- 1) connection RLS + creation ------------------------------------------
  perform pg_temp.impersonate(c_wsadmin);
  insert into public.integration_connections (organization_id, provider_key, name, created_by)
  values (org_id, 'test_provider', 'P8 Live Conn', c_wsadmin)
  returning id into v_conn;
  reset role;
  perform pg_temp.impersonate('00000000-0000-4000-b800-000000000003');
  select count(*) into n from public.integration_connections;
  if n <> 0 then raise exception 'FAIL outsider sees % connections', n; end if;
  reset role;
  perform pg_temp.impersonate(c_trainer);
  select count(*) into n from public.integration_connections;
  if n <> 0 then raise exception 'FAIL trainer sees % connections', n; end if;
  begin
    insert into public.integration_connections (organization_id, provider_key, name, created_by)
    values (org_id, 'test_provider', 'trainer conn', c_trainer);
    raise exception 'FAIL trainer created a connection';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 2) lifecycle state machine --------------------------------------------
  begin
    update public.integration_connections set status='active' where id=v_conn;
    raise exception 'FAIL draft -> active allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.integration_connections set status='degraded' where id=v_conn;
    raise exception 'FAIL draft -> degraded allowed';
  exception when insufficient_privilege then null;
  end;

  -- 3) credential isolation -----------------------------------------------
  perform pg_temp.impersonate(c_trainer);
  begin
    perform app.store_connection_secret(v_conn, 'test_trainer_secret');
    raise exception 'FAIL trainer stored credentials';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform pg_temp.impersonate(c_wsadmin);
  select app.store_connection_secret(v_conn, 'test_livecheck_secret_1') into j;
  if j->>'fingerprint' is null or position('test_livecheck_secret_1' in j::text) > 0 then
    raise exception 'FAIL store returned the secret or no fingerprint';
  end if;
  -- Browsers can never read secrets back:
  begin
    perform app.get_connection_secret(v_conn);
    raise exception 'FAIL authenticated session read a secret';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from vault.decrypted_secrets;
    raise exception 'FAIL authenticated session queried vault directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform app.get_connection_secret_with_key(v_conn, 'wrong-key');
    raise exception 'FAIL non-platform-admin passed key gate';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform pg_temp.impersonate(c_admin);
  begin
    perform app.get_connection_secret_with_key(v_conn, 'wrong-key');
    raise exception 'FAIL wrong worker key accepted';
  exception when insufficient_privilege then null;
  end;
  select app.get_connection_secret_with_key(v_conn, v_worker_key) into t;
  if t <> 'test_livecheck_secret_1' then raise exception 'FAIL secret round-trip mismatch'; end if;
  reset role;
  select status, secret_ref into t, v_secret_ref from public.integration_connections where id=v_conn;
  if t <> 'awaiting_credentials' then raise exception 'FAIL store left status %', t; end if;

  -- rotation bumps version; revocation fails closed
  perform pg_temp.impersonate(c_wsadmin);
  perform app.store_connection_secret(v_conn, 'test_livecheck_secret_2');
  reset role;
  select secret_version into n from public.integration_connections where id=v_conn;
  if n <> 2 then raise exception 'FAIL rotation version %', n; end if;
  perform pg_temp.impersonate(c_wsadmin);
  perform app.revoke_connection_secret(v_conn, 'live check revocation');
  reset role;
  select status into t from public.integration_connections where id=v_conn;
  if t <> 'revoked' then raise exception 'FAIL revoke left status %', t; end if;
  select count(*) into n from vault.secrets where id = v_secret_ref;
  if n <> 0 then raise exception 'FAIL vault secret survived revocation'; end if;
  perform pg_temp.impersonate(c_admin);
  begin
    perform app.get_connection_secret_with_key(v_conn, v_worker_key);
    raise exception 'FAIL revoked credential retrievable';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  -- restore a working credential (revoked -> awaiting_credentials,
  -- migration 26)
  perform pg_temp.impersonate(c_wsadmin);
  perform app.store_connection_secret(v_conn, 'test_livecheck_secret_3');
  reset role;
  select status into t from public.integration_connections where id=v_conn;
  if t <> 'awaiting_credentials' then raise exception 'FAIL re-store after revoke left %', t; end if;
  update public.integration_connections set status='validating' where id=v_conn;
  update public.integration_connections set status='active' where id=v_conn;

  -- 4) sync definitions: auto-approve/auto-post are hard-off ---------------
  insert into public.integration_sync_definitions (connection_id, organization_id)
  values (v_conn, org_id) returning id into v_def;
  begin
    update public.integration_sync_definitions set auto_approve = true where id=v_def;
    raise exception 'FAIL auto_approve=true accepted';
  exception when check_violation then null;
  end;
  begin
    update public.integration_sync_definitions set auto_post = true where id=v_def;
    raise exception 'FAIL auto_post=true accepted';
  exception when check_violation then null;
  end;

  -- 5) source-record immutability -----------------------------------------
  insert into public.integration_source_records
    (organization_id, connection_id, data_type, external_id, payload, payload_sha256)
  values (org_id, v_conn, 'appointments', 'x1', '{"a":1}', repeat('a', 64))
  returning id into v_record;
  begin
    update public.integration_source_records set payload='{"a":2}' where id=v_record;
    raise exception 'FAIL source record mutated';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.integration_source_records where id=v_record;
    raise exception 'FAIL source record deleted';
  exception when insufficient_privilege then null;
  end;
  -- content-addressed idempotency: identical payload conflicts
  begin
    insert into public.integration_source_records
      (organization_id, connection_id, data_type, external_id, payload, payload_sha256)
    values (org_id, v_conn, 'appointments', 'x1', '{"a":1}', repeat('a', 64));
    raise exception 'FAIL duplicate source record accepted';
  exception when unique_violation then null;
  end;

  -- 6) job enqueue: permissions + idempotency ------------------------------
  perform pg_temp.impersonate(c_trainer);
  begin
    perform app.enqueue_background_job(org_id, 'appointment_sync', '{}', 'p8-job-x');
    raise exception 'FAIL trainer enqueued a job';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform pg_temp.impersonate(c_wsadmin);
  select app.enqueue_background_job(org_id, 'appointment_sync',
    jsonb_build_object('definition_id', v_def), 'p8-job-1') into v_job1;
  select app.enqueue_background_job(org_id, 'appointment_sync',
    jsonb_build_object('definition_id', v_def), 'p8-job-1') into v_job2;
  if v_job1 is distinct from v_job2 then
    raise exception 'FAIL idempotent enqueue returned different ids';
  end if;
  select app.enqueue_background_job(org_id, 'cleanup', '{}', 'p8-job-2') into v_job2;
  begin
    perform app.enqueue_background_job(org_id, 'not_a_type', '{}', 'p8-job-bad');
    raise exception 'FAIL unknown job type accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;

  -- 7) atomic claim: competing workers never share a job -------------------
  perform pg_temp.impersonate(c_trainer);
  begin
    perform * from app.claim_background_jobs('worker-t', 1, 60);
    raise exception 'FAIL trainer claimed jobs';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform pg_temp.impersonate(c_admin);
  select count(*) into n from app.claim_background_jobs('worker-A', 1, 60);
  if n <> 1 then raise exception 'FAIL worker A claimed % jobs', n; end if;
  select count(*) into n from app.claim_background_jobs('worker-B', 5, 60);
  if n <> 1 then raise exception 'FAIL worker B claimed % jobs (expected only the unclaimed one)', n; end if;
  reset role;
  select count(*) into n from public.background_jobs
  where id in (v_job1, v_job2) and status='claimed'
    and claimed_by in ('worker-A', 'worker-B');
  if n <> 2 then raise exception 'FAIL claims not recorded'; end if;
  select count(distinct claimed_by) into n from public.background_jobs where id in (v_job1, v_job2);
  if n <> 2 then raise exception 'FAIL both jobs claimed by one worker'; end if;

  -- 8) start/complete + terminal protection --------------------------------
  perform pg_temp.impersonate(c_admin);
  perform app.start_background_job(v_job2, case when (select claimed_by from public.background_jobs where id=v_job2)='worker-A' then 'worker-A' else 'worker-B' end);
  perform app.complete_background_job(v_job2, (select claimed_by from public.background_jobs where id=v_job2), '{"detail":"ok"}');
  begin
    perform app.start_background_job(v_job2, 'worker-A');
    raise exception 'FAIL restarted a completed job';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  select status into t from public.background_jobs where id=v_job2;
  if t <> 'succeeded' then raise exception 'FAIL complete left %', t; end if;
  begin
    update public.background_jobs set status='queued' where id=v_job2;
    raise exception 'FAIL terminal job resurrected';
  exception when insufficient_privilege then null;
  end;

  -- 9) lease recovery -------------------------------------------------------
  -- v_job1 is claimed but never started/completed; expire its lease.
  update public.background_jobs set lease_expires_at = now() - interval '1 minute'
  where id = v_job1;
  perform pg_temp.impersonate(c_admin);
  select count(*) into n from app.claim_background_jobs('worker-C', 5, 60);
  if n <> 1 then raise exception 'FAIL lease recovery claimed % jobs', n; end if;
  reset role;
  select attempt_count, claimed_by into n, t from public.background_jobs where id=v_job1;
  if n <> 2 or t <> 'worker-C' then
    raise exception 'FAIL recovered job attempt=% worker=%', n, t;
  end if;

  -- 10) retry progression with backoff, then permanent failure --------------
  perform pg_temp.impersonate(c_admin);
  perform app.start_background_job(v_job1, 'worker-C');
  select app.fail_background_job(v_job1, 'worker-C', 'network_timeout', 'sim timeout', true) into t;
  reset role;
  if t <> 'retryable_failed' then raise exception 'FAIL first failure status %', t; end if;
  if not exists (
    select 1 from public.background_jobs where id = v_job1 and available_at > now()
  ) then
    raise exception 'FAIL no backoff applied';
  end if;
  update public.background_jobs set available_at = now(), max_attempts = 3 where id=v_job1;
  perform pg_temp.impersonate(c_admin);
  select count(*) into n from app.claim_background_jobs('worker-D', 5, 60);
  if n <> 1 then raise exception 'FAIL retry not claimable'; end if;
  perform app.start_background_job(v_job1, 'worker-D');
  select app.fail_background_job(v_job1, 'worker-D', 'invalid_response', 'sim permanent', false) into t;
  reset role;
  if t <> 'permanently_failed' then raise exception 'FAIL non-retryable status %', t; end if;
  -- Two attempt rows: worker-A claimed but never STARTED (attempt rows
  -- record execution, not claims), workers C and D each started one.
  select count(*) into n from public.background_job_attempts where job_id=v_job1;
  if n <> 2 then raise exception 'FAIL attempt history wrong (%)', n; end if;
  select count(*) into n from public.background_job_attempts
  where job_id=v_job1 and outcome in ('retryable_failed', 'permanently_failed');
  if n <> 2 then raise exception 'FAIL attempt outcomes wrong (%)', n; end if;

  -- 11) dead-letter + requeue (permissions + audit) -------------------------
  perform pg_temp.impersonate(c_trainer);
  begin
    perform app.dead_letter_background_job(v_job1, 'nope');
    raise exception 'FAIL trainer dead-lettered a job';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform pg_temp.impersonate(c_wsadmin);
  perform app.dead_letter_background_job(v_job1, 'live check DL');
  reset role;
  select status into t from public.background_jobs where id=v_job1;
  if t <> 'dead_lettered' then raise exception 'FAIL DL left %', t; end if;
  perform pg_temp.impersonate(c_wsadmin);
  begin
    perform app.requeue_dead_letter_job(v_job1, 'x');
    raise exception 'FAIL trivial requeue reason accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform app.requeue_dead_letter_job(v_job1, 'live check requeue');
  reset role;
  select status into t from public.background_jobs where id=v_job1;
  if t <> 'queued' then raise exception 'FAIL requeue left %', t; end if;
  select count(*) into n from public.audit_events
  where entity_id=v_job1 and action in ('job_dead_lettered', 'job_requeued_from_dead_letter');
  if n <> 2 then raise exception 'FAIL DL actions not audited (%)', n; end if;

  -- 12) cancellation --------------------------------------------------------
  perform pg_temp.impersonate(c_wsadmin);
  perform app.cancel_background_job(v_job1, 'live check cancel');
  reset role;
  select status into t from public.background_jobs where id=v_job1;
  if t <> 'cancelled' then raise exception 'FAIL cancel left %', t; end if;

  -- 13) schedule occurrence uniqueness --------------------------------------
  insert into public.scheduled_report_definitions
    (organization_id, owner_id, report_type, frequency)
  values (org_id, c_wsadmin, 'quick_report', 'daily')
  returning id into v_sched;
  insert into public.scheduled_report_runs
    (definition_id, organization_id, intended_run_at, created_by)
  values (v_sched, org_id, '2099-08-01T00:00:00Z', c_wsadmin);
  begin
    insert into public.scheduled_report_runs
      (definition_id, organization_id, intended_run_at, created_by)
    values (v_sched, org_id, '2099-08-01T00:00:00Z', c_wsadmin);
    raise exception 'FAIL duplicate schedule occurrence accepted';
  exception when unique_violation then null;
  end;

  -- 14) delivery-event lifecycle guard --------------------------------------
  insert into public.email_delivery_events
    (organization_id, recipient_email, template_key, subject, idempotency_key, status)
  values (org_id, 'p8@test.local', 'scheduled_report', 'subject', 'p8-del-1', 'pending')
  returning id into v_event;
  update public.email_delivery_events set status='failed', finalized_at=now() where id=v_event;
  begin
    update public.email_delivery_events set status='pending' where id=v_event;
    raise exception 'FAIL finalized delivery reopened';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.email_delivery_events set recipient_email='other@test.local' where id=v_event;
    raise exception 'FAIL delivery recipient mutated';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.email_delivery_events
      (organization_id, recipient_email, template_key, subject, idempotency_key)
    values (org_id, 'p8@test.local', 'scheduled_report', 'subject', 'p8-del-1');
    raise exception 'FAIL duplicate delivery idempotency key accepted';
  exception when unique_violation then null;
  end;

  -- 15) job/table RLS isolation --------------------------------------------
  perform pg_temp.impersonate('00000000-0000-4000-b800-000000000003');
  select count(*) into n from public.background_jobs;
  if n <> 0 then raise exception 'FAIL outsider sees % jobs', n; end if;
  select count(*) into n from public.email_delivery_events;
  if n <> 0 then raise exception 'FAIL outsider sees % deliveries', n; end if;
  select count(*) into n from public.integration_source_records;
  if n <> 0 then raise exception 'FAIL outsider sees % source records', n; end if;
  reset role;
  perform pg_temp.impersonate(c_trainer);
  begin
    perform app.retry_background_job(v_job2);
    raise exception 'FAIL trainer retried a job';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;

  raise notice 'Phase 8 live integration/job/delivery checks passed';
end $$;

rollback;
