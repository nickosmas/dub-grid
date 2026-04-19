import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { createShiftSeries } from "@/lib/db/schedule";

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

describe("createShiftSeries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores shift-code series with a null absence_type_id", async () => {
    const shiftSeriesInsert = vi.fn().mockResolvedValue({ error: null });
    const shiftsUpsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "shift_series") {
        return {
          insert: shiftSeriesInsert,
        } as unknown as ReturnType<typeof supabase.from>;
      }

      if (table === "shifts") {
        return {
          upsert: shiftsUpsert,
        } as unknown as ReturnType<typeof supabase.from>;
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await createShiftSeries(
      "emp-1",
      "org-1",
      42,
      "D",
      "daily",
      null,
      "2026-04-14",
      "2026-04-14",
      null,
      null,
    );

    expect(shiftSeriesInsert).toHaveBeenCalledTimes(1);
    expect(shiftSeriesInsert.mock.calls[0][0]).toMatchObject({
      emp_id: "emp-1",
      org_id: "org-1",
      shift_code_id: 42,
      absence_type_id: null,
      frequency: "daily",
      start_date: "2026-04-14",
      end_date: "2026-04-14",
    });

    expect(shiftsUpsert).toHaveBeenCalledTimes(1);
    expect(shiftsUpsert.mock.calls[0][0][0]).toMatchObject({
      emp_id: "emp-1",
      date: "2026-04-14",
      draft_shift_code_ids: [42],
      draft_absence_type_id: null,
    });
  });

  it("stores absence-based repeating series on shift_series and generated shifts", async () => {
    const shiftSeriesInsert = vi.fn().mockResolvedValue({ error: null });
    const shiftsUpsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "shift_series") {
        return {
          insert: shiftSeriesInsert,
        } as unknown as ReturnType<typeof supabase.from>;
      }

      if (table === "shifts") {
        return {
          upsert: shiftsUpsert,
        } as unknown as ReturnType<typeof supabase.from>;
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await createShiftSeries(
      "emp-1",
      "org-1",
      null,
      "Vacation",
      "daily",
      null,
      "2026-04-14",
      "2026-04-14",
      null,
      7,
    );

    expect(shiftSeriesInsert).toHaveBeenCalledTimes(1);
    expect(shiftSeriesInsert.mock.calls[0][0]).toMatchObject({
      emp_id: "emp-1",
      org_id: "org-1",
      shift_code_id: null,
      absence_type_id: 7,
      frequency: "daily",
      start_date: "2026-04-14",
      end_date: "2026-04-14",
    });

    expect(shiftsUpsert).toHaveBeenCalledTimes(1);
    expect(shiftsUpsert.mock.calls[0][0][0]).toMatchObject({
      emp_id: "emp-1",
      date: "2026-04-14",
      draft_shift_code_ids: [],
      draft_absence_type_id: 7,
    });
  });
});
