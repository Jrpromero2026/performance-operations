import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateTestRecords,
  resolveTestConfig,
  testProviderAdapter,
} from "@/lib/integrations/providers/test-provider";
import { IntegrationFailure } from "@/lib/integrations/shared/failures";
import type { FetchContext } from "@/lib/integrations/shared/contract";

function ctx(overrides: Partial<FetchContext> = {}): FetchContext {
  return {
    connectionId: "conn-1",
    organizationId: "org-1",
    window: { startDate: "2099-07-01", endDate: "2099-07-31" },
    cursor: null,
    secret: "test_ok",
    config: { record_count: 60, start_date: "2099-07-01", days: 5 },
    pageLimit: 25,
    ...overrides,
  };
}

describe("test provider determinism", () => {
  it("identical inputs produce identical records; different connections differ", () => {
    const config = resolveTestConfig({ record_count: 10 });
    const a = generateTestRecords(config, "conn-1", false);
    const b = generateTestRecords(config, "conn-1", false);
    const c = generateTestRecords(config, "conn-2", false);
    expect(a).toEqual(b);
    expect(a.map((r) => r.payload.status)).not.toEqual(c.map((r) => r.payload.status));
    expect(new Set(a.map((r) => r.externalId)).size).toBe(10);
  });
});

describe("pagination and windows", () => {
  it("pages with a cursor and terminates", async () => {
    const first = await testProviderAdapter.fetchAppointments!(ctx());
    expect(first.records.length).toBe(25);
    expect(first.nextCursor).toBe("1");
    const second = await testProviderAdapter.fetchAppointments!(ctx({ cursor: "1" }));
    expect(second.records.length).toBe(25);
    const third = await testProviderAdapter.fetchAppointments!(ctx({ cursor: "2" }));
    expect(third.records.length).toBe(10);
    expect(third.nextCursor).toBeNull();
    const ids = new Set(
      [...first.records, ...second.records, ...third.records].map((r) => r.externalId),
    );
    expect(ids.size).toBe(60);
  });

  it("re-fetching the same page returns identical records (idempotent input)", async () => {
    const a = await testProviderAdapter.fetchAppointments!(ctx({ cursor: "1" }));
    const b = await testProviderAdapter.fetchAppointments!(ctx({ cursor: "1" }));
    expect(a.records).toEqual(b.records);
  });

  it("respects the date window", async () => {
    const page = await testProviderAdapter.fetchAppointments!(
      ctx({ window: { startDate: "2099-07-02", endDate: "2099-07-03" } }),
    );
    for (const record of page.records) {
      expect(String(record.payload.date) >= "2099-07-02").toBe(true);
      expect(String(record.payload.date) <= "2099-07-03").toBe(true);
    }
  });

  it("rejects an unparseable cursor as invalid_response", async () => {
    await expect(
      testProviderAdapter.fetchAppointments!(ctx({ cursor: "not-a-page" })),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("filters by modified-since for incremental fetches", async () => {
    const page = await testProviderAdapter.fetchChangedAppointments!(
      ctx(),
      "2099-07-03T00:00:00Z",
    );
    for (const record of page.records) {
      expect(record.sourceUpdatedAt! > "2099-07-03T00:00:00Z").toBe(true);
    }
  });
});

describe("simulated failure credentials", () => {
  it("fail_auth → authentication_failed (not retryable)", async () => {
    await expect(
      testProviderAdapter.fetchAppointments!(ctx({ secret: "fail_auth_x" })),
    ).rejects.toMatchObject({ code: "authentication_failed" });
  });

  it("fail_outage → provider_unavailable (retryable)", async () => {
    await expect(
      testProviderAdapter.fetchAppointments!(ctx({ secret: "fail_outage_x" })),
    ).rejects.toBeInstanceOf(IntegrationFailure);
  });

  it("fail_rate throttles the first page with Retry-After then succeeds", async () => {
    const throttled = await testProviderAdapter.fetchAppointments!(
      ctx({ secret: "fail_rate_x" }),
    );
    expect(throttled.records).toHaveLength(0);
    expect(throttled.rateLimit?.throttled).toBe(true);
    expect(throttled.rateLimit?.retryAfterSeconds).toBe(1);
    const retried = await testProviderAdapter.fetchAppointments!(
      ctx({ secret: "fail_rate_x", cursor: "0" }),
    );
    expect(retried.records.length).toBeGreaterThan(0);
  });

  it("fail_drift removes the status field and changes the price type", () => {
    const config = resolveTestConfig({ record_count: 3 });
    const drifted = generateTestRecords(config, "conn-1", true);
    for (const record of drifted) {
      expect(record.payload.status).toBeUndefined();
      expect(typeof record.payload.price_cents).toBe("string");
      expect(record.payload.appointment_state).toBeDefined();
    }
  });

  it("validateConnection reports simulated failures without throwing", async () => {
    const bad = await testProviderAdapter.validateConnection(ctx({ secret: "fail_auth_1" }));
    expect(bad.ok).toBe(false);
    expect(bad.failureCode).toBe("authentication_failed");
    const good = await testProviderAdapter.validateConnection(ctx());
    expect(good.ok).toBe(true);
    expect(good.capabilities?.incrementalSync).toBe(true);
  });
});

describe("normalization into the import staging model", () => {
  it("maps records to NormalizedRow with statuses, price, and identifiers", () => {
    const [record] = generateTestRecords(resolveTestConfig({ record_count: 1 }), "conn-1", false);
    const result = testProviderAdapter.normalizeSourceRecord(record!, {
      organizationTimezone: "America/Los_Angeles",
    });
    expect(result.normalized.externalAppointmentId).toBe(record!.externalId);
    expect(result.normalized.appointmentDate).toBe(record!.payload.date);
    expect(result.normalized.sourceTrainerName).toBe("Payton E2E Payroll");
    expect(result.normalized.sourceServiceName).toBe("E2E Signature 60");
    expect(result.normalized.listedPriceCents).toBe(6400);
    expect(result.normalized.sourceStatus).toBe(record!.payload.status);
    expect(result.issues).toHaveLength(0);
  });

  it("evidence rows cover every declared column", () => {
    const [record] = generateTestRecords(resolveTestConfig({ record_count: 1 }), "conn-1", false);
    const row = testProviderAdapter.toEvidenceRow(record!);
    for (const column of testProviderAdapter.evidenceColumns) {
      expect(row).toHaveProperty(column);
    }
  });
});

describe("test provider webhooks", () => {
  const secret = "test_webhook_secret";
  const body = JSON.stringify({ event_id: "evt-1", action: "appointment.changed", record_id: "r1" });
  const signature = createHmac("sha256", secret).update(body, "utf8").digest("base64");

  it("verifies valid signatures and fresh timestamps", () => {
    expect(
      testProviderAdapter.verifyWebhook!({
        rawBody: body,
        signatureHeader: signature,
        secret,
        timestampHeader: new Date().toISOString(),
      }).valid,
    ).toBe(true);
  });

  it("rejects bad signatures, stale timestamps, and missing secrets", () => {
    expect(
      testProviderAdapter.verifyWebhook!({ rawBody: body, signatureHeader: "nope", secret }).valid,
    ).toBe(false);
    expect(
      testProviderAdapter.verifyWebhook!({
        rawBody: body,
        signatureHeader: signature,
        secret,
        timestampHeader: new Date(Date.now() - 10 * 60_000).toISOString(),
      }).reason,
    ).toBe("timestamp_out_of_window");
    expect(
      testProviderAdapter.verifyWebhook!({ rawBody: body, signatureHeader: signature, secret: null })
        .valid,
    ).toBe(false);
  });

  it("parses only well-formed JSON events", () => {
    const parsed = testProviderAdapter.parseWebhook!(body, "application/json");
    expect(parsed?.providerEventId).toBe("evt-1");
    expect(parsed?.eventType).toBe("appointment.changed");
    expect(testProviderAdapter.parseWebhook!("{}", "application/json")).toBeNull();
    expect(testProviderAdapter.parseWebhook!(body, "text/plain")).toBeNull();
    expect(testProviderAdapter.parseWebhook!("not json", "application/json")).toBeNull();
  });
});
