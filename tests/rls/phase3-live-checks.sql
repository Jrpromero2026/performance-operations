-- ============================================================================
-- Phase 3 live checks: batch state machine, transactional posting/reversal,
-- immutability, cross-organization denial, trainer self-scope.
-- Requires migrations + seed. Creates throwaway fixtures, impersonates users
-- via request.jwt.claims, and ROLLS BACK — never run against production.
-- Executed against performance-operations-dev on 2026-07-30: ALL PASSED.
-- ============================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000001', 'rls-admin@test.local'),
  ('00000000-0000-4000-a000-000000000002', 'rls-timberhill@test.local'),
  ('00000000-0000-4000-a000-000000000003', 'rls-outsider@test.local'),
  ('00000000-0000-4000-a000-000000000004', 'rls-trainer@test.local');
insert into public.profiles (id, email, full_name) values
  ('00000000-0000-4000-a000-000000000001', 'rls-admin@test.local', 'RLS Admin'),
  ('00000000-0000-4000-a000-000000000002', 'rls-timberhill@test.local', 'RLS WS Admin'),
  ('00000000-0000-4000-a000-000000000003', 'rls-outsider@test.local', 'RLS Outsider'),
  ('00000000-0000-4000-a000-000000000004', 'rls-trainer@test.local', 'RLS Trainer');
insert into public.organization_memberships (profile_id, organization_id, role_id)
select u.uid, o.id, r.id from (values
  ('00000000-0000-4000-a000-000000000001'::uuid, 'platform_admin'),
  ('00000000-0000-4000-a000-000000000002'::uuid, 'workspace_admin'),
  ('00000000-0000-4000-a000-000000000004'::uuid, 'trainer')
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
  v_batch1 uuid;
  v_batch2 uuid;
  v_batch3 uuid;
  n int;
  result jsonb;
begin
  select id into strict th_id from public.organizations where slug = 'timberhill-athletic-club';

  insert into public.trainers (display_name, first_name, last_name, profile_id)
  values ('RLS Fixture Trainer', 'RLS', 'Trainer', '00000000-0000-4000-a000-000000000004')
  returning id into v_trainer;
  insert into public.trainer_organization_assignments (trainer_id, organization_id, title)
  values (v_trainer, th_id, 'Trainer');
  insert into public.service_categories (organization_id, name) values (th_id, 'RLS Cat')
  returning id into v_category;
  insert into public.services (organization_id, category_id, internal_name, display_name)
  values (th_id, v_category, 'rls-svc', 'RLS Service') returning id into v_service;
  insert into public.clients (display_name, email) values ('RLS Client', 'rlsclient@test.local')
  returning id into v_client;
  insert into public.client_organization_assignments (client_id, organization_id)
  values (v_client, th_id);

  insert into public.import_batches (organization_id, source, original_filename, storage_path,
    file_hash, file_size, mime_type, uploaded_by)
  values (th_id, 'setmore', 'rls-test.csv', 'x/rls-test.csv', 'hash-rls-1', 100, 'text/csv',
    '00000000-0000-4000-a000-000000000002')
  returning id into v_batch1;
  update public.import_batches set status='parsing' where id=v_batch1;
  update public.import_batches set status='validating' where id=v_batch1;
  update public.import_batches set status='ready_for_approval' where id=v_batch1;
  update public.import_batches set status='approved',
    approved_by='00000000-0000-4000-a000-000000000002', approved_at=now() where id=v_batch1;

  insert into public.import_rows (import_batch_id, organization_id, source_row_number,
    original_row, normalized_row, row_hash, processing_status, duplicate_class,
    appointment_date, start_at, end_at, duration_minutes, canonical_status,
    external_appointment_id, listed_price_cents, matched_trainer_id, matched_service_id, matched_client_id)
  values
    (v_batch1, th_id, 1, '{"a":"1"}', '{}', 'rh1', 'ready', 'new',
     '2099-01-01', '2099-01-01T17:00:00Z', '2099-01-01T18:00:00Z', 60, 'scheduled',
     'RLSBK1', 6400, v_trainer, v_service, v_client),
    (v_batch1, th_id, 2, '{"a":"2"}', '{}', 'rh2', 'ready', 'new',
     '2099-01-02', '2099-01-02T17:00:00Z', '2099-01-02T18:00:00Z', 60, 'scheduled',
     'RLSBK1', 6400, v_trainer, v_service, v_client);

  -- 1) invalid transition blocked at DB level
  insert into public.import_batches (organization_id, source, original_filename, storage_path,
    file_hash, file_size, mime_type)
  values (th_id, 'setmore', 'rls-bad.csv', 'x/rls-bad.csv', 'hash-rls-2', 100, 'text/csv')
  returning id into v_batch3;
  begin
    update public.import_batches set status='posted' where id=v_batch3;
    raise exception 'FAIL uploaded->posted transition allowed';
  exception when insufficient_privilege then null;
  end;

  -- 2) cross-org denial
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000003');
  select count(*) into n from public.import_batches;
  if n <> 0 then raise exception 'FAIL outsider sees % batches', n; end if;
  select count(*) into n from public.import_rows;
  if n <> 0 then raise exception 'FAIL outsider sees % rows', n; end if;
  reset role;

  -- 3) unauthorized posting rejected
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000003');
  begin
    perform app.post_import_batch(v_batch1);
    raise exception 'FAIL outsider posted a batch';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 4) transactional posting
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000002');
  select app.post_import_batch(v_batch1) into result;
  if (result->>'posted_count')::int <> 2 then
    raise exception 'FAIL posted_count = %', result->>'posted_count';
  end if;
  reset role;
  select count(*) into n from public.appointments where import_batch_id = v_batch1;
  if n <> 2 then raise exception 'FAIL % appointments posted', n; end if;
  select count(*) into n from public.appointment_source_links where import_batch_id = v_batch1;
  if n <> 2 then raise exception 'FAIL % source links', n; end if;
  select count(*) into n from public.appointment_status_history h
    join public.appointments a on a.id = h.appointment_id where a.import_batch_id = v_batch1;
  if n <> 2 then raise exception 'FAIL % status history rows', n; end if;
  select count(*) into n from public.appointment_participants p
    join public.appointments a on a.id = p.appointment_id where a.import_batch_id = v_batch1;
  if n <> 2 then raise exception 'FAIL % participants', n; end if;
  select count(*) into n from public.import_rows
    where import_batch_id = v_batch1 and processing_status = 'posted';
  if n <> 2 then raise exception 'FAIL % rows marked posted', n; end if;

  -- 5) double posting blocked
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000002');
  begin
    perform app.post_import_batch(v_batch1);
    raise exception 'FAIL double post allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;

  -- 6) immutability
  begin
    update public.import_rows set original_row = '{"tampered":true}'
    where import_batch_id = v_batch1 and source_row_number = 1;
    raise exception 'FAIL original row mutated';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.appointments set source_listed_price_cents = 1
    where import_batch_id = v_batch1 and source_listed_price_cents = 6400
      and appointment_date = '2099-01-01';
    raise exception 'FAIL appointment source evidence mutated';
  exception when insufficient_privilege then null;
  end;

  -- 7) trainer self-scope
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000004');
  select count(*) into n from public.appointments;
  if n <> 2 then raise exception 'FAIL trainer self-scope sees % (want 2)', n; end if;
  reset role;
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000003');
  select count(*) into n from public.appointments;
  if n <> 0 then raise exception 'FAIL outsider sees % appointments', n; end if;
  reset role;

  -- 8) blocking-issue batch cannot post; zero partial rows
  insert into public.import_batches (organization_id, source, original_filename, storage_path,
    file_hash, file_size, mime_type)
  values (th_id, 'setmore', 'rls-blocked.csv', 'x/rls-blocked.csv', 'hash-rls-3', 100, 'text/csv')
  returning id into v_batch2;
  update public.import_batches set status='parsing' where id=v_batch2;
  update public.import_batches set status='validating' where id=v_batch2;
  update public.import_batches set status='ready_for_approval' where id=v_batch2;
  update public.import_batches set status='approved' where id=v_batch2;
  insert into public.import_rows (import_batch_id, organization_id, source_row_number,
    original_row, row_hash, processing_status, duplicate_class,
    appointment_date, start_at, end_at, duration_minutes, canonical_status,
    matched_trainer_id, matched_service_id)
  values (v_batch2, th_id, 1, '{"b":"1"}', 'rh3', 'ready', 'new',
    '2099-02-01', '2099-02-01T17:00:00Z', '2099-02-01T18:00:00Z', 60, 'scheduled',
    v_trainer, v_service);
  insert into public.import_row_issues (import_row_id, import_batch_id, organization_id,
    code, severity, message)
  select r.id, v_batch2, th_id, 'unmatched_service', 'blocking', 'test blocker'
  from public.import_rows r where r.import_batch_id = v_batch2;

  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000002');
  begin
    perform app.post_import_batch(v_batch2);
    raise exception 'FAIL posted with blocking issues';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  select count(*) into n from public.appointments where import_batch_id = v_batch2;
  if n <> 0 then raise exception 'FAIL partial posting: % rows', n; end if;

  -- 9) reversal preserves history; double reversal blocked; audited
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000002');
  select app.reverse_import_batch(v_batch1, 'live verification reversal') into result;
  if (result->>'reversed_count')::int <> 2 then
    raise exception 'FAIL reversed_count = %', result->>'reversed_count';
  end if;
  begin
    perform app.reverse_import_batch(v_batch1, 'second attempt');
    raise exception 'FAIL double reversal allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  select count(*) into n from public.appointments
    where import_batch_id = v_batch1 and record_state = 'reversed';
  if n <> 2 then raise exception 'FAIL % reversed appointments', n; end if;
  select count(*) into n from public.appointments where import_batch_id = v_batch1;
  if n <> 2 then raise exception 'FAIL reversal deleted appointments'; end if;
  select count(*) into n from public.import_rows where import_batch_id = v_batch1;
  if n <> 2 then raise exception 'FAIL reversal deleted rows'; end if;
  select count(*) into n from public.audit_events
    where entity_id = v_batch1 and action in ('import_batch_posted', 'import_batch_reversed');
  if n <> 2 then raise exception 'FAIL audit events missing (%)', n; end if;

  raise notice 'Phase 3 live posting/reversal/RLS checks passed';
end $$;

rollback;
