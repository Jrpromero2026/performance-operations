-- ============================================================================
-- Performance Operations — Phase G, Migration 34: trainer ↔ client scope
--
-- Closes Phase F finding P1-1.
--
-- The problem: there is no stored trainer↔client assignment anywhere in
-- this system, and there should not be one — a "primary trainer" column
-- would be a second, drifting source of truth alongside the appointment
-- ledger, and it would have to be maintained by hand. But without SOME
-- authoritative relationship, the question "which clients may this trainer
-- see?" has no safe answer, so trainers currently see no clients at all.
--
-- The fix: derive the relationship from what actually happened. A trainer
-- is authorized to see exactly those clients they have a real, active
-- appointment with. The derivation is a single database function, so the
-- application layer, the RLS policies, and any future agent all get the
-- same answer — there is no second implementation to drift.
--
-- Deliberate properties:
--   * Fails closed. A user with no trainer row derives an EMPTY set, and
--     an empty set grants nothing.
--   * Organization-bounded. Membership in the appointment's organization
--     is required, so history cannot carry a trainer across a tenant line.
--   * Reversed/voided appointments do not grant access. Access follows the
--     live ledger, not deleted history.
--   * Both link paths count: the appointment's own trainer_id and an
--     appointment_trainer_assignments row (multi-trainer sessions).
--     Both participant rows and the appointment's primary client_id count
--     on the client side.
--   * NEVER widens anyone. This is additive self-scope only: a role that
--     already holds `client:read` is unaffected, and nothing here can
--     grant a trainer access to a client they never worked with.
-- ============================================================================

insert into public.permissions (key, description) values
  ('client:read_self', 'View only the clients this trainer has appointment history with')
on conflict (key) do nothing;

with grants(role_key, permission_key) as (
  values ('trainer','client:read_self')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.key = g.role_key
join public.permissions p on p.key = g.permission_key
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- app.trainer_client_ids() — THE authoritative trainer→client derivation.
--
-- security definer + pinned search_path, matching every other authz helper:
-- the answer must not depend on which tables the caller can already read,
-- or the scope would vary by role and stop being a reliable backstop.
-- ----------------------------------------------------------------------------
create or replace function app.trainer_client_ids()
returns table (organization_id uuid, client_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select app.current_trainer_id() as trainer_id
  ),
  -- Appointments this trainer delivered, by either link path.
  mine as (
    select a.id, a.organization_id, a.client_id
    from public.appointments a, me
    where me.trainer_id is not null
      and a.record_state = 'active'
      and (
        a.trainer_id = me.trainer_id
        or exists (
          select 1
          from public.appointment_trainer_assignments ta
          where ta.appointment_id = a.id
            and ta.trainer_id = me.trainer_id
            and ta.organization_id = a.organization_id
        )
      )
      -- Tenant boundary: an appointment only counts inside an organization
      -- where this user currently holds an active membership.
      and a.organization_id in (select app.user_organization_ids())
  )
  select distinct mine.organization_id, mine.client_id
  from mine
  where mine.client_id is not null
  union
  select distinct mine.organization_id, p.client_id
  from mine
  join public.appointment_participants p
    on p.appointment_id = mine.id
   and p.organization_id = mine.organization_id;
$$;

revoke all on function app.trainer_client_ids() from public;
revoke all on function app.trainer_client_ids() from anon;
grant execute on function app.trainer_client_ids() to authenticated;

-- Convenience predicate for policies, so no policy re-implements the rule.
create or replace function app.can_read_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    app.is_platform_admin()
    or exists (
      select 1
      from public.client_organization_assignments a
      where a.client_id = p_client_id
        and app.has_permission_in(a.organization_id, 'client:read')
    )
    or exists (
      select 1
      from app.trainer_client_ids() tc
      where tc.client_id = p_client_id
        and app.has_permission_in(tc.organization_id, 'client:read_self')
    );
$$;

revoke all on function app.can_read_client(uuid) from public;
revoke all on function app.can_read_client(uuid) from anon;
grant execute on function app.can_read_client(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS: extend client visibility with the derived self-scope.
--
-- The existing organization-wide `client:read` branch is preserved exactly;
-- only a narrower additional branch is added.
-- ----------------------------------------------------------------------------
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated
  using (
    app.is_platform_admin()
    or exists (
      select 1 from public.client_organization_assignments a
      where a.client_id = clients.id
        and app.has_permission_in(a.organization_id, 'client:read')
    )
    or exists (
      select 1 from app.trainer_client_ids() tc
      where tc.client_id = clients.id
        and app.has_permission_in(tc.organization_id, 'client:read_self')
    )
  );

-- The assignment rows carry the same visibility, so a trainer who can see
-- a client can see which organization that client belongs to — and no more.
drop policy if exists client_org_assignments_select
  on public.client_organization_assignments;
create policy client_org_assignments_select
  on public.client_organization_assignments
  for select to authenticated
  using (
    app.has_permission_in(organization_id, 'client:read')
    or exists (
      select 1 from app.trainer_client_ids() tc
      where tc.client_id = client_organization_assignments.client_id
        and tc.organization_id = client_organization_assignments.organization_id
        and app.has_permission_in(tc.organization_id, 'client:read_self')
    )
  );

-- External source identifiers stay behind full `client:read`: they are
-- reconciliation plumbing, not something a trainer needs, and exposing
-- vendor ids widens the surface for no operational benefit.
