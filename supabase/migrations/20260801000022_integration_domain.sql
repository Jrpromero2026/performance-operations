-- ============================================================================
-- Performance Operations — Phase 8, Migration 22: integration domain
--
-- Provider-neutral integration framework: provider catalog, connection
-- lifecycle, credential references (secrets live in Supabase Vault, NEVER
-- in application tables), sync definitions/runs/cursors, immutable source
-- evidence, webhook endpoints/events, and failure classification.
--
-- Architectural invariant: integrations produce SOURCE EVIDENCE that flows
-- through the EXISTING import pipeline (staging → matching → review →
-- approval → posting). Nothing in this domain writes to canonical
-- appointments; auto-approve and auto-post are CHECK-constrained OFF.
-- ============================================================================

-- ---------------------------------------------------------- permissions
insert into public.permissions (key, description) values
  ('integration:read',               'View integration connections, runs, and health'),
  ('integration:create',             'Create integration connections'),
  ('integration:update',             'Update integration connections and sync definitions'),
  ('integration:disable',            'Disable or re-enable integration connections'),
  ('integration:manage_credentials', 'Submit, rotate, and revoke provider credentials'),
  ('integration:sync',               'Trigger synchronization runs'),
  ('integration:reset_cursor',       'Reset synchronization cursors (elevated)'),
  ('integration:view_failures',      'View integration failure details'),
  ('job:read',                       'View background jobs'),
  ('job:retry',                      'Retry failed background jobs'),
  ('job:cancel',                     'Cancel queued background jobs'),
  ('job:manage_dead_letter',         'Requeue or resolve dead-letter jobs'),
  ('scheduled_report:execute',       'Enable and run scheduled report execution'),
  ('report_delivery:read',           'View report delivery status'),
  ('report_delivery:manage',         'Manage delivery channels and definitions'),
  ('report_delivery:retry',          'Retry failed report deliveries'),
  ('email_policy:manage',            'Manage organization email delivery policies')
on conflict (key) do nothing;

-- Role matrix (documented in docs/AUTHORIZATION_MODEL.md):
--   platform_admin   → everything
--   workspace_admin  → org-scoped integration + automation (incl. creds)
--   payroll_manager  → report schedules/deliveries + job visibility;
--                      NO provider credential access
--   department_manager → read own-scope delivery status only
--   trainer/viewer   → none
with grants(role_key, permission_key) as (
  values
  ('platform_admin','integration:read'),('platform_admin','integration:create'),
  ('platform_admin','integration:update'),('platform_admin','integration:disable'),
  ('platform_admin','integration:manage_credentials'),('platform_admin','integration:sync'),
  ('platform_admin','integration:reset_cursor'),('platform_admin','integration:view_failures'),
  ('platform_admin','job:read'),('platform_admin','job:retry'),
  ('platform_admin','job:cancel'),('platform_admin','job:manage_dead_letter'),
  ('platform_admin','scheduled_report:execute'),('platform_admin','report_delivery:read'),
  ('platform_admin','report_delivery:manage'),('platform_admin','report_delivery:retry'),
  ('platform_admin','email_policy:manage'),
  ('workspace_admin','integration:read'),('workspace_admin','integration:create'),
  ('workspace_admin','integration:update'),('workspace_admin','integration:disable'),
  ('workspace_admin','integration:manage_credentials'),('workspace_admin','integration:sync'),
  ('workspace_admin','integration:view_failures'),
  ('workspace_admin','job:read'),('workspace_admin','job:retry'),
  ('workspace_admin','job:cancel'),('workspace_admin','job:manage_dead_letter'),
  ('workspace_admin','scheduled_report:execute'),('workspace_admin','report_delivery:read'),
  ('workspace_admin','report_delivery:manage'),('workspace_admin','report_delivery:retry'),
  ('workspace_admin','email_policy:manage'),
  ('payroll_manager','integration:read'),
  ('payroll_manager','job:read'),
  ('payroll_manager','scheduled_report:execute'),
  ('payroll_manager','report_delivery:read'),('payroll_manager','report_delivery:retry'),
  ('department_manager','report_delivery:read')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.key = g.role_key
join public.permissions p on p.key = g.permission_key
on conflict do nothing;

-- ------------------------------------------------------- provider catalog
-- Code-driven reference data: adapters live in src/lib/integrations;
-- this table records status + verified capability matrix per provider.
create table public.integration_providers (
  key              text primary key,
  display_name     text not null,
  status           text not null default 'blocked'
                   check (status in ('available', 'blocked', 'deprecated')),
  adapter_version  text,
  docs_url         text,
  docs_inspected_on date,
  capabilities     jsonb not null default '{}'::jsonb,
  blocked_reasons  jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger integration_providers_set_updated_at
  before update on public.integration_providers
  for each row execute function app.set_updated_at();

insert into public.integration_providers
  (key, display_name, status, adapter_version, docs_url, docs_inspected_on,
   capabilities, blocked_reasons)
values
  ('setmore_api', 'Setmore (API)', 'blocked', null,
   'https://setmore.docs.apiary.io/', '2026-07-29',
   '{"auth":"oauth2_refresh_token","appointments_by_date":true,"cursor_pagination":true,"max_page":150,"staff":true,"services":true,"customers":"search_only","modified_since":false,"webhooks":false,"status_field":false,"rate_limits":"unspecified"}',
   '["No credentials: limited-beta access requires an approved application from the org''s Setmore Pro account","No appointment status field documented in the API (label only) — canonical status mapping unverifiable","Recurring-series occurrence identity unverified (Phase 3 CSV finding: booking id = series)","Cost unit (cents vs dollars) ambiguous in official examples"]'),
  ('acuity_api', 'Acuity Scheduling (API)', 'blocked', null,
   'https://developers.acuityscheduling.com/reference', '2026-07-29',
   '{"auth":"http_basic_user_id_api_key","appointments_by_date":true,"canceled_visible":true,"pagination":"max_plus_date_windows","max_default":100,"calendars":true,"appointment_types":true,"clients":true,"modified_since":false,"webhooks":{"events":["appointment.scheduled","appointment.rescheduled","appointment.canceled","appointment.changed"],"signature":"hmac_sha256_base64_x_acuity_signature"},"rate_limits":"undocumented"}',
   '["No account credentials available","No representative sample data (Phase 3 blocker persists)","Status semantics / identifier stability / calendar-trainer / type-service models unconfirmed for this business"]'),
  ('test_provider', 'Test Provider (synthetic)', 'available', 'test-v1', null, '2026-07-29',
   '{"auth":"synthetic","appointments_by_date":true,"cursor_pagination":true,"max_page":50,"staff":false,"services":false,"clients":false,"modified_since":true,"webhooks":true,"purpose":"framework verification only — never a real external system"}',
   '[]');

-- No insert/update/delete policies: catalog managed by migrations only.
alter table public.integration_providers enable row level security;
alter table public.integration_providers force row level security;
create policy integration_providers_select on public.integration_providers
  for select to authenticated using (true);

-- ---------------------------------------------------------- connections
-- Credentials NEVER live here: secret_ref points into Supabase Vault;
-- only a safe fingerprint + rotation metadata are stored.
create table public.integration_connections (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  provider_key          text not null references public.integration_providers (key),
  name                  text not null,
  status                text not null default 'draft' check (status in (
    'draft', 'awaiting_credentials', 'validating', 'active',
    'degraded', 'disabled', 'revoked', 'failed'
  )),
  capabilities          jsonb not null default '{}'::jsonb,
  secret_ref            uuid,
  secret_fingerprint    text,
  secret_version        int not null default 0,
  secret_rotated_at     timestamptz,
  last_health_check_at  timestamptz,
  last_health_status    text,
  failure_reason        text,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, provider_key, name)
);
create index integration_connections_org_idx
  on public.integration_connections (organization_id, status);
create trigger integration_connections_set_updated_at
  before update on public.integration_connections
  for each row execute function app.set_updated_at();

-- Connection lifecycle, DB-enforced.
create or replace function app.integration_connection_guard()
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
    when 'draft'                then new.status in ('awaiting_credentials', 'disabled')
    when 'awaiting_credentials' then new.status in ('validating', 'disabled')
    when 'validating'           then new.status in ('active', 'failed', 'awaiting_credentials')
    when 'active'               then new.status in ('degraded', 'disabled', 'revoked', 'failed', 'validating')
    when 'degraded'             then new.status in ('active', 'disabled', 'revoked', 'failed', 'validating')
    when 'disabled'             then new.status in ('validating', 'revoked', 'awaiting_credentials')
    when 'failed'               then new.status in ('validating', 'disabled', 'revoked', 'awaiting_credentials')
    when 'revoked'              then new.status in ('awaiting_credentials')
    else false
  end;
  if not allowed then
    raise exception 'invalid_connection_transition_%_to_%', old.status, new.status
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger integration_connections_guard
  before update on public.integration_connections
  for each row execute function app.integration_connection_guard();

-- ------------------------------------------------------ sync definitions
-- Auto-approve and auto-post are CHECK-constrained false: enabling them is
-- an explicit FUTURE policy decision requiring a migration, exactly like
-- scheduled-report execution was in Phase 7.
create table public.integration_sync_definitions (
  id                  uuid primary key default gen_random_uuid(),
  connection_id       uuid not null references public.integration_connections (id) on delete cascade,
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  department_id       uuid references public.departments (id) on delete restrict,
  data_type           text not null default 'appointments' check (data_type in (
    'appointments', 'staff', 'services', 'clients'
  )),
  window_strategy     text not null default 'trailing_days'
                      check (window_strategy in ('trailing_days', 'fixed_range', 'since_cursor')),
  window_days         int not null default 30 check (window_days between 1 and 366),
  window_start        date,
  window_end          date,
  mode                text not null default 'incremental' check (mode in ('incremental', 'full')),
  frequency           text not null default 'manual' check (frequency in (
    'manual', 'hourly', 'daily', 'weekly'
  )),
  timezone            text not null default 'America/Los_Angeles',
  active              boolean not null default true,
  auto_create_batch   boolean not null default true,
  auto_parse          boolean not null default true,
  auto_validate       boolean not null default true,
  auto_approve        boolean not null default false check (auto_approve = false),
  auto_post           boolean not null default false check (auto_post = false),
  owner_id            uuid references public.profiles (id) on delete set null,
  last_successful_run_at timestamptz,
  next_intended_run_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index integration_sync_definitions_conn_idx
  on public.integration_sync_definitions (connection_id);
create trigger integration_sync_definitions_set_updated_at
  before update on public.integration_sync_definitions
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------ sync runs
create table public.integration_sync_runs (
  id                  uuid primary key default gen_random_uuid(),
  connection_id       uuid not null references public.integration_connections (id) on delete restrict,
  definition_id       uuid references public.integration_sync_definitions (id) on delete set null,
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  trigger_source      text not null default 'manual' check (trigger_source in (
    'manual', 'schedule', 'webhook', 'retry'
  )),
  status              text not null default 'running' check (status in (
    'running', 'succeeded', 'partial', 'failed'
  )),
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  cursor_before       text,
  cursor_after        text,
  requested_window    jsonb not null default '{}'::jsonb,
  pages_fetched       int not null default 0,
  records_fetched     int not null default 0,
  records_accepted    int not null default 0,
  records_rejected    int not null default 0,
  records_unchanged   int not null default 0,
  import_batch_id     uuid references public.import_batches (id) on delete set null,
  rate_limit_state    jsonb not null default '{}'::jsonb,
  warnings            jsonb not null default '[]'::jsonb,
  failure_code        text,
  failure_message     text,
  retry_count         int not null default 0,
  correlation_id      uuid not null default gen_random_uuid(),
  job_id              uuid,
  created_at          timestamptz not null default now()
);
create index integration_sync_runs_conn_idx
  on public.integration_sync_runs (connection_id, started_at desc);
create index integration_sync_runs_org_idx
  on public.integration_sync_runs (organization_id, status);

-- ---------------------------------------------------- source evidence
-- Immutable raw provider records: the API-era equivalent of the original
-- uploaded file. Content-addressed uniqueness makes re-fetching the same
-- page idempotent (same payload → conflict-ignored).
create table public.integration_source_records (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  connection_id     uuid not null references public.integration_connections (id) on delete restrict,
  sync_run_id       uuid references public.integration_sync_runs (id) on delete set null,
  data_type         text not null,
  external_id       text not null,
  source_updated_at timestamptz,
  payload           jsonb not null,
  payload_sha256    text not null,
  received_at       timestamptz not null default now(),
  unique (connection_id, data_type, external_id, payload_sha256)
);
create index integration_source_records_conn_idx
  on public.integration_source_records (connection_id, data_type, external_id);

create or replace function app.protect_source_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'source_record_immutable' using errcode = '42501';
end;
$$;
create trigger integration_source_records_protect
  before update or delete on public.integration_source_records
  for each row execute function app.protect_source_record();

-- -------------------------------------------------------------- cursors
create table public.integration_cursors (
  id              uuid primary key default gen_random_uuid(),
  connection_id   uuid not null references public.integration_connections (id) on delete cascade,
  definition_id   uuid not null references public.integration_sync_definitions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  data_type       text not null,
  cursor_value    text,
  previous_value  text,
  advanced_at     timestamptz,
  reset_by        uuid references public.profiles (id) on delete set null,
  reset_reason    text,
  updated_at      timestamptz not null default now(),
  unique (definition_id, data_type)
);
create trigger integration_cursors_set_updated_at
  before update on public.integration_cursors
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------- webhooks
-- Endpoint identity is an unguessable token; only its sha256 is stored
-- (invitation pattern). Signature secrets live in Vault via secret_ref.
create table public.integration_webhook_endpoints (
  id              uuid primary key default gen_random_uuid(),
  connection_id   uuid not null references public.integration_connections (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  provider_key    text not null references public.integration_providers (key),
  token_sha256    text not null unique,
  secret_ref      uuid,
  active          boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create table public.integration_webhook_events (
  id                uuid primary key default gen_random_uuid(),
  endpoint_id       uuid not null references public.integration_webhook_endpoints (id) on delete cascade,
  connection_id     uuid not null references public.integration_connections (id) on delete restrict,
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  provider_event_id text not null,
  event_type        text not null,
  payload           jsonb not null default '{}'::jsonb,
  payload_sha256    text not null,
  received_at       timestamptz not null default now(),
  status            text not null default 'received' check (status in (
    'received', 'enqueued', 'processed', 'rejected', 'duplicate'
  )),
  rejection_reason  text,
  job_id            uuid,
  unique (endpoint_id, provider_event_id)
);
create index integration_webhook_events_conn_idx
  on public.integration_webhook_events (connection_id, received_at desc);

-- -------------------------------------------------------------- failures
create table public.integration_failures (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  provider_key    text not null,
  connection_id   uuid references public.integration_connections (id) on delete cascade,
  job_id          uuid,
  failure_code    text not null,
  retryable       boolean not null default false,
  message         text not null default '',
  recommended_action text not null default '',
  correlation_id  uuid,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  attempt_count   int not null default 1,
  resolved        boolean not null default false,
  resolved_at     timestamptz,
  unique (connection_id, failure_code)
);
create index integration_failures_org_idx
  on public.integration_failures (organization_id, resolved);

-- --------------------------------------- import_batches: integration link
alter table public.import_batches
  add column created_via text not null default 'manual'
    check (created_via in ('manual', 'integration')),
  add column integration_connection_id uuid
    references public.integration_connections (id) on delete set null,
  add column integration_sync_run_id uuid
    references public.integration_sync_runs (id) on delete set null;

alter table public.import_batches drop constraint import_batches_source_check;
alter table public.import_batches add constraint import_batches_source_check
  check (source in ('setmore', 'acuity', 'manual_csv', 'integration_test'));

-- ------------------------------------------------- credential management
-- Secrets are stored in Supabase Vault (authenticated-encrypted at rest);
-- application tables carry only the Vault id + a safe fingerprint.
-- store/rotate are permission-checked definer functions returning the
-- fingerprint ONLY; retrieval is service_role-exclusive (the worker's
-- server-side path) — an authenticated browser session can NEVER read a
-- secret back.
create or replace function app.store_connection_secret(
  p_connection_id uuid,
  p_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conn public.integration_connections%rowtype;
  v_secret_id uuid;
  v_fingerprint text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_secret is null or length(p_secret) < 8 then
    raise exception 'secret_too_short' using errcode = 'P0001';
  end if;
  select * into v_conn from public.integration_connections
  where id = p_connection_id for update;
  if v_conn.id is null then
    raise exception 'connection_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_conn.organization_id, 'integration:manage_credentials') then
    raise exception 'not_authorized_to_manage_credentials' using errcode = '42501';
  end if;
  if v_conn.status not in ('draft', 'awaiting_credentials', 'revoked', 'failed', 'disabled') then
    raise exception 'connection_not_awaiting_credentials' using errcode = 'P0003';
  end if;

  -- Safe fingerprint: sha256 prefix + last 4 characters (never the value).
  v_fingerprint := left(encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'), 12)
                   || '…' || right(p_secret, 4);

  if v_conn.secret_ref is not null then
    perform vault.update_secret(v_conn.secret_ref, p_secret);
    v_secret_id := v_conn.secret_ref;
  else
    v_secret_id := vault.create_secret(
      p_secret,
      'integration_connection:' || v_conn.id,
      'Provider credential for integration connection ' || v_conn.id);
  end if;

  update public.integration_connections
  set secret_ref = v_secret_id,
      secret_fingerprint = v_fingerprint,
      secret_version = v_conn.secret_version + 1,
      secret_rotated_at = now(),
      status = case when status = 'draft' then 'awaiting_credentials' else status end
  where id = v_conn.id;

  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_conn.organization_id, v_uid, 'integration_connection', v_conn.id,
          case when v_conn.secret_version = 0 then 'integration_credentials_submitted'
               else 'integration_credentials_rotated' end,
          jsonb_build_object('secret_version', v_conn.secret_version + 1,
                             'fingerprint', v_fingerprint));

  return jsonb_build_object(
    'fingerprint', v_fingerprint,
    'secret_version', v_conn.secret_version + 1);
end;
$$;
revoke all on function app.store_connection_secret(uuid, text) from public;
grant execute on function app.store_connection_secret(uuid, text) to authenticated;

create or replace function app.revoke_connection_secret(p_connection_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conn public.integration_connections%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'revoke_reason_required' using errcode = 'P0001';
  end if;
  select * into v_conn from public.integration_connections
  where id = p_connection_id for update;
  if v_conn.id is null then
    raise exception 'connection_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_conn.organization_id, 'integration:manage_credentials') then
    raise exception 'not_authorized_to_manage_credentials' using errcode = '42501';
  end if;
  if v_conn.secret_ref is not null then
    delete from vault.secrets where id = v_conn.secret_ref;
  end if;
  update public.integration_connections
  set secret_ref = null,
      secret_fingerprint = null,
      status = 'revoked',
      failure_reason = 'credentials_revoked'
  where id = v_conn.id;
  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_conn.organization_id, v_uid, 'integration_connection', v_conn.id,
          'integration_credentials_revoked', jsonb_build_object('reason', p_reason));
end;
$$;
revoke all on function app.revoke_connection_secret(uuid, text) from public;
grant execute on function app.revoke_connection_secret(uuid, text) to authenticated;

-- Server-side retrieval: SERVICE ROLE ONLY. Browsers (authenticated role)
-- can never call this; the worker uses it when executing provider jobs.
create or replace function app.get_connection_secret(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn public.integration_connections%rowtype;
  v_secret text;
begin
  select * into v_conn from public.integration_connections where id = p_connection_id;
  if v_conn.id is null or v_conn.secret_ref is null then
    raise exception 'secret_not_found' using errcode = 'P0002';
  end if;
  if v_conn.status = 'revoked' then
    raise exception 'credentials_revoked' using errcode = '42501';
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where id = v_conn.secret_ref;
  return v_secret;
end;
$$;
revoke all on function app.get_connection_secret(uuid) from public;
grant execute on function app.get_connection_secret(uuid) to service_role;

-- Public wrappers for the credential functions callable from PostgREST.
create or replace function public.store_connection_secret(p_connection_id uuid, p_secret text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.store_connection_secret(p_connection_id, p_secret); $$;
revoke all on function public.store_connection_secret(uuid, text) from public;
grant execute on function public.store_connection_secret(uuid, text) to authenticated;

create or replace function public.revoke_connection_secret(p_connection_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select app.revoke_connection_secret(p_connection_id, p_reason); $$;
revoke all on function public.revoke_connection_secret(uuid, text) from public;
grant execute on function public.revoke_connection_secret(uuid, text) to authenticated;

-- ------------------------------------------------------------------- RLS
alter table public.integration_connections enable row level security;
alter table public.integration_connections force row level security;
alter table public.integration_sync_definitions enable row level security;
alter table public.integration_sync_definitions force row level security;
alter table public.integration_sync_runs enable row level security;
alter table public.integration_sync_runs force row level security;
alter table public.integration_source_records enable row level security;
alter table public.integration_source_records force row level security;
alter table public.integration_cursors enable row level security;
alter table public.integration_cursors force row level security;
alter table public.integration_webhook_endpoints enable row level security;
alter table public.integration_webhook_endpoints force row level security;
alter table public.integration_webhook_events enable row level security;
alter table public.integration_webhook_events force row level security;
alter table public.integration_failures enable row level security;
alter table public.integration_failures force row level security;

create policy integration_connections_select on public.integration_connections
  for select to authenticated
  using (app.has_permission_in(organization_id, 'integration:read'));
create policy integration_connections_insert on public.integration_connections
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'integration:create')
    and created_by = (select auth.uid())
  );
create policy integration_connections_update on public.integration_connections
  for update to authenticated
  using (app.has_permission_in(organization_id, 'integration:update'))
  with check (app.has_permission_in(organization_id, 'integration:update'));

create policy integration_sync_definitions_select on public.integration_sync_definitions
  for select to authenticated
  using (app.has_permission_in(organization_id, 'integration:read'));
create policy integration_sync_definitions_write on public.integration_sync_definitions
  for all to authenticated
  using (app.has_permission_in(organization_id, 'integration:update'))
  with check (app.has_permission_in(organization_id, 'integration:update'));

create policy integration_sync_runs_select on public.integration_sync_runs
  for select to authenticated
  using (app.has_permission_in(organization_id, 'integration:read'));
create policy integration_sync_runs_insert on public.integration_sync_runs
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'integration:sync'));
create policy integration_sync_runs_update on public.integration_sync_runs
  for update to authenticated
  using (app.has_permission_in(organization_id, 'integration:sync'))
  with check (app.has_permission_in(organization_id, 'integration:sync'));

create policy integration_source_records_select on public.integration_source_records
  for select to authenticated
  using (app.has_permission_in(organization_id, 'integration:read'));
create policy integration_source_records_insert on public.integration_source_records
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'integration:sync'));

create policy integration_cursors_select on public.integration_cursors
  for select to authenticated
  using (app.has_permission_in(organization_id, 'integration:read'));
create policy integration_cursors_write on public.integration_cursors
  for all to authenticated
  using (app.has_permission_in(organization_id, 'integration:sync'))
  with check (app.has_permission_in(organization_id, 'integration:sync'));

create policy integration_webhook_endpoints_select on public.integration_webhook_endpoints
  for select to authenticated
  using (app.has_permission_in(organization_id, 'integration:read'));
create policy integration_webhook_endpoints_write on public.integration_webhook_endpoints
  for all to authenticated
  using (app.has_permission_in(organization_id, 'integration:update'))
  with check (app.has_permission_in(organization_id, 'integration:update'));

create policy integration_webhook_events_select on public.integration_webhook_events
  for select to authenticated
  using (app.has_permission_in(organization_id, 'integration:read'));
create policy integration_webhook_events_insert on public.integration_webhook_events
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'integration:sync'));
create policy integration_webhook_events_update on public.integration_webhook_events
  for update to authenticated
  using (app.has_permission_in(organization_id, 'integration:sync'))
  with check (app.has_permission_in(organization_id, 'integration:sync'));

create policy integration_failures_select on public.integration_failures
  for select to authenticated
  using (app.has_permission_in(organization_id, 'integration:view_failures'));
create policy integration_failures_write on public.integration_failures
  for all to authenticated
  using (app.has_permission_in(organization_id, 'integration:sync'))
  with check (app.has_permission_in(organization_id, 'integration:sync'));
