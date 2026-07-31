import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/data/organization-setup";

/**
 * Slugs must satisfy the organizations check constraint:
 * `^[a-z0-9]+(-[a-z0-9]+)*$`. Anything slugify can emit has to pass it,
 * or organization creation fails at the database with an opaque error.
 */
const SLUG_CONSTRAINT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slugify", () => {
  it("lowercases and hyphenates a normal name", () => {
    expect(slugify("Timberhill Athletic Club")).toBe("timberhill-athletic-club");
  });

  it("drops punctuation rather than emitting an invalid slug", () => {
    expect(slugify("G3 Performance & Fitness, LLC.")).toBe("g3-performance-fitness-llc");
  });

  it("never leaves a leading or trailing hyphen", () => {
    expect(slugify("  --Gym--  ")).toBe("gym");
    expect(slugify("Gym!!!")).toBe("gym");
  });

  it("collapses runs of separators", () => {
    expect(slugify("A   ---   B")).toBe("a-b");
  });

  it("falls back rather than producing an empty slug", () => {
    expect(slugify("!!!")).toBe("organization");
    expect(slugify("")).toBe("organization");
  });

  it("strips accents instead of dropping the whole word", () => {
    expect(slugify("Café Fitness")).toBe("cafe-fitness");
  });

  it("satisfies the database constraint for a wide range of names", () => {
    const names = [
      "Timberhill Athletic Club (Pilot)",
      "G3 Performance",
      "24/7 Fitness",
      "Gym #1",
      "  spaced  out  ",
      "ALL CAPS GYM",
      "Ünïcödé Gym",
      "a".repeat(200),
      "!!!",
      "",
    ];
    for (const name of names) {
      expect(slugify(name)).toMatch(SLUG_CONSTRAINT);
    }
  });

  it("bounds slug length", () => {
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});
