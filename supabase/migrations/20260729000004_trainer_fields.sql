-- ============================================================================
-- Performance Operations — Phase 2, Migration 4: trainer identity fields
--
-- Additive expansion of the trainer identity created in Phase 1. Trainers may
-- exist without login access; deletion is not supported (deactivate instead),
-- so no DELETE policies are added.
-- ============================================================================

alter table public.trainers
  add column first_name              text not null default '',
  add column last_name               text not null default '',
  add column phone                   text,
  add column employment_status       text not null default 'active'
             check (employment_status in ('active', 'on_leave', 'separated')),
  add column hire_date               date,
  add column separation_date         date,
  add column notes                   text not null default '',
  -- external scheduling-system identifiers, e.g. {"setmore": "...", "acuity": "..."}
  add column source_identifiers      jsonb not null default '{}'::jsonb,
  add column default_organization_id uuid references public.organizations (id) on delete set null,
  add constraint trainers_separation_after_hire
    check (separation_date is null or hire_date is null or separation_date >= hire_date);

create index trainers_default_organization_id_idx
  on public.trainers (default_organization_id);
-- duplicate detection hot paths
create index trainers_email_lower_idx on public.trainers (lower(email));
create index trainers_source_identifiers_idx
  on public.trainers using gin (source_identifiers);

-- Phase 1 allowed only platform admins to create trainer identities. Trainer
-- management now belongs to anyone holding trainer:manage in at least one
-- organization; the org assignment rows remain governed per-organization.
drop policy trainers_insert on public.trainers;
create policy trainers_insert on public.trainers
  for insert to authenticated
  with check (
    app.is_platform_admin()
    or exists (
      select 1 from app.user_organization_ids() as org(id)
      where app.has_permission_in(org.id, 'trainer:manage')
    )
  );
