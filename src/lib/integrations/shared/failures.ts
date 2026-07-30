/**
 * Failure classification — every automated operation maps errors to a
 * STABLE code with an explicit retryable flag and an operator-safe
 * message. Raw provider responses are never propagated into messages;
 * sanitization truncates and strips anything resembling a credential.
 */

export type FailureCode =
  | "authentication_failed"
  | "authorization_failed"
  | "rate_limited"
  | "provider_unavailable"
  | "network_timeout"
  | "invalid_response"
  | "schema_drift"
  | "mapping_failure"
  | "validation_failure"
  | "internal_transaction_failure"
  | "recipient_failure"
  | "delivery_not_configured"
  | "provider_blocked"
  | "permanent_configuration_failure"
  | "unknown";

export interface ClassifiedFailure {
  code: FailureCode;
  retryable: boolean;
  operatorMessage: string;
  recommendedAction: string;
}

const CLASSIFICATIONS: Record<
  FailureCode,
  { retryable: boolean; action: string }
> = {
  authentication_failed: {
    retryable: false,
    action: "Rotate the connection credentials, then re-validate the connection.",
  },
  authorization_failed: {
    retryable: false,
    action: "The credential lacks required scopes — review provider account permissions.",
  },
  rate_limited: {
    retryable: true,
    action: "Wait for the provider's rate-limit window; the job backs off automatically.",
  },
  provider_unavailable: {
    retryable: true,
    action: "Provider outage — retries continue with backoff. Check provider status.",
  },
  network_timeout: {
    retryable: true,
    action: "Transient network failure — retries continue with backoff.",
  },
  invalid_response: {
    retryable: false,
    action: "The provider returned an unparseable response — review adapter compatibility.",
  },
  schema_drift: {
    retryable: false,
    action:
      "The provider's data shape changed — review the drift report and update the adapter before resuming.",
  },
  mapping_failure: {
    retryable: false,
    action: "Records could not be mapped — resolve in the import review queue.",
  },
  validation_failure: {
    retryable: false,
    action: "Records failed validation — resolve in the import review queue.",
  },
  internal_transaction_failure: {
    retryable: true,
    action: "Internal write failed — retried automatically; investigate if it persists.",
  },
  recipient_failure: {
    retryable: false,
    action: "The recipient is not authorized or no longer active — fix the recipient list.",
  },
  delivery_not_configured: {
    retryable: false,
    action:
      "No email delivery provider is configured for this organization — configure a channel first.",
  },
  provider_blocked: {
    retryable: false,
    action: "The provider is blocked — see its setup checklist for the missing inputs.",
  },
  permanent_configuration_failure: {
    retryable: false,
    action: "Fix the connection or definition configuration, then retry manually.",
  },
  unknown: {
    retryable: true,
    action: "Unclassified failure — retried with backoff; investigate the job history.",
  },
};

/** Error subclass carrying an explicit classification. */
export class IntegrationFailure extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
  ) {
    super(message);
    this.name = "IntegrationFailure";
  }
}

const SECRET_PATTERN =
  /(bearer\s+[\w.-]+|refresh[Tt]oken=[\w-]+|api[_-]?key[=:]\s*[\w-]+|authorization[=:]\s*\S+)/g;

/** Strip credential-shaped substrings and bound length. */
export function sanitizeErrorMessage(message: string): string {
  return message.replaceAll(SECRET_PATTERN, "[redacted]").slice(0, 300);
}

export function classifyFailure(error: unknown): ClassifiedFailure {
  let code: FailureCode = "unknown";
  let raw = "";
  if (error instanceof IntegrationFailure) {
    code = error.code;
    raw = error.message;
  } else if (error instanceof Error) {
    raw = error.message;
    if (error.name === "ProviderBlockedError") code = "provider_blocked";
    else if (/timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(raw)) code = "network_timeout";
    else if (/429|rate.?limit/i.test(raw)) code = "rate_limited";
    else if (/401|invalid.?token|unauthenticated/i.test(raw)) code = "authentication_failed";
    else if (/403|forbidden/i.test(raw)) code = "authorization_failed";
    else if (/5\d\d|unavailable|bad gateway/i.test(raw)) code = "provider_unavailable";
  } else {
    raw = String(error);
  }
  const spec = CLASSIFICATIONS[code];
  return {
    code,
    retryable: spec.retryable,
    operatorMessage: sanitizeErrorMessage(raw) || code,
    recommendedAction: spec.action,
  };
}
