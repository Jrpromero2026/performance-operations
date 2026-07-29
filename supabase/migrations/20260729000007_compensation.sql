-- ============================================================================
-- Performance Operations — Phase 2, Migration 7: compensation configuration
--
-- Configuration only — NO calculation behavior. Invariants:
--   * money = integer cents (bigint), rates = integer basis points
--   * plans are containers; versions are the immutable units of record
--   * a PUBLISHED version's substance can never be silently rewritten
--     (enforced by trigger, not just application code)
--   * assignments reference a specific plan version and are effective-dated
--     with a DB-level no-overlap guarantee per trainer/org/purpose
-- ============================================================================

-- ----------------------------------------------------------------------------
-- compensation_plans — org-scoped container.
-- ----------------------------------------------------------------------------
create table public.compensation_plans (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  description     text not null default '',
  status          text not null default 'active' check (status in ('active', 'inactive')),
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create index compensation_plans_organization_id_idx
  on public.compensation_plans (organization_id);

create trigger compensation_plans_set_updated_at
  before update on public.compensation_plans
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- compensation_plan_versions — the immutable unit. Lifecycle:
-- draft (editable) → published (substance frozen) → archived.
-- ----------------------------------------------------------------------------
create table public.compensation_plan_versions (
  id                  uuid primary key default gen_random_uuid(),
  plan_id             uuid not null,
  organization_id     uuid not null,
  version_number      int not null check (version_number >= 1),
  compensation_method text not null check (compensation_method in (
    'revenue_commission',
    'flat_per_session',
    'hourly',
    'percentage_of_revenue',
    'team_training_rate',
    'head_coach_rate',
    'assistant_coach_rate',
    'evaluation_bonus',
    'package_sale_commission',
    'nutrition_client_rate',
    'admin_hourly',
    'manual_bonus',
    'manual_deduction'
  )),
  tier_behavior       text not null default 'not_applicable'
                      check (tier_behavior in ('cliff', 'marginal', 'not_applicable')),
  status              text not null default 'draft'
                      check (status in ('draft', 'published', 'archived')),
  effective_from      date not null default current_date,
  effective_to        date check (effective_to is null or effective_to > effective_from),
  notes               text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (plan_id, version_number),
  unique (id, organization_id),
  foreign key (plan_id, organization_id)
    references public.compensation_plans (id, organization_id) on delete restrict
);

create index compensation_plan_versions_plan_id_idx
  on public.compensation_plan_versions (plan_id);
create index compensation_plan_versions_organization_id_idx
  on public.compensation_plan_versions (organization_id);

create trigger compensation_plan_versions_set_updated_at
  before update on public.compensation_plan_versions
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- commission_tiers — ordered revenue tiers for tiered methods.
-- All bounds in integer cents; rates in basis points (50% = 5000 bp).
-- ----------------------------------------------------------------------------
create table public.commission_tiers (
  id                 uuid primary key default gen_random_uuid(),
  plan_version_id    uuid not null,
  organization_id    uuid not null,
  sequence           int not null check (sequence >= 1),
  min_revenue_cents  bigint not null check (min_revenue_cents >= 0),
  max_revenue_cents  bigint check (max_revenue_cents is null or max_revenue_cents > min_revenue_cents),
  rate_basis_points  int not null check (rate_basis_points >= 0 and rate_basis_points <= 10000),
  effective_from     date,
  effective_to       date check (effective_to is null or effective_from is null or effective_to > effective_from),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (plan_version_id, sequence),
  foreign key (plan_version_id, organization_id)
    references public.compensation_plan_versions (id, organization_id) on delete cascade,
  -- tiers within one version may not overlap in revenue range
  exclude using gist (
    plan_version_id with =,
    int8range(min_revenue_cents, coalesce(max_revenue_cents, 9223372036854775807), '[)') with &&
  )
);

create index commission_tiers_plan_version_id_idx
  on public.commission_tiers (plan_version_id);
create index commission_tiers_organization_id_idx
  on public.commission_tiers (organization_id);

create trigger commission_tiers_set_updated_at
  before update on public.commission_tiers
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- compensation_rules — structured, validated parameters for a version
-- (rate/amount per rule type; no free-form JSON).
-- ----------------------------------------------------------------------------
create table public.compensation_rules (
  id                uuid primary key default gen_random_uuid(),
  plan_version_id   uuid not null,
  organization_id   uuid not null,
  rule_type         text not null check (rule_type in (
    'session_rate',
    'hourly_rate',
    'revenue_rate',
    'team_training_rate',
    'head_coach_rate',
    'assistant_coach_rate',
    'evaluation_bonus',
    'package_sale_rate',
    'nutrition_client_rate',
    'admin_hourly_rate',
    'manual_bonus',
    'manual_deduction'
  )),
  amount_cents      bigint check (amount_cents is null or amount_cents >= 0),
  rate_basis_points int check (rate_basis_points is null
                               or (rate_basis_points >= 0 and rate_basis_points <= 10000)),
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- exactly one of amount / rate must be present
  check (num_nonnulls(amount_cents, rate_basis_points) = 1),
  unique (plan_version_id, rule_type),
  foreign key (plan_version_id, organization_id)
    references public.compensation_plan_versions (id, organization_id) on delete cascade
);

create index compensation_rules_plan_version_id_idx
  on public.compensation_rules (plan_version_id);
create index compensation_rules_organization_id_idx
  on public.compensation_rules (organization_id);

create trigger compensation_rules_set_updated_at
  before update on public.compensation_rules
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- trainer_compensation_assignments — a trainer's plan version per org and
-- purpose, effective-dated, with DB-level overlap prevention.
-- ----------------------------------------------------------------------------
create table public.trainer_compensation_assignments (
  id              uuid primary key default gen_random_uuid(),
  trainer_id      uuid not null references public.trainers (id) on delete restrict,
  organization_id uuid not null,
  plan_version_id uuid not null,
  purpose         text not null default 'primary' check (purpose in (
    'primary', 'team_training', 'evaluations', 'nutrition', 'administrative'
  )),
  effective_from  date not null default current_date,
  effective_to    date check (effective_to is null or effective_to > effective_from),
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (plan_version_id, organization_id)
    references public.compensation_plan_versions (id, organization_id) on delete restrict,
  -- no overlapping assignment windows per trainer/org/purpose
  constraint trainer_comp_assignments_no_overlap
  exclude using gist (
    trainer_id with =,
    organization_id with =,
    purpose with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create index trainer_comp_assignments_trainer_id_idx
  on public.trainer_compensation_assignments (trainer_id);
create index trainer_comp_assignments_organization_id_idx
  on public.trainer_compensation_assignments (organization_id);
create index trainer_comp_assignments_plan_version_id_idx
  on public.trainer_compensation_assignments (plan_version_id);
create index trainer_comp_assignments_active_idx
  on public.trainer_compensation_assignments (trainer_id, organization_id)
  where effective_to is null;

create trigger trainer_compensation_assignments_set_updated_at
  before update on public.trainer_compensation_assignments
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- app.protect_published_version() — BEFORE UPDATE trigger on plan versions.
-- Once published, the substance (method, tier behavior, effective dates,
-- version number, plan linkage) is frozen; only status may move
-- published → archived. Drafts remain freely editable.
-- ----------------------------------------------------------------------------
create or replace function app.protect_published_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('published', 'archived') then
    if new.compensation_method is distinct from old.compensation_method
       or new.tier_behavior   is distinct from old.tier_behavior
       or new.effective_from  is distinct from old.effective_from
       or new.version_number  is distinct from old.version_number
       or new.plan_id         is distinct from old.plan_id
       or (old.status = 'archived' and new.status <> 'archived')
       or (old.status = 'published' and new.status = 'draft') then
      raise exception 'published_version_immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger compensation_plan_versions_protect_published
  before update on public.compensation_plan_versions
  for each row execute function app.protect_published_version();

-- app.version_is_draft(version_id) — used by tier/rule policies so the
-- parameters of a published version cannot be edited either.
create or replace function app.version_is_draft(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.compensation_plan_versions v
    where v.id = p_version_id and v.status = 'draft'
  );
$$;

revoke all on function app.version_is_draft(uuid) from public;
grant execute on function app.version_is_draft(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS — compensation:read to view, compensation:manage to write.
-- Trainers do NOT see plan internals in this phase (their own statements
-- arrive with the payroll engine).
-- ----------------------------------------------------------------------------
alter table public.compensation_plans enable row level security;
alter table public.compensation_plans force row level security;
alter table public.compensation_plan_versions enable row level security;
alter table public.compensation_plan_versions force row level security;
alter table public.commission_tiers enable row level security;
alter table public.commission_tiers force row level security;
alter table public.compensation_rules enable row level security;
alter table public.compensation_rules force row level security;
alter table public.trainer_compensation_assignments enable row level security;
alter table public.trainer_compensation_assignments force row level security;

create policy compensation_plans_select on public.compensation_plans
  for select to authenticated
  using (app.has_permission_in(organization_id, 'compensation:read'));
create policy compensation_plans_insert on public.compensation_plans
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'compensation:manage'));
create policy compensation_plans_update on public.compensation_plans
  for update to authenticated
  using (app.has_permission_in(organization_id, 'compensation:manage'))
  with check (app.has_permission_in(organization_id, 'compensation:manage'));

create policy compensation_plan_versions_select on public.compensation_plan_versions
  for select to authenticated
  using (app.has_permission_in(organization_id, 'compensation:read'));
create policy compensation_plan_versions_insert on public.compensation_plan_versions
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'compensation:manage'));
create policy compensation_plan_versions_update on public.compensation_plan_versions
  for update to authenticated
  using (app.has_permission_in(organization_id, 'compensation:manage'))
  with check (app.has_permission_in(organization_id, 'compensation:manage'));

create policy commission_tiers_select on public.commission_tiers
  for select to authenticated
  using (app.has_permission_in(organization_id, 'compensation:read'));
create policy commission_tiers_insert on public.commission_tiers
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'compensation:manage')
    and app.version_is_draft(plan_version_id)
  );
create policy commission_tiers_update on public.commission_tiers
  for update to authenticated
  using (
    app.has_permission_in(organization_id, 'compensation:manage')
    and app.version_is_draft(plan_version_id)
  )
  with check (
    app.has_permission_in(organization_id, 'compensation:manage')
    and app.version_is_draft(plan_version_id)
  );
create policy commission_tiers_delete on public.commission_tiers
  for delete to authenticated
  using (
    app.has_permission_in(organization_id, 'compensation:manage')
    and app.version_is_draft(plan_version_id)
  );

create policy compensation_rules_select on public.compensation_rules
  for select to authenticated
  using (app.has_permission_in(organization_id, 'compensation:read'));
create policy compensation_rules_insert on public.compensation_rules
  for insert to authenticated
  with check (
    app.has_permission_in(organization_id, 'compensation:manage')
    and app.version_is_draft(plan_version_id)
  );
create policy compensation_rules_update on public.compensation_rules
  for update to authenticated
  using (
    app.has_permission_in(organization_id, 'compensation:manage')
    and app.version_is_draft(plan_version_id)
  )
  with check (
    app.has_permission_in(organization_id, 'compensation:manage')
    and app.version_is_draft(plan_version_id)
  );
create policy compensation_rules_delete on public.compensation_rules
  for delete to authenticated
  using (
    app.has_permission_in(organization_id, 'compensation:manage')
    and app.version_is_draft(plan_version_id)
  );

create policy trainer_comp_assignments_select on public.trainer_compensation_assignments
  for select to authenticated
  using (app.has_permission_in(organization_id, 'compensation:read'));
create policy trainer_comp_assignments_insert on public.trainer_compensation_assignments
  for insert to authenticated
  with check (app.has_permission_in(organization_id, 'compensation:manage'));
create policy trainer_comp_assignments_update on public.trainer_compensation_assignments
  for update to authenticated
  using (app.has_permission_in(organization_id, 'compensation:manage'))
  with check (app.has_permission_in(organization_id, 'compensation:manage'));
