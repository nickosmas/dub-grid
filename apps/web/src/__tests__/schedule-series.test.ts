import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShiftSeries } from "@/lib/db/schedule";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe("createShiftSeries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores canonical multi-segment worked state on the shift series record", async () => {
    const shiftSeriesInsert = vi.fn().mockResolvedValue({ error: null });
    const scheduleCellIn = vi.fn().mockResolvedValue({ data: [], error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "focus_areas") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            })),
          })),
        } as unknown as ReturnType<typeof supabase.from>;
      }

      if (table === "shift_categories") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 12,
                    org_id: "org-1",
                    name: "Day Shift",
                    abbr: "D",
                    color: "#eff6ff",
                    start_time: "07:00:00",
                    end_time: "15:00:00",
                    sort_order: 0,
                    focus_area_id: null,
                    break_minutes: null,
                    archived_at: null,
                  },
                ],
                error: null,
              }),
            })),
          })),
        } as unknown as ReturnType<typeof supabase.from>;
      }

      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 88,
                    org_id: "org-1",
                    name: "Nurse",
                    abbr: "RN",
                    show_on_grid: false,
                    assignment_mode: "with_shift",
                    eligibility_mode: "and",
                    focus_area_ids: [],
                    department_ids: [],
                    applicable_shift_ids: [],
                    eligible_role_ids: [],
                    required_certification_ids: [],
                    color: "#eff6ff",
                    border_color: "#60a5fa",
                    text_color: "#1d4ed8",
                    job_shift_overrides: [],
                    default_start_time: null,
                    default_end_time: null,
                    default_duration_hours: null,
                    default_duration_minutes: null,
                    sort_order: 0,
                    system_key: null,
                    archived_at: null,
                  },
                  {
                    id: 99,
                    org_id: "org-1",
                    name: "Aide",
                    abbr: "CNA",
                    show_on_grid: false,
                    assignment_mode: "shiftless",
                    eligibility_mode: "and",
                    focus_area_ids: [],
                    department_ids: [],
                    applicable_shift_ids: [],
                    eligible_role_ids: [],
                    required_certification_ids: [],
                    color: "#f8fafc",
                    border_color: "#cbd5e1",
                    text_color: "#334155",
                    job_shift_overrides: [],
                    default_start_time: "15:00:00",
                    default_end_time: "23:00:00",
                    default_duration_hours: null,
                    default_duration_minutes: null,
                    sort_order: 1,
                    system_key: null,
                    archived_at: null,
                  },
                ],
                error: null,
              }),
            })),
          })),
        } as unknown as ReturnType<typeof supabase.from>;
      }

      if (table === "shift_series") {
        return {
          insert: shiftSeriesInsert,
        } as unknown as ReturnType<typeof supabase.from>;
      }

      if (table === "schedule_cells") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: scheduleCellIn,
              })),
            })),
          })),
        } as unknown as ReturnType<typeof supabase.from>;
      }

      throw new Error(`Unexpected table ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null });

    const input = {
      kind: "worked" as const,
      segments: [
        {
          shiftId: 12,
          jobId: 88,
          position: 0,
        },
        {
          shiftId: null,
          jobId: 99,
          position: 1,
        },
      ],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    };

    await createShiftSeries(
      "emp-1",
      "org-1",
      input,
      "D/CNA",
      "daily",
      null,
      "2026-04-14",
      "2026-04-14",
      null,
      undefined,
    );

    expect(shiftSeriesInsert).toHaveBeenCalledTimes(1);
    expect(shiftSeriesInsert.mock.calls[0][0]).not.toHaveProperty("shift_id");
    expect(shiftSeriesInsert.mock.calls[0][0]).not.toHaveProperty("job_id");
    expect(shiftSeriesInsert.mock.calls[0][0]).not.toHaveProperty("absence_type_id");
    expect(shiftSeriesInsert.mock.calls[0][0]).toMatchObject({
      emp_id: "emp-1",
      org_id: "org-1",
      state: {
        ...input,
        seriesId: expect.any(String),
        fromRecurring: false,
      },
      frequency: "daily",
      start_date: "2026-04-14",
      end_date: "2026-04-14",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("write_schedule_cell_snapshot", {
      p_org_id: "org-1",
      p_emp_id: "emp-1",
      p_date: "2026-04-14",
      p_snapshot_kind: "draft",
      p_state_kind: "worked",
      p_shift_ids: [12, null],
      p_job_ids: [88, 99],
      p_is_mentored_flags: [false, false],
      p_absence_type_id: null,
      p_custom_start_time: null,
      p_custom_end_time: null,
      p_series_id: expect.any(String),
      p_from_recurring: false,
      p_expected_version: 0,
    });
  });

  it("stores canonical absence state on the shift series record and generated shifts", async () => {
    const shiftSeriesInsert = vi.fn().mockResolvedValue({ error: null });
    const scheduleCellIn = vi.fn().mockResolvedValue({ data: [], error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "shift_series") {
        return {
          insert: shiftSeriesInsert,
        } as unknown as ReturnType<typeof supabase.from>;
      }

      if (table === "schedule_cells") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: scheduleCellIn,
              })),
            })),
          })),
        } as unknown as ReturnType<typeof supabase.from>;
      }

      throw new Error(`Unexpected table ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null });

    const input = {
      kind: "absence" as const,
      segments: [],
      absenceTypeId: 7,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    };

    await createShiftSeries(
      "emp-1",
      "org-1",
      input,
      "Vacation",
      "daily",
      null,
      "2026-04-14",
      "2026-04-14",
      null,
      undefined,
    );

    expect(shiftSeriesInsert).toHaveBeenCalledTimes(1);
    expect(shiftSeriesInsert.mock.calls[0][0]).not.toHaveProperty("shift_id");
    expect(shiftSeriesInsert.mock.calls[0][0]).not.toHaveProperty("job_id");
    expect(shiftSeriesInsert.mock.calls[0][0]).not.toHaveProperty("absence_type_id");
    expect(shiftSeriesInsert.mock.calls[0][0]).toMatchObject({
      emp_id: "emp-1",
      org_id: "org-1",
      state: {
        ...input,
        seriesId: expect.any(String),
        fromRecurring: false,
      },
      frequency: "daily",
      start_date: "2026-04-14",
      end_date: "2026-04-14",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("write_schedule_cell_snapshot", {
      p_org_id: "org-1",
      p_emp_id: "emp-1",
      p_date: "2026-04-14",
      p_snapshot_kind: "draft",
      p_state_kind: "absence",
      p_shift_ids: [],
      p_job_ids: [],
      p_is_mentored_flags: [],
      p_absence_type_id: 7,
      p_custom_start_time: null,
      p_custom_end_time: null,
      p_series_id: expect.any(String),
      p_from_recurring: false,
      p_expected_version: 0,
    });
  });
});
