-- ============================================================================
-- Performance Operations — Phase 6, Migration 18: operations center tables
--
-- Additive: in-app notifications (per recipient), saved views (per owner:
-- saved reports + saved filters), and export events (audited export
-- history across surfaces). No email/push — in-app only.
-- ============================================================================

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  category        text not null check (category in (
    'payroll', 'imports', 'configuration', 'reporting', 'system', 'ai'
  )),
  severity        text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title           text not null,
  body            text not null default '',
  link_path       text,
  entity_type     text,
  entity_id       uuid,
  actor_id        uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  read_at         timestamptz,
  pinned_at       timestamptz,
  archived_at     timestamptz
);

create index notifications_recipient_idx
  on public.notifications (recipient_id, archived_at, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id) where read_at is null and archived_at is null;

-- Recipients may only change their own read/pin/archive state — content is
-- immutable after creation.
create or replace function app.protect_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recipient_id    is distinct from old.recipient_id
     or new.organization_id is distinct from old.organization_id
     or new.category     is distinct from old.category
     or new.severity     is distinct from old.severity
     or new.title        is distinct from old.title
     or new.body         is distinct from old.body
     or new.link_path    is distinct from old.link_path
     or new.entity_type  is distinct from old.entity_type
     or new.entity_id    is distinct from old.entity_id
     or new.actor_id     is distinct from old.actor_id
     or new.created_at   is distinct from old.created_at then
    raise exception 'notification_content_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger notifications_protect
  before update on public.notifications
  for each row execute function app.protect_notification();

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (actor_id = (select auth.uid()));
create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (recipient_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
create table public.saved_views (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('report', 'filter')),
  page       text not null,
  name       text not null,
  config     jsonb not null default '{}'::jsonb,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, page, name)
);
create index saved_views_owner_idx on public.saved_views (owner_id, page);

create trigger saved_views_set_updated_at
  before update on public.saved_views
  for each row execute function app.set_updated_at();

alter table public.saved_views enable row level security;
alter table public.saved_views force row level security;
create policy saved_views_all on public.saved_views
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
create table public.export_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  export_type     text not null,
  source_page     text not null,
  format          text not null default 'csv' check (format in ('csv', 'xlsx', 'pdf', 'view')),
  engine_version  text,
  metadata        jsonb not null default '{}'::jsonb,
  generated_by    uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index export_events_org_idx on public.export_events (organization_id, created_at desc);

alter table public.export_events enable row level security;
alter table public.export_events force row level security;
create policy export_events_select on public.export_events
  for select to authenticated
  using (app.has_permission_in(organization_id, 'report:read'));
create policy export_events_insert on public.export_events
  for insert to authenticated
  with check (
    generated_by = (select auth.uid())
    and app.has_permission_in(organization_id, 'report:read')
  );
