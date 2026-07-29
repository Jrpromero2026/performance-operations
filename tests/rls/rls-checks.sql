-- ============================================================================
-- RLS policy checks for the foundation schema.
--
-- Requires a LOCAL Supabase stack with migrations + seed applied:
--   npx supabase start
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f tests/rls/rls-checks.sql
--
-- The script creates throwaway auth users, simulates them via
-- `set local role authenticated` + request.jwt.claims, asserts policy
-- behavior, and rolls everything back. It must never run against production.
-- ============================================================================

begin;

-- --- fixtures -----------------------------------------------------------------
insert into auth.users (id, email)
values
  ('00000000-0000-4000-a000-000000000001', 'rls-admin@test.local'),
  ('00000000-0000-4000-a000-000000000002', 'rls-timberhill@test.local'),
  ('00000000-0000-4000-a000-000000000003', 'rls-outsider@test.local');

insert into public.profiles (id, email, full_name)
values
  ('00000000-0000-4000-a000-000000000001', 'rls-admin@test.local', 'RLS Platform Admin'),
  ('00000000-0000-4000-a000-000000000002', 'rls-timberhill@test.local', 'RLS Timberhill Admin'),
  ('00000000-0000-4000-a000-000000000003', 'rls-outsider@test.local', 'RLS Outsider');

-- platform admin (membership host org: Timberhill), workspace admin (Timberhill)
insert into public.organization_memberships (profile_id, organization_id, role_id)
select '00000000-0000-4000-a000-000000000001', o.id, r.id
from public.organizations o, public.roles r
where o.slug = 'timberhill-athletic-club' and r.key = 'platform_admin';

insert into public.organization_memberships (profile_id, organization_id, role_id)
select '00000000-0000-4000-a000-000000000002', o.id, r.id
from public.organizations o, public.roles r
where o.slug = 'timberhill-athletic-club' and r.key = 'workspace_admin';

-- the outsider has NO memberships at all.

-- --- helper -------------------------------------------------------------------
create or replace function pg_temp.impersonate(user_id uuid)
returns void language plpgsql as $$
begin
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', user_id, 'role', 'authenticated')::text
  );
  set local role authenticated;
end;
$$;

-- --- assertions ---------------------------------------------------------------
do $$
declare
  n int;
  g3_id uuid;
begin
  -- Capture G3's id BEFORE impersonating: the smuggling test must attempt an
  -- insert with a real foreign org id, not a subquery that RLS filters empty.
  select id into strict g3_id from public.organizations where slug = 'g3-sports-fitness';
  -- 1) Outsider (no memberships) sees NO organizations: deny by default.
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000003');
  select count(*) into n from public.organizations;
  if n <> 0 then raise exception 'FAIL outsider sees % organizations', n; end if;

  select count(*) into n from public.departments;
  if n <> 0 then raise exception 'FAIL outsider sees % departments', n; end if;

  select count(*) into n from public.audit_events;
  if n <> 0 then raise exception 'FAIL outsider sees % audit events', n; end if;

  reset role;

  -- 2) Workspace admin sees only Timberhill.
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000002');
  select count(*) into n from public.organizations;
  if n <> 1 then raise exception 'FAIL workspace admin sees % orgs (want 1)', n; end if;

  select count(*) into n
  from public.departments d
  join public.organizations o on o.id = d.organization_id
  where o.slug = 'g3-sports-fitness';
  if n <> 0 then raise exception 'FAIL workspace admin sees % G3 departments', n; end if;

  select count(*) into n from public.departments;
  if n <> 3 then raise exception 'FAIL workspace admin sees % departments (want 3)', n; end if;

  reset role;

  -- 3) Platform admin sees everything.
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000001');
  select count(*) into n from public.organizations;
  if n < 2 then raise exception 'FAIL platform admin sees % orgs (want >= 2)', n; end if;

  select count(*) into n from public.departments;
  if n < 9 then raise exception 'FAIL platform admin sees % departments (want >= 9)', n; end if;

  reset role;

  -- 4) Workspace admin cannot write another org's departments.
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000002');
  begin
    insert into public.departments (organization_id, name)
    values (g3_id, 'RLS Smuggled Department');
    raise exception 'FAIL cross-org department insert was allowed';
  exception
    when insufficient_privilege then null; -- expected
    when check_violation then null;        -- policy WITH CHECK rejection
  end;
  reset role;

  -- 5) Nobody can update or delete audit events (append-only).
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000001');
  update public.audit_events set action = 'tampered' where true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL audit events were updatable (% rows)', n; end if;

  delete from public.audit_events where true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL audit events were deletable (% rows)', n; end if;
  reset role;

  raise notice 'RLS checks passed';
end $$;

-- ---------------------------------------------------------------------------
-- Phase 2 checks: invitations, services, compensation, escalation guards,
-- published-version immutability, locked-period protection.
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
  g3_id uuid;
  th_id uuid;
  admin_role uuid;
  viewer_role uuid;
  v_plan uuid;
  v_version uuid;
begin
  select id into strict g3_id from public.organizations where slug = 'g3-sports-fitness';
  select id into strict th_id from public.organizations where slug = 'timberhill-athletic-club';
  select id into strict admin_role from public.roles where key = 'platform_admin';
  select id into strict viewer_role from public.roles where key = 'viewer';

  -- Fixture: a compensation plan + published version in Timberhill (as postgres).
  insert into public.compensation_plans (organization_id, name)
  values (th_id, 'RLS Check Plan') returning id into v_plan;
  insert into public.compensation_plan_versions
    (plan_id, organization_id, version_number, compensation_method, status)
  values (v_plan, th_id, 1, 'flat_per_session', 'published')
  returning id into v_version;

  -- 6) Outsider sees no invitations, services, or compensation plans.
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000003');
  select count(*) into n from public.invitations;
  if n <> 0 then raise exception 'FAIL outsider sees % invitations', n; end if;
  select count(*) into n from public.service_categories;
  if n <> 0 then raise exception 'FAIL outsider sees % service categories', n; end if;
  select count(*) into n from public.compensation_plans;
  if n <> 0 then raise exception 'FAIL outsider sees % compensation plans', n; end if;
  reset role;

  -- 7) Workspace admin sees only own-org service categories (11 seeded).
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000002');
  select count(*) into n from public.service_categories;
  if n <> 11 then raise exception 'FAIL workspace admin sees % categories (want 11)', n; end if;

  -- 8) Escalation guard: workspace admin cannot create a platform_admin
  --    invitation, but CAN create a viewer invitation.
  begin
    insert into public.invitations (organization_id, email, role_id, token_hash, invited_by, expires_at)
    values (th_id, 'rls-escalation@test.local', admin_role, 'rls-hash-1',
            '00000000-0000-4000-a000-000000000002', now() + interval '1 day');
    raise exception 'FAIL workspace admin minted a platform_admin invitation';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
  end;
  insert into public.invitations (organization_id, email, role_id, token_hash, invited_by, expires_at)
  values (th_id, 'rls-viewer@test.local', viewer_role, 'rls-hash-2',
          '00000000-0000-4000-a000-000000000002', now() + interval '1 day');

  -- 9) Escalation guard on memberships: workspace admin cannot insert a
  --    platform_admin membership (restrictive policy).
  begin
    insert into public.organization_memberships (profile_id, organization_id, role_id)
    values ('00000000-0000-4000-a000-000000000003', th_id, admin_role);
    raise exception 'FAIL workspace admin granted platform_admin membership';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
  end;
  reset role;

  -- 10) Published compensation versions are immutable even for platform admins.
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000001');
  begin
    update public.compensation_plan_versions
    set compensation_method = 'hourly' where id = v_version;
    raise exception 'FAIL published version substance was mutated';
  exception
    when insufficient_privilege then null; -- trigger raises 42501
  end;

  -- 11) Locked reporting periods reject edits without payroll:reopen.
  reset role;
  insert into public.reporting_periods (organization_id, label, start_date, end_date, status)
  values (th_id, 'RLS Locked Period', '2099-01-01', '2099-01-31', 'locked');
  perform pg_temp.impersonate('00000000-0000-4000-a000-000000000002');
  -- workspace admin has period:manage but NOT payroll:reopen
  begin
    update public.reporting_periods set label = 'tampered'
    where label = 'RLS Locked Period';
    -- if no exception, ensure zero rows changed (RLS may filter silently)
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL locked period was edited without reopen permission'; end if;
  exception
    when insufficient_privilege then null; -- trigger raises 42501
  end;
  reset role;

  raise notice 'Phase 2 RLS checks passed';
end $$;

rollback;
