import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getProviderAdapter, listProviderAdapters } from "@/lib/integrations/registry";
import { ProviderBlockedError } from "@/lib/integrations/shared/contract";
import { verifyAcuitySignature } from "@/lib/integrations/providers/acuity";

describe("provider registry", () => {
  it("exposes exactly the three declared providers", () => {
    expect(listProviderAdapters().map((a) => a.key).sort()).toEqual([
      "acuity_api",
      "setmore_api",
      "test_provider",
    ]);
    expect(getProviderAdapter("unknown")).toBeNull();
  });

  it("marks Setmore and Acuity blocked with recorded reasons and checklists", () => {
    for (const key of ["setmore_api", "acuity_api"] as const) {
      const adapter = getProviderAdapter(key)!;
      expect(adapter.status).toBe("blocked");
      expect(adapter.blockedReasons.length).toBeGreaterThan(0);
      expect(adapter.setupChecklist.length).toBeGreaterThan(3);
    }
    expect(getProviderAdapter("test_provider")!.status).toBe("available");
  });
});

describe("blocked adapters fail closed", () => {
  it.each(["setmore_api", "acuity_api"] as const)(
    "%s validateConnection reports provider_blocked without network access",
    async (key) => {
      const adapter = getProviderAdapter(key)!;
      const validation = await adapter.validateConnection({
        connectionId: "c",
        organizationId: "o",
        window: { startDate: "2099-01-01", endDate: "2099-01-31" },
        cursor: null,
        secret: "anything",
        config: {},
        pageLimit: 10,
      });
      expect(validation.ok).toBe(false);
      expect(validation.failureCode).toBe("provider_blocked");
    },
  );

  it("acuity_api throws ProviderBlockedError from record handling", () => {
    const adapter = getProviderAdapter("acuity_api")!;
    expect(() =>
      adapter.normalizeSourceRecord(
        { externalId: "x", sourceUpdatedAt: null, payload: {} },
        { organizationTimezone: "America/Los_Angeles" },
      ),
    ).toThrow(ProviderBlockedError);
    expect(() => adapter.toEvidenceRow({ externalId: "x", sourceUpdatedAt: null, payload: {} })).toThrow(
      ProviderBlockedError,
    );
    expect(adapter.fetchAppointments).toBeUndefined();
  });

  /**
   * Setmore diverges from Acuity deliberately (Phase G). Its transport is
   * implemented, so the fail-closed boundary moved to where it belongs:
   * anything that could touch the network or the credential. Pure
   * normalization is a deterministic offline function with no credential
   * access, and blocking it would only prevent replaying already-captured
   * evidence — no safety is gained.
   */
  it("setmore_api fails closed on every credential-touching path", async () => {
    const adapter = getProviderAdapter("setmore_api")!;
    expect(adapter.status).toBe("blocked");
    await expect(
      adapter.fetchAppointments!({
        connectionId: "c",
        organizationId: "o",
        window: { startDate: "2099-01-01", endDate: "2099-01-31" },
        cursor: null,
        secret: "anything",
        config: {},
        pageLimit: 10,
      }),
    ).rejects.toThrow(ProviderBlockedError);
  });

  it("setmore_api normalizes offline evidence without a credential", () => {
    const adapter = getProviderAdapter("setmore_api")!;
    const record = {
      externalId: "abc123",
      sourceUpdatedAt: null,
      payload: {
        key: "abc123",
        start_time: "2025-12-01T17:30Z",
        end_time: "2025-12-01T18:30Z",
        staff_key: "staff_1",
        service_key: "svc_1",
      },
    };
    const { normalized } = adapter.normalizeSourceRecord(record, {
      organizationTimezone: "America/Los_Angeles",
    });
    expect(normalized.startAt).toBe("2025-12-01T17:30:00.000Z");
    expect(normalized.durationMinutes).toBe(60);
    // No status is available from the API, so none is invented.
    expect(normalized.sourceStatus).toBeUndefined();
    expect(adapter.toEvidenceRow(record).key).toBe("abc123");
  });
});

describe("verified capability matrices (mirror the findings docs)", () => {
  it("Setmore: date-range + cursor, NO status/webhooks/incremental", () => {
    const caps = getProviderAdapter("setmore_api")!.getCapabilities();
    expect(caps.appointmentsByDate).toBe(true);
    expect(caps.cursorPagination).toBe(true);
    // OBSERVED, not documented. The official docs claim 150; the live
    // account returns 50 and ignores the `limit` parameter entirely
    // (verified 2026-08-17). The capability matrix must describe the API
    // that exists, not the one that was written down — a sync planned
    // against 150 would underestimate its request count threefold.
    expect(caps.maxPageSize).toBe(50);
    expect(caps.incrementalSync).toBe(false);
    expect(caps.webhooks).toBe(false);
  });

  it("Setmore capability notes record where the docs proved wrong", () => {
    const notes = getProviderAdapter("setmore_api")!.getCapabilities().notes.join(" ");
    expect(notes).toMatch(/Page size is 50, not the documented 150/);
    expect(notes).toMatch(/~2 hours, not the documented ~7 days/);
    expect(notes).toMatch(/does not return historical\/archived services/);
  });

  it("Acuity: date windows + webhooks, no cursor", () => {
    const caps = getProviderAdapter("acuity_api")!.getCapabilities();
    expect(caps.appointmentsByDate).toBe(true);
    expect(caps.cursorPagination).toBe(false);
    expect(caps.webhooks).toBe(true);
    expect(caps.clients).toBe(true);
  });
});

describe("Acuity webhook signature verification (documented HMAC contract)", () => {
  const secret = "acuity-api-key";
  const body = "action=appointment.scheduled&id=123&calendarID=5&appointmentTypeID=9";
  const signature = createHmac("sha256", secret).update(body, "utf8").digest("base64");

  it("accepts a correctly signed body", () => {
    expect(
      verifyAcuitySignature({ rawBody: body, signatureHeader: signature, secret }).valid,
    ).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets, and missing inputs", () => {
    expect(
      verifyAcuitySignature({ rawBody: body + "x", signatureHeader: signature, secret }).valid,
    ).toBe(false);
    expect(
      verifyAcuitySignature({ rawBody: body, signatureHeader: signature, secret: "other" }).valid,
    ).toBe(false);
    expect(
      verifyAcuitySignature({ rawBody: body, signatureHeader: null, secret }).reason,
    ).toBe("missing_signature");
    expect(
      verifyAcuitySignature({ rawBody: body, signatureHeader: signature, secret: null }).reason,
    ).toBe("no_secret_configured");
  });
});
