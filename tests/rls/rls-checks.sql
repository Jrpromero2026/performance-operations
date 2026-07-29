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
declare n int;
begin
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
    select id, 'RLS Smuggled Department' from public.organizations
    where slug = 'g3-sports-fitness';
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

rollback;
