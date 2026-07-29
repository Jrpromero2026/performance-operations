-- ============================================================================
-- Performance Operations — Phase 2, Migration 3: invite-based onboarding
--
-- Invitations are the ONLY sanctioned path to a working account: an auth user
-- without an accepted invitation has no profile and no memberships, and
-- deny-by-default RLS gives them nothing. Raw invite tokens are never stored —
-- only sha256 hashes.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create table public.invitations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  email               text not null check (email = lower(email) and position('@' in email) > 1),
  role_id             uuid not null references public.roles (id) on delete restrict,
  department_ids      uuid[] not null default '{}',
  token_hash          text not null unique,
  status              text not null default 'pending'
                      check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by          uuid references public.profiles (id) on delete set null,
  expires_at          timestamptz not null,
  accepted_at         timestamptz,
  accepted_profile_id uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index invitations_organization_id_idx on public.invitations (organization_id);
create index invitations_email_idx on public.invitations (email);
-- one live invitation per organization + email
create unique index invitations_one_pending_uidx
  on public.invitations (organization_id, email)
  where status = 'pending';

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function app.set_updated_at();

alter table public.invitations enable row level security;
alter table public.invitations force row level security;

-- ----------------------------------------------------------------------------
-- app.can_grant_role(org, role) — escalation guard used by RLS.
-- SECURITY DEFINER: reads roles/memberships regardless of caller's row access;
-- pinned search_path; keyed to auth.uid(). A caller may grant a role only if:
--   * they are a platform admin (may grant anything), or
--   * they hold member:manage in the organization AND the target role is not
--     platform_admin (workspace admins cannot mint platform admins).
-- ----------------------------------------------------------------------------
create or replace function app.can_grant_role(org_id uuid, target_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin()
    or (
      app.has_permission_in(org_id, 'member:manage')
      and exists (
        select 1 from public.roles r
        where r.id = target_role_id and r.key <> 'platform_admin'
      )
    );
$$;

revoke all on function app.can_grant_role(uuid, uuid) from public;
grant execute on function app.can_grant_role(uuid, uuid) to authenticated;

-- Managers see and manage invitations for their organizations.
create policy invitations_select on public.invitations
  for select to authenticated
  using (
    app.is_platform_admin()
    or app.has_permission_in(organization_id, 'member:manage')
  );

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    app.can_grant_role(organization_id, role_id)
    and invited_by = (select auth.uid())
  );

-- Revocation/expiry only; acceptance happens via app.accept_invitation.
create policy invitations_update on public.invitations
  for update to authenticated
  using (
    app.is_platform_admin()
    or app.has_permission_in(organization_id, 'member:manage')
  )
  with check (
    app.is_platform_admin()
    or app.has_permission_in(organization_id, 'member:manage')
  );

-- Escalation guard on memberships themselves (RESTRICTIVE: ANDed with the
-- existing member:manage policies), so even a manager cannot write a
-- platform_admin membership unless they are one.
create policy organization_memberships_grant_guard on public.organization_memberships
  as restrictive
  for insert to authenticated
  with check (app.can_grant_role(organization_id, role_id));

create policy organization_memberships_update_grant_guard on public.organization_memberships
  as restrictive
  for update to authenticated
  with check (app.can_grant_role(organization_id, role_id));

-- ----------------------------------------------------------------------------
-- app.get_invitation_preview(token) — safe, minimal invite details for the
-- accept page (pre-auth). SECURITY DEFINER with pinned search_path; exposes
-- only what the invitee needs; the unguessable token is the credential.
-- ----------------------------------------------------------------------------
create or replace function app.get_invitation_preview(p_token text)
returns table (
  email             text,
  organization_name text,
  role_name         text,
  status            text,
  expires_at        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.email, o.name, r.name, i.status, i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  join public.roles r on r.id = i.role_id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

revoke all on function app.get_invitation_preview(text) from public;
grant execute on function app.get_invitation_preview(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- app.accept_invitation(token) — atomically activates an invitation for the
-- CURRENT authenticated user. SECURITY DEFINER (must write profile +
-- memberships the invitee could never write under RLS); pinned search_path.
-- Guarantees:
--   * caller must be authenticated,
--   * invitation must be pending and unexpired (expired ones are marked),
--   * the caller's auth email must match the invitation email,
--   * profile + org membership + department memberships + audit event are
--     created in one transaction — no orphaned halves.
-- ----------------------------------------------------------------------------
create or replace function app.accept_invitation(p_token text)
returns uuid  -- organization_id joined
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_email      text;
  v_inv        public.invitations%rowtype;
  v_dept       uuid;
  v_has_other  boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select * into v_inv
  from public.invitations i
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if v_inv.id is null then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation_not_pending' using errcode = 'P0003';
  end if;
  if v_inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation_expired' using errcode = 'P0004';
  end if;
  if v_inv.email <> v_email then
    raise exception 'invitation_email_mismatch' using errcode = 'P0005';
  end if;

  insert into public.profiles (id, email, full_name)
  values (v_uid, v_email,
          coalesce((select u.raw_user_meta_data->>'full_name' from auth.users u where u.id = v_uid), ''))
  on conflict (id) do nothing;

  select exists (
    select 1 from public.organization_memberships m
    where m.profile_id = v_uid and m.effective_to is null
  ) into v_has_other;

  insert into public.organization_memberships
    (profile_id, organization_id, role_id, is_default)
  values (v_uid, v_inv.organization_id, v_inv.role_id, not v_has_other);

  foreach v_dept in array v_inv.department_ids loop
    insert into public.department_memberships (profile_id, organization_id, department_id)
    values (v_uid, v_inv.organization_id, v_dept);
  end loop;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_profile_id = v_uid
  where id = v_inv.id;

  insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_inv.organization_id, v_uid, 'invitation', v_inv.id, 'invitation_accepted',
          jsonb_build_object('role_id', v_inv.role_id,
                             'department_count', coalesce(array_length(v_inv.department_ids, 1), 0)));

  return v_inv.organization_id;
end;
$$;

revoke all on function app.accept_invitation(text) from public;
grant execute on function app.accept_invitation(text) to authenticated;
