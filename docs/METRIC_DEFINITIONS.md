# Metric Definitions

Generated from the metric catalog (`intel-v1`). Every metric lists its
business definition, exact formula (implemented exactly once), unit,
dependencies (`dataset:*` = loader facts, `configuration:*` = config
tables, bare ids = other metrics), scopes, and required permissions.
Undefined ratios (zero denominators) return null with a warning — never a
fake zero. Pipeline-gated metrics report waiting_for_imports /
waiting_for_payroll until their source exists.


#### `appointments_total` â€” Appointments (all statuses)

- **Definition:** All active ledger appointments in scope, any status.
- **Formula:** `count(appointments)`
- **Unit:** count Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `appointments_scheduled` â€” Appointments scheduled

- **Definition:** Appointments currently in canonical status 'scheduled'.
- **Formula:** `count(status = scheduled)`
- **Unit:** count Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `appointments_completed` â€” Appointments completed

- **Definition:** Appointments in canonical status 'completed'.
- **Formula:** `count(status = completed)`
- **Unit:** count Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `appointments_cancelled` â€” Appointments cancelled

- **Definition:** Appointments in canonical status 'cancelled'.
- **Formula:** `count(status = cancelled)`
- **Unit:** count Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `appointments_late_cancelled` â€” Appointments late-cancelled

- **Definition:** Appointments in canonical status 'late_cancelled'.
- **Formula:** `count(status = late_cancelled)`
- **Unit:** count Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `appointments_no_show` â€” No-shows

- **Definition:** Appointments in canonical status 'no_show'.
- **Formula:** `count(status = no_show)`
- **Unit:** count Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `appointments_rescheduled` â€” Appointments rescheduled

- **Definition:** Appointments in canonical status 'rescheduled'.
- **Formula:** `count(status = rescheduled)`
- **Unit:** count Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `completed_rate_bp` â€” Completed %

- **Definition:** Share of booked appointments (scheduled/completed/cancelled/late_cancelled/no_show) that completed.
- **Formula:** `completed Ã· booked Ã— 10000`
- **Unit:** rate_bp Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `appointments_completed`, `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `cancellation_rate_bp` â€” Cancellation %

- **Definition:** Share of booked appointments cancelled or late-cancelled.
- **Formula:** `(cancelled + late_cancelled) Ã· booked Ã— 10000`
- **Unit:** rate_bp Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `appointments_cancelled`, `appointments_late_cancelled`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `no_show_rate_bp` â€” No-show %

- **Definition:** Share of booked appointments that were no-shows.
- **Formula:** `no_show Ã· booked Ã— 10000`
- **Unit:** rate_bp Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `appointments_no_show`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `average_session_duration_minutes` â€” Average session duration

- **Definition:** Mean duration of completed appointments.
- **Formula:** `mean(duration_minutes of completed)`
- **Unit:** minutes Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `median_session_duration_minutes` â€” Median session duration

- **Definition:** Median duration of completed appointments.
- **Formula:** `median(duration_minutes of completed)`
- **Unit:** minutes Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `coaching_minutes` â€” Coaching time

- **Definition:** Minutes of completed appointments whose service counts as coaching hours (display as hours = minutes Ã· 60).
- **Formula:** `Î£ duration_minutes(completed AND service.counts_as_coaching_hours)`
- **Unit:** minutes Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`, `configuration:services`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `completed_minutes` â€” Completed time (all services)

- **Definition:** Minutes of all completed appointments.
- **Formula:** `Î£ duration_minutes(completed)`
- **Unit:** minutes Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `scheduled_minutes` â€” Booked time

- **Definition:** Minutes of booked appointments regardless of outcome (scheduled/completed/cancelled/late_cancelled/no_show).
- **Formula:** `Î£ duration_minutes(booked statuses)`
- **Unit:** minutes Â· **Category:** scheduling Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `group_sessions_completed` â€” Group sessions completed

- **Definition:** Completed appointments on group-training services.
- **Formula:** `count(completed AND service.is_group_training)`
- **Unit:** count Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`, `configuration:services`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `evaluation_sessions_completed` â€” Evaluations completed

- **Definition:** Completed appointments on evaluation services.
- **Formula:** `count(completed AND service.is_evaluation)`
- **Unit:** count Â· **Category:** appointments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`, `configuration:services`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `session_growth_bp` â€” Session growth

- **Definition:** Change in completed appointments vs the previous equal-length window.
- **Formula:** `(completed âˆ’ previous_completed) Ã· previous_completed Ã— 10000`
- **Unit:** rate_bp Â· **Category:** growth Â· **Version:** intel-v1
- **Dependencies:** `appointments_completed`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `revenue_listed_cents` â€” Revenue (source listed)

- **Definition:** Sum of source listed amounts over completed appointments. This is listed session value, not collected cash.
- **Formula:** `Î£ source_listed_price_cents(completed)`
- **Unit:** cents Â· **Category:** revenue Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `revenue_paid_cents` â€” Revenue (source paid)

- **Definition:** Sum of source-reported paid amounts over completed appointments. Incomplete when the source omitted paid data.
- **Formula:** `Î£ source_amount_paid_cents(completed)`
- **Unit:** cents Â· **Category:** revenue Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `revenue_eligible_cents` â€” Eligible revenue (future)

- **Definition:** Payroll-eligible revenue. The business definition is not approved yet.
- **Formula:** `NOT APPROVED â€” never inferred`
- **Unit:** cents Â· **Category:** revenue Â· **Version:** intel-v1
- **Dependencies:** none
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)
- **Status:** business definition NOT approved â€” always unavailable

#### `revenue_recognized_cents` â€” Recognized revenue (future)

- **Definition:** Accounting-recognized revenue. The business definition is not approved yet.
- **Formula:** `NOT APPROVED â€” never inferred`
- **Unit:** cents Â· **Category:** revenue Â· **Version:** intel-v1
- **Dependencies:** none
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)
- **Status:** business definition NOT approved â€” always unavailable

#### `revenue_per_session_cents` â€” Revenue per session

- **Definition:** Listed revenue divided by completed session-counting appointments.
- **Formula:** `revenue_listed_cents Ã· completed_sessions`
- **Unit:** cents_per_session Â· **Category:** revenue Â· **Version:** intel-v1
- **Dependencies:** `revenue_listed_cents`, `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `revenue_per_hour_cents` â€” Revenue per hour

- **Definition:** Listed revenue per coaching hour.
- **Formula:** `revenue_listed_cents Ã— 60 Ã· coaching_minutes`
- **Unit:** cents_per_hour Â· **Category:** revenue Â· **Version:** intel-v1
- **Dependencies:** `revenue_listed_cents`, `coaching_minutes`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `average_session_value_cents` â€” Average session value

- **Definition:** Unweighted mean of listed values across completed appointments that carry one.
- **Formula:** `mean(source_listed_price_cents of completed)`
- **Unit:** cents Â· **Category:** revenue Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `revenue_growth_bp` â€” Revenue growth

- **Definition:** Change in listed revenue vs the previous equal-length window.
- **Formula:** `(revenue âˆ’ previous_revenue) Ã· previous_revenue Ã— 10000`
- **Unit:** rate_bp Â· **Category:** growth Â· **Version:** intel-v1
- **Dependencies:** `revenue_listed_cents`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `rolling_revenue_30d_cents` â€” Rolling revenue (30 days)

- **Definition:** Listed revenue over the 30 days ending at the range end (uses the current and previous windows; incomplete if they cover less).
- **Formula:** `Î£ source_listed_price_cents(completed, dateToâˆ’29 â€¦ dateTo)`
- **Unit:** cents Â· **Category:** revenue Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service, client Â· **Permission:** appointment:read (self: trainer:read_self)

#### `payroll_gross_cents` â€” Gross payroll

- **Definition:** Final gross compensation from finalized payroll runs whose periods overlap the range.
- **Formula:** `Î£ final_gross_compensation_cents(finalized runs)`
- **Unit:** cents Â· **Category:** payroll Â· **Version:** intel-v1
- **Dependencies:** `dataset:payroll`
- **Scopes:** organization, trainer Â· **Permission:** payroll:read (self: payroll:read_self)

#### `payroll_pct_of_revenue_bp` â€” Payroll %

- **Definition:** Gross payroll as a share of listed revenue.
- **Formula:** `payroll_gross_cents Ã· revenue_listed_cents Ã— 10000`
- **Unit:** rate_bp Â· **Category:** payroll Â· **Version:** intel-v1
- **Dependencies:** `payroll_gross_cents`, `revenue_listed_cents`
- **Scopes:** organization, trainer Â· **Permission:** payroll:read (self: payroll:read_self)

#### `payroll_per_session_cents` â€” Payroll per session

- **Definition:** Gross payroll divided by the sessions the payroll engine counted (reconciles to posted payroll, not the ledger).
- **Formula:** `payroll_gross_cents Ã· payroll_completed_sessions`
- **Unit:** cents_per_session Â· **Category:** payroll Â· **Version:** intel-v1
- **Dependencies:** `payroll_gross_cents`, `dataset:payroll`
- **Scopes:** organization, trainer Â· **Permission:** payroll:read (self: payroll:read_self)

#### `payroll_per_hour_cents` â€” Payroll per hour

- **Definition:** Gross payroll per compensated hour from finalized runs.
- **Formula:** `payroll_gross_cents Ã— 60 Ã· compensated_minutes`
- **Unit:** cents_per_hour Â· **Category:** payroll Â· **Version:** intel-v1
- **Dependencies:** `payroll_gross_cents`, `dataset:payroll`
- **Scopes:** organization, trainer Â· **Permission:** payroll:read (self: payroll:read_self)

#### `payroll_bonus_cents` â€” Payroll bonuses

- **Definition:** Bonus totals (evaluation bonuses + positive adjustments).
- **Formula:** `Î£ bonus_total_cents(finalized runs)`
- **Unit:** cents Â· **Category:** payroll Â· **Version:** intel-v1
- **Dependencies:** `dataset:payroll`
- **Scopes:** organization, trainer Â· **Permission:** payroll:read (self: payroll:read_self)

#### `payroll_deduction_cents` â€” Payroll deductions

- **Definition:** Deduction magnitudes from finalized runs.
- **Formula:** `Î£ deduction_total_cents(finalized runs)`
- **Unit:** cents Â· **Category:** payroll Â· **Version:** intel-v1
- **Dependencies:** `dataset:payroll`
- **Scopes:** organization, trainer Â· **Permission:** payroll:read (self: payroll:read_self)

#### `payroll_adjustment_net_cents` â€” Payroll adjustments (net)

- **Definition:** Signed adjustment total from finalized runs.
- **Formula:** `Î£ adjustment_total_cents(finalized runs)`
- **Unit:** cents Â· **Category:** payroll Â· **Version:** intel-v1
- **Dependencies:** `dataset:payroll`
- **Scopes:** organization, trainer Â· **Permission:** payroll:read (self: payroll:read_self)

#### `payroll_growth_bp` â€” Payroll growth

- **Definition:** Change in gross payroll vs finalized runs of the previous equal-length window.
- **Formula:** `(gross âˆ’ previous_gross) Ã· previous_gross Ã— 10000`
- **Unit:** rate_bp Â· **Category:** growth Â· **Version:** intel-v1
- **Dependencies:** `payroll_gross_cents`
- **Scopes:** organization, trainer Â· **Permission:** payroll:read (self: payroll:read_self)

#### `payroll_variance_cents` â€” Payroll variance

- **Definition:** Signed cents difference between this window's gross payroll and the previous window's.
- **Formula:** `payroll_gross_cents âˆ’ previous_payroll_gross_cents`
- **Unit:** cents Â· **Category:** payroll Â· **Version:** intel-v1
- **Dependencies:** `payroll_gross_cents`
- **Scopes:** organization, trainer Â· **Permission:** payroll:read (self: payroll:read_self)

#### `active_clients` â€” Active clients

- **Definition:** Distinct clients with â‰¥1 completed appointment in the window.
- **Formula:** `count(distinct client_id of completed)`
- **Unit:** count Â· **Category:** clients Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer, service Â· **Permission:** client:read (self: trainer:read_self)

#### `inactive_clients` â€” Inactive clients

- **Definition:** Clients who had completed appointments before the window ends but none inside it (organization lifetime view).
- **Formula:** `count(lifetime clients with first_visit â‰¤ dateTo) âˆ’ active_clients`
- **Unit:** count Â· **Category:** clients Â· **Version:** intel-v1
- **Dependencies:** `active_clients`, `dataset:client_history`
- **Scopes:** organization Â· **Permission:** client:read (self: trainer:read_self)

#### `new_clients` â€” New clients

- **Definition:** Clients whose first-ever completed appointment falls inside the window.
- **Formula:** `count(clients with first_visit within range)`
- **Unit:** count Â· **Category:** clients Â· **Version:** intel-v1
- **Dependencies:** `dataset:client_history`
- **Scopes:** organization Â· **Permission:** client:read (self: trainer:read_self)

#### `returning_clients` â€” Returning clients

- **Definition:** Active clients whose first visit predates the window.
- **Formula:** `active_clients âˆ’ new_clients`
- **Unit:** count Â· **Category:** clients Â· **Version:** intel-v1
- **Dependencies:** `active_clients`, `new_clients`
- **Scopes:** organization Â· **Permission:** client:read (self: trainer:read_self)

#### `sessions_per_client_x100` â€” Sessions per client

- **Definition:** Completed appointments per active client (value Ã— 100, two implied decimals).
- **Formula:** `completed Ã· active_clients Ã— 100`
- **Unit:** sessions_per_client Â· **Category:** clients Â· **Version:** intel-v1
- **Dependencies:** `appointments_completed`, `active_clients`
- **Scopes:** organization, department, trainer, service Â· **Permission:** client:read (self: trainer:read_self)

#### `revenue_per_client_cents` â€” Revenue per client

- **Definition:** Listed revenue divided by active clients.
- **Formula:** `revenue_listed_cents Ã· active_clients`
- **Unit:** cents_per_client Â· **Category:** clients Â· **Version:** intel-v1
- **Dependencies:** `revenue_listed_cents`, `active_clients`
- **Scopes:** organization, department, trainer, service Â· **Permission:** client:read (self: trainer:read_self)

#### `average_client_spend_cents` â€” Average client spend (paid)

- **Definition:** Source-paid revenue divided by active clients; incomplete when the source omitted paid amounts.
- **Formula:** `revenue_paid_cents Ã· active_clients`
- **Unit:** cents_per_client Â· **Category:** clients Â· **Version:** intel-v1
- **Dependencies:** `revenue_paid_cents`, `active_clients`
- **Scopes:** organization, department, trainer, service Â· **Permission:** client:read (self: trainer:read_self)

#### `client_retention_rate_bp` â€” Client retention

- **Definition:** Share of the previous window's active clients who are active again in this window.
- **Formula:** `count(previous_active âˆ© active) Ã· count(previous_active) Ã— 10000`
- **Unit:** rate_bp Â· **Category:** retention Â· **Version:** intel-v1
- **Dependencies:** `active_clients`, `dataset:client_history`
- **Scopes:** organization, department, trainer Â· **Permission:** client:read (self: trainer:read_self)

#### `visit_frequency_per_week_x100` â€” Visit frequency

- **Definition:** Completed appointments per active client per week (value Ã— 100).
- **Formula:** `completed Ã· active_clients Ã· weeks_in_range Ã— 100`
- **Unit:** visits_per_week Â· **Category:** retention Â· **Version:** intel-v1
- **Dependencies:** `appointments_completed`, `active_clients`
- **Scopes:** organization, department, trainer, service Â· **Permission:** client:read (self: trainer:read_self)

#### `client_first_visit` â€” First visit

- **Definition:** The client's first-ever completed appointment date.
- **Formula:** `min(appointment_date of completed, lifetime)`
- **Unit:** date Â· **Category:** clients Â· **Version:** intel-v1
- **Dependencies:** `dataset:client_history`
- **Scopes:** client Â· **Permission:** client:read (self: trainer:read_self)

#### `client_last_visit` â€” Last visit

- **Definition:** The client's most recent completed appointment date.
- **Formula:** `max(appointment_date of completed, lifetime)`
- **Unit:** date Â· **Category:** clients Â· **Version:** intel-v1
- **Dependencies:** `dataset:client_history`
- **Scopes:** client Â· **Permission:** client:read (self: trainer:read_self)

#### `client_growth_bp` â€” Client growth

- **Definition:** Change in active clients vs the previous equal-length window.
- **Formula:** `(active âˆ’ previous_active) Ã· previous_active Ã— 10000`
- **Unit:** rate_bp Â· **Category:** growth Â· **Version:** intel-v1
- **Dependencies:** `active_clients`
- **Scopes:** organization, department, trainer, service Â· **Permission:** client:read (self: trainer:read_self)

#### `repeat_client_count` â€” Repeat clients

- **Definition:** Distinct clients with two or more completed appointments in the window for this scope.
- **Formula:** `count(clients with â‰¥2 completed)`
- **Unit:** count Â· **Category:** trainers Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, trainer Â· **Permission:** client:read (self: trainer:read_self)

#### `active_trainers` â€” Active trainers

- **Definition:** Distinct trainers with at least one completed appointment in the window for this scope.
- **Formula:** `count(distinct trainer_id of completed)`
- **Unit:** count Â· **Category:** departments Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization, department, service Â· **Permission:** trainer:read

#### `active_departments` â€” Active departments

- **Definition:** Distinct departments with at least one completed appointment in the window.
- **Formula:** `count(distinct department_id of completed)`
- **Unit:** count Â· **Category:** organizations Â· **Version:** intel-v1
- **Dependencies:** `dataset:appointments`
- **Scopes:** organization Â· **Permission:** department:read

#### `schedule_utilization_bp` â€” Schedule utilization

- **Definition:** Share of booked time that was actually delivered (completed minutes over booked minutes).
- **Formula:** `completed_minutes Ã· scheduled_minutes Ã— 10000`
- **Unit:** rate_bp Â· **Category:** utilization Â· **Version:** intel-v1
- **Dependencies:** `completed_minutes`, `scheduled_minutes`
- **Scopes:** organization, department, trainer, service Â· **Permission:** appointment:read (self: trainer:read_self)

#### `capacity_utilization_bp` â€” Capacity utilization

- **Definition:** Coached time against configured availability. Availability/capacity configuration does not exist yet.
- **Formula:** `coaching_minutes Ã· configured_capacity_minutes Ã— 10000`
- **Unit:** rate_bp Â· **Category:** utilization Â· **Version:** intel-v1
- **Dependencies:** `coaching_minutes`, `configuration:capacity`
- **Scopes:** organization, department, trainer Â· **Permission:** appointment:read (self: trainer:read_self)

#### `trainer_assignment_coverage_bp` â€” Trainer assignment complete

- **Definition:** Share of roster trainers (active org assignment) that also have an active department assignment.
- **Formula:** `trainers_with_department Ã· roster_trainers Ã— 10000`
- **Unit:** rate_bp Â· **Category:** readiness Â· **Version:** intel-v1
- **Dependencies:** `configuration:trainers`
- **Scopes:** organization Â· **Permission:** report:manage

#### `compensation_coverage_bp` â€” Compensation complete

- **Definition:** Share of active trainers with an active compensation plan assignment.
- **Formula:** `trainers_with_compensation Ã· active_trainers Ã— 10000`
- **Unit:** rate_bp Â· **Category:** readiness Â· **Version:** intel-v1
- **Dependencies:** `configuration:compensation`
- **Scopes:** organization Â· **Permission:** report:manage

#### `service_alias_coverage_bp` â€” Import alias coverage

- **Definition:** Share of active services with at least one import source alias (imports auto-match only via aliases).
- **Formula:** `services_with_alias Ã· active_services Ã— 10000`
- **Unit:** rate_bp Â· **Category:** readiness Â· **Version:** intel-v1
- **Dependencies:** `configuration:services`
- **Scopes:** organization Â· **Permission:** report:manage

#### `reporting_period_coverage_bp` â€” Reporting period coverage

- **Definition:** Whether reporting periods fully cover the selected date range (10000 = fully covered).
- **Formula:** `range fully covered by periods ? 10000 : 0`
- **Unit:** rate_bp Â· **Category:** readiness Â· **Version:** intel-v1
- **Dependencies:** `configuration:periods`
- **Scopes:** organization Â· **Permission:** report:manage

#### `import_health_bp` â€” Import health

- **Definition:** Import pipeline state: full health requires zero open blocking issues and no batches stuck awaiting action.
- **Formula:** `passed_checks Ã· 2 Ã— 10000 (checks: no open blocking issues; no waiting batches)`
- **Unit:** rate_bp Â· **Category:** readiness Â· **Version:** intel-v1
- **Dependencies:** `dataset:import_state`
- **Scopes:** organization Â· **Permission:** report:manage

#### `payroll_readiness_bp` â€” Payroll readiness

- **Definition:** Payroll pipeline state: full readiness requires compensation coverage, zero open blocking payroll issues, and no unfinished active runs.
- **Formula:** `passed_checks Ã· 3 Ã— 10000 (checks: compensation complete; no blocking issues; no unfinished runs)`
- **Unit:** rate_bp Â· **Category:** readiness Â· **Version:** intel-v1
- **Dependencies:** `compensation_coverage_bp`, `dataset:payroll_state`
- **Scopes:** organization Â· **Permission:** report:manage

#### `organization_readiness_bp` â€” Organization readiness

- **Definition:** Mean of the readiness indicators above â€” the executive setup score.
- **Formula:** `mean(trainer_assignment, compensation, alias, period coverage, import health, payroll readiness)`
- **Unit:** rate_bp Â· **Category:** readiness Â· **Version:** intel-v1
- **Dependencies:** `trainer_assignment_coverage_bp`, `compensation_coverage_bp`, `service_alias_coverage_bp`, `reporting_period_coverage_bp`, `import_health_bp`, `payroll_readiness_bp`
- **Scopes:** organization Â· **Permission:** report:manage
