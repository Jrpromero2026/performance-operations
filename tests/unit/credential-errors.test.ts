import { describe, expect, it } from "vitest";
import { explainSecretResolutionFailure } from "@/lib/integrations/shared/credential-errors";

/**
 * These messages are the only thing standing between an operator and an
 * hour of debugging the wrong problem. Each one must name a DIFFERENT
 * fix, because the underlying causes need genuinely different work.
 */
describe("explainSecretResolutionFailure", () => {
  it("tells the operator to provision the vault key when it is missing", () => {
    const message = explainSecretResolutionFailure(
      'raise exception "worker_key_not_provisioned"'
    );
    expect(message).toMatch(/worker_server_key/);
    expect(message).toMatch(/WORKER_SECRET/);
  });

  it("explains that a mismatch requires rotating BOTH sides", () => {
    const message = explainSecretResolutionFailure("worker_key_mismatch");
    expect(message).toMatch(/does not match/);
    // The non-obvious part: WORKER_SECRET cannot be read back, so the fix
    // is to set one new value in both places, not to "look up" the old one.
    expect(message).toMatch(/BOTH places/);
  });

  it("distinguishes missing from mismatched", () => {
    const missing = explainSecretResolutionFailure("worker_key_not_provisioned");
    const mismatch = explainSecretResolutionFailure("worker_key_mismatch");
    expect(missing).not.toBe(mismatch);
  });

  it("does not blame the credential when the cause is authorization", () => {
    const message = explainSecretResolutionFailure("not_authorized");
    expect(message).toMatch(/platform-admin/);
    expect(message).not.toMatch(/rotate|re-submit/i);
  });

  it("directs a revoked credential to re-submission", () => {
    expect(explainSecretResolutionFailure("credentials_revoked")).toMatch(/revoked/);
  });

  it("directs a missing credential to the connection page", () => {
    expect(explainSecretResolutionFailure("secret_not_found")).toMatch(
      /No credential is stored/
    );
  });

  it("admits when it does not recognize the reason rather than guessing", () => {
    const message = explainSecretResolutionFailure("something entirely new");
    expect(message).toMatch(/not recognized/);
  });

  it("never echoes anything credential-shaped back to the operator", () => {
    // Defence in depth: the RPC returns no secret on failure, but if a
    // raised message ever carried one, it must not be reflected.
    const message = explainSecretResolutionFailure(
      "worker_key_mismatch: got sk_live_abcdef123456"
    );
    expect(message).not.toContain("sk_live_abcdef123456");
  });
});
