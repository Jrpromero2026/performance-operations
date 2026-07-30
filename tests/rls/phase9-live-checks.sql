-- ============================================================================
-- Phase 9 live checks: analytics domain RLS + lifecycle governance.
--   * performance_goals: scope-narrowed visibility (org / department /
--     trainer-self), creation discipline (no org goals from
--     department-scoped or trainer roles), approval + completion
--     permissions, completed-goal immutability, append-only event trail
--   * performance_benchmarks: creation/approval permissions, frozen
--     approved content, deprecation path
--   * analytics_dashboards: owner-only writes, sharing permission gates,
--     shared visibility rules, defaults governance
--   * cross-organization denial throughout
-- Isolated throwaway organization; impersonates users via
-- request.jwt.claims; ROLLS BACK — never run against production.
-- Executed against performance-operations-dev on 2026-07-30: ALL PASSED.
-- ============================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-b900-000000000001', 'p9-wsadmin@test.local'),
  ('00000000-0000-4000-b900-000000000002', 'p9-deptmgr@test.local'),
  ('00000000-0000-4000-b900-000000000003', 'p9-trainer@test.local'),
  ('00000000-0000-4000-b900-000000000004', 'p9-outsider@test.local'),
  ('00000000-0000-4000-b900-000000000005', 'p9-trainer2@test.local');
insert into public.profiles (id, email, full_name) values
  ('00000000-0000-4000-b900-000000000001', 'p9-wsadmin@test.local', 'P9 WS Admin'),
  ('00000000-0000-4000-b900-000000000002', 'p9-deptmgr@test.local', 'P9 Dept Mgr'),
  ('00000000-0000-4000-b900-000000000003', 'p9-trainer@test.local', 'P9 Trainer'),
  ('00000000-0000-4000-b900-000000000004', 'p9-outsider@test.local', 'P9 Outsider'),
  ('00000000-0000-4000-b900-000000000005', 'p9-trainer2@test.local', 'P9 Trainer Two');
insert into public.organizations (slug, name) values
  ('p9-analytics-test', 'P9 Analytics Test Org'),
  ('p9-other-org', 'P9 Other Org');
insert into public.organization_memberships (profile_id, organization_id, role_id)
select u.uid, o.id, r.id from (values
  ('00000000-0000-4000-b900-000000000001'::uuid, 'workspace_admin', 'p9-analytics-test'),
  ('00000000-0000-4000-b900-000000000002'::uuid, 'department_manager', 'p9-analytics-test'),
  ('00000000-0000-4000-b900-000000000003'::uuid, 'trainer', 'p9-analytics-test'),
  ('00000000-0000-4000-b900-000000000005'::uuid, 'trainer', 'p9-analytics-test'),
  ('00000000-0000-4000-b900-000000000004'::uuid, 'workspace_admin', 'p9-other-org')
) as u(uid, role_key, org_slug)
join public.roles r on r.key = u.role_key
join public.organizations o on o.slug = u.org_slug;

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
  other_org_id uuid;
  dept_a uuid;
  dept_b uuid;
  trainer1 uuid;
  trainer2 uuid;
  c_wsadmin constant uuid := '00000000-0000-4000-b900-000000000001';
  c_deptmgr constant uuid := '00000000-0000-4000-b900-000000000002';
  c_trainer constant uuid := '00000000-0000-4000-b900-000000000003';
  c_outsider constant uuid := '00000000-0000-4000-b900-000000000004';
  v_org_goal uuid;
  v_dept_goal uuid;
  v_deptb_goal uuid;
  v_trainer_goal uuid;
  v_bench uuid;
  v_dash uuid;
  v_widget uuid;
  n int;
begin
  select id into strict org_id from public.organizations where slug = 'p9-analytics-test';
  select id into strict other_org_id from public.organizations where slug = 'p9-other-org';
  insert into public.departments (organization_id, name) values (org_id, 'P9 Dept A') returning id into dept_a;
  insert into public.departments (organization_id, name) values (org_id, 'P9 Dept B') returning id into dept_b;
  insert into public.department_memberships (profile_id, department_id, organization_id)
  values (c_deptmgr, dept_a, org_id);
  insert into public.trainers (display_name, profile_id) values ('P9 Trainer', c_trainer) returning id into trainer1;
  insert into public.trainers (display_name, profile_id)
  values ('P9 Trainer Two', '00000000-0000-4000-b900-000000000005') returning id into trainer2;

  -- ==================================================================
  -- GOALS
  -- ==================================================================

  -- wsadmin creates org + department + trainer goals
  perform pg_temp.impersonate(c_wsadmin);
  insert into public.performance_goals
    (organization_id, name, metric_id, metric_version, metric_unit, scope_level,
     goal_type, target_value, start_date, end_date, created_by)
  values (org_id, 'Org sessions', 'appointments_completed', 'intel-v1', 'count',
          'organization', 'minimum', 100, '2026-01-01', '2026-12-31', c_wsadmin)
  returning id into v_org_goal;
  insert into public.performance_goals
    (organization_id, name, metric_id, metric_version, metric_unit, scope_level,
     department_id, goal_type, target_value, start_date, end_date, created_by)
  values (org_id, 'Dept A sessions', 'appointments_completed', 'intel-v1', 'count',
          'department', dept_a, 'minimum', 50, '2026-01-01', '2026-12-31', c_wsadmin)
  returning id into v_dept_goal;
  insert into public.performance_goals
    (organization_id, name, metric_id, metric_version, metric_unit, scope_level,
     department_id, goal_type, target_value, start_date, end_date, created_by)
  values (org_id, 'Dept B sessions', 'appointments_completed', 'intel-v1', 'count',
          'department', dept_b, 'minimum', 40, '2026-01-01', '2026-12-31', c_wsadmin)
  returning id into v_deptb_goal;
  insert into public.performance_goals
    (organization_id, name, metric_id, metric_version, metric_unit, scope_level,
     trainer_id, goal_type, target_value, start_date, end_date, created_by)
  values (org_id, 'Trainer 1 sessions', 'appointments_completed', 'intel-v1', 'count',
          'trainer', trainer1, 'minimum', 20, '2026-01-01', '2026-12-31', c_wsadmin)
  returning id into v_trainer_goal;
  select count(*) into n from public.performance_goals where organization_id = org_id;
  if n <> 4 then raise exception 'FAIL wsadmin sees % goals, expected 4', n; end if;
  reset role;

  -- outsider (other org's admin): cross-org denial
  perform pg_temp.impersonate(c_outsider);
  select count(*) into n from public.performance_goals where organization_id = org_id;
  if n <> 0 then raise exception 'FAIL outsider sees % goals', n; end if;
  reset role;

  -- department manager: only their department's goals (no org goal, no dept B)
  perform pg_temp.impersonate(c_deptmgr);
  select count(*) into n from public.performance_goals where organization_id = org_id;
  if n <> 1 then raise exception 'FAIL dept mgr sees % goals, expected 1 (dept A only)', n; end if;
  -- cannot create an organization goal
  begin
    insert into public.performance_goals
      (organization_id, name, metric_id, metric_version, metric_unit, scope_level,
       goal_type, target_value, start_date, end_date, created_by)
    values (org_id, 'illegal org goal', 'appointments_completed', 'intel-v1', 'count',
            'organization', 'minimum', 1, '2026-01-01', '2026-12-31', c_deptmgr);
    raise exception 'FAIL dept mgr created an organization goal';
  exception when insufficient_privilege then null;
  end;
  -- cannot create a goal in a department they do not manage
  begin
    insert into public.performance_goals
      (organization_id, name, metric_id, metric_version, metric_unit, scope_level,
       department_id, goal_type, target_value, start_date, end_date, created_by)
    values (org_id, 'illegal dept B goal', 'appointments_completed', 'intel-v1', 'count',
            'department', dept_b, 'minimum', 1, '2026-01-01', '2026-12-31', c_deptmgr);
    raise exception 'FAIL dept mgr created a dept B goal';
  exception when insufficient_privilege then null;
  end;
  -- CAN create a goal in their own department
  insert into public.performance_goals
    (organization_id, name, metric_id, metric_version, metric_unit, scope_level,
     department_id, goal_type, target_value, start_date, end_date, created_by)
  values (org_id, 'Mgr own-dept goal', 'appointments_completed', 'intel-v1', 'count',
          'department', dept_a, 'minimum', 5, '2026-01-01', '2026-12-31', c_deptmgr);
  -- department_manager has no goal:approve — activation must fail
  begin
    update public.performance_goals set status = 'active' where id = v_dept_goal;
    raise exception 'FAIL dept mgr approved a goal without goal:approve';
  exception when others then
    if sqlerrm not like '%goal_forbidden%' then raise; end if;
  end;
  reset role;

  -- trainer: sees exactly their own goal; cannot create any goal
  perform pg_temp.impersonate(c_trainer);
  select count(*) into n from public.performance_goals where organization_id = org_id;
  if n <> 1 then raise exception 'FAIL trainer sees % goals, expected 1 (own)', n; end if;
  select count(*) into n from public.performance_goals where trainer_id = trainer1;
  if n <> 1 then raise exception 'FAIL trainer cannot see their own goal'; end if;
  begin
    insert into public.performance_goals
      (organization_id, name, metric_id, metric_version, metric_unit, scope_level,
       trainer_id, goal_type, target_value, start_date, end_date, created_by)
    values (org_id, 'trainer self goal', 'appointments_completed', 'intel-v1', 'count',
            'trainer', trainer1, 'minimum', 1, '2026-01-01', '2026-12-31', c_trainer);
    raise exception 'FAIL trainer created a goal (no goal:create)';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- lifecycle: wsadmin approves, completes; completed goals freeze
  perform pg_temp.impersonate(c_wsadmin);
  update public.performance_goals set status = 'active' where id = v_org_goal;
  select count(*) into n from public.performance_goals
   where id = v_org_goal and status = 'active' and approved_by = c_wsadmin and approved_at is not null;
  if n <> 1 then raise exception 'FAIL approval did not record approver'; end if;
  -- invalid transition draft -> achieved
  begin
    update public.performance_goals set status = 'achieved' where id = v_dept_goal;
    raise exception 'FAIL draft jumped straight to achieved';
  exception when others then
    if sqlerrm not like '%goal_transition_invalid%' then raise; end if;
  end;
  -- definitional fields frozen after creation
  begin
    update public.performance_goals set metric_id = 'active_clients' where id = v_org_goal;
    raise exception 'FAIL metric_id changed after creation';
  exception when others then
    if sqlerrm not like '%goal_immutable%' then raise; end if;
  end;
  -- active goals: target edits rejected (draft-only)
  begin
    update public.performance_goals set target_value = 999 where id = v_org_goal;
    raise exception 'FAIL target changed on an active goal';
  exception when others then
    if sqlerrm not like '%goal_immutable%' then raise; end if;
  end;
  -- complete, then verify immutability + archival path
  update public.performance_goals set status = 'achieved' where id = v_org_goal;
  begin
    update public.performance_goals set notes = 'rewrite history' where id = v_org_goal;
    raise exception 'FAIL completed goal accepted an edit';
  exception when others then
    if sqlerrm not like '%goal_immutable%' then raise; end if;
  end;
  update public.performance_goals set status = 'archived' where id = v_org_goal;
  begin
    update public.performance_goals set status = 'active' where id = v_org_goal;
    raise exception 'FAIL archived goal changed';
  exception when others then
    if sqlerrm not like '%goal_immutable%' then raise; end if;
  end;
  -- event trail exists and is append-only
  select count(*) into n from public.performance_goal_events where goal_id = v_org_goal;
  if n < 3 then raise exception 'FAIL expected >=3 goal events, got %', n; end if;
  -- Append-only: clients have no delete/update policy (RLS deletes zero
  -- rows silently) and the protect trigger blocks privileged paths.
  delete from public.performance_goal_events where goal_id = v_org_goal;
  select count(*) into strict n from public.performance_goal_events where goal_id = v_org_goal;
  if n < 3 then raise exception 'FAIL goal events were deleted'; end if;
  reset role;

  -- trainer cannot see the event trail of goals outside their scope
  perform pg_temp.impersonate(c_trainer);
  select count(*) into n from public.performance_goal_events
   where goal_id in (v_dept_goal, v_deptb_goal);
  if n <> 0 then raise exception 'FAIL trainer sees foreign goal events'; end if;
  reset role;

  -- ==================================================================
  -- BENCHMARKS
  -- ==================================================================

  perform pg_temp.impersonate(c_trainer);
  begin
    insert into public.performance_benchmarks
      (organization_id, name, metric_id, metric_version, metric_unit, scope_level,
       source_type, value, evidence, effective_from, created_by)
    values (org_id, 'trainer bench', 'appointments_completed', 'intel-v1', 'count',
            'organization', 'internal_standard', 10, 'trainer-set evidence text', '2026-01-01', c_trainer);
    raise exception 'FAIL trainer created a benchmark';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform pg_temp.impersonate(c_wsadmin);
  insert into public.performance_benchmarks
    (organization_id, name, metric_id, metric_version, metric_unit, scope_level,
     source_type, value, evidence, effective_from, created_by)
  values (org_id, 'Session floor', 'appointments_completed', 'intel-v1', 'count',
          'organization', 'internal_standard', 80,
          'Owner-set internal standard for live checks', '2026-01-01', c_wsadmin)
  returning id into v_bench;
  reset role;

  -- dept manager has no benchmark permissions: RLS hides the row from
  -- update entirely (0 rows) — verify the status never moved.
  perform pg_temp.impersonate(c_deptmgr);
  update public.performance_benchmarks set status = 'approved' where id = v_bench;
  reset role;
  perform pg_temp.impersonate(c_wsadmin);
  select count(*) into n from public.performance_benchmarks
   where id = v_bench and status = 'draft';
  if n <> 1 then raise exception 'FAIL dept mgr approved a benchmark'; end if;
  reset role;

  perform pg_temp.impersonate(c_wsadmin);
  update public.performance_benchmarks set status = 'approved' where id = v_bench;
  -- approved content is frozen
  begin
    update public.performance_benchmarks set value = 999 where id = v_bench;
    raise exception 'FAIL approved benchmark value changed';
  exception when others then
    if sqlerrm not like '%benchmark_immutable%' then raise; end if;
  end;
  begin
    update public.performance_benchmarks set evidence = 'rewritten' where id = v_bench;
    raise exception 'FAIL approved benchmark evidence changed';
  exception when others then
    if sqlerrm not like '%benchmark_immutable%' then raise; end if;
  end;
  -- deprecation preserves the row
  update public.performance_benchmarks set status = 'deprecated' where id = v_bench;
  select count(*) into n from public.performance_benchmarks
   where id = v_bench and status = 'deprecated' and deprecated_at is not null;
  if n <> 1 then raise exception 'FAIL deprecation not recorded'; end if;
  reset role;

  -- outsider cross-org denial
  perform pg_temp.impersonate(c_outsider);
  select count(*) into n from public.performance_benchmarks where organization_id = org_id;
  if n <> 0 then raise exception 'FAIL outsider sees benchmarks'; end if;
  reset role;

  -- ==================================================================
  -- DASHBOARDS
  -- ==================================================================

  -- trainer creates a personal dashboard (allowed) with a widget
  perform pg_temp.impersonate(c_trainer);
  insert into public.analytics_dashboards (organization_id, owner_id, name)
  values (org_id, c_trainer, 'My dashboard') returning id into v_dash;
  insert into public.analytics_dashboard_widgets
    (dashboard_id, organization_id, widget_type, metric_id, config)
  values (v_dash, org_id, 'metric', 'appointments_completed',
          '{"metricId":"appointments_completed"}') returning id into v_widget;
  -- trainer cannot share at department scope (no permission)
  begin
    update public.analytics_dashboards
       set shared_scope = 'department', department_id = dept_a where id = v_dash;
    raise exception 'FAIL trainer shared to a department';
  exception when others then
    if sqlerrm not like '%dashboard_forbidden%' then raise; end if;
  end;
  begin
    update public.analytics_dashboards set shared_scope = 'organization' where id = v_dash;
    raise exception 'FAIL trainer shared to the organization';
  exception when others then
    if sqlerrm not like '%dashboard_forbidden%' then raise; end if;
  end;
  reset role;

  -- other members cannot see a personal dashboard...
  perform pg_temp.impersonate(c_wsadmin);
  select count(*) into n from public.analytics_dashboards where id = v_dash;
  if n <> 0 then raise exception 'FAIL personal dashboard visible to non-owner'; end if;
  -- ...nor its widgets
  select count(*) into n from public.analytics_dashboard_widgets where id = v_widget;
  if n <> 0 then raise exception 'FAIL personal dashboard widgets visible to non-owner'; end if;
  -- wsadmin shares an org dashboard
  insert into public.analytics_dashboards (organization_id, owner_id, name, shared_scope)
  values (org_id, c_wsadmin, 'Org shared', 'organization');
  reset role;

  -- trainer (analytics:read) can see the org-shared dashboard
  perform pg_temp.impersonate(c_trainer);
  select count(*) into n from public.analytics_dashboards
   where organization_id = org_id and shared_scope = 'organization';
  if n <> 1 then raise exception 'FAIL org-shared dashboard not visible to trainer'; end if;
  -- but cannot modify it
  begin
    update public.analytics_dashboards set name = 'hijack'
     where organization_id = org_id and shared_scope = 'organization';
    if not found then null; else raise exception 'FAIL trainer modified a shared dashboard'; end if;
  exception when insufficient_privilege then null;
  end;
  -- personal default: trainer sets their own
  insert into public.analytics_dashboard_defaults
    (organization_id, scope, profile_id, dashboard_id, set_by)
  values (org_id, 'personal', c_trainer, v_dash, c_trainer);
  -- org default requires dashboard:set_default — trainer denied
  begin
    insert into public.analytics_dashboard_defaults
      (organization_id, scope, dashboard_id, set_by)
    values (org_id, 'organization', v_dash, c_trainer);
    raise exception 'FAIL trainer set the organization default';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- department sharing: dept manager shares within their department; the
  -- OTHER department's members cannot see it (dept B has no members here,
  -- so assert the dept-A manager CAN and the trainer CANNOT)
  perform pg_temp.impersonate(c_deptmgr);
  insert into public.analytics_dashboards
    (organization_id, owner_id, name, shared_scope, department_id)
  values (org_id, c_deptmgr, 'Dept A dashboard', 'department', dept_a);
  -- cannot share into a department they do not manage
  begin
    insert into public.analytics_dashboards
      (organization_id, owner_id, name, shared_scope, department_id)
    values (org_id, c_deptmgr, 'Dept B dashboard', 'department', dept_b);
    raise exception 'FAIL dept mgr shared into dept B';
  exception when others then
    if sqlerrm not like '%dashboard_forbidden%' then raise; end if;
  end;
  reset role;
  perform pg_temp.impersonate(c_trainer);
  select count(*) into n from public.analytics_dashboards
   where organization_id = org_id and shared_scope = 'department';
  if n <> 0 then raise exception 'FAIL trainer sees department-shared dashboard outside their departments'; end if;
  reset role;

  -- outsider cross-org denial on dashboards
  perform pg_temp.impersonate(c_outsider);
  select count(*) into n from public.analytics_dashboards where organization_id = org_id;
  if n <> 0 then raise exception 'FAIL outsider sees dashboards'; end if;
  reset role;

  raise notice 'PHASE 9 LIVE CHECKS: ALL PASSED';
end;
$$;

rollback;