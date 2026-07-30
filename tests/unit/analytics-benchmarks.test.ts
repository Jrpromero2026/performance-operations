import { describe, expect, it } from "vitest";
import { getMetricAnalyticsMetadata } from "@/lib/analytics/shared/metadata";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";

/**
 * Benchmark GOVERNANCE rules that live in TypeScript (creation-side
 * validation). Lifecycle enforcement (approval permission, frozen content,
 * deprecation) is database-trigger territory — covered by the live SQL
 * verification suite, not unit tests.
 */
describe("benchmark compatibility rules", () => {
  it("date metrics can never carry a benchmark", () => {
    for (const [id, definition] of METRIC_DEFINITIONS) {
      if (definition.unit === "date") {
        expect(getMetricAnalyticsMetadata(id)?.benchmarkCompatible).toBe(false);
      }
    }
  });

  it("unapproved metrics can never carry a benchmark", () => {
    for (const [id, definition] of METRIC_DEFINITIONS) {
      if (definition.notYetApproved) {
        expect(getMetricAnalyticsMetadata(id)?.benchmarkCompatible).toBe(false);
      }
    }
  });

  it("core operational metrics are benchmark-compatible", () => {
    for (const id of ["appointments_completed", "revenue_listed_cents", "client_retention_rate_bp"]) {
      expect(getMetricAnalyticsMetadata(id)?.benchmarkCompatible).toBe(true);
    }
  });
});
