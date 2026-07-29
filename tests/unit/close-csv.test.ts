import { describe, expect, it } from "vitest";
import { buildCsvDocument, csvCell, usd } from "@/lib/close/csv";

describe("csvCell formula-injection protection", () => {
  it.each([
    ["=SUM(A1:A9)", "'=SUM(A1:A9)"],
    ["+1234", "'+1234"],
    ["-cmd", "'-cmd"],
    ["@import", "'@import"],
    ["\tleading tab", "'\tleading tab"],
  ])("neutralizes %j", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it("prefixes negative numbers too (documented cost of fail-safe protection)", () => {
    expect(csvCell(-500)).toBe("'-500");
  });

  it("leaves ordinary values untouched", () => {
    expect(csvCell("Payton")).toBe("Payton");
    expect(csvCell(1500)).toBe("1500");
    expect(csvCell(0)).toBe("0");
  });

  it("returns empty for null/undefined (never fake zeros)", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes per RFC 4180", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildCsvDocument", () => {
  it("emits CRLF line endings, a blank separator after headers, and a trailing newline", () => {
    const doc = buildCsvDocument(
      [["Title"], ["Org", "Acme"]],
      ["A", "B"],
      [["1", "2"]],
    );
    expect(doc.content).toBe("Title\r\nOrg,Acme\r\n\r\nA,B\r\n1,2\r\n");
  });

  it("skips the separator when there are no header lines", () => {
    const doc = buildCsvDocument([], ["A"], [["1"]]);
    expect(doc.content).toBe("A\r\n1\r\n");
  });

  it("counts data rows only", () => {
    const doc = buildCsvDocument([["Header"]], ["A"], [["1"], ["2"], ["3"]]);
    expect(doc.rowCount).toBe(3);
  });

  it("hashes deterministically and measures UTF-8 bytes", () => {
    const one = buildCsvDocument([], ["Name"], [["Zoë"]]);
    const two = buildCsvDocument([], ["Name"], [["Zoë"]]);
    expect(one.sha256).toBe(two.sha256);
    expect(one.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(one.byteSize).toBe(Buffer.byteLength(one.content, "utf8"));
    expect(one.byteSize).toBeGreaterThan(one.content.length - 1); // ë is 2 bytes

    const changed = buildCsvDocument([], ["Name"], [["Zoe"]]);
    expect(changed.sha256).not.toBe(one.sha256);
  });

  it("applies injection protection to every region (headers, columns, rows)", () => {
    const doc = buildCsvDocument(
      [["=header()"]],
      ["=col"],
      [["=row", "safe"]],
    );
    expect(doc.content).toBe("'=header()\r\n\r\n'=col\r\n'=row,safe\r\n");
  });
});

describe("usd presentation", () => {
  it("formats integer cents as US currency", () => {
    expect(usd(123456)).toBe("$1,234.56");
    expect(usd(0)).toBe("$0.00");
    expect(usd(-2500)).toBe("-$25.00");
  });

  it("renders null as empty — never a fake $0.00", () => {
    expect(usd(null)).toBe("");
  });
});
