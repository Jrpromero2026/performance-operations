import { describe, expect, it } from "vitest";
import {
  isSetupComplete,
  nextIncompleteStep,
  readinessChecklist,
} from "@/lib/data/config-stats";
import type { OrgConfigStats } from "@/lib/data/config-stats";

/**
 * Setup readiness is a pure function over organization statistics. Phase
 * 9.5 re-worded it into owner language and tied each item to the wizard
 * step that satisfies it; the evaluation rules are unchanged, except that
 * the previously hardcoded-false "scheduling export sample" item became a
 * real check.
 */

const EMPTY: OrgConfigStats = {
  organizationId: "org-1",
  organizationName: "Test Gym",
  departments: 0,
  members: 0,
  admins: 0,
  pendingInvitations: 0,
  activeTrainers: 0,
  trainersWithCompensation: 0,
  activeServices: 0,
  servicesWithAliases: 0,
  reportingPeriods: 0,
  openPeriods: 0,
  compensationPlans: 0,
  publishedVersions: 0,
  importBatches: 0,
  postedImportBatches: 0,
  validatedPayrollRuns: 0,
};

const COMPLETE: OrgConfigStats = {
  ...EMPTY,
  departments: 3,
  members: 1,
  admins: 1,
  activeTrainers: 4,
  trainersWithCompensation: 4,
  activeServices: 5,
  servicesWithAliases: 5,
  reportingPeriods: 2,
  openPeriods: 1,
  compensationPlans: 2,
  publishedVersions: 2,
  importBatches: 1,
  postedImportBatches: 1,
  validatedPayrollRuns: 1,
};

describe("readiness checklist", () => {
  it("reaches 100% for a fully configured organization", () => {
    // The regression that mattered: the previous checklist contained a
    // permanently-false item, so this could never be true for anyone.
    expect(isSetupComplete(COMPLETE)).toBe(true);
  });

  it("is not complete for a brand-new organization", () => {
    expect(isSetupComplete(EMPTY)).toBe(false);
  });

  it("counts an uploaded scheduling file as real evidence", () => {
    const item = readinessChecklist({ ...EMPTY, importBatches: 1 }).find(
      (i) => i.label === "Scheduling file uploaded"
    );
    expect(item?.done).toBe(true);
  });

  it("does not credit payroll until a run produced reviewable numbers", () => {
    const notRun = readinessChecklist(EMPTY).find((i) => i.label === "Payroll validated");
    expect(notRun?.done).toBe(false);
    expect(notRun?.detail).toBe("not yet run");

    const validated = readinessChecklist({ ...EMPTY, validatedPayrollRuns: 1 }).find(
      (i) => i.label === "Payroll validated"
    );
    expect(validated?.done).toBe(true);
  });

  it("requires every trainer to have a plan, not merely some", () => {
    const partial = readinessChecklist({
      ...COMPLETE,
      activeTrainers: 4,
      trainersWithCompensation: 3,
    }).find((i) => i.label === "Trainer plans assigned");
    expect(partial?.done).toBe(false);
    expect(partial?.detail).toBe("3/4");
  });

  it("requires every service to be matched to the schedule", () => {
    const partial = readinessChecklist({
      ...COMPLETE,
      activeServices: 5,
      servicesWithAliases: 2,
    }).find((i) => i.label === "Service names matched to your schedule");
    expect(partial?.done).toBe(false);
    expect(partial?.detail).toBe("2/5");
  });

  it("speaks in owner language, not configuration objects", () => {
    const labels = readinessChecklist(EMPTY).map((i) => i.label);
    expect(labels).toContain("Trainers reviewed");
    expect(labels).toContain("Scheduling file uploaded");
    expect(labels).not.toContain("Trainers configured");
    expect(labels).not.toContain("Service aliases mapped");
  });
});

describe("nextIncompleteStep", () => {
  it("points at the earliest unfinished wizard step", () => {
    expect(nextIncompleteStep(EMPTY)).toBe(1);
  });

  it("advances as steps are satisfied", () => {
    const afterStepOne = { ...EMPTY, reportingPeriods: 1 };
    expect(nextIncompleteStep(afterStepOne)).toBe(2);

    const afterUpload = { ...afterStepOne, importBatches: 1 };
    expect(nextIncompleteStep(afterUpload)).toBe(3);

    const afterTrainers = { ...afterUpload, activeTrainers: 2 };
    expect(nextIncompleteStep(afterTrainers)).toBe(4);
  });

  it("returns null once every wizard-owned item passes", () => {
    expect(nextIncompleteStep(COMPLETE)).toBeNull();
  });

  it("ignores items no wizard step owns", () => {
    // Missing admin is a real readiness gap but not a wizard step, so it
    // must not send the owner back into the wizard.
    const noAdmin = { ...COMPLETE, admins: 0 };
    expect(nextIncompleteStep(noAdmin)).toBeNull();
    expect(isSetupComplete(noAdmin)).toBe(false);
  });
});
