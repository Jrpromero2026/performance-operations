-- ============================================================================
-- Performance Operations — Phase 8, Migration 23: background jobs + delivery
--
-- Minimal production-oriented job system (atomic claim via FOR UPDATE SKIP
-- LOCKED, lease recovery, exponential backoff with bounded jitter,
-- dead-letter), scheduled-report execution runs (DB-enforced one execution
-- per intended occurrence), delivery channels, and email delivery events.
--
-- Enables scheduled-report execution: the Phase 7 CHECK
-- (execution_enabled = false) is dropped now that a controlled worker
-- exists. Execution remains off per definition until explicitly enabled by
-- a scheduled_report:execute holder.
-- ============================================================================

-- ------------------------------------------------------- background jobs
create table public.background_jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  job_type         text not null check (job_type in (
    'connection_validation', 'appointment_sync', 'metadata_sync',
    'scheduled_report_generation', 'report_email_delivery',
    'notification_email_delivery', 'webhook_processing', 'cleanup'
  )),
  status           text not null default 'queued' check (status in (
    'queued', 'claimed', 'running', 'succeeded', 'retryable_failed',
    'permanently_failed', 'cancelled', 'dead_lettered'
  )),
  payload          jsonb not null default '{}'::jsonb,
  payload_version  int not null default 1,
  idempotency_key  text not null unique,
  scheduled_for    timestamptz not null default now(),
  available_at     timestamptz not null default now(),
  claimed_by       text,
  claimed_at       timestamptz,
  lease_expires_at timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  attempt_count    int not null default 0,
  max_attempts     int not null default 5 check (max_attempts between 1 and 20),
  last_error_code  text,
  last_error       text,
  result           jsonb,
  parent_job_id    uuid references public.background_jobs (id) on delete set null,
  correlation_id   uuid not null default gen_random_uuid(),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index background_jobs_claimable_idx
  on public.background_jobs (available_at)
  where status in ('queued', 'retryable_failed');
create index background_jobs_org_idx
  on public.background_jobs (organization_id, status, created_at desc);

create table public.background_job_attempts (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.background_jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  attempt_number int not null,
  worker_id      text not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  outcome        text check (outcome in ('succeeded', 'retryable_failed', 'permanently_failed', 'lease_expired')),
  error_code     text,
  error_message  text,
  unique (job_id, attempt_number)
);
create index background_job_attempts_job_idx on public.background_job_attempts (job_id);

-- ------------------------------------------------------ delivery channels
create table public.delivery_channels (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  channel_type     text not null default 'email' check (channel_type in ('email')),
  provider         text not null default 'none_configured' check (provider in (
    'none_configured', 'test', 'resend', 'postmark', 'ses', 'smtp'
  )),
  status           text not null default 'unconfigured' check (status in (
    'unconfigured', 'test_mode', 'active', 'disabled'
  )),
  sender_address   text,
  sender_name      text,
  config           jsonb not null default '{}'::jsonb,
  secret_ref       uuid,
  allow_external_recipients boolean not null default false,
  allow_trainer_statements  boolean not null default false,
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, channel_type)
);
create trigger delivery_channels_set_updated_at
  before update on public.delivery_channels
  for each row execute function app.set_updated_at();

-- A channel that is not 'test'/'active' can never claim real delivery:
-- provider 'none_configured' may only be 'unconfigured' or 'disabled'.
alter table public.delivery_channels add constraint delivery_channels_provider_status_chk
  check (provider <> 'none_configured' or status in ('unconfigured', 'disabled'));

-- ------------------------------------------------ scheduled report runs
-- One execution per intended occurrence, DATABASE-enforced.
create table public.scheduled_report_runs (
  id                uuid primary key default gen_random_uuid(),
  definition_id     uuid not null references public.scheduled_report_definitions (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  intended_run_at   timestamptz not null,
  trigger_source    text not null default 'schedule' check (trigger_source in ('schedule', 'manual')),
  status            text not null default 'queued' check (status in (
    'queued', 'running', 'succeeded', 'failed', 'skipped'
  )),
  job_id            uuid references public.background_jobs (id) on delete set null,
  report_package_id uuid references public.report_packages (id) on delete set null,
  export_event_id   uuid,
  artifact          jsonb not null default '{}'::jsonb,
  is_final          boolean not null default false,
  failure_code      text,
  failure_message   text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (definition_id, intended_run_at)
);
create index scheduled_report_runs_org_idx
  on public.scheduled_report_runs (organization_id, created_at desc);

-- Drop the Phase 7 hard-off constraint: a controlled worker now exists.
-- Per-definition execution stays opt-in (default false) and is toggled
-- only through the scheduled_report:execute permission.
alter table public.scheduled_report_definitions
  drop constraint scheduled_report_definitions_execution_enabled_check;

-- --------------------------------------------------- email delivery events
create table public.email_delivery_events (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  channel_id         uuid references public.delivery_channels (id) on delete set null,
  scheduled_report_run_id uuid references public.scheduled_report_runs (id) on delete set null,
  job_id             uuid references public.background_jobs (id) on delete set null,
  recipient_email    text not null,
  recipient_type     text not null default 'user' check (recipient_type in ('user', 'trainer', 'external')),
  recipient_profile_id uuid references public.profiles (id) on delete set null,
  template_key       text not null,
  subject            text not null,
  artifact_type      text,
  artifact_id        uuid,
  artifact_sha256    text,
  status             text not null default 'pending' check (status in (
    'pending', 'sending', 'delivered_to_provider', 'accepted', 'delivered',
    'deferred', 'bounced', 'rejected', 'failed', 'cancelled'
  )),
  provider           text not null default 'none_configured',
  provider_message_id text,
  attempt_count      int not null default 0,
  last_error         text,
  idempotency_key    text not null unique,
  sent_at            timestamptz,
  finalized_at       timestamptz,
  created_at         timestamptz not null default now()
);
create index email_delivery_events_org_idx
  on public.email_delivery_events (organization_id, status, created_at desc);
create index email_delivery_events_recipient_idx
  on public.email_delivery_events (recipient_profile_id);

-- Completed delivery evidence is immutable; live rows may only move
-- forward through the lifecycle.
create or replace function app.email_delivery_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('delivered', 'bounced', 'rejected', 'failed', 'cancelled')
     and new.status is distinct from old.status then
    raise exception 'delivery_event_finalized' using errcode = '42501';
  end if;
  if new.recipient_email is distinct from old.recipient_email
     or new.idempotency_key is distinct from old.idempotency_key
     or new.artifact_id is distinct from old.artifact_id
     or new.artifact_sha256 is distinct from old.artifact_sha256
     or new.organization_id is distinct from old.organization_id then
    raise exception 'delivery_event_immutable_fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger email_delivery_events_guard
  before update on public.email_delivery_events
  for each row execute function app.email_delivery_guard();

-- ------------------------------------------------------------ job RPCs
-- Enqueue: permission-checked per job type; idempotent on idempotency_key
-- (returns the existing job id instead of raising).
create or replace function app.enqueue_background_job(
  p_organization_id uuid,
  p_job_type text,
  p_payload jsonb,
  p_idempotency_key text,
  p_scheduled_for timestamptz default now(),
  p_max_attempts int default 5,
  p_parent_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_required text;
  v_id uuid;
begin
  if v_uid is null and coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  v_required := case p_job_type
    when 'connection_validation'        then 'integration:sync'
    when 'appointment_sync'             then 'integration:sync'
    when 'metadata_sync'                then 'integration:sync'
    when 'webhook_processing'           then 'integration:sync'
    when 'scheduled_report_generation'  then 'scheduled_report:execute'
    when 'report_email_delivery'        then 'report_delivery:manage'
    when 'notification_email_delivery'  then 'report_delivery:manage'
    when 'cleanup'                      then 'integration:update'
    else null
  end;
  if v_required is null then
    raise exception 'unknown_job_type' using errcode = 'P0001';
  end if;
  if v_uid is not null and not app.has_permission_in(p_organization_id, v_required) then
    raise exception 'not_authorized_to_enqueue' using errcode = '42501';
  end if;

  insert into public.background_jobs
    (organization_id, job_type, payload, idempotency_key, scheduled_for,
     available_at, max_attempts, parent_job_id, created_by)
  values
    (p_organization_id, p_job_type, coalesce(p_payload, '{}'::jsonb),
     p_idempotency_key, p_scheduled_for, p_scheduled_for,
     p_max_attempts, p_parent_job_id, v_uid)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.background_jobs
    where idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end;
$$;
revoke all on function app.enqueue_background_job(uuid, text, jsonb, text, timestamptz, int, uuid) from public;
grant execute on function app.enqueue_background_job(uuid, text, jsonb, text, timestamptz, int, uuid) to authenticated, service_role;

-- Atomic claim: FOR UPDATE SKIP LOCKED over claimable rows — queued /
-- retryable_failed that are due, plus claimed/running rows whose lease
-- expired (crash recovery; the expired attempt is closed as lease_expired).
-- Claiming is a SYSTEM action: service_role or platform admin (dev worker).
create or replace function app.claim_background_jobs(
  p_worker_id text,
  p_limit int default 5,
  p_lease_seconds int default 300
)
returns setof public.background_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service boolean := coalesce((select auth.jwt()->>'role'), '') = 'service_role';
begin
  if not v_is_service and not app.is_platform_admin() then
    raise exception 'not_authorized_to_claim_jobs' using errcode = '42501';
  end if;
  if p_worker_id is null or length(btrim(p_worker_id)) < 3 then
    raise exception 'worker_id_required' using errcode = 'P0001';
  end if;

  return query
  with claimable as (
    select j.id
    from public.background_jobs j
    where (j.status in ('queued', 'retryable_failed') and j.available_at <= now())
       or (j.status in ('claimed', 'running') and j.lease_expires_at < now())
    order by j.available_at
    limit greatest(1, least(p_limit, 20))
    for update skip locked
  ),
  expired as (
    -- Close out the attempt of a lease-expired job before re-claiming.
    update public.background_job_attempts a
    set finished_at = now(), outcome = 'lease_expired',
        error_code = 'lease_expired',
        error_message = 'Worker lease expired before completion.'
    from public.background_jobs j
    where a.job_id = j.id
      and j.id in (select id from claimable)
      and j.status in ('claimed', 'running')
      and a.attempt_number = j.attempt_count
      and a.finished_at is null
    returning a.job_id
  )
  update public.background_jobs j
  set status = 'claimed',
      claimed_by = p_worker_id,
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 3600))),
      attempt_count = j.attempt_count + 1
  from claimable c
  where j.id = c.id
  returning j.*;
end;
$$;
revoke all on function app.claim_background_jobs(text, int, int) from public;
grant execute on function app.claim_background_jobs(text, int, int) to authenticated, service_role;

-- Mark a claimed job running (records the attempt row).
create or replace function app.start_background_job(p_job_id uuid, p_worker_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.background_jobs%rowtype;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role'
     and not app.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_job from public.background_jobs where id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'claimed' or v_job.claimed_by is distinct from p_worker_id then
    raise exception 'job_not_claimed_by_worker' using errcode = 'P0003';
  end if;
  update public.background_jobs
  set status = 'running', started_at = coalesce(started_at, now())
  where id = p_job_id;
  insert into public.background_job_attempts
    (job_id, organization_id, attempt_number, worker_id)
  values (p_job_id, v_job.organization_id, v_job.attempt_count, p_worker_id);
end;
$$;
revoke all on function app.start_background_job(uuid, text) from public;
grant execute on function app.start_background_job(uuid, text) to authenticated, service_role;

-- Complete successfully.
create or replace function app.complete_background_job(
  p_job_id uuid, p_worker_id text, p_result jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.background_jobs%rowtype;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role'
     and not app.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_job from public.background_jobs where id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'running' or v_job.claimed_by is distinct from p_worker_id then
    raise exception 'job_not_running_for_worker' using errcode = 'P0003';
  end if;
  update public.background_jobs
  set status = 'succeeded', completed_at = now(), result = p_result,
      lease_expires_at = null, last_error_code = null, last_error = null
  where id = p_job_id;
  update public.background_job_attempts
  set finished_at = now(), outcome = 'succeeded'
  where job_id = p_job_id and attempt_number = v_job.attempt_count and finished_at is null;
end;
$$;
revoke all on function app.complete_background_job(uuid, text, jsonb) from public;
grant execute on function app.complete_background_job(uuid, text, jsonb) to authenticated, service_role;

-- Fail: retryable failures back off exponentially with bounded jitter
-- (base 30 s, doubling, capped at 1 h, +0–25 % jitter); attempts beyond
-- max_attempts (or non-retryable failures) become permanently_failed.
create or replace function app.fail_background_job(
  p_job_id uuid, p_worker_id text,
  p_error_code text, p_error text, p_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.background_jobs%rowtype;
  v_status text;
  v_backoff_seconds numeric;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role'
     and not app.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_job from public.background_jobs where id = p_job_id for update;
  if v_job.id is null or v_job.status not in ('running', 'claimed')
     or v_job.claimed_by is distinct from p_worker_id then
    raise exception 'job_not_running_for_worker' using errcode = 'P0003';
  end if;

  if p_retryable and v_job.attempt_count < v_job.max_attempts then
    v_status := 'retryable_failed';
    v_backoff_seconds := least(3600, 30 * power(2, v_job.attempt_count - 1));
    v_backoff_seconds := v_backoff_seconds * (1 + random() * 0.25);
  else
    v_status := 'permanently_failed';
  end if;

  update public.background_jobs
  set status = v_status,
      available_at = case when v_status = 'retryable_failed'
                          then now() + make_interval(secs => v_backoff_seconds)
                          else available_at end,
      completed_at = case when v_status = 'permanently_failed' then now() else null end,
      lease_expires_at = null,
      last_error_code = p_error_code,
      last_error = left(coalesce(p_error, ''), 500)
  where id = p_job_id;

  update public.background_job_attempts
  set finished_at = now(),
      outcome = case when v_status = 'retryable_failed' then 'retryable_failed' else 'permanently_failed' end,
      error_code = p_error_code,
      error_message = left(coalesce(p_error, ''), 500)
  where job_id = p_job_id and attempt_number = v_job.attempt_count and finished_at is null;

  return v_status;
end;
$$;
revoke all on function app.fail_background_job(uuid, text, text, text, boolean) from public;
grant execute on function app.fail_background_job(uuid, text, text, text, boolean) to authenticated, service_role;

-- Manual operator actions — org-scoped permissions, audited.
create or replace function app.retry_background_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.background_jobs%rowtype;
begin
  select * into v_job from public.background_jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_job.organization_id, 'job:retry') then
    raise exception 'not_authorized_to_retry' using errcode = '42501';
  end if;
  if v_job.status not in ('retryable_failed', 'permanently_failed') then
    raise exception 'job_not_retryable_state' using errcode = 'P0003';
  end if;
  update public.background_jobs
  set status = 'queued', available_at = now(), lease_expires_at = null,
      claimed_by = null, claimed_at = null, completed_at = null,
      max_attempts = greatest(max_attempts, attempt_count + 1)
  where id = p_job_id;
  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_job.organization_id, v_uid, 'background_job', p_job_id, 'job_manually_retried',
          jsonb_build_object('job_type', v_job.job_type, 'attempt_count', v_job.attempt_count));
end;
$$;
revoke all on function app.retry_background_job(uuid) from public;
grant execute on function app.retry_background_job(uuid) to authenticated;

create or replace function app.cancel_background_job(p_job_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.background_jobs%rowtype;
begin
  select * into v_job from public.background_jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_job.organization_id, 'job:cancel') then
    raise exception 'not_authorized_to_cancel' using errcode = '42501';
  end if;
  if v_job.status not in ('queued', 'retryable_failed') then
    raise exception 'job_not_cancellable' using errcode = 'P0003';
  end if;
  update public.background_jobs
  set status = 'cancelled', completed_at = now(),
      last_error_code = 'cancelled', last_error = left(coalesce(p_reason, ''), 500)
  where id = p_job_id;
  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_job.organization_id, v_uid, 'background_job', p_job_id, 'job_cancelled',
          jsonb_build_object('reason', p_reason, 'job_type', v_job.job_type));
end;
$$;
revoke all on function app.cancel_background_job(uuid, text) from public;
grant execute on function app.cancel_background_job(uuid, text) to authenticated;

create or replace function app.dead_letter_background_job(p_job_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.background_jobs%rowtype;
begin
  select * into v_job from public.background_jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_job.organization_id, 'job:manage_dead_letter') then
    raise exception 'not_authorized_for_dead_letter' using errcode = '42501';
  end if;
  if v_job.status <> 'permanently_failed' then
    raise exception 'job_not_permanently_failed' using errcode = 'P0003';
  end if;
  update public.background_jobs set status = 'dead_lettered' where id = p_job_id;
  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_job.organization_id, v_uid, 'background_job', p_job_id, 'job_dead_lettered',
          jsonb_build_object('reason', p_reason, 'job_type', v_job.job_type));
end;
$$;
revoke all on function app.dead_letter_background_job(uuid, text) from public;
grant execute on function app.dead_letter_background_job(uuid, text) to authenticated;

create or replace function app.requeue_dead_letter_job(p_job_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.background_jobs%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'requeue_reason_required' using errcode = 'P0001';
  end if;
  select * into v_job from public.background_jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_job.organization_id, 'job:manage_dead_letter') then
    raise exception 'not_authorized_for_dead_letter' using errcode = '42501';
  end if;
  if v_job.status <> 'dead_lettered' then
    raise exception 'job_not_dead_lettered' using errcode = 'P0003';
  end if;
  update public.background_jobs
  set status = 'queued', available_at = now(), lease_expires_at = null,
      claimed_by = null, claimed_at = null, completed_at = null,
      max_attempts = greatest(max_attempts, attempt_count + 1)
  where id = p_job_id;
  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_job.organization_id, v_uid, 'background_job', p_job_id, 'job_requeued_from_dead_letter',
          jsonb_build_object('reason', p_reason, 'job_type', v_job.job_type));
end;
$$;
revoke all on function app.requeue_dead_letter_job(uuid, text) from public;
grant execute on function app.requeue_dead_letter_job(uuid, text) to authenticated;

-- Job state machine backstop: direct table updates cannot fabricate
-- transitions; the RPCs above are the only mutation path (no UPDATE
-- policy is granted on background_jobs), and this trigger protects
-- terminal states even from privileged sessions.
create or replace function app.background_job_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('succeeded', 'cancelled') and new.status is distinct from old.status then
    raise exception 'job_terminal' using errcode = '42501';
  end if;
  if new.idempotency_key is distinct from old.idempotency_key
     or new.organization_id is distinct from old.organization_id
     or new.job_type is distinct from old.job_type then
    raise exception 'job_identity_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger background_jobs_guard
  before update on public.background_jobs
  for each row execute function app.background_job_guard();

-- Public wrappers.
create or replace function public.enqueue_background_job(
  p_organization_id uuid, p_job_type text, p_payload jsonb,
  p_idempotency_key text, p_scheduled_for timestamptz default now(),
  p_max_attempts int default 5, p_parent_job_id uuid default null
)
returns uuid language sql security invoker set search_path = ''
as $$ select app.enqueue_background_job(p_organization_id, p_job_type, p_payload,
       p_idempotency_key, p_scheduled_for, p_max_attempts, p_parent_job_id); $$;
revoke all on function public.enqueue_background_job(uuid, text, jsonb, text, timestamptz, int, uuid) from public;
grant execute on function public.enqueue_background_job(uuid, text, jsonb, text, timestamptz, int, uuid) to authenticated, service_role;

create or replace function public.claim_background_jobs(p_worker_id text, p_limit int default 5, p_lease_seconds int default 300)
returns setof public.background_jobs language sql security invoker set search_path = ''
as $$ select * from app.claim_background_jobs(p_worker_id, p_limit, p_lease_seconds); $$;
revoke all on function public.claim_background_jobs(text, int, int) from public;
grant execute on function public.claim_background_jobs(text, int, int) to authenticated, service_role;

create or replace function public.start_background_job(p_job_id uuid, p_worker_id text)
returns void language sql security invoker set search_path = ''
as $$ select app.start_background_job(p_job_id, p_worker_id); $$;
revoke all on function public.start_background_job(uuid, text) from public;
grant execute on function public.start_background_job(uuid, text) to authenticated, service_role;

create or replace function public.complete_background_job(p_job_id uuid, p_worker_id text, p_result jsonb default null)
returns void language sql security invoker set search_path = ''
as $$ select app.complete_background_job(p_job_id, p_worker_id, p_result); $$;
revoke all on function public.complete_background_job(uuid, text, jsonb) from public;
grant execute on function public.complete_background_job(uuid, text, jsonb) to authenticated, service_role;

create or replace function public.fail_background_job(p_job_id uuid, p_worker_id text, p_error_code text, p_error text, p_retryable boolean)
returns text language sql security invoker set search_path = ''
as $$ select app.fail_background_job(p_job_id, p_worker_id, p_error_code, p_error, p_retryable); $$;
revoke all on function public.fail_background_job(uuid, text, text, text, boolean) from public;
grant execute on function public.fail_background_job(uuid, text, text, text, boolean) to authenticated, service_role;

create or replace function public.retry_background_job(p_job_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select app.retry_background_job(p_job_id); $$;
revoke all on function public.retry_background_job(uuid) from public;
grant execute on function public.retry_background_job(uuid) to authenticated;

create or replace function public.cancel_background_job(p_job_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select app.cancel_background_job(p_job_id, p_reason); $$;
revoke all on function public.cancel_background_job(uuid, text) from public;
grant execute on function public.cancel_background_job(uuid, text) to authenticated;

create or replace function public.dead_letter_background_job(p_job_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select app.dead_letter_background_job(p_job_id, p_reason); $$;
revoke all on function public.dead_letter_background_job(uuid, text) from public;
grant execute on function public.dead_letter_background_job(uuid, text) to authenticated;

create or replace function public.requeue_dead_letter_job(p_job_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select app.requeue_dead_letter_job(p_job_id, p_reason); $$;
revoke all on function public.requeue_dead_letter_job(uuid, text) from public;
grant execute on function public.requeue_dead_letter_job(uuid, text) to authenticated;

-- ------------------------------------------------------------------- RLS
alter table public.background_jobs enable row level security;
alter table public.background_jobs force row level security;
alter table public.background_job_attempts enable row level security;
alter table public.background_job_attempts force row level security;
alter table public.delivery_channels enable row level security;
alter table public.delivery_channels force row level security;
alter table public.scheduled_report_runs enable row level security;
alter table public.scheduled_report_runs force row level security;
alter table public.email_delivery_events enable row level security;
alter table public.email_delivery_events force row level security;

-- Jobs: read with job:read; ALL mutations flow through the definer RPCs
-- (no insert/update/delete policies for authenticated).
create policy background_jobs_select on public.background_jobs
  for select to authenticated
  using (app.has_permission_in(organization_id, 'job:read'));
create policy background_job_attempts_select on public.background_job_attempts
  for select to authenticated
  using (app.has_permission_in(organization_id, 'job:read'));

create policy delivery_channels_select on public.delivery_channels
  for select to authenticated
  using (app.has_permission_in(organization_id, 'report_delivery:read'));
create policy delivery_channels_write on public.delivery_channels
  for all to authenticated
  using (app.has_permission_in(organization_id, 'email_policy:manage'))
  with check (app.has_permission_in(organization_id, 'email_policy:manage'));

create policy scheduled_report_runs_select on public.scheduled_report_runs
  for select to authenticated
  using (app.has_permission_in(organization_id, 'report_delivery:read')
         or app.has_permission_in(organization_id, 'scheduled_report:execute'));
create policy scheduled_report_runs_insert on public.scheduled_report_runs
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'scheduled_report:execute'));
create policy scheduled_report_runs_update on public.scheduled_report_runs
  for update to authenticated
  using (app.has_permission_in(organization_id, 'scheduled_report:execute'))
  with check (app.has_permission_in(organization_id, 'scheduled_report:execute'));

-- Email delivery: managers see org events; recipients see their OWN.
create policy email_delivery_events_select on public.email_delivery_events
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'report_delivery:read')
    or recipient_profile_id = (select auth.uid())
  );
create policy email_delivery_events_insert on public.email_delivery_events
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'report_delivery:manage'));
create policy email_delivery_events_update on public.email_delivery_events
  for update to authenticated
  using (app.has_permission_in(organization_id, 'report_delivery:manage')
         or app.has_permission_in(organization_id, 'report_delivery:retry'))
  with check (app.has_permission_in(organization_id, 'report_delivery:manage')
              or app.has_permission_in(organization_id, 'report_delivery:retry'));
