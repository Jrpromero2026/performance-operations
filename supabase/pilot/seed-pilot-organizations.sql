-- ============================================================================
-- PILOT SEED — creates the two clean pilot organizations (Option 2 in
-- docs/PILOT_CONFIGURATION_INVENTORY.md).
--
-- RUN ONLY AFTER JR CONFIRMS THE NAMES. Not a migration: this is
-- owner-triggered configuration seeding, executed once against
-- performance-operations-dev (MCP execute_sql or psql). Idempotent —
-- safe to re-run; it never touches the existing sandbox organizations.
--
-- Seeds ONLY: organization rows, department structures, and JR's
-- platform-admin membership. Services, trainers, compensation plans,
-- reporting periods, and policies are deliberately NOT seeded — JR
-- enters those in the app per docs/PILOT_INPUTS_REQUIRED.md.
-- ============================================================================

begin;

insert into public.organizations (slug, name, status)
values
  ('timberhill-pilot', 'Timberhill Athletic Club (Pilot)', 'active'),
  ('g3-performance-pilot', 'G3 Performance (Pilot)', 'active')
on conflict (slug) do nothing;

-- Department structures mirror the intended real structures already
-- recorded in the sandbox organizations.
insert into public.departments (organization_id, name)
select o.id, d.name
from public.organizations o
join (values
  ('timberhill-pilot', 'Personal Training'),
  ('timberhill-pilot', 'PACK Training'),
  ('timberhill-pilot', 'Nutrition Coaching'),
  ('g3-performance-pilot', 'Athlete Performance'),
  ('g3-performance-pilot', 'Adult Human Performance'),
  ('g3-performance-pilot', 'Team Performance'),
  ('g3-performance-pilot', 'Performance Evaluations'),
  ('g3-performance-pilot', 'Tactical Performance'),
  ('g3-performance-pilot', 'G3 Volleyball')
) as d(slug, name) on d.slug = o.slug
where not exists (
  select 1 from public.departments existing
  where existing.organization_id = o.id and existing.name = d.name
);

-- JR (platform admin) gets an explicit membership in both pilot orgs so
-- they appear in the workspace selector as first-class workspaces.
insert into public.organization_memberships (profile_id, organization_id, role_id)
select p.id, o.id, r.id
from public.profiles p
join public.roles r on r.key = 'platform_admin'
join public.organizations o on o.slug in ('timberhill-pilot', 'g3-performance-pilot')
where p.email = 'jrpromero16@gmail.com'
  and not exists (
    select 1 from public.organization_memberships m
    where m.profile_id = p.id and m.organization_id = o.id and m.effective_to is null
  );

commit;

-- Verification (expected: 2 rows with 3 and 6 departments, 1 member each)
select o.slug, o.name,
  (select count(*) from public.departments d where d.organization_id = o.id) as departments,
  (select count(*) from public.organization_memberships m
    where m.organization_id = o.id and m.effective_to is null) as members
from public.organizations o
where o.slug in ('timberhill-pilot', 'g3-performance-pilot')
order by o.slug;
