-- ============================================================================
-- Phase G live checks
--
-- Two subjects, both security-critical, both previously unverifiable:
--
--   A. TRAINER ↔ CLIENT SCOPE (closes Phase F finding P1-1). Proves against
--      REAL rows that a trainer sees exactly the clients they have active
--      appointments with — and that Trainer A cannot see Trainer B's
--      clients, cannot see clients from a reversed appointment, and cannot
--      cross an organization boundary.
--
--   B. ORGANIZATIONAL SNAPSHOTS. Proves the permission gate, the tenant
--      boundary, and — most importantly — that recorded history is
--      IMMUTABLE: figures cannot be edited, snapshots cannot be deleted,
--      and a correction can only be made by recording a new snapshot.
--
-- Runs in ISOLATED throwaway organizations, impersonates users via
-- request.jwt.claims, and ROLLS BACK. Never run against production.
--
-- Executed against the hosted pilot project (uavwqtbnkirvfvdilcwy) on
-- 2026-08-15: ALL 18 ASSERTIONS PASSED (A1–A8, B1–B10). A negative control
-- was run in the same session to confirm a failing assertion does surface
-- as an error rather than passing silently.
-- ============================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-b900-000000000001', 'pg-admin@test.local'),
  ('00000000-0000-4000-b900-000000000002', 'pg-wsadmin@test.local'),
  ('00000000-0000-4000-b900-000000000003', 'pg-trainer-a@test.local'),
  ('00000000-0000-4000-b900-000000000004', 'pg-trainer-b@test.local'),
  ('00000000-0000-4000-b900-000000000005', 'pg-outsider@test.local'),
  ('00000000-0000-4000-b900-000000000006', 'pg-deptmgr@test.local');
insert into public.profiles (id, email, full_name) values
  ('00000000-0000-4000-b900-000000000001', 'pg-admin@test.local', 'PG Admin'),
  ('00000000-0000-4000-b900-000000000002', 'pg-wsadmin@test.local', 'PG WS Admin'),
  ('00000000-0000-4000-b900-000000000003', 'pg-trainer-a@test.local', 'PG Trainer A'),
  ('00000000-0000-4000-b900-000000000004', 'pg-trainer-b@test.local', 'PG Trainer B'),
  ('00000000-0000-4000-b900-000000000005', 'pg-outsider@test.local', 'PG Outsider'),
  ('00000000-0000-4000-b900-000000000006', 'pg-deptmgr@test.local', 'PG Dept Mgr');

insert into public.organizations (slug, name) values
  ('pg-scope-test', 'PG Scope Test Org'),
  ('pg-other-test', 'PG Other Org');

insert into public.organization_memberships (profile_id, organization_id, role_id)
select u.uid, o.id, r.id from (values
  ('00000000-0000-4000-b900-000000000001'::uuid, 'platform_admin'),
  ('00000000-0000-4000-b900-000000000002'::uuid, 'workspace_admin'),
  ('00000000-0000-4000-b900-000000000003'::uuid, 'trainer'),
  ('00000000-0000-4000-b900-000000000004'::uuid, 'trainer'),
  ('00000000-0000-4000-b900-000000000006'::uuid, 'department_manager')
) as u(uid, role_key)
join public.roles r on r.key = u.role_key
join public.organizations o on o.slug = 'pg-scope-test';

-- The outsider is a full workspace admin — in a DIFFERENT organization.
-- This is the sharpest cross-tenant test: high privilege, wrong tenant.
insert into public.organization_memberships (profile_id, organization_id, role_id)
select '00000000-0000-4000-b900-000000000005'::uuid, o.id, r.id
from public.roles r, public.organizations o
where r.key = 'workspace_admin' and o.slug = 'pg-other-test';

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
  org_id     uuid;
  other_org  uuid;
  c_admin    constant uuid := '00000000-0000-4000-b900-000000000001';
  c_wsadmin  constant uuid := '00000000-0000-4000-b900-000000000002';
  c_trainerA constant uuid := '00000000-0000-4000-b900-000000000003';
  c_trainerB constant uuid := '00000000-0000-4000-b900-000000000004';
  c_outsider constant uuid := '00000000-0000-4000-b900-000000000005';
  c_deptmgr  constant uuid := '00000000-0000-4000-b900-000000000006';
  v_trainerA uuid;
  v_trainerB uuid;
  v_category uuid;
  v_service  uuid;
  v_clientA  uuid;  -- Trainer A's client
  v_clientB  uuid;  -- Trainer B's client
  v_clientR  uuid;  -- client whose only appointment is reversed
  v_clientP  uuid;  -- client linked only via a participant row
  v_batch    uuid;
  v_apptR    uuid;
  v_snap1    uuid;
  v_snap2    uuid;
  n          int;
  t          text;
begin
  select id into org_id from public.organizations where slug = 'pg-scope-test';
  select id into other_org from public.organizations where slug = 'pg-other-test';

  -- ---------------------------------------------------------------- fixtures
  insert into public.trainers (display_name, first_name, last_name, profile_id)
  values ('PG Trainer A', 'PG', 'TrainerA', c_trainerA) returning id into v_trainerA;
  insert into public.trainers (display_name, first_name, last_name, profile_id)
  values ('PG Trainer B', 'PG', 'TrainerB', c_trainerB) returning id into v_trainerB;
  insert into public.trainer_organization_assignments (trainer_id, organization_id, title)
  values (v_trainerA, org_id, 'Trainer'), (v_trainerB, org_id, 'Trainer');

  insert into public.service_categories (organization_id, name) values (org_id, 'PG Cat')
  returning id into v_category;
  insert into public.services (organization_id, category_id, internal_name, display_name)
  values (org_id, v_category, 'pg-svc', 'PG Service') returning id into v_service;

  insert into public.clients (display_name, email) values ('PG Client A', 'pg-a@test.local')
  returning id into v_clientA;
  insert into public.clients (display_name, email) values ('PG Client B', 'pg-b@test.local')
  returning id into v_clientB;
  insert into public.clients (display_name, email) values ('PG Client R', 'pg-r@test.local')
  returning id into v_clientR;
  insert into public.clients (display_name, email) values ('PG Client P', 'pg-p@test.local')
  returning id into v_clientP;
  insert into public.client_organization_assignments (client_id, organization_id)
  values (v_clientA, org_id), (v_clientB, org_id), (v_clientR, org_id), (v_clientP, org_id);

  insert into public.import_batches (organization_id, source, original_filename, storage_path,
    file_hash, file_size, mime_type, uploaded_by)
  values (org_id, 'setmore', 'pg-test.csv', 'x/pg-test.csv', 'hash-pg-1', 100, 'text/csv', c_wsadmin)
  returning id into v_batch;
  update public.import_batches set status='parsing' where id=v_batch;
  update public.import_batches set status='validating' where id=v_batch;
  update public.import_batches set status='ready_for_approval' where id=v_batch;
  update public.import_batches set status='approved', approved_by=c_wsadmin, approved_at=now()
  where id=v_batch;

  -- Row 1 → Trainer A + Client A.  Row 2 → Trainer B + Client B.
  -- Row 3 → Trainer A + Client R, later REVERSED.
  insert into public.import_rows (import_batch_id, organization_id, source_row_number,
    original_row, normalized_row, row_hash, processing_status, duplicate_class,
    appointment_date, start_at, end_at, duration_minutes, canonical_status,
    external_appointment_id, listed_price_cents, matched_trainer_id, matched_service_id, matched_client_id)
  values
    (v_batch, org_id, 1, '{"a":"1"}', '{}', 'pgh1', 'ready', 'new',
     '2097-06-01', '2097-06-01T17:00:00Z', '2097-06-01T18:00:00Z', 60, 'completed',
     'PGBK1', 6400, v_trainerA, v_service, v_clientA),
    (v_batch, org_id, 2, '{"a":"2"}', '{}', 'pgh2', 'ready', 'new',
     '2097-06-02', '2097-06-02T17:00:00Z', '2097-06-02T18:00:00Z', 60, 'completed',
     'PGBK2', 6400, v_trainerB, v_service, v_clientB),
    (v_batch, org_id, 3, '{"a":"3"}', '{}', 'pgh3', 'ready', 'new',
     '2097-06-03', '2097-06-03T17:00:00Z', '2097-06-03T18:00:00Z', 60, 'completed',
     'PGBK3', 6400, v_trainerA, v_service, v_clientR);

  perform pg_temp.impersonate(c_wsadmin);
  perform app.post_import_batch(v_batch);
  reset role;

  -- Client P is a PARTICIPANT on Trainer A's first appointment only.
  insert into public.appointment_participants (appointment_id, organization_id, client_id)
  select a.id, org_id, v_clientP from public.appointments a
  where a.import_batch_id = v_batch and a.appointment_date = '2097-06-01';

  -- Reverse Trainer A's third appointment: access must follow the LIVE ledger.
  select id into strict v_apptR from public.appointments
  where import_batch_id = v_batch and appointment_date = '2097-06-03';
  update public.appointments set record_state = 'reversed' where id = v_apptR;

  -- ===================================================================
  -- A. TRAINER ↔ CLIENT SCOPE
  -- ===================================================================

  -- A1: the derivation itself, evaluated AS Trainer A.
  perform pg_temp.impersonate(c_trainerA);
  select count(*) into n from app.trainer_client_ids();
  if n <> 2 then
    raise exception 'FAIL A1 trainer A derived % clients, expected 2 (own client + participant)', n;
  end if;
  select count(*) into n from app.trainer_client_ids() where client_id = v_clientA;
  if n <> 1 then raise exception 'FAIL A1 trainer A cannot derive own client'; end if;
  select count(*) into n from app.trainer_client_ids() where client_id = v_clientP;
  if n <> 1 then raise exception 'FAIL A1 participant client not derived'; end if;
  select count(*) into n from app.trainer_client_ids() where client_id = v_clientB;
  if n <> 0 then raise exception 'FAIL A1 trainer A derived trainer B''s client'; end if;
  select count(*) into n from app.trainer_client_ids() where client_id = v_clientR;
  if n <> 0 then raise exception 'FAIL A1 reversed appointment still grants scope'; end if;
  reset role;

  -- A2: RLS on public.clients — the control that actually protects data.
  perform pg_temp.impersonate(c_trainerA);
  select count(*) into n from public.clients where id = v_clientA;
  if n <> 1 then raise exception 'FAIL A2 trainer A cannot read own client'; end if;
  select count(*) into n from public.clients where id = v_clientP;
  if n <> 1 then raise exception 'FAIL A2 trainer A cannot read participant client'; end if;
  select count(*) into n from public.clients where id = v_clientB;
  if n <> 0 then raise exception 'FAIL A2 TRAINER A CAN READ TRAINER B''S CLIENT'; end if;
  select count(*) into n from public.clients where id = v_clientR;
  if n <> 0 then raise exception 'FAIL A2 reversed-appointment client readable'; end if;
  -- and an unqualified list leaks nothing either
  select count(*) into n from public.clients;
  if n <> 2 then raise exception 'FAIL A2 trainer A sees % clients in total, expected 2', n; end if;
  reset role;

  -- A3: the mirror image, as Trainer B.
  perform pg_temp.impersonate(c_trainerB);
  select count(*) into n from public.clients where id = v_clientB;
  if n <> 1 then raise exception 'FAIL A3 trainer B cannot read own client'; end if;
  select count(*) into n from public.clients where id = v_clientA;
  if n <> 0 then raise exception 'FAIL A3 TRAINER B CAN READ TRAINER A''S CLIENT'; end if;
  select count(*) into n from public.clients where id = v_clientP;
  if n <> 0 then raise exception 'FAIL A3 trainer B can read a participant of A''s session'; end if;
  select count(*) into n from public.clients;
  if n <> 1 then raise exception 'FAIL A3 trainer B sees % clients, expected 1', n; end if;
  reset role;

  -- A4: cross-organization. A privileged admin in ANOTHER org sees nothing.
  perform pg_temp.impersonate(c_outsider);
  select count(*) into n from public.clients
  where id in (v_clientA, v_clientB, v_clientR, v_clientP);
  if n <> 0 then raise exception 'FAIL A4 outsider read % clients across the tenant line', n; end if;
  select count(*) into n from app.trainer_client_ids();
  if n <> 0 then raise exception 'FAIL A4 outsider derived a trainer scope'; end if;
  reset role;

  -- A5: self-scope NARROWS, it never widens. A workspace admin holding
  -- client:read still sees every client in the organization.
  perform pg_temp.impersonate(c_wsadmin);
  select count(*) into n from public.clients
  where id in (v_clientA, v_clientB, v_clientR, v_clientP);
  if n <> 4 then raise exception 'FAIL A5 workspace admin lost client access (% of 4)', n; end if;
  reset role;

  -- A6: assignment rows carry the same narrowed visibility.
  perform pg_temp.impersonate(c_trainerA);
  select count(*) into n from public.client_organization_assignments
  where client_id = v_clientB;
  if n <> 0 then raise exception 'FAIL A6 trainer A read another trainer''s client assignment'; end if;
  select count(*) into n from public.client_organization_assignments
  where client_id = v_clientA;
  if n <> 1 then raise exception 'FAIL A6 trainer A cannot read own client assignment'; end if;
  reset role;

  -- A7: source identifiers stay behind full client:read.
  insert into public.client_source_identifiers (client_id, organization_id, source, external_id)
  values (v_clientA, org_id, 'setmore', 'PGCUST1');
  perform pg_temp.impersonate(c_trainerA);
  select count(*) into n from public.client_source_identifiers where client_id = v_clientA;
  if n <> 0 then raise exception 'FAIL A7 trainer read vendor client identifiers'; end if;
  reset role;

  -- A8: a user with NO trainer row derives nothing (fails closed).
  perform pg_temp.impersonate(c_deptmgr);
  select count(*) into n from app.trainer_client_ids();
  if n <> 0 then raise exception 'FAIL A8 non-trainer derived a trainer scope'; end if;
  reset role;

  -- ===================================================================
  -- B. ORGANIZATIONAL SNAPSHOTS
  -- ===================================================================

  -- B1: a trainer cannot record club figures.
  perform pg_temp.impersonate(c_trainerA);
  begin
    insert into public.organizational_snapshots
      (organization_id, source_key, period_start, period_end, as_of_date, entered_by)
    values (org_id, 'gym_management_solutions', '2097-06-01', '2097-06-30', '2097-06-30', c_trainerA);
    raise exception 'FAIL B1 trainer recorded an organizational snapshot';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- B2: an authorized user records one, with values.
  perform pg_temp.impersonate(c_wsadmin);
  insert into public.organizational_snapshots
    (organization_id, source_key, period_start, period_end, as_of_date, entered_by, note)
  values (org_id, 'gym_management_solutions', '2097-06-01', '2097-06-30', '2097-06-30',
          c_wsadmin, 'June reading')
  returning id into v_snap1;
  insert into public.organizational_snapshot_values
    (snapshot_id, organization_id, metric_key, value)
  values (v_snap1, org_id, 'club_active_members', 5000),
         (v_snap1, org_id, 'club_pt_eligible_members', 4200);
  reset role;

  -- B3: entered_by cannot be forged.
  perform pg_temp.impersonate(c_wsadmin);
  begin
    insert into public.organizational_snapshots
      (organization_id, source_key, period_start, period_end, as_of_date, entered_by)
    values (org_id, 'gym_management_solutions', '2097-07-01', '2097-07-31', '2097-07-31', c_admin);
    raise exception 'FAIL B3 snapshot attributed to another user';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- B4: THE CENTRAL RULE — recorded figures are immutable.
  begin
    update public.organizational_snapshot_values set value = 9999
    where snapshot_id = v_snap1 and metric_key = 'club_active_members';
    raise exception 'FAIL B4 A RECORDED SNAPSHOT VALUE WAS OVERWRITTEN';
  exception when check_violation then null;
  end;
  begin
    delete from public.organizational_snapshot_values where snapshot_id = v_snap1;
    raise exception 'FAIL B4 snapshot values were deleted';
  exception when check_violation then null;
  end;
  begin
    update public.organizational_snapshots set as_of_date = '2097-07-15' where id = v_snap1;
    raise exception 'FAIL B4 snapshot provenance was rewritten';
  exception when check_violation then null;
  end;
  begin
    delete from public.organizational_snapshots where id = v_snap1;
    raise exception 'FAIL B4 snapshot history was deleted';
  exception when check_violation then null;
  end;
  select value into n from public.organizational_snapshot_values
  where snapshot_id = v_snap1 and metric_key = 'club_active_members';
  if n <> 5000 then raise exception 'FAIL B4 original value changed to %', n; end if;

  -- B5: corrections happen by SUPERSEDING, and both readings survive.
  perform pg_temp.impersonate(c_wsadmin);
  insert into public.organizational_snapshots
    (organization_id, source_key, period_start, period_end, as_of_date, entered_by, note)
  values (org_id, 'gym_management_solutions', '2097-06-01', '2097-06-30', '2097-06-30',
          c_wsadmin, 'June corrected')
  returning id into v_snap2;
  insert into public.organizational_snapshot_values
    (snapshot_id, organization_id, metric_key, value)
  values (v_snap2, org_id, 'club_active_members', 5100);
  perform public.supersede_organizational_snapshot(v_snap1, v_snap2);
  reset role;

  select status into t from public.organizational_snapshots where id = v_snap1;
  if t <> 'superseded' then raise exception 'FAIL B5 old snapshot status is %', t; end if;
  select count(*) into n from public.organizational_snapshots
  where id = v_snap1 and superseded_by_id = v_snap2;
  if n <> 1 then raise exception 'FAIL B5 supersession not linked'; end if;
  -- The superseded reading is still readable — that IS the history.
  select value into n from public.organizational_snapshot_values
  where snapshot_id = v_snap1 and metric_key = 'club_active_members';
  if n <> 5000 then raise exception 'FAIL B5 superseded reading lost, got %', n; end if;

  -- B6: a superseded snapshot is frozen for good.
  begin
    update public.organizational_snapshots set status = 'voided', void_reason = 'nope'
    where id = v_snap1;
    raise exception 'FAIL B6 superseded snapshot changed again';
  exception when check_violation then null;
  end;

  -- B7: cross-organization denial.
  perform pg_temp.impersonate(c_outsider);
  select count(*) into n from public.organizational_snapshots where organization_id = org_id;
  if n <> 0 then raise exception 'FAIL B7 outsider read % snapshots', n; end if;
  select count(*) into n from public.organizational_snapshot_values where organization_id = org_id;
  if n <> 0 then raise exception 'FAIL B7 outsider read snapshot values'; end if;
  begin
    insert into public.organizational_snapshots
      (organization_id, source_key, period_start, period_end, as_of_date, entered_by)
    values (org_id, 'gym_management_solutions', '2097-08-01', '2097-08-31', '2097-08-31', c_outsider);
    raise exception 'FAIL B7 outsider wrote into another organization';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- B8: a trainer cannot read club figures at all (no self-scope escape).
  perform pg_temp.impersonate(c_trainerA);
  select count(*) into n from public.organizational_snapshots where organization_id = org_id;
  if n <> 0 then raise exception 'FAIL B8 trainer read % club snapshots', n; end if;
  reset role;

  -- B9: a department manager may READ but not ENTER.
  perform pg_temp.impersonate(c_deptmgr);
  select count(*) into n from public.organizational_snapshots where organization_id = org_id;
  if n <> 2 then raise exception 'FAIL B9 department manager read % snapshots, expected 2', n; end if;
  begin
    insert into public.organizational_snapshots
      (organization_id, source_key, period_start, period_end, as_of_date, entered_by)
    values (org_id, 'gym_management_solutions', '2097-09-01', '2097-09-30', '2097-09-30', c_deptmgr);
    raise exception 'FAIL B9 department manager recorded a snapshot';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- B10: the supersede RPC re-checks permission rather than trusting the caller.
  perform pg_temp.impersonate(c_deptmgr);
  begin
    perform public.supersede_organizational_snapshot(v_snap2, v_snap2);
    raise exception 'FAIL B10 unauthorized supersede succeeded';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise notice 'PHASE G LIVE CHECKS: ALL PASSED';
end;
$$;

rollback;
