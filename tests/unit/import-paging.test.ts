import { describe, expect, it, vi } from "vitest";
import { selectAllPages } from "@/lib/imports/pipeline";

/**
 * PostgREST truncates at `max_rows` SILENTLY — a capped response is
 * indistinguishable from a complete one. The first real Timberhill import
 * (2,883 rows) matched only its first 1,000 and then marked 992 rows
 * `ready` that actually carried blocking issues, because the issue query
 * was truncated too.
 *
 * These tests exist so that never recurs unnoticed.
 */
function pagedSource(total: number, cap = 1000) {
  const all = Array.from({ length: total }, (_, i) => ({ n: i }));
  return vi.fn(async (from: number, to: number) => ({
    // Mirrors PostgREST: the requested range, further clamped by max_rows.
    data: all.slice(from, Math.min(to + 1, from + cap)),
    error: null,
  }));
}

describe("selectAllPages", () => {
  it("returns every row when the total exceeds one page", async () => {
    const page = pagedSource(2883);
    const rows = await selectAllPages<{ n: number }>(page, "test");
    expect(rows).toHaveLength(2883);
    expect(rows[0].n).toBe(0);
    expect(rows[2882].n).toBe(2882);
  });

  it("requests successive ranges rather than one unbounded read", async () => {
    const page = pagedSource(2883);
    await selectAllPages<{ n: number }>(page, "test");
    expect(page.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops on a short page instead of looping forever", async () => {
    const page = pagedSource(1500);
    const rows = await selectAllPages<{ n: number }>(page, "test");
    expect(rows).toHaveLength(1500);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("handles an exact multiple of the page size", async () => {
    const page = pagedSource(2000);
    const rows = await selectAllPages<{ n: number }>(page, "test");
    expect(rows).toHaveLength(2000);
    // One extra call proves emptiness rather than assuming it.
    expect(page).toHaveBeenCalledTimes(3);
  });

  it("returns nothing for an empty table", async () => {
    expect(await selectAllPages(pagedSource(0), "test")).toEqual([]);
  });

  it("throws with its label rather than silently returning a partial set", async () => {
    const page = vi.fn(async () => ({ data: null, error: { code: "57014" } }));
    await expect(selectAllPages(page, "rows_load_failed")).rejects.toThrow(
      "rows_load_failed:57014"
    );
  });

  it("surfaces an error that appears only on a LATER page", async () => {
    // The dangerous case: page one succeeds, page two fails. Returning
    // page one would look like a complete, small result set.
    const all = Array.from({ length: 2500 }, (_, i) => ({ n: i }));
    const page = vi.fn(async (from: number, to: number) =>
      from === 0
        ? { data: all.slice(from, to + 1), error: null }
        : { data: null, error: { code: "08006" } }
    );
    await expect(selectAllPages(page, "rows_load_failed")).rejects.toThrow(
      "rows_load_failed:08006"
    );
  });
});
