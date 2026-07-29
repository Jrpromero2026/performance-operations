import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectDelimiter,
  escapeCsvCell,
  isFormulaLike,
  parseCsv,
  rowToObject,
} from "@/lib/imports/csv";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "..", "fixtures", name), "utf8");

describe("parseCsv", () => {
  it("parses plain UTF-8 CSV", () => {
    const result = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(result.headers).toEqual(["a", "b", "c"]);
    expect(result.rows).toEqual([["1", "2", "3"], ["4", "5", "6"]]);
    expect(result.issues).toEqual([]);
    expect(result.hadBom).toBe(false);
  });

  it("strips a UTF-8 BOM", () => {
    const result = parseCsv(fixture("generic-bom.csv"));
    expect(result.hadBom).toBe(true);
    expect(result.headers[0]).toBe("Date");
    expect(result.rows).toHaveLength(1);
  });

  it("handles quoted commas and embedded newlines", () => {
    const result = parseCsv('name,note\n"Doe, Jane","line one\nline two"\n');
    expect(result.rows[0]).toEqual(["Doe, Jane", "line one\nline two"]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const result = parseCsv('a\n"She said ""hi"""\n');
    expect(result.rows[0][0]).toBe('She said "hi"');
  });

  it("keeps empty cells distinct and preserves blank values", () => {
    const result = parseCsv("a,b,c\n1,,3\n");
    expect(result.rows[0]).toEqual(["1", "", "3"]);
  });

  it("flags duplicate and empty headers", () => {
    const result = parseCsv("a,a,\n1,2,3\n");
    expect(result.issues.map((i) => i.code).sort()).toEqual([
      "duplicate_header",
      "empty_header",
    ]);
  });

  it("flags and repairs ragged rows without discarding them", () => {
    const result = parseCsv(fixture("malformed.csv"));
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("ragged_row");
    expect(codes).toContain("unclosed_quote");
    // every surviving row realigned to the header width
    for (const row of result.rows) expect(row).toHaveLength(result.headers.length);
  });

  it("enforces the row limit", () => {
    const big = "a\n" + Array.from({ length: 20 }, (_, i) => `${i}`).join("\n");
    const result = parseCsv(big, { maxRows: 10 });
    expect(result.rows).toHaveLength(10);
    expect(result.issues.some((i) => i.code === "row_limit_exceeded")).toBe(true);
  });

  it("reports empty files", () => {
    expect(parseCsv("").issues[0].code).toBe("empty_file");
    expect(parseCsv("   \n  ").issues[0].code).toBe("empty_file");
  });

  it("parses the large synthetic Setmore fixture with trailing-space headers", () => {
    const result = parseCsv(fixture("setmore-valid.csv"));
    expect(result.headers).toHaveLength(20);
    expect(result.headers[6]).toBe("Country code "); // trailing space preserved
    expect(result.rows).toHaveLength(6);
    expect(result.issues).toEqual([]);
  });

  it("handles a 10k-row file quickly", () => {
    const lines = ["id,value"];
    for (let i = 0; i < 10_000; i++) lines.push(`${i},"v,${i}"`);
    const start = performance.now();
    const result = parseCsv(lines.join("\n"));
    expect(result.rows).toHaveLength(10_000);
    expect(performance.now() - start).toBeLessThan(2_000);
  });
});

describe("delimiter detection", () => {
  it("detects comma, semicolon, and tab", () => {
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
  });
});

describe("formula-injection protection", () => {
  it("identifies formula-like cells", () => {
    expect(isFormulaLike("=SUM(A1)")).toBe(true);
    expect(isFormulaLike("+123abc")).toBe(true);
    expect(isFormulaLike("@cmd")).toBe(true);
    expect(isFormulaLike("-5")).toBe(false); // negative number, not a formula
    expect(isFormulaLike("normal")).toBe(false);
  });

  it("neutralizes formulas on export", () => {
    expect(escapeCsvCell("=HYPERLINK(...)")).toBe("'=HYPERLINK(...)");
    expect(escapeCsvCell('a,"b')).toBe('"a,""b"');
    expect(escapeCsvCell("plain")).toBe("plain");
  });
});

describe("rowToObject", () => {
  it("keys by trimmed headers and keeps first occurrence on duplicates", () => {
    const obj = rowToObject(["A ", "B", "A "], ["1", "2", "3"]);
    expect(obj).toEqual({ A: "1", B: "2" });
  });
});
