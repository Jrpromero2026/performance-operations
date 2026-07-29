/** Shared import-domain types (pure; no I/O). */

export type ImportSource = "setmore" | "acuity" | "manual_csv";

export type IssueSeverity = "blocking" | "warning" | "info";

export interface RowIssue {
  code: string;
  severity: IssueSeverity;
  field?: string;
  message: string;
  /** Only set when safe to display in aggregate lists (never client PII). */
  originalValue?: string;
  suggestedAction?: string;
}

/**
 * Source-independent normalized staging row. Fields the source does not
 * provide are ABSENT (undefined); fields provided but blank are "" / null
 * per type; invalid values are absent WITH a recorded issue. This is the
 * missing / blank / invalid / not-provided distinction, kept practical.
 */
export interface NormalizedRow {
  externalAppointmentId?: string;
  externalClientId?: string;
  sourceAccountId?: string;

  appointmentDate?: string; // ISO date
  startAt?: string; // UTC ISO instant
  endAt?: string;
  durationMinutes?: number;
  timezone?: string;
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;

  sourceTrainerName?: string;
  sourceTrainerEmail?: string;

  sourceClientName?: string;
  sourceClientEmail?: string;
  sourceClientPhone?: string;

  sourceServiceName?: string;

  sourceStatus?: string;

  listedPriceCents?: number;
  amountPaidCents?: number;
  amountDueCents?: number;
  currency?: string;
  paymentStatus?: string;

  notes?: string;
  location?: string;
  bookingChannel?: string;
  participantCount?: number;

  /** Unknown source columns preserved verbatim (never discarded). */
  extra?: Record<string, string>;
}

export interface NormalizeResult {
  normalized: NormalizedRow;
  issues: RowIssue[];
}

export interface AdapterContext {
  organizationTimezone: string;
}

/** Source-adapter contract. Parsing stays isolated in these modules. */
export interface SourceAdapter {
  source: ImportSource;
  version: string;
  displayName: string;
  /** Trimmed header names this adapter requires. */
  requiredHeaders: string[];
  optionalHeaders: string[];
  /** 0–1 confidence that the given (trimmed) headers belong to this adapter. */
  detect(headers: string[]): number;
  normalizeRow(
    row: Record<string, string>,
    ctx: AdapterContext
  ): NormalizeResult;
}
