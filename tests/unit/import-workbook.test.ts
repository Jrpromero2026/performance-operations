import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  looksLikeLegacyXls,
  looksLikeZip,
  workbookToCsvText,
} from "@/lib/imports/workbook";
import { parseCsv, rowToObject } from "@/lib/imports/csv";
import { setmoreAdapter } from "@/lib/imports/adapters/setmore";

/** Build an in-memory .xlsx shaped like a real Setmore export. */
async function setmoreWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet 1");
  ws.addRow([
    "Appointment date", "Appointment time", "Customer name", "Customer ID",
    "Company Name", "Service/class/event", "Meeting Type", "Cost",
    "Team member", "Country code ", "Phone", "Email", "Label", "Status",
    "Comments ", "Booking ID", "Booked via", "Booked on ", "Address",
    "City", "State", "Country", "Zipcode / Postal code",
  ]);
  ws.addRow([
    "3 Aug 2026", "06:00 AM - 07:00 AM", "Sample Client", "CUST01", "",
    "Personal Coaching | Signature Package - 12x60 min.", "1 on 1",
    69, // whole-number Cost as a real numeric cell
    "Mason Morgan, CSCS", "+1", "5415550100", "sample@example.com",
    "No Label", "Confirmed", "", "BOOKAUG01", "Staff", "1 Jul 2026 09:00 AM",
    "", "", "", "", "",
  ]);
  ws.addRow([
    "4 Aug 2026", "07:30 AM - 08:00 AM", "Other Client", "CUST02", "",
    "Private Training | Intro Session - 1x30 min.", "1 on 1",
    80.75, // fractional numeric cell
    "Emma Ciechanowski", "+1", "", "", "No label", "Cancelled", "",
    "BOOKAUG02", "Customer", "2 Jul 2026 10:00 AM", "", "", "", "", "",
  ]);
  // A fully empty row that must be skipped.
  ws.addRow(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("magic-byte detection", () => {
  it("recognizes a real xlsx as ZIP regardless of its claimed name", async () => {
    expect(looksLikeZip(await setmoreWorkbook())).toBe(true);
  });

  it("does not mistake CSV text for a workbook", () => {
    expect(looksLikeZip(Buffer.from("Appointment date,Cost\n1 Aug 2026,50\n"))).toBe(false);
  });

  it("identifies legacy .xls for a clear rejection", () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(looksLikeLegacyXls(ole)).toBe(true);
    expect(looksLikeZip(ole)).toBe(false);
  });
});

describe("workbook → pipeline round trip", () => {
  it("converts the first sheet into the pipeline's CSV dialect", async () => {
    const { csvText, rowCount, sheetName } = await workbookToCsvText(await setmoreWorkbook());
    expect(sheetName).toBe("Sheet 1");
    expect(rowCount).toBe(2); // empty row skipped
    const parsed = parseCsv(csvText, { maxRows: 100 });
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.headers).toHaveLength(23);
  });

  it("renders numeric Cost cells exactly as the validated conversions did", async () => {
    const { csvText } = await workbookToCsvText(await setmoreWorkbook());
    const parsed = parseCsv(csvText, { maxRows: 100 });
    const first = rowToObject(parsed.headers, parsed.rows[0]);
    const second = rowToObject(parsed.headers, parsed.rows[1]);
    expect(first["Cost"]).toBe("69");      // whole number: no decimal point
    expect(second["Cost"]).toBe("80.75");  // fraction preserved
  });

  it("feeds the setmore adapter with identical semantics to a CSV upload", async () => {
    const { csvText } = await workbookToCsvText(await setmoreWorkbook());
    const parsed = parseCsv(csvText, { maxRows: 100 });
    const ctx = { organizationTimezone: "America/Los_Angeles" };

    const detect = setmoreAdapter.detect(parsed.headers);
    expect(detect).toBeGreaterThan(0.7);

    const row = rowToObject(parsed.headers, parsed.rows[0]);
    const { normalized, issues } = setmoreAdapter.normalizeRow(row, ctx);
    expect(issues.filter((i) => i.severity === "blocking")).toHaveLength(0);
    expect(normalized.appointmentDate).toBe("2026-08-03");
    expect(normalized.listedPriceCents).toBe(6900);
    expect(normalized.sourceTrainerName).toBe("Mason Morgan, CSCS");
    expect(normalized.sourceStatus).toBe("Confirmed");
    expect(normalized.externalClientId).toBe("CUST01");
  });

  it("rejects a workbook with no usable sheet", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Empty");
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(workbookToCsvText(buffer)).rejects.toThrow(/empty/);
  });
});
