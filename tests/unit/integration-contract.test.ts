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

  it.each(["setmore_api", "acuity_api"] as const)(
    "%s throws ProviderBlockedError from record handling",
    (key) => {
      const adapter = getProviderAdapter(key)!;
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
    },
  );
});

describe("verified capability matrices (mirror the findings docs)", () => {
  it("Setmore: date-range + cursor, NO status/webhooks/incremental", () => {
    const caps = getProviderAdapter("setmore_api")!.getCapabilities();
    expect(caps.appointmentsByDate).toBe(true);
    expect(caps.cursorPagination).toBe(true);
    expect(caps.maxPageSize).toBe(150);
    expect(caps.incrementalSync).toBe(false);
    expect(caps.webhooks).toBe(false);
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
