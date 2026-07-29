-- ============================================================================
-- Performance Operations — Phase 3, Migration 12: import staging domain
--
-- Staged import architecture: uploaded file → parsed raw rows → validation →
-- normalized staging → matching → review → approval → transactional posting.
-- Documented deviations from the proposed entity list:
--   * import_files is folded into import_batches (exactly one file per
--     batch; file metadata lives on the batch).
--   * import_entity_matches is folded into import_rows (matched ids +
--     method + confidence columns); import_resolutions is the audited log
--     of every human decision.
-- New permissions are seeded additively; high-risk permissions are NOT
-- granted broadly (see role grants at the bottom).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- import_batches — one uploaded file, one lifecycle.
-- ----------------------------------------------------------------------------
create table public.import_batches (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  source                    text not null check (source in ('setmore', 'acuity', 'manual_csv')),
  source_account_identifier text,
  original_filename         text not null,
  storage_path              text not null,
  file_hash                 text not null,
  file_size                 bigint not null check (file_size >= 0),
  mime_type                 text not null,
  adapter_version           text not null default '',
  schema_profile_id         uuid,
  total_row_count           int not null default 0,
  accepted_row_count        int not null default 0,
  warning_row_count         int not null default 0,
  blocked_row_count         int not null default 0,
  duplicate_row_count       int not null default 0,
  excluded_row_count        int not null default 0,
  posted_row_count          int not null default 0,
  status                    text not null default 'uploaded' check (status in (
    'uploaded', 'parsing', 'validating', 'needs_review',
    'ready_for_approval', 'approved', 'posting', 'posted', 'failed', 'reversed'
  )),
  uploaded_by               uuid references public.profiles (id) on delete set null,
  uploaded_at               timestamptz not null default now(),
  parsing_started_at        timestamptz,
  parsing_completed_at      timestamptz,
  approved_by               uuid references public.profiles (id) on delete set null,
  approved_at               timestamptz,
  posted_by                 uuid references public.profiles (id) on delete set null,
  posted_at                 timestamptz,
  reversed_by               uuid references public.profiles (id) on delete set null,
  reversed_at               timestamptz,
  failure_code              text,
  sanitized_failure_message text,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index import_batches_organization_id_idx on public.import_batches (organization_id);
create index import_batches_org_status_idx on public.import_batches (organization_id, status);
create index import_batches_file_hash_idx on public.import_batches (organization_id, file_hash);
-- the same file may never be POSTED twice for an organization
create unique index import_batches_no_double_posted_file_uidx
  on public.import_batches (organization_id, file_hash)
  where status in ('posted', 'posting');

create trigger import_batches_set_updated_at
  before update on public.import_batches
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- Batch state machine — enforced at the database level.
-- ----------------------------------------------------------------------------
create or replace function app.import_batch_transition_guard()
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
    when 'uploaded'           then new.status in ('parsing', 'failed')
    when 'parsing'            then new.status in ('validating', 'failed')
    when 'validating'         then new.status in ('needs_review', 'ready_for_approval', 'failed')
    when 'needs_review'       then new.status in ('ready_for_approval', 'validating', 'failed')
    when 'ready_for_approval' then new.status in ('approved', 'needs_review', 'validating')
    when 'approved'           then new.status in ('posting', 'needs_review', 'failed')
    when 'posting'            then new.status in ('posted', 'failed')
    when 'posted'             then new.status in ('reversed')
    when 'failed'             then new.status in ('parsing', 'validating', 'needs_review')
    when 'reversed'           then false
    else false
  end;
  if not allowed then
    raise exception 'invalid_batch_transition_%_to_%', old.status, new.status
      using errcode = '42501';
  end if;
  -- A batch may be posted at most once; a reversal at most once.
  if new.status = 'posting' and old.posted_at is not null then
    raise exception 'batch_already_posted' using errcode = '42501';
  end if;
  if new.status = 'reversed' and old.reversed_at is not null then
    raise exception 'batch_already_reversed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger import_batches_transition_guard
  before update on public.import_batches
  for each row execute function app.import_batch_transition_guard();

-- ----------------------------------------------------------------------------
-- import_schema_profiles — saved, versioned column mappings (generic adapter).
-- ----------------------------------------------------------------------------
create table public.import_schema_profiles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  source           text not null check (source in ('setmore', 'acuity', 'manual_csv')),
  name             text not null,
  header_signature text not null,
  column_mappings  jsonb not null,
  version          int not null default 1 check (version >= 1),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (organization_id, source, header_signature, version)
);

create index import_schema_profiles_org_idx
  on public.import_schema_profiles (organization_id, source, header_signature);

alter table public.import_batches
  add constraint import_batches_schema_profile_fkey
  foreign key (schema_profile_id) references public.import_schema_profiles (id)
  on delete set null;

-- ----------------------------------------------------------------------------
-- import_rows — every source row, preserved verbatim.
-- ----------------------------------------------------------------------------
create table public.import_rows (
  id                    uuid primary key default gen_random_uuid(),
  import_batch_id       uuid not null references public.import_batches (id) on delete cascade,
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  source_row_number     int not null check (source_row_number >= 1),
  original_row          jsonb not null,   -- immutable after insert (trigger)
  normalized_row        jsonb not null default '{}'::jsonb,
  corrections           jsonb not null default '{}'::jsonb, -- audited overrides
  row_hash              text not null,
  processing_status     text not null default 'pending' check (processing_status in (
    'pending', 'needs_review', 'ready', 'excluded', 'posted'
  )),
  duplicate_class       text check (duplicate_class in (
    'new', 'exact_duplicate', 'possible_duplicate', 'source_update',
    'conflict', 'previously_reversed'
  )),
  blocking_issue_count  int not null default 0,
  warning_count         int not null default 0,
  info_count            int not null default 0,
  -- normalized appointment scalars (denormalized for queue filtering)
  appointment_date      date,
  start_at              timestamptz,
  end_at                timestamptz,
  duration_minutes      int,
  canonical_status      text references public.appointment_status_definitions (key),
  external_appointment_id text,
  listed_price_cents    bigint,
  amount_paid_cents     bigint,
  currency              text not null default 'USD',
  -- matching outcome (entity-match data folded in; see header note)
  matched_trainer_id    uuid references public.trainers (id) on delete set null,
  trainer_match_method  text,
  matched_service_id    uuid references public.services (id) on delete set null,
  service_match_method  text,
  matched_client_id     uuid references public.clients (id) on delete set null,
  client_match_method   text,
  proposed_department_id uuid references public.departments (id) on delete set null,
  posted_appointment_id uuid,
  exclusion_reason      text,
  excluded_by           uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (import_batch_id, source_row_number)
);

create index import_rows_batch_idx on public.import_rows (import_batch_id);
create index import_rows_batch_status_idx
  on public.import_rows (import_batch_id, processing_status);
create index import_rows_org_external_idx
  on public.import_rows (organization_id, external_appointment_id);
create index import_rows_row_hash_idx on public.import_rows (organization_id, row_hash);

create trigger import_rows_set_updated_at
  before update on public.import_rows
  for each row execute function app.set_updated_at();

-- Original row evidence is immutable; rows locked once posted; rows cannot
-- change while their batch is approved (approval must be revoked first).
create or replace function app.protect_import_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_batch_status text;
begin
  if new.original_row is distinct from old.original_row
     or new.source_row_number is distinct from old.source_row_number
     or new.row_hash is distinct from old.row_hash
     or new.import_batch_id is distinct from old.import_batch_id then
    raise exception 'import_row_original_immutable' using errcode = '42501';
  end if;
  if old.processing_status = 'posted'
     and new.processing_status is distinct from old.processing_status then
    raise exception 'posted_import_row_immutable' using errcode = '42501';
  end if;
  select b.status into v_batch_status
  from public.import_batches b where b.id = old.import_batch_id;
  if v_batch_status = 'approved' and new.posted_appointment_id is null then
    raise exception 'batch_approved_rows_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger import_rows_protect
  before update on public.import_rows
  for each row execute function app.protect_import_row();

-- ----------------------------------------------------------------------------
-- import_row_issues — explicit, per-row issues with severity + resolution.
-- ----------------------------------------------------------------------------
create table public.import_row_issues (
  id                uuid primary key default gen_random_uuid(),
  import_row_id     uuid not null references public.import_rows (id) on delete cascade,
  import_batch_id   uuid not null references public.import_batches (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  code              text not null,
  severity          text not null check (severity in ('blocking', 'warning', 'info')),
  field             text,
  message           text not null,
  original_value    text,
  suggested_action  text,
  resolution_status text not null default 'open' check (resolution_status in (
    'open', 'resolved', 'waived', 'accepted'
  )),
  resolved_by       uuid references public.profiles (id) on delete set null,
  resolved_at       timestamptz,
  resolution_note   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index import_row_issues_row_idx on public.import_row_issues (import_row_id);
create index import_row_issues_batch_sev_idx
  on public.import_row_issues (import_batch_id, severity, resolution_status);
create index import_row_issues_batch_code_idx
  on public.import_row_issues (import_batch_id, code);

create trigger import_row_issues_set_updated_at
  before update on public.import_row_issues
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- import_resolutions — append-only log of every human decision.
-- ----------------------------------------------------------------------------
create table public.import_resolutions (
  id                 uuid primary key default gen_random_uuid(),
  import_batch_id    uuid not null references public.import_batches (id) on delete cascade,
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  import_row_id      uuid references public.import_rows (id) on delete cascade,
  action             text not null,
  payload            jsonb not null default '{}'::jsonb,
  affected_row_count int not null default 1,
  actor_id           uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);

create index import_resolutions_batch_idx on public.import_resolutions (import_batch_id);

-- ----------------------------------------------------------------------------
-- import_batch_events — append-only state-transition history.
-- ----------------------------------------------------------------------------
create table public.import_batch_events (
  id              uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  from_status     text,
  to_status       text not null,
  actor_id        uuid references public.profiles (id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now()
);

create index import_batch_events_batch_idx on public.import_batch_events (import_batch_id);

-- ----------------------------------------------------------------------------
-- New permissions (additive) + intentional role grants.
-- High-risk permissions are NOT granted to every role.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('import:upload',   'Upload import files'),
  ('import:resolve',  'Resolve import review issues and mappings'),
  ('import:post',     'Post approved import batches to the ledger'),
  ('import:reverse',  'Reverse posted import batches'),
  ('import:download', 'Download original uploaded import files'),
  ('appointment:read', 'View posted appointments'),
  ('appointment:correct', 'Create posted-appointment corrections')
on conflict (key) do nothing;

with grants(role_key, permission_key) as (
  values
  ('platform_admin', 'import:upload'), ('platform_admin', 'import:resolve'),
  ('platform_admin', 'import:post'), ('platform_admin', 'import:reverse'),
  ('platform_admin', 'import:download'),
  ('platform_admin', 'appointment:read'), ('platform_admin', 'appointment:correct'),
  ('workspace_admin', 'import:upload'), ('workspace_admin', 'import:resolve'),
  ('workspace_admin', 'import:post'), ('workspace_admin', 'import:reverse'),
  ('workspace_admin', 'import:download'),
  ('workspace_admin', 'appointment:read'), ('workspace_admin', 'appointment:correct'),
  ('payroll_manager', 'import:upload'), ('payroll_manager', 'import:resolve'),
  ('payroll_manager', 'import:post'), ('payroll_manager', 'import:download'),
  ('payroll_manager', 'appointment:read'), ('payroll_manager', 'appointment:correct'),
  -- department managers: view appointments (RLS narrows to departments); no import admin
  ('department_manager', 'appointment:read'),
  -- viewers: read-only posted appointments
  ('viewer', 'appointment:read')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.key = g.role_key
join public.permissions p on p.key = g.permission_key
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS — import domain. No broad UPDATE policies; specific permissions per op.
-- ----------------------------------------------------------------------------
alter table public.import_batches enable row level security;
alter table public.import_batches force row level security;
alter table public.import_schema_profiles enable row level security;
alter table public.import_schema_profiles force row level security;
alter table public.import_rows enable row level security;
alter table public.import_rows force row level security;
alter table public.import_row_issues enable row level security;
alter table public.import_row_issues force row level security;
alter table public.import_resolutions enable row level security;
alter table public.import_resolutions force row level security;
alter table public.import_batch_events enable row level security;
alter table public.import_batch_events force row level security;

create policy import_batches_select on public.import_batches
  for select to authenticated
  using (app.has_permission_in(organization_id, 'import:read'));
create policy import_batches_insert on public.import_batches
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'import:upload')
    and uploaded_by = (select auth.uid())
  );
create policy import_batches_update on public.import_batches
  for update to authenticated
  using (app.has_permission_in(organization_id, 'import:manage'))
  with check (app.has_permission_in(organization_id, 'import:manage'));
-- no delete policy: batches are evidence.

create policy import_schema_profiles_select on public.import_schema_profiles
  for select to authenticated
  using (app.has_permission_in(organization_id, 'import:read'));
create policy import_schema_profiles_insert on public.import_schema_profiles
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'import:manage'));

create policy import_rows_select on public.import_rows
  for select to authenticated
  using (app.has_permission_in(organization_id, 'import:read'));
create policy import_rows_insert on public.import_rows
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'import:upload'));
create policy import_rows_update on public.import_rows
  for update to authenticated
  using (app.has_permission_in(organization_id, 'import:resolve'))
  with check (app.has_permission_in(organization_id, 'import:resolve'));

create policy import_row_issues_select on public.import_row_issues
  for select to authenticated
  using (app.has_permission_in(organization_id, 'import:read'));
create policy import_row_issues_insert on public.import_row_issues
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'import:upload'));
create policy import_row_issues_update on public.import_row_issues
  for update to authenticated
  using (app.has_permission_in(organization_id, 'import:resolve'))
  with check (app.has_permission_in(organization_id, 'import:resolve'));

create policy import_resolutions_select on public.import_resolutions
  for select to authenticated
  using (app.has_permission_in(organization_id, 'import:read'));
create policy import_resolutions_insert on public.import_resolutions
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'import:resolve')
    and actor_id = (select auth.uid())
  );
-- append-only: no update/delete policies.

create policy import_batch_events_select on public.import_batch_events
  for select to authenticated
  using (app.has_permission_in(organization_id, 'import:read'));
create policy import_batch_events_insert on public.import_batch_events
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'import:manage'));
-- append-only: no update/delete policies.

-- ----------------------------------------------------------------------------
-- Private storage bucket for original files. Signed URLs only; access via
-- org-scoped policies keyed on the first path segment (organization id).
-- Path scheme: organization_id/year/month/import_batch_id/original_filename
-- No update/delete policies: originals are evidence (retention unresolved).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'performance-operations-imports',
  'performance-operations-imports',
  false,
  10485760, -- 10 MB
  array['text/csv', 'application/vnd.ms-excel', 'text/plain']
)
on conflict (id) do nothing;

create policy import_files_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'performance-operations-imports'
    and app.has_permission_in(((storage.foldername(name))[1])::uuid, 'import:upload')
  );

create policy import_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'performance-operations-imports'
    and app.has_permission_in(((storage.foldername(name))[1])::uuid, 'import:download')
  );
