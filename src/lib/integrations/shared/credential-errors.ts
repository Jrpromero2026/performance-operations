/**
 * Operator-facing explanations for credential-resolution failures.
 *
 * `app.get_connection_secret_with_key` RAISES a precise reason for every
 * failure mode. Callers that discard that reason turn an actionable
 * diagnostic into a generic one — and worse, an infrastructure problem
 * (worker key missing or mismatched) then reads as a provider rejecting
 * the credential, sending an operator off to rotate a token that was
 * never at fault.
 *
 * Messages name the FIX, not the failure. No branch can echo a
 * credential: the RPC returns none on any failure path.
 */
export function explainSecretResolutionFailure(raw: string): string {
  if (raw.includes("worker_key_not_provisioned")) {
    return "The server worker key is not provisioned in this project's vault. Store a secret named `worker_server_key` whose value is EXACTLY the WORKER_SECRET environment variable, then retry. See docs/HOSTED_PILOT_ENVIRONMENT.md.";
  }
  if (raw.includes("worker_key_mismatch")) {
    return "The server worker key does not match the WORKER_SECRET environment variable. Because WORKER_SECRET is write-only once set, bring them into lockstep by generating one new value and setting it in BOTH places.";
  }
  if (raw.includes("not_authorized")) {
    return "Resolving a stored credential requires platform-admin access. Your role in this organization is not sufficient.";
  }
  if (raw.includes("credentials_revoked")) {
    return "This connection's credentials have been revoked. Submit a new provider credential before retrying.";
  }
  if (raw.includes("secret_not_found")) {
    return "No credential is stored for this connection. Add the provider credential on the connection page first.";
  }
  return "The stored credential could not be resolved, and the reason was not recognized. Check the connection's credential status.";
}
