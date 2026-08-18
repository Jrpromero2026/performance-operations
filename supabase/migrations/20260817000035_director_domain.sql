-- ============================================================================
-- Performance Operations — Phase H, Migration 35: Timberhill PT Director
--
-- Conversation/run storage for the Director agent. Kept deliberately
-- SEPARATE from audit_events so agent traffic never dilutes the financial
-- audit trail (Phase F §22).
--
-- The load-bearing security property is the OWNERSHIP TRIPLE, the lesson
-- G3 paid for: every row carries (organization_id, profile_id), RLS pins
-- reads AND writes to auth.uid() within an active-membership org, and a
-- conversation id supplied by a client is therefore worthless to anyone
-- but its owner. Conversations are personal — there is deliberately no
-- admin read-other-people's-chats path.
--
-- The agent is READ-ONLY over the platform: nothing in this domain stores
-- operational data, and no policy here grants any.
-- ============================================================================

create table public.director_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  title           text not null default 'New conversation'
                  check (char_length(title) between 1 and 120),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index director_conversations_owner_idx
  on public.director_conversations (profile_id, organization_id, updated_at desc);
create trigger director_conversations_set_updated_at
  before update on public.director_conversations
  for each row execute function app.set_updated_at();

create table public.director_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.director_conversations (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  role             text not null check (role in ('user','assistant','tool')),
  content          text not null default '',
  /** For role='tool': which tool ran and the evidence it returned. */
  tool_name        text,
  tool_payload     jsonb,
  created_at       timestamptz not null default now()
);
create index director_messages_conversation_idx
  on public.director_messages (conversation_id, created_at);

create table public.director_runs (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.director_conversations (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  status           text not null default 'running'
                   check (status in ('running','succeeded','failed','rate_limited')),
  model            text not null,
  tool_calls       int not null default 0,
  input_tokens     int,
  output_tokens    int,
  duration_ms      int,
  error            text,
  created_at       timestamptz not null default now()
);
create index director_runs_owner_idx
  on public.director_runs (profile_id, created_at desc);

-- ---------------------------------------------------------------- RLS
alter table public.director_conversations enable row level security;
alter table public.director_conversations force row level security;
alter table public.director_messages enable row level security;
alter table public.director_messages force row level security;
alter table public.director_runs enable row level security;
alter table public.director_runs force row level security;

-- Owner-only, inside an org the owner actively belongs to. The membership
-- check stops a stale owner (membership ended) from continuing to use the
-- agent against that organization.
create policy director_conversations_select on public.director_conversations
  for select to authenticated
  using (profile_id = (select auth.uid())
         and organization_id in (select app.user_organization_ids()));
create policy director_conversations_insert on public.director_conversations
  for insert to authenticated
  with check (profile_id = (select auth.uid())
              and organization_id in (select app.user_organization_ids()));
create policy director_conversations_update on public.director_conversations
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy director_messages_select on public.director_messages
  for select to authenticated
  using (profile_id = (select auth.uid()));
create policy director_messages_insert on public.director_messages
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (select 1 from public.director_conversations c
                where c.id = conversation_id
                  and c.profile_id = (select auth.uid())
                  and c.organization_id = director_messages.organization_id));

create policy director_runs_select on public.director_runs
  for select to authenticated
  using (profile_id = (select auth.uid()));
create policy director_runs_insert on public.director_runs
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (select 1 from public.director_conversations c
                where c.id = conversation_id
                  and c.profile_id = (select auth.uid())
                  and c.organization_id = director_runs.organization_id));
create policy director_runs_update on public.director_runs
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- No delete policies: runs and messages are the agent's audit trail.
