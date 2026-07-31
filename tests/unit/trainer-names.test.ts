import { describe, expect, it } from "vitest";
import { splitTrainerName } from "@/lib/imports/trainer-names";

/**
 * Scheduling exports carry one display string; trainer records need a
 * first and last name. The rule that matters: never fabricate a surname.
 * When the source gives one token, say so and let the owner supply it.
 */

describe("splitTrainerName", () => {
  it("splits an ordinary two-part name", () => {
    expect(splitTrainerName("JR Romero")).toMatchObject({
      firstName: "JR",
      lastName: "Romero",
      needsLastName: false,
    });
  });

  it("treats everything before the final token as the given name", () => {
    expect(splitTrainerName("Mary Anne Wilson")).toMatchObject({
      firstName: "Mary Anne",
      lastName: "Wilson",
    });
  });

  it("keeps a generational suffix with the surname", () => {
    expect(splitTrainerName("Robert Downey Jr.")).toMatchObject({
      firstName: "Robert",
      lastName: "Downey Jr.",
    });
    expect(splitTrainerName("Sam Wilson III")).toMatchObject({
      firstName: "Sam",
      lastName: "Wilson III",
    });
  });

  it("handles the surname-first comma form", () => {
    expect(splitTrainerName("Romero, JR")).toMatchObject({
      firstName: "JR",
      lastName: "Romero",
      needsLastName: false,
    });
  });

  it("flags a mononym instead of inventing a surname", () => {
    const result = splitTrainerName("Amanda");
    expect(result.firstName).toBe("Amanda");
    expect(result.lastName).toBe("");
    expect(result.needsLastName).toBe(true);
  });

  it("never duplicates the given name into the surname slot", () => {
    // Guarding the tempting shortcut: "Amanda Amanda" would be a
    // fabricated name appearing on payroll statements.
    const result = splitTrainerName("Amanda");
    expect(result.lastName).not.toBe(result.firstName);
  });

  it("preserves the display name exactly as the source wrote it", () => {
    expect(splitTrainerName("JR  Romero").displayName).toBe("JR Romero");
    expect(splitTrainerName("  Kyra Smith  ").displayName).toBe("Kyra Smith");
  });

  it("collapses internal whitespace when splitting", () => {
    expect(splitTrainerName("JR   Romero")).toMatchObject({
      firstName: "JR",
      lastName: "Romero",
    });
  });

  it("reports an empty source as needing a name", () => {
    expect(splitTrainerName("   ")).toMatchObject({
      firstName: "",
      lastName: "",
      needsLastName: true,
    });
  });

  it("does not strip a suffix that is the only surname", () => {
    // "Sam V" — V is more likely the surname than a suffix here, since
    // dropping it would leave no surname at all.
    expect(splitTrainerName("Sam V").lastName).toBe("V");
  });
});
