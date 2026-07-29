import { describe, expect, it } from "vitest";
import {
  buildManifestPayload,
  hashManifest,
  sha256Hex,
  stableStringify,
  type ManifestInput,
} from "@/lib/close/manifest";
import { classifyCloseChecks } from "@/lib/close/checks";
import type { CloseReadinessInputs } from "@/lib/close/checks";

describe("stableStringify", () => {
  it("serializes object keys sorted, recursively", () => {
    expect(stableStringify({ b: 1, a: { z: true, m: null } })).toBe(
      '{"a":{"m":null,"z":true},"b":1}',
    );
  });

  it("is insensitive to key insertion order", () => {
    const one = stableStringify({ x: 1, y: [{ b: 2, a: 3 }] });
    const two = stableStringify({ y: [{ a: 3, b: 2 }], x: 1 });
    expect(one).toBe(two);
  });

  it("preserves array element order (arrays are sorted by the builder, not here)", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined-valued keys so hashes never depend on absent fields", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("handles primitives and escaping", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify("a\"b")).toBe(JSON.stringify('a"b'));
    expect(stableStringify(42)).toBe("42");
  });
});

describe("sha256Hex", () => {
  it("matches a known vector", () => {
    // sha256("") — standard test vector.
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

function readinessChecks() {
  const inputs: CloseReadinessInputs = {
    now: "2026-07-29T12:00:00Z",
    organizationId: "org-1",
    closeRunId: "run-1",
    period: {
      id: "period-1",
      organizationId: "org-1",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      status: "open",
      label: "June 2026",
    },
    policy: { allowSelfApproval: false, payrollRequiredState: "posted" },
    imports: {
      processing: 0,
      needsReview: 0,
      readyForApproval: 0,
      approvedUnposted: 0,
      failed: 0,
      reversedTouchingPeriod: 0,
    },
    appointments: { activeInPeriod: 5, correctionsInPeriod: 0 },
    payroll: {
      finalizedRun: {
        id: "payroll-1",
        name: "June payroll",
        status: "posted",
        snapshotVersion: 1,
        totalsReconcile: true,
        wasReopened: false,
      },
      activeRuns: [],
      openLateArrivalIssues: 0,
      stale: false,
      pendingAdjustments: 0,
      pendingTimeEntries: 0,
    },
    configuration: { readiness: [], paidAmountsPresent: true },
    reporting: {
      executivePackage: { id: "pkg-1", version: 1, status: "ready" },
      exportTypesPresent: ["payroll_register_csv", "executive_summary_csv"],
    },
    acknowledgements: new Set(["revenue_definitions_unapproved"]),
  };
  return classifyCloseChecks(inputs);
}

function manifestInput(): ManifestInput {
  return {
    organizationId: "org-1",
    organizationName: "Timberhill Athletic Club",
    period: {
      id: "period-1",
      label: "June 2026",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    },
    closeRunId: "run-1",
    closeVersion: 1,
    sourceCutoffAt: "2026-07-01T00:00:00Z",
    approvals: {
      initiatedBy: "user-a",
      reviewedBy: "user-a",
      reviewedAt: "2026-07-02T10:00:00Z",
      approvedBy: "user-b",
      approvedAt: "2026-07-02T11:00:00Z",
    },
    acknowledgements: [
      { checkCode: "zzz_last", actorId: "user-a", note: "reviewed", at: "t1" },
      { checkCode: "aaa_first", actorId: "user-a", note: "ok", at: "t2" },
    ],
    intelligenceVersion: "intel-v1",
    payroll: {
      runId: "payroll-1",
      calculationVersion: "calc-v1",
      snapshotVersion: 2,
      snapshotSha256: "abc123",
    },
    appointmentCount: 42,
    importBatches: { included: ["b2", "b1"], reversed: ["b9"] },
    reportPackage: { id: "pkg-1", type: "executive", version: 1, sha256: "def456" },
    exports: [
      {
        id: "e2",
        export_type: "payroll_register_csv",
        file_name: "register.csv",
        version: 1,
        sha256: "h2",
        row_count: 10,
      },
      {
        id: "e1",
        export_type: "executive_summary_csv",
        file_name: "summary.csv",
        version: 1,
        sha256: "h1",
        row_count: 20,
      },
    ],
    trainerStatementVersions: [
      { trainerId: "t-b", sha256: "s2" },
      { trainerId: "t-a", sha256: "s1" },
    ],
    readinessChecks: readinessChecks(),
    supersedesCloseRunId: null,
    reopenHistory: [],
  };
}

describe("buildManifestPayload", () => {
  it("sorts every embedded collection deterministically", () => {
    const payload = buildManifestPayload(manifestInput());
    expect(
      (payload.warning_acknowledgements as { check_code: string }[]).map(
        (a) => a.check_code,
      ),
    ).toEqual(["aaa_first", "zzz_last"]);
    expect((payload.import_batches as { included: string[] }).included).toEqual([
      "b1",
      "b2",
    ]);
    expect(
      (payload.exports as { export_type: string }[]).map((e) => e.export_type),
    ).toEqual(["executive_summary_csv", "payroll_register_csv"]);
    expect(
      (payload.trainer_statements as { trainer_id: string }[]).map((s) => s.trainer_id),
    ).toEqual(["t-a", "t-b"]);
    const codes = (payload.readiness_results as { code: string }[]).map((c) => c.code);
    expect(codes).toEqual([...codes].sort());
  });

  it("hashes identically regardless of input array order", () => {
    const a = manifestInput();
    const b = manifestInput();
    b.acknowledgements.reverse();
    b.exports.reverse();
    b.importBatches.included.reverse();
    b.trainerStatementVersions!.reverse();
    expect(hashManifest(buildManifestPayload(a))).toBe(
      hashManifest(buildManifestPayload(b)),
    );
  });

  it("changes the hash when any material fact changes", () => {
    const base = hashManifest(buildManifestPayload(manifestInput()));
    const mutations: ((i: ManifestInput) => void)[] = [
      (i) => (i.appointmentCount = 43),
      (i) => (i.payroll!.snapshotSha256 = "tampered"),
      (i) => (i.exports[0]!.sha256 = "tampered"),
      (i) => (i.approvals.approvedBy = "user-c"),
      (i) => (i.closeVersion = 2),
    ];
    for (const mutate of mutations) {
      const input = manifestInput();
      mutate(input);
      expect(hashManifest(buildManifestPayload(input))).not.toBe(base);
    }
  });

  it("excludes volatile execution fields from the hashed payload", () => {
    const payload = buildManifestPayload(manifestInput());
    const keys = JSON.stringify(payload);
    expect(keys).not.toContain("closed_by");
    expect(keys).not.toContain("closed_at");
  });

  it("records payroll as null for zero-activity closes without breaking engine versions", () => {
    const input = manifestInput();
    input.payroll = null;
    const payload = buildManifestPayload(input);
    expect(payload.payroll).toBeNull();
    expect(
      (payload.engine_versions as { payroll_calculation: string | null })
        .payroll_calculation,
    ).toBeNull();
  });

  it("round-trips through stableStringify to a stable byte sequence", () => {
    const payload = buildManifestPayload(manifestInput());
    expect(stableStringify(payload)).toBe(stableStringify(JSON.parse(stableStringify(payload))));
  });
});
