-- ============================================================================
-- Performance Operations — Phase 3, Migration 13: canonical appointment ledger
--
-- Appointments are posted ONLY through app.post_import_batch (transactional,
-- security definer, documented below). Source evidence fields are trigger-
-- frozen; status/business changes flow through append-only history and
-- correction tables; reversal marks records reversed — never deletes.
-- Multi-participant/multi-coach future support: appointment_participants
-- exists from day one (primary client also gets a participant row), so group
-- sessions and two-coach models can be added without a schema break.
-- ============================================================================

create table public.appointments (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete restrict,
  department_id           uuid,
  trainer_id              uuid not null references public.trainers (id) on delete restrict,
  client_id               uuid references public.clients (id) on delete restrict,
  service_id              uuid not null,
  appointment_date        date not null,
  start_at                timestamptz not null,
  end_at                  timestamptz not null,
  duration_minutes        int not null check (duration_minutes > 0 and duration_minutes <= 24 * 60),
  timezone                text not null,
  canonical_status        text not null references public.appointment_status_definitions (key),
  record_state            text not null default 'active' check (record_state in (
    'active', 'superseded', 'reversed', 'voided'
  )),
  source                  text not null check (source in ('setmore', 'acuity', 'manual_csv')),
  external_appointment_id text,
  source_created_at       timestamptz,
  source_updated_at       timestamptz,
  -- SOURCE-PROVIDED financial facts. Explicitly NOT recognized revenue and
  -- NOT payroll-eligible revenue — those concepts arrive in later phases.
  source_listed_price_cents bigint check (source_listed_price_cents is null or source_listed_price_cents >= 0),
  source_amount_paid_cents  bigint check (source_amount_paid_cents is null or source_amount_paid_cents >= 0),
  source_amount_due_cents   bigint check (source_amount_due_cents is null or source_amount_due_cents >= 0),
  currency                text not null default 'USD',
  payment_status          text,
  participant_count       int not null default 1 check (participant_count >= 1),
  notes                   text not null default '',
  import_batch_id         uuid not null references public.import_batches (id) on delete restrict,
  import_row_id           uuid not null references public.import_rows (id) on delete restrict,
  posted_at               timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete restrict,
  foreign key (service_id, organization_id)
    references public.services (id, organization_id) on delete restrict,
  unique (import_row_id)
);

create index appointments_org_date_idx on public.appointments (organization_id, appointment_date desc);
create index appointments_org_trainer_idx on public.appointments (organization_id, trainer_id);
create index appointments_org_client_idx on public.appointments (organization_id, client_id);
create index appointments_org_service_idx on public.appointments (organization_id, service_id);
create index appointments_org_status_idx on public.appointments (organization_id, canonical_status);
create index appointments_batch_idx on public.appointments (import_batch_id);
create index appointments_dept_idx on public.appointments (department_id);
-- occurrence identity: one ACTIVE appointment per (org, source, external id, start)
create unique index appointments_occurrence_uidx
  on public.appointments (organization_id, source, external_appointment_id, start_at)
  where record_state = 'active' and external_appointment_id is not null;

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function app.set_updated_at();

-- Source evidence is frozen; record_state may only move forward.
create or replace function app.protect_appointment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source is distinct from old.source
     or new.external_appointment_id is distinct from old.external_appointment_id
     or new.import_batch_id is distinct from old.import_batch_id
     or new.import_row_id is distinct from old.import_row_id
     or new.posted_at is distinct from old.posted_at
     or new.organization_id is distinct from old.organization_id
     or new.source_created_at is distinct from old.source_created_at
     or new.source_listed_price_cents is distinct from old.source_listed_price_cents
     or new.source_amount_paid_cents is distinct from old.source_amount_paid_cents
     or new.source_amount_due_cents is distinct from old.source_amount_due_cents then
    raise exception 'appointment_source_evidence_immutable' using errcode = '42501';
  end if;
  if old.record_state <> 'active' and new.record_state = 'active' then
    raise exception 'appointment_record_state_cannot_reactivate' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger appointments_protect
  before update on public.appointments
  for each row execute function app.protect_appointment();

-- ----------------------------------------------------------------------------
-- appointment_participants — future group/multi-athlete support. The primary
-- client also receives a participant row at posting time.
-- ----------------------------------------------------------------------------
create table public.appointment_participants (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id       uuid not null references public.clients (id) on delete restrict,
  role            text not null default 'client' check (role in ('client', 'athlete', 'other')),
  created_at      timestamptz not null default now(),
  unique (appointment_id, client_id)
);

create index appointment_participants_appointment_idx
  on public.appointment_participants (appointment_id);
create index appointment_participants_client_idx
  on public.appointment_participants (client_id);

-- ----------------------------------------------------------------------------
-- appointment_status_history — append-only.
-- ----------------------------------------------------------------------------
create table public.appointment_status_history (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  previous_status text,
  new_status      text not null references public.appointment_status_definitions (key),
  change_source   text not null check (change_source in ('import', 'correction', 'reversal')),
  reason          text,
  changed_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index appointment_status_history_appointment_idx
  on public.appointment_status_history (appointment_id);

-- ----------------------------------------------------------------------------
-- appointment_source_links — append-only linkage to import evidence.
-- ----------------------------------------------------------------------------
create table public.appointment_source_links (
  id                      uuid primary key default gen_random_uuid(),
  appointment_id          uuid not null references public.appointments (id) on delete cascade,
  organization_id         uuid not null references public.organizations (id) on delete restrict,
  import_batch_id         uuid not null references public.import_batches (id) on delete restrict,
  import_row_id           uuid not null references public.import_rows (id) on delete restrict,
  source                  text not null,
  external_appointment_id text,
  link_type               text not null default 'original' check (link_type in (
    'original', 'source_update', 'correction'
  )),
  created_at              timestamptz not null default now()
);

create index appointment_source_links_appointment_idx
  on public.appointment_source_links (appointment_id);
create index appointment_source_links_batch_idx
  on public.appointment_source_links (import_batch_id);

-- ----------------------------------------------------------------------------
-- appointment_corrections — append-only field-level correction history.
-- ----------------------------------------------------------------------------
create table public.appointment_corrections (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  field           text not null,
  previous_value  text,
  new_value       text,
  reason          text not null,
  change_source   text not null default 'manual' check (change_source in (
    'manual', 'source_update', 'reversal'
  )),
  corrected_by    uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index appointment_corrections_appointment_idx
  on public.appointment_corrections (appointment_id);

-- ----------------------------------------------------------------------------
-- RLS — org-scoped; department-scoped roles narrowed; trainer self-scope
-- prepared for later phases. Writes only via specific permissions; no
-- deletes anywhere.
-- ----------------------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.appointments force row level security;
alter table public.appointment_participants enable row level security;
alter table public.appointment_participants force row level security;
alter table public.appointment_status_history enable row level security;
alter table public.appointment_status_history force row level security;
alter table public.appointment_source_links enable row level security;
alter table public.appointment_source_links force row level security;
alter table public.appointment_corrections enable row level security;
alter table public.appointment_corrections force row level security;

create policy appointments_select on public.appointments
  for select to authenticated
  using (
    app.is_platform_admin()
    or (
      app.has_permission_in(organization_id, 'appointment:read')
      and (
        not app.is_department_scoped_in(organization_id)
        or department_id is null
        or department_id in (select app.user_department_ids())
      )
    )
    or trainer_id = app.current_trainer_id()
  );
-- Inserts happen ONLY inside app.post_import_batch (security definer);
-- no INSERT policy for authenticated users.
create policy appointments_update on public.appointments
  for update to authenticated
  using (app.has_permission_in(organization_id, 'appointment:correct'))
  with check (app.has_permission_in(organization_id, 'appointment:correct'));

create policy appointment_participants_select on public.appointment_participants
  for select to authenticated
  using (app.has_permission_in(organization_id, 'appointment:read'));

create policy appointment_status_history_select on public.appointment_status_history
  for select to authenticated
  using (app.has_permission_in(organization_id, 'appointment:read'));
create policy appointment_status_history_insert on public.appointment_status_history
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'appointment:correct')
    and changed_by = (select auth.uid())
  );

create policy appointment_source_links_select on public.appointment_source_links
  for select to authenticated
  using (app.has_permission_in(organization_id, 'appointment:read'));

create policy appointment_corrections_select on public.appointment_corrections
  for select to authenticated
  using (app.has_permission_in(organization_id, 'appointment:read'));
create policy appointment_corrections_insert on public.appointment_corrections
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'appointment:correct')
    and corrected_by = (select auth.uid())
  );

-- ----------------------------------------------------------------------------
-- app.post_import_batch(p_batch_id) — THE ONLY WAY appointments are created.
--
-- SECURITY DEFINER rationale: posting must atomically write appointments,
-- participants, status history, source links, row updates, batch counts,
-- batch state, and audit events — several of which have no INSERT policy
-- for regular users (deliberately). The function:
--   * pins search_path,
--   * re-validates authorization (import:post in the batch's organization),
--   * re-validates batch state (approved), zero blocking issues, and
--     unresolved duplicates,
--   * locks the batch row (FOR UPDATE) against concurrent posting,
--   * is atomic: ANY failure raises and rolls back everything — no partial
--     posting is possible.
-- Returns jsonb { posted_count }.
-- ----------------------------------------------------------------------------
create or replace function app.post_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_batch     public.import_batches%rowtype;
  v_row       record;
  v_blocking  int;
  v_unresolved_dupes int;
  v_appt_id   uuid;
  v_tz        text;
  v_posted    int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_batch from public.import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'batch_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_batch.organization_id, 'import:post') then
    raise exception 'not_authorized_to_post' using errcode = '42501';
  end if;
  if v_batch.status <> 'approved' then
    raise exception 'batch_not_approved' using errcode = 'P0003';
  end if;
  if v_batch.posted_at is not null then
    raise exception 'batch_already_posted' using errcode = 'P0004';
  end if;

  select count(*) into v_blocking
  from public.import_row_issues i
  where i.import_batch_id = p_batch_id
    and i.severity = 'blocking'
    and i.resolution_status = 'open';
  if v_blocking > 0 then
    raise exception 'blocking_issues_remain' using errcode = 'P0005';
  end if;

  select count(*) into v_unresolved_dupes
  from public.import_rows r
  where r.import_batch_id = p_batch_id
    and r.processing_status not in ('excluded')
    and r.duplicate_class in ('exact_duplicate', 'possible_duplicate', 'conflict', 'source_update');
  if v_unresolved_dupes > 0 then
    raise exception 'unresolved_duplicates_remain' using errcode = 'P0006';
  end if;

  select o.timezone into v_tz
  from public.organizations o where o.id = v_batch.organization_id;

  update public.import_batches
  set status = 'posting'
  where id = p_batch_id;

  for v_row in
    select * from public.import_rows r
    where r.import_batch_id = p_batch_id
      and r.processing_status = 'ready'
    order by r.source_row_number
  loop
    if v_row.matched_trainer_id is null
       or v_row.matched_service_id is null
       or v_row.start_at is null
       or v_row.end_at is null
       or v_row.duration_minutes is null
       or v_row.canonical_status is null then
      raise exception 'row_%_not_postable', v_row.source_row_number using errcode = 'P0007';
    end if;

    insert into public.appointments (
      organization_id, department_id, trainer_id, client_id, service_id,
      appointment_date, start_at, end_at, duration_minutes, timezone,
      canonical_status, source, external_appointment_id,
      source_created_at,
      source_listed_price_cents, source_amount_paid_cents, currency,
      participant_count, import_batch_id, import_row_id
    ) values (
      v_batch.organization_id, v_row.proposed_department_id,
      v_row.matched_trainer_id, v_row.matched_client_id, v_row.matched_service_id,
      v_row.appointment_date, v_row.start_at, v_row.end_at, v_row.duration_minutes, v_tz,
      v_row.canonical_status, v_batch.source, v_row.external_appointment_id,
      nullif(v_row.normalized_row->>'source_created_at', '')::timestamptz,
      v_row.listed_price_cents, v_row.amount_paid_cents, v_row.currency,
      1, v_batch.id, v_row.id
    )
    returning id into v_appt_id;

    insert into public.appointment_source_links
      (appointment_id, organization_id, import_batch_id, import_row_id,
       source, external_appointment_id, link_type)
    values
      (v_appt_id, v_batch.organization_id, v_batch.id, v_row.id,
       v_batch.source, v_row.external_appointment_id, 'original');

    insert into public.appointment_status_history
      (appointment_id, organization_id, previous_status, new_status,
       change_source, changed_by)
    values
      (v_appt_id, v_batch.organization_id, null, v_row.canonical_status,
       'import', v_uid);

    if v_row.matched_client_id is not null then
      insert into public.appointment_participants
        (appointment_id, organization_id, client_id, role)
      values (v_appt_id, v_batch.organization_id, v_row.matched_client_id, 'client');
    end if;

    update public.import_rows
    set processing_status = 'posted', posted_appointment_id = v_appt_id
    where id = v_row.id;

    v_posted := v_posted + 1;
  end loop;

  update public.import_batches
  set status = 'posted',
      posted_by = v_uid,
      posted_at = now(),
      posted_row_count = v_posted
  where id = p_batch_id;

  insert into public.import_batch_events
    (import_batch_id, organization_id, from_status, to_status, actor_id)
  values
    (p_batch_id, v_batch.organization_id, 'approved', 'posting', v_uid),
    (p_batch_id, v_batch.organization_id, 'posting', 'posted', v_uid);

  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values
    (v_batch.organization_id, v_uid, 'import_batch', p_batch_id, 'import_batch_posted',
     jsonb_build_object('posted_count', v_posted, 'source', v_batch.source));

  return jsonb_build_object('posted_count', v_posted);
end;
$$;

revoke all on function app.post_import_batch(uuid) from public;
grant execute on function app.post_import_batch(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- app.reverse_import_batch(p_batch_id, p_reason) — controlled reversal.
--
-- SECURITY DEFINER (same rationale/protections as posting). Marks the
-- batch's ACTIVE appointments reversed (history preserved — no deletion),
-- appends status history, sets batch → reversed. PHASE 4 DEPENDENCY GUARD
-- (documented): when payroll tables exist, this function MUST refuse to
-- reverse a batch whose appointments are referenced by payroll line items,
-- pending a controlled dependency workflow.
-- ----------------------------------------------------------------------------
create or replace function app.reverse_import_batch(p_batch_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_batch    public.import_batches%rowtype;
  v_reversed int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'reversal_reason_required' using errcode = 'P0008';
  end if;

  select * into v_batch from public.import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'batch_not_found' using errcode = 'P0002';
  end if;
  if not app.has_permission_in(v_batch.organization_id, 'import:reverse') then
    raise exception 'not_authorized_to_reverse' using errcode = '42501';
  end if;
  if v_batch.status <> 'posted' then
    raise exception 'batch_not_posted' using errcode = 'P0003';
  end if;
  if v_batch.reversed_at is not null then
    raise exception 'batch_already_reversed' using errcode = 'P0004';
  end if;

  insert into public.appointment_status_history
    (appointment_id, organization_id, previous_status, new_status,
     change_source, reason, changed_by)
  select a.id, a.organization_id, a.canonical_status, a.canonical_status,
         'reversal', p_reason, v_uid
  from public.appointments a
  where a.import_batch_id = p_batch_id and a.record_state = 'active';

  update public.appointments a
  set record_state = 'reversed'
  where a.import_batch_id = p_batch_id and a.record_state = 'active';
  get diagnostics v_reversed = row_count;

  update public.import_batches
  set status = 'reversed',
      reversed_by = v_uid,
      reversed_at = now(),
      sanitized_failure_message = null
  where id = p_batch_id;

  insert into public.import_batch_events
    (import_batch_id, organization_id, from_status, to_status, actor_id, reason)
  values
    (p_batch_id, v_batch.organization_id, 'posted', 'reversed', v_uid, p_reason);

  insert into public.audit_events
    (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values
    (v_batch.organization_id, v_uid, 'import_batch', p_batch_id, 'import_batch_reversed',
     jsonb_build_object('reversed_count', v_reversed, 'reason', p_reason));

  return jsonb_build_object('reversed_count', v_reversed);
end;
$$;

revoke all on function app.reverse_import_batch(uuid, text) from public;
grant execute on function app.reverse_import_batch(uuid, text) to authenticated;

-- Public RPC wrappers (PostgREST exposes only public).
create or replace function public.post_import_batch(p_batch_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app.post_import_batch(p_batch_id);
$$;
revoke all on function public.post_import_batch(uuid) from public;
grant execute on function public.post_import_batch(uuid) to authenticated;

create or replace function public.reverse_import_batch(p_batch_id uuid, p_reason text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app.reverse_import_batch(p_batch_id, p_reason);
$$;
revoke all on function public.reverse_import_batch(uuid, text) from public;
grant execute on function public.reverse_import_batch(uuid, text) to authenticated;
