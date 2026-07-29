-- ============================================================================
-- Performance Operations — Phase 2, Migration 6: reporting-period management
--
-- Adds period typing, payment date, and notes; replaces the org-wide overlap
-- exclusion with a per-type exclusion (documented rule: a monthly REPORTING
-- period and a semi-monthly PAYROLL period may coexist over the same dates,
-- but two periods of the same type may never overlap in one organization).
-- Locked periods are protected by trigger: only holders of payroll:reopen
-- (platform admins) may modify or unlock them.
-- ============================================================================

alter table public.reporting_periods
  add column period_type  text not null default 'monthly'
             check (period_type in ('monthly', 'semi_monthly', 'biweekly', 'custom')),
  add column payment_date date,
  add column notes        text not null default '';

-- New periods default to open (draft remains a legal historical value).
alter table public.reporting_periods alter column status set default 'open';

-- Replace the org-wide overlap exclusion with a per-type exclusion.
alter table public.reporting_periods
  drop constraint reporting_periods_organization_id_daterange_excl;
alter table public.reporting_periods
  add constraint reporting_periods_no_same_type_overlap
  exclude using gist (
    organization_id with =,
    period_type with =,
    daterange(start_date, end_date, '[]') with &&
  );

-- ----------------------------------------------------------------------------
-- app.protect_locked_period() — BEFORE UPDATE trigger. A locked period can
-- only be modified (including unlocking) by a user holding payroll:reopen in
-- the organization. SECURITY DEFINER not needed: has_permission_in already is.
-- ----------------------------------------------------------------------------
create or replace function app.protect_locked_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'locked'
     and not app.has_permission_in(old.organization_id, 'payroll:reopen') then
    raise exception 'locked_period_requires_reopen_permission' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reporting_periods_protect_locked
  before update on public.reporting_periods
  for each row execute function app.protect_locked_period();
