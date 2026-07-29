-- ============================================================================
-- Performance Operations — Phase 7, Migration 19: period close domain
--
-- Additive only. The reporting-period status model (draft/open/closed/
-- locked) is preserved; the fine-grained close lifecycle lives on
-- period_close_runs. Nothing here duplicates payroll snapshots,
-- intelligence results, import records, appointments, or audit rows —
-- packages/manifests store REFERENCES and hashes plus engine-rendered
-- payloads frozen at generation time.
--
-- Documented deviations from the proposed model (see
-- docs/PERIOD_CLOSE_ARCHITECTURE.md):
--  * period_close_checks: readiness checks are COMPUTED live by the
--    coordinator (never persisted as rows — no stale checklists); the
--    latest evaluation summary is stored on the run and the full results
--    inside the immutable manifest.
--  * period_close_approvals: folded into run columns + append-only
--    period_close_events + audit_events.
--  * export_manifests + items: folded into close_exports rows; the close
--    manifest references them by id + hash.
--  * period_close_artifacts: covered by report_packages + close_exports.
--  * saved_report_view_access: covered by saved_views sharing columns.
-- ============================================================================

-- ---------------------------------------------------------------- helpers
-- Department accessibility: org-wide roles see every department; the
-- department-scoped role sees only departments it is a member of.
create or replace function app.can_access_department(p_org uuid, p_department uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.roles r on r.id = m.role_id
    where m.profile_id = (select auth.uid())
      and m.effective_to is null
      and (m.organization_id = p_org or r.key = 'platform_admin')
      and r.key <> 'department_manager'
  )
  or exists (
    select 1 from public.department_memberships dm
    where dm.profile_id = (select auth.uid())
      and dm.organization_id = p_org
      and dm.department_id = p_department
      and dm.effective_to is null
  );
$$;
revoke all on function app.can_access_department(uuid, uuid) from public;
grant execute on function app.can_access_department(uuid, uuid) to authenticated;

-- ---------------------------------------------------------- permissions
insert into public.permissions (key, description) values
  ('period_close:read',    'View period close runs, packages, exports, and manifests'),
  ('period_close:create',  'Create period close runs'),
  ('period_close:review',  'Evaluate readiness, acknowledge warnings, complete close review'),
  ('period_close:approve', 'Approve a period close'),
  ('period_close:execute', 'Execute the final period close'),
  ('period_close:reopen',  'Reopen a closed period (elevated)'),
  ('period_close:export',  'Generate and download close exports'),
  ('report_package:create',   'Generate report packages'),
  ('report_package:finalize', 'Finalize report packages (via close execution)'),
  ('saved_report:share',      'Share saved report views with organization or department'),
  ('scheduled_report:manage', 'Manage scheduled report definitions')
on conflict (key) do nothing;

-- Role matrix (documented in docs/AUTHORIZATION_MODEL.md):
--   platform_admin  → everything (incl. reopen)
--   workspace_admin → everything except period_close:reopen
--   payroll_manager → read/create/review/export + report_package:create +
--                     saved_report:share + scheduled_report:manage
--   department_manager → period_close:read only
--   trainer/viewer  → none
with grants(role_key, permission_key) as (
  values
  ('platform_admin','period_close:read'),('platform_admin','period_close:create'),
  ('platform_admin','period_close:review'),('platform_admin','period_close:approve'),
  ('platform_admin','period_close:execute'),('platform_admin','period_close:reopen'),
  ('platform_admin','period_close:export'),('platform_admin','report_package:create'),
  ('platform_admin','report_package:finalize'),('platform_admin','saved_report:share'),
  ('platform_admin','scheduled_report:manage'),
  ('workspace_admin','period_close:read'),('workspace_admin','period_close:create'),
  ('workspace_admin','period_close:review'),('workspace_admin','period_close:approve'),
  ('workspace_admin','period_close:execute'),('workspace_admin','period_close:export'),
  ('workspace_admin','report_package:create'),('workspace_admin','report_package:finalize'),
  ('workspace_admin','saved_report:share'),('workspace_admin','scheduled_report:manage'),
  ('payroll_manager','period_close:read'),('payroll_manager','period_close:create'),
  ('payroll_manager','period_close:review'),('payroll_manager','period_close:export'),
  ('payroll_manager','report_package:create'),('payroll_manager','saved_report:share'),
  ('payroll_manager','scheduled_report:manage'),
  ('department_manager','period_close:read')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.key = g.role_key
join public.permissions p on p.key = g.permission_key
on conflict do nothing;

-- ------------------------------------------------- close policy (per org)
-- Self-approval FAILS CLOSED: separation of duties is enforced unless an
-- organization explicitly allows self-approval (dev/small-org escape hatch).
create table public.organization_close_policies (
  organization_id        uuid primary key references public.organizations (id) on delete cascade,
  allow_self_approval    boolean not null default false,
  payroll_required_state text not null default 'posted'
                         check (payroll_required_state in ('posted', 'locked')),
  require_ack_note       boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger organization_close_policies_set_updated_at
  before update on public.organization_close_policies
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------ period close runs
create table public.period_close_runs (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  reporting_period_id       uuid not null references public.reporting_periods (id) on delete restrict,
  close_version             int not null default 1 check (close_version >= 1),
  status                    text not null default 'close_review' check (status in (
    'close_review', 'ready_to_close', 'closing', 'closed', 'superseded', 'voided'
  )),
  source_cutoff_at          timestamptz,
  readiness_snapshot        jsonb not null default '{}'::jsonb,
  blocking_issue_count      int not null default 0,
  warning_count             int not null default 0,
  initiated_by              uuid references public.profiles (id) on delete set null,
  initiated_at              timestamptz not null default now(),
  reviewed_by               uuid references public.profiles (id) on delete set null,
  reviewed_at               timestamptz,
  approved_by               uuid references public.profiles (id) on delete set null,
  approved_at               timestamptz,
  closed_by                 uuid references public.profiles (id) on delete set null,
  closed_at                 timestamptz,
  reopened_by               uuid references public.profiles (id) on delete set null,
  reopened_at               timestamptz,
  reopen_reason             text,
  close_notes               text not null default '',
  report_package_id         uuid,
  manifest_sha256           text,
  supersedes_close_run_id   uuid references public.period_close_runs (id) on delete restrict,
  superseded_by_close_run_id uuid references public.period_close_runs (id) on delete restrict,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index period_close_runs_org_idx on public.period_close_runs (organization_id, status);
create index period_close_runs_period_idx on public.period_close_runs (reporting_period_id);
-- Only ONE current close run per period (closed counts as current until
-- superseded via the controlled reopen workflow).
create unique index period_close_runs_one_active_uidx
  on public.period_close_runs (reporting_period_id)
  where status not in ('superseded', 'voided');

create trigger period_close_runs_set_updated_at
  before update on public.period_close_runs
  for each row execute function app.set_updated_at();

-- State machine, DB-enforced.
create or replace function app.period_close_transition_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;
  allowed := case old.status
    when 'close_review'   then new.status in ('ready_to_close', 'voided')
    when 'ready_to_close' then new.status in ('close_review', 'closing', 'voided')
    when 'closing'        then new.status in ('closed', 'ready_to_close')
    when 'closed'         then new.status in ('superseded')
    else false
  end;
  if not allowed then
    raise exception 'invalid_close_transition_%_to_%', old.status, new.status
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger period_close_runs_transition_guard
  before update on public.period_close_runs
  for each row execute function app.period_close_transition_guard();

-- Closed runs are frozen except the supersession marking done by the
-- reopen RPC (status change validated above; other columns immutable).
create or replace function app.protect_closed_close_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'closed' then
    if new.status = 'superseded'
       and new.superseded_by_close_run_id is not null
       and new.reopened_by is not null then
      -- reopen RPC path: only supersession + reopen columns may change
      if new.organization_id is distinct from old.organization_id
         or new.reporting_period_id is distinct from old.reporting_period_id
         or new.close_version is distinct from old.close_version
         or new.manifest_sha256 is distinct from old.manifest_sha256
         or new.report_package_id is distinct from old.report_package_id
         or new.closed_by is distinct from old.closed_by
         or new.closed_at is distinct from old.closed_at
         or new.approved_by is distinct from old.approved_by
         or new.approved_at is distinct from old.approved_at then
        raise exception 'closed_run_immutable' using errcode = '42501';
      end if;
      return new;
    end if;
    raise exception 'closed_run_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger period_close_runs_protect_closed
  before update on public.period_close_runs
  for each row execute function app.protect_closed_close_run();

-- ---------------------------------------------------- close run events
create table public.period_close_events (
  id                  uuid primary key default gen_random_uuid(),
  period_close_run_id uuid not null references public.period_close_runs (id) on delete cascade,
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  from_status         text,
  to_status           text not null,
  actor_id            uuid references public.profiles (id) on delete set null,
  reason              text,
  created_at          timestamptz not null default now()
);
create index period_close_events_run_idx on public.period_close_events (period_close_run_id);

-- ------------------------------------------- warning acknowledgements
create table public.period_close_acknowledgements (
  id                  uuid primary key default gen_random_uuid(),
  period_close_run_id uuid not null references public.period_close_runs (id) on delete cascade,
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  check_code          text not null,
  close_version       int not null,
  note                text not null default '',
  acknowledged_by     uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (period_close_run_id, check_code)
);
create index period_close_acks_run_idx
  on public.period_close_acknowledgements (period_close_run_id);

-- Acknowledgements freeze once their run is closed.
create or replace function app.protect_ack_after_close()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.period_close_runs
  where id = coalesce(old.period_close_run_id, new.period_close_run_id);
  if v_status in ('closed', 'superseded') then
    raise exception 'acknowledgements_frozen' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger period_close_acks_protect
  before update or delete on public.period_close_acknowledgements
  for each row execute function app.protect_ack_after_close();

-- --------------------------------------------------------- report packages
create table public.report_packages (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete restrict,
  reporting_period_id     uuid not null references public.reporting_periods (id) on delete restrict,
  period_close_run_id     uuid references public.period_close_runs (id) on delete set null,
  package_type            text not null check (package_type in (
    'executive', 'department', 'payroll', 'trainer_statements',
    'import_reconciliation', 'readiness', 'full_close'
  )),
  department_id           uuid references public.departments (id) on delete restrict,
  version                 int not null default 1 check (version >= 1),
  status                  text not null default 'generating' check (status in (
    'draft', 'generating', 'ready', 'failed', 'finalized', 'superseded', 'voided'
  )),
  generated_by            uuid references public.profiles (id) on delete set null,
  generated_at            timestamptz not null default now(),
  intelligence_version    text,
  payroll_run_id          uuid references public.payroll_runs (id) on delete set null,
  payroll_snapshot_version int,
  filters                 jsonb not null default '{}'::jsonb,
  payload                 jsonb not null default '{}'::jsonb,
  warnings                jsonb not null default '[]'::jsonb,
  package_sha256          text,
  failure_reason          text,
  supersedes_package_id   uuid references public.report_packages (id) on delete restrict,
  superseded_by_package_id uuid references public.report_packages (id) on delete restrict,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index report_packages_org_period_idx
  on public.report_packages (organization_id, reporting_period_id, package_type);
create unique index report_packages_version_uidx
  on public.report_packages (
    organization_id, reporting_period_id, package_type,
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  );

create trigger report_packages_set_updated_at
  before update on public.report_packages
  for each row execute function app.set_updated_at();

-- Lifecycle + immutability: content freezes at 'ready'; finalized packages
-- may only be marked superseded (reopen workflow).
create or replace function app.report_package_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if new.status is distinct from old.status then
    allowed := case old.status
      when 'draft'      then new.status in ('generating', 'voided')
      when 'generating' then new.status in ('ready', 'failed')
      when 'ready'      then new.status in ('finalized', 'superseded', 'voided')
      when 'failed'     then new.status in ('voided')
      when 'finalized'  then new.status in ('superseded')
      else false
    end;
    if not allowed then
      raise exception 'invalid_package_transition_%_to_%', old.status, new.status
        using errcode = '42501';
    end if;
  end if;
  -- Content is immutable once ready (regeneration = new version row).
  if old.status in ('ready', 'finalized', 'superseded')
     and (new.payload is distinct from old.payload
          or new.package_sha256 is distinct from old.package_sha256
          or new.payroll_run_id is distinct from old.payroll_run_id
          or new.payroll_snapshot_version is distinct from old.payroll_snapshot_version
          or new.version is distinct from old.version) then
    raise exception 'package_content_frozen' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger report_packages_guard
  before update on public.report_packages
  for each row execute function app.report_package_guard();

-- Late FK now that report_packages exists.
alter table public.period_close_runs
  add constraint period_close_runs_package_fkey
  foreign key (report_package_id) references public.report_packages (id) on delete restrict;

-- ------------------------------------------------------------ close exports
-- Export files are NOT stored as bytes: every export is deterministically
-- regenerable from frozen sources (payroll snapshots, finalized package
-- payloads); this table records identity, version, hash, and rowcount so
-- integrity is verifiable. See docs/EXPORT_MANIFEST.md.
create table public.close_exports (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  reporting_period_id      uuid not null references public.reporting_periods (id) on delete restrict,
  period_close_run_id      uuid references public.period_close_runs (id) on delete set null,
  report_package_id        uuid references public.report_packages (id) on delete set null,
  export_type              text not null check (export_type in (
    'payroll_register_csv', 'payroll_detail_csv', 'department_summary_csv',
    'executive_summary_csv', 'trainer_statement_register_csv', 'close_manifest_json'
  )),
  file_name                text not null,
  mime_type                text not null default 'text/csv',
  version                  int not null default 1 check (version >= 1),
  byte_size                int not null default 0,
  sha256                   text not null,
  row_count                int not null default 0,
  filters                  jsonb not null default '{}'::jsonb,
  payroll_run_id           uuid references public.payroll_runs (id) on delete set null,
  payroll_snapshot_version int,
  generated_by             uuid references public.profiles (id) on delete set null,
  superseded               boolean not null default false,
  download_count           int not null default 0,
  created_at               timestamptz not null default now()
);
create index close_exports_org_period_idx
  on public.close_exports (organization_id, reporting_period_id, export_type);
create unique index close_exports_version_uidx
  on public.close_exports (organization_id, reporting_period_id, export_type, version);

-- Only download_count and superseded may change after creation.
create or replace function app.protect_close_export()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sha256 is distinct from old.sha256
     or new.export_type is distinct from old.export_type
     or new.file_name is distinct from old.file_name
     or new.version is distinct from old.version
     or new.byte_size is distinct from old.byte_size
     or new.row_count is distinct from old.row_count
     or new.organization_id is distinct from old.organization_id
     or new.reporting_period_id is distinct from old.reporting_period_id then
    raise exception 'export_record_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger close_exports_protect
  before update on public.close_exports
  for each row execute function app.protect_close_export();

-- ------------------------------------------------------- close manifests
create table public.period_close_manifests (
  id                  uuid primary key default gen_random_uuid(),
  period_close_run_id uuid not null unique references public.period_close_runs (id) on delete restrict,
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  payload             jsonb not null,
  manifest_sha256     text not null,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

-- ------------------------------------------- saved view sharing (Phase 6+)
alter table public.saved_views
  add column organization_id uuid references public.organizations (id) on delete cascade,
  add column department_id uuid references public.departments (id) on delete cascade,
  add column shared_scope text not null default 'personal'
    check (shared_scope in ('personal', 'organization', 'department')),
  add column is_default boolean not null default false,
  add column last_used_at timestamptz;

-- shared views must carry an organization; department shares a department.
alter table public.saved_views
  add constraint saved_views_shared_org_chk
  check (shared_scope = 'personal' or organization_id is not null),
  add constraint saved_views_shared_dept_chk
  check (shared_scope <> 'department' or department_id is not null);

-- One default per scope target.
create unique index saved_views_default_personal_uidx
  on public.saved_views (owner_id, page)
  where is_default and shared_scope = 'personal';
create unique index saved_views_default_org_uidx
  on public.saved_views (organization_id, page)
  where is_default and shared_scope = 'organization';
create unique index saved_views_default_dept_uidx
  on public.saved_views (organization_id, department_id, page)
  where is_default and shared_scope = 'department';

drop policy saved_views_all on public.saved_views;
create policy saved_views_select on public.saved_views
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (shared_scope = 'organization'
        and app.has_permission_in(organization_id, 'report:read'))
    or (shared_scope = 'department'
        and app.has_permission_in(organization_id, 'report:read')
        and app.can_access_department(organization_id, department_id))
  );
create policy saved_views_insert on public.saved_views
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (shared_scope = 'personal'
         or app.has_permission_in(organization_id, 'saved_report:share'))
  );
create policy saved_views_update on public.saved_views
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or (shared_scope <> 'personal'
        and app.has_permission_in(organization_id, 'saved_report:share'))
  )
  with check (
    shared_scope = 'personal'
    or app.has_permission_in(organization_id, 'saved_report:share')
  );
create policy saved_views_delete on public.saved_views
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or (shared_scope <> 'personal'
        and app.has_permission_in(organization_id, 'saved_report:share'))
  );

-- --------------------------------------------- scheduled report definitions
-- DEFINITIONS ONLY: execution_enabled is constrained false — a future
-- background-jobs phase relaxes the constraint (clean execution interface).
create table public.scheduled_report_definitions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  department_id      uuid references public.departments (id) on delete cascade,
  owner_id           uuid not null references public.profiles (id) on delete cascade,
  saved_view_id      uuid references public.saved_views (id) on delete set null,
  report_type        text not null check (report_type in (
    'quick_report', 'executive_package', 'department_package', 'payroll_package'
  )),
  frequency          text not null check (frequency in (
    'daily', 'weekly', 'monthly', 'period_close', 'custom'
  )),
  delivery_channel   text not null default 'in_app' check (delivery_channel in ('in_app', 'email_planned')),
  recipients         jsonb not null default '[]'::jsonb,
  timezone           text not null default 'America/Los_Angeles',
  active             boolean not null default true,
  execution_enabled  boolean not null default false check (execution_enabled = false),
  next_intended_run  date,
  last_intended_run  date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index scheduled_report_definitions_org_idx
  on public.scheduled_report_definitions (organization_id);
create trigger scheduled_report_definitions_set_updated_at
  before update on public.scheduled_report_definitions
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------- RLS
alter table public.organization_close_policies enable row level security;
alter table public.organization_close_policies force row level security;
alter table public.period_close_runs enable row level security;
alter table public.period_close_runs force row level security;
alter table public.period_close_events enable row level security;
alter table public.period_close_events force row level security;
alter table public.period_close_acknowledgements enable row level security;
alter table public.period_close_acknowledgements force row level security;
alter table public.report_packages enable row level security;
alter table public.report_packages force row level security;
alter table public.close_exports enable row level security;
alter table public.close_exports force row level security;
alter table public.period_close_manifests enable row level security;
alter table public.period_close_manifests force row level security;
alter table public.scheduled_report_definitions enable row level security;
alter table public.scheduled_report_definitions force row level security;

create policy close_policies_select on public.organization_close_policies
  for select to authenticated
  using (app.has_permission_in(organization_id, 'period_close:read'));
create policy close_policies_write on public.organization_close_policies
  for all to authenticated
  using (app.has_permission_in(organization_id, 'org:manage'))
  with check (app.has_permission_in(organization_id, 'org:manage'));

create policy close_runs_select on public.period_close_runs
  for select to authenticated
  using (app.has_permission_in(organization_id, 'period_close:read'));
create policy close_runs_insert on public.period_close_runs
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'period_close:create')
    and initiated_by = (select auth.uid())
  );
create policy close_runs_update on public.period_close_runs
  for update to authenticated
  using (app.has_permission_in(organization_id, 'period_close:review'))
  with check (app.has_permission_in(organization_id, 'period_close:review'));

create policy close_events_select on public.period_close_events
  for select to authenticated
  using (app.has_permission_in(organization_id, 'period_close:read'));
create policy close_events_insert on public.period_close_events
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'period_close:review'));

create policy close_acks_select on public.period_close_acknowledgements
  for select to authenticated
  using (app.has_permission_in(organization_id, 'period_close:read'));
create policy close_acks_insert on public.period_close_acknowledgements
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'period_close:review')
    and acknowledged_by = (select auth.uid())
  );
create policy close_acks_delete on public.period_close_acknowledgements
  for delete to authenticated
  using (app.has_permission_in(organization_id, 'period_close:review'));

create policy report_packages_select on public.report_packages
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'period_close:read')
    and (
      package_type <> 'department'
      or department_id is null
      or app.can_access_department(organization_id, department_id)
    )
  );
create policy report_packages_insert on public.report_packages
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'report_package:create')
    and generated_by = (select auth.uid())
  );
create policy report_packages_update on public.report_packages
  for update to authenticated
  using (app.has_permission_in(organization_id, 'report_package:create'))
  with check (app.has_permission_in(organization_id, 'report_package:create'));

create policy close_exports_select on public.close_exports
  for select to authenticated
  using (app.has_permission_in(organization_id, 'period_close:read'));
create policy close_exports_insert on public.close_exports
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'period_close:export')
    and generated_by = (select auth.uid())
  );
create policy close_exports_update on public.close_exports
  for update to authenticated
  using (app.has_permission_in(organization_id, 'period_close:export'))
  with check (app.has_permission_in(organization_id, 'period_close:export'));

-- Manifests: read-only to users; created ONLY by the close RPC (definer).
create policy close_manifests_select on public.period_close_manifests
  for select to authenticated
  using (app.has_permission_in(organization_id, 'period_close:read'));

create policy scheduled_reports_select on public.scheduled_report_definitions
  for select to authenticated
  using (app.has_permission_in(organization_id, 'report:read'));
create policy scheduled_reports_insert on public.scheduled_report_definitions
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'scheduled_report:manage')
    and owner_id = (select auth.uid())
  );
create policy scheduled_reports_update on public.scheduled_report_definitions
  for update to authenticated
  using (app.has_permission_in(organization_id, 'scheduled_report:manage'))
  with check (app.has_permission_in(organization_id, 'scheduled_report:manage'));
create policy scheduled_reports_delete on public.scheduled_report_definitions
  for delete to authenticated
  using (app.has_permission_in(organization_id, 'scheduled_report:manage'));
