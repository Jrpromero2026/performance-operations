-- ============================================================================
-- Performance Operations — Phase 9, Migration 32: analytics report packages
-- and scheduled-report subscription types
--
-- Additive CHECK extensions: analytics package types reuse the Phase 7
-- report_packages infrastructure (versioned manifests, supersede chains,
-- finality); analytics subscriptions reuse the Phase 8 scheduled-report
-- engine (recipient governance, one-execution-per-occurrence, test-mode
-- delivery). No new parallel export system.
-- ============================================================================

alter table public.report_packages
  drop constraint report_packages_package_type_check;
alter table public.report_packages
  add constraint report_packages_package_type_check check (package_type in (
    'executive', 'department', 'payroll', 'trainer_statements',
    'import_reconciliation', 'readiness', 'full_close',
    -- Phase 9 analytics packages
    'executive_analytics', 'department_scorecard', 'trainer_scorecard',
    'goal_progress', 'benchmark', 'cohort_analysis', 'board_presentation'
  ));

alter table public.scheduled_report_definitions
  drop constraint scheduled_report_definitions_report_type_check;
alter table public.scheduled_report_definitions
  add constraint scheduled_report_definitions_report_type_check check (report_type in (
    'quick_report', 'executive_package', 'department_package', 'payroll_package',
    -- Phase 9 analytics subscriptions
    'executive_scorecard', 'department_scorecard', 'trainer_self_scorecard',
    'goal_progress_report', 'benchmark_report', 'cohort_report',
    'analytics_dashboard', 'board_presentation_package'
  ));

-- Dashboard linkage for dashboard subscriptions and packages: the
-- referenced dashboard must survive as evidence — archive, never destroy
-- (deletes are already impossible; this records which dashboard).
alter table public.scheduled_report_definitions
  add column if not exists dashboard_id uuid references public.analytics_dashboards (id) on delete set null;
alter table public.report_packages
  add column if not exists dashboard_id uuid references public.analytics_dashboards (id) on delete set null;
