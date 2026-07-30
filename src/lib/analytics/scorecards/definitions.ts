/**
 * Default scorecard definitions — code-defined compositions of EXISTING
 * catalog metrics (custom per-user compositions belong to the dashboard
 * builder; a scorecard_definitions table is deliberately deferred until a
 * business owner asks for org-managed custom scorecards — decision log).
 *
 * Every item references a catalog metric id; labels are display-only.
 * Metric access is enforced per item by the engine (an item the viewer
 * cannot read renders as unavailable — composition never widens access).
 */

export interface ScorecardItemDef {
  metricId: string;
  label: string;
}

export interface ScorecardSectionDef {
  title: string;
  items: ScorecardItemDef[];
}

export interface ScorecardDef {
  key:
    | "organization_executive"
    | "department"
    | "trainer"
    | "payroll_operations"
    | "period_close"
    | "integration_operations";
  name: string;
  description: string;
  sections: ScorecardSectionDef[];
}

export const ORGANIZATION_EXECUTIVE_SCORECARD: ScorecardDef = {
  key: "organization_executive",
  name: "Organization Executive Scorecard",
  description:
    "Operational volume, scheduling outcomes, client activity, payroll, and readiness for the organization.",
  sections: [
    {
      title: "Operational volume",
      items: [
        { metricId: "appointments_completed", label: "Completed sessions" },
        { metricId: "appointments_total", label: "Total appointments" },
        { metricId: "coaching_minutes", label: "Coaching time" },
        { metricId: "active_trainers", label: "Active trainers" },
      ],
    },
    {
      title: "Scheduling outcomes",
      items: [
        { metricId: "completed_rate_bp", label: "Completed rate" },
        { metricId: "cancellation_rate_bp", label: "Cancellation rate" },
        { metricId: "no_show_rate_bp", label: "No-show rate" },
        { metricId: "schedule_utilization_bp", label: "Schedule utilization" },
      ],
    },
    {
      title: "Source amounts",
      items: [
        { metricId: "revenue_listed_cents", label: "Source-listed amount" },
        { metricId: "revenue_paid_cents", label: "Source-paid amount" },
        { metricId: "revenue_per_session_cents", label: "Listed amount / session" },
        { metricId: "revenue_per_hour_cents", label: "Listed amount / hour" },
      ],
    },
    {
      title: "Client activity",
      items: [
        { metricId: "active_clients", label: "Active clients" },
        { metricId: "new_clients", label: "New clients" },
        { metricId: "returning_clients", label: "Returning clients" },
        { metricId: "client_retention_rate_bp", label: "Client retention" },
      ],
    },
    {
      title: "Payroll",
      items: [
        { metricId: "payroll_gross_cents", label: "Posted gross payroll" },
        { metricId: "payroll_pct_of_revenue_bp", label: "Payroll % of listed amount" },
      ],
    },
    {
      title: "Organization readiness",
      items: [
        { metricId: "organization_readiness_bp", label: "Overall readiness" },
        { metricId: "import_health_bp", label: "Import health" },
        { metricId: "payroll_readiness_bp", label: "Payroll readiness" },
      ],
    },
  ],
};

export const DEPARTMENT_SCORECARD: ScorecardDef = {
  key: "department",
  name: "Department Scorecard",
  description:
    "Volume, outcomes, source amounts, payroll, and client activity for one department.",
  sections: [
    {
      title: "Appointment volume",
      items: [
        { metricId: "appointments_completed", label: "Completed sessions" },
        { metricId: "appointments_total", label: "Total appointments" },
        { metricId: "coaching_minutes", label: "Coaching time" },
        { metricId: "active_trainers", label: "Active trainers" },
      ],
    },
    {
      title: "Scheduling outcomes",
      items: [
        { metricId: "completed_rate_bp", label: "Completed rate" },
        { metricId: "cancellation_rate_bp", label: "Cancellation rate" },
        { metricId: "no_show_rate_bp", label: "No-show rate" },
      ],
    },
    {
      title: "Source amounts & payroll",
      items: [
        { metricId: "revenue_listed_cents", label: "Source-listed amount" },
        { metricId: "revenue_paid_cents", label: "Source-paid amount" },
        { metricId: "average_session_value_cents", label: "Avg session value (listed)" },
        { metricId: "payroll_gross_cents", label: "Posted gross payroll" },
      ],
    },
    {
      title: "Client activity",
      items: [
        { metricId: "active_clients", label: "Active clients" },
        { metricId: "new_clients", label: "New clients" },
        { metricId: "returning_clients", label: "Returning clients" },
      ],
    },
  ],
};

export const TRAINER_SCORECARD: ScorecardDef = {
  key: "trainer",
  name: "Trainer Scorecard",
  description:
    "One trainer's sessions, outcomes, source amounts, own posted payroll, and client activity.",
  sections: [
    {
      title: "Sessions",
      items: [
        { metricId: "appointments_completed", label: "Completed sessions" },
        { metricId: "appointments_cancelled", label: "Cancelled" },
        { metricId: "appointments_no_show", label: "No-shows" },
        { metricId: "completed_rate_bp", label: "Completed rate" },
        { metricId: "cancellation_rate_bp", label: "Cancellation rate" },
        { metricId: "coaching_minutes", label: "Hours coached" },
        { metricId: "average_session_duration_minutes", label: "Avg session duration" },
      ],
    },
    {
      title: "Source amounts",
      items: [
        { metricId: "revenue_listed_cents", label: "Source-listed amount" },
        { metricId: "revenue_paid_cents", label: "Source-paid amount" },
        { metricId: "revenue_per_hour_cents", label: "Listed amount / hour" },
      ],
    },
    {
      title: "Payroll (own)",
      items: [
        { metricId: "payroll_gross_cents", label: "Posted gross payroll" },
        { metricId: "payroll_per_hour_cents", label: "Payroll / hour" },
      ],
    },
    {
      title: "Clients",
      items: [
        { metricId: "active_clients", label: "Clients served" },
        { metricId: "returning_clients", label: "Returning clients" },
        { metricId: "repeat_client_count", label: "Repeat clients" },
      ],
    },
    {
      title: "Utilization",
      items: [
        { metricId: "schedule_utilization_bp", label: "Schedule utilization" },
      ],
    },
  ],
};

export const PAYROLL_OPERATIONS_SCORECARD: ScorecardDef = {
  key: "payroll_operations",
  name: "Payroll Operations Scorecard",
  description: "Posted payroll composition and readiness for the organization.",
  sections: [
    {
      title: "Posted payroll",
      items: [
        { metricId: "payroll_gross_cents", label: "Gross payroll" },
        { metricId: "payroll_per_session_cents", label: "Payroll / session" },
        { metricId: "payroll_per_hour_cents", label: "Payroll / hour" },
        { metricId: "payroll_pct_of_revenue_bp", label: "Payroll % of listed amount" },
      ],
    },
    {
      title: "Composition",
      items: [
        { metricId: "payroll_bonus_cents", label: "Bonuses" },
        { metricId: "payroll_deduction_cents", label: "Deductions" },
        { metricId: "payroll_adjustment_net_cents", label: "Net adjustments" },
        { metricId: "payroll_variance_cents", label: "Variance vs previous run" },
      ],
    },
    {
      title: "Readiness",
      items: [
        { metricId: "payroll_readiness_bp", label: "Payroll readiness" },
        { metricId: "compensation_coverage_bp", label: "Compensation coverage" },
      ],
    },
  ],
};

export const PERIOD_CLOSE_SCORECARD: ScorecardDef = {
  key: "period_close",
  name: "Period Close Scorecard",
  description:
    "Close readiness metrics; live close-run state is appended by the scorecard composer.",
  sections: [
    {
      title: "Close readiness",
      items: [
        { metricId: "organization_readiness_bp", label: "Overall readiness" },
        { metricId: "import_health_bp", label: "Import health" },
        { metricId: "payroll_readiness_bp", label: "Payroll readiness" },
        { metricId: "reporting_period_coverage_bp", label: "Period coverage" },
      ],
    },
  ],
};

export const INTEGRATION_OPERATIONS_SCORECARD: ScorecardDef = {
  key: "integration_operations",
  name: "Integration Operations Scorecard",
  description:
    "Import health metrics; live connection/job/delivery state is appended by the scorecard composer.",
  sections: [
    {
      title: "Pipeline health",
      items: [
        { metricId: "import_health_bp", label: "Import health" },
        { metricId: "service_alias_coverage_bp", label: "Service alias coverage" },
      ],
    },
  ],
};

export const DEFAULT_SCORECARDS: ScorecardDef[] = [
  ORGANIZATION_EXECUTIVE_SCORECARD,
  DEPARTMENT_SCORECARD,
  TRAINER_SCORECARD,
  PAYROLL_OPERATIONS_SCORECARD,
  PERIOD_CLOSE_SCORECARD,
  INTEGRATION_OPERATIONS_SCORECARD,
];
