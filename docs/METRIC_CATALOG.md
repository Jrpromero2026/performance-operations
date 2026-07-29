# Metric Catalog

Generated from `src/lib/intelligence/catalog.ts` (engine version `intel-v1`,
60 metrics). The catalog is the single registry: duplicate ids or a
definition without exactly one evaluator fail at module load and in unit
tests. Units: `cents` = integer USD cents; `rate_bp` = basis points
(10000 = 100%); `minutes` = integer minutes (display converts to hours);
`*_x100` units carry two implied decimals.

Self permission = the permission that grants a trainer THEIR OWN value;
the reporting service forces trainer scope for self access.

| ID | Name | Category | Unit | Scopes | Permission | Self |
| --- | --- | --- | --- | --- | --- | --- |
| `appointments_total` | Appointments (all statuses) | appointments | count | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `appointments_scheduled` | Appointments scheduled | appointments | count | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `appointments_completed` | Appointments completed | appointments | count | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `appointments_cancelled` | Appointments cancelled | appointments | count | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `appointments_late_cancelled` | Appointments late-cancelled | appointments | count | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `appointments_no_show` | No-shows | appointments | count | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `appointments_rescheduled` | Appointments rescheduled | appointments | count | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `completed_rate_bp` | Completed % | appointments | rate_bp | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `cancellation_rate_bp` | Cancellation % | appointments | rate_bp | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `no_show_rate_bp` | No-show % | appointments | rate_bp | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `average_session_duration_minutes` | Average session duration | appointments | minutes | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `median_session_duration_minutes` | Median session duration | appointments | minutes | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `coaching_minutes` | Coaching time | appointments | minutes | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `completed_minutes` | Completed time (all services) | appointments | minutes | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `scheduled_minutes` | Booked time | scheduling | minutes | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `group_sessions_completed` | Group sessions completed | appointments | count | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `evaluation_sessions_completed` | Evaluations completed | appointments | count | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `session_growth_bp` | Session growth | growth | rate_bp | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `revenue_listed_cents` | Revenue (source listed) | revenue | cents | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `revenue_paid_cents` | Revenue (source paid) | revenue | cents | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `revenue_eligible_cents` | Eligible revenue (future) | revenue | cents | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `revenue_recognized_cents` | Recognized revenue (future) | revenue | cents | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `revenue_per_session_cents` | Revenue per session | revenue | cents_per_session | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `revenue_per_hour_cents` | Revenue per hour | revenue | cents_per_hour | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `average_session_value_cents` | Average session value | revenue | cents | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `revenue_growth_bp` | Revenue growth | growth | rate_bp | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `rolling_revenue_30d_cents` | Rolling revenue (30 days) | revenue | cents | organization, department, trainer, service, client | appointment:read | trainer:read_self |
| `payroll_gross_cents` | Gross payroll | payroll | cents | organization, trainer | payroll:read | payroll:read_self |
| `payroll_pct_of_revenue_bp` | Payroll % | payroll | rate_bp | organization, trainer | payroll:read | payroll:read_self |
| `payroll_per_session_cents` | Payroll per session | payroll | cents_per_session | organization, trainer | payroll:read | payroll:read_self |
| `payroll_per_hour_cents` | Payroll per hour | payroll | cents_per_hour | organization, trainer | payroll:read | payroll:read_self |
| `payroll_bonus_cents` | Payroll bonuses | payroll | cents | organization, trainer | payroll:read | payroll:read_self |
| `payroll_deduction_cents` | Payroll deductions | payroll | cents | organization, trainer | payroll:read | payroll:read_self |
| `payroll_adjustment_net_cents` | Payroll adjustments (net) | payroll | cents | organization, trainer | payroll:read | payroll:read_self |
| `payroll_growth_bp` | Payroll growth | growth | rate_bp | organization, trainer | payroll:read | payroll:read_self |
| `payroll_variance_cents` | Payroll variance | payroll | cents | organization, trainer | payroll:read | payroll:read_self |
| `active_clients` | Active clients | clients | count | organization, department, trainer, service | client:read | trainer:read_self |
| `inactive_clients` | Inactive clients | clients | count | organization | client:read | trainer:read_self |
| `new_clients` | New clients | clients | count | organization | client:read | trainer:read_self |
| `returning_clients` | Returning clients | clients | count | organization | client:read | trainer:read_self |
| `sessions_per_client_x100` | Sessions per client | clients | sessions_per_client | organization, department, trainer, service | client:read | trainer:read_self |
| `revenue_per_client_cents` | Revenue per client | clients | cents_per_client | organization, department, trainer, service | client:read | trainer:read_self |
| `average_client_spend_cents` | Average client spend (paid) | clients | cents_per_client | organization, department, trainer, service | client:read | trainer:read_self |
| `client_retention_rate_bp` | Client retention | retention | rate_bp | organization, department, trainer | client:read | trainer:read_self |
| `visit_frequency_per_week_x100` | Visit frequency | retention | visits_per_week | organization, department, trainer, service | client:read | trainer:read_self |
| `client_first_visit` | First visit | clients | date | client | client:read | trainer:read_self |
| `client_last_visit` | Last visit | clients | date | client | client:read | trainer:read_self |
| `client_growth_bp` | Client growth | growth | rate_bp | organization, department, trainer, service | client:read | trainer:read_self |
| `repeat_client_count` | Repeat clients | trainers | count | organization, department, trainer | client:read | trainer:read_self |
| `active_trainers` | Active trainers | departments | count | organization, department, service | trainer:read | â€” |
| `active_departments` | Active departments | organizations | count | organization | department:read | â€” |
| `schedule_utilization_bp` | Schedule utilization | utilization | rate_bp | organization, department, trainer, service | appointment:read | trainer:read_self |
| `capacity_utilization_bp` | Capacity utilization | utilization | rate_bp | organization, department, trainer | appointment:read | trainer:read_self |
| `trainer_assignment_coverage_bp` | Trainer assignment complete | readiness | rate_bp | organization | report:manage | â€” |
| `compensation_coverage_bp` | Compensation complete | readiness | rate_bp | organization | report:manage | â€” |
| `service_alias_coverage_bp` | Import alias coverage | readiness | rate_bp | organization | report:manage | â€” |
| `reporting_period_coverage_bp` | Reporting period coverage | readiness | rate_bp | organization | report:manage | â€” |
| `import_health_bp` | Import health | readiness | rate_bp | organization | report:manage | â€” |
| `payroll_readiness_bp` | Payroll readiness | readiness | rate_bp | organization | report:manage | â€” |
| `organization_readiness_bp` | Organization readiness | readiness | rate_bp | organization | report:manage | â€” |
