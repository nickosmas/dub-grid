import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

import { supabase } from "@/lib/supabase";
import { fetchShifts } from "@/lib/db/shifts";
import { fetchScheduleNotes } from "@/lib/db/schedule";
import { createShiftJobCompatibilityMaps } from "@/lib/shift-job-segments";
import { DEFAULT_PAGE_SIZE } from "@/lib/db/shared";
import type { JobDefinition, ShiftCategory, AssignmentDefinition } from "@/types";

// Spy-enabled chainable query mock: every filter/order/range call is a
// vi.fn() returning the same object (so calls can be asserted), and the
// object itself is thenable, matching the real Supabase query builder.
function chainableQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "gte", "lte", "order", "range"]) {
    query[method] = vi.fn(() => query);
  }
  (query as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve(result);
  return query;
}

describe("fetchShifts (via fetchNormalizedShifts) pagination wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies org/date filters, orders and ranges the query, and maps a short page into a ShiftMap", async () => {
    const shiftCategories: ShiftCategory[] = [
      { id: 10, orgId: "org-1", name: "Day Shift", abbr: "D", startTime: "07:00", endTime: "15:00", sortOrder: 0, focusAreaId: 1 },
    ];
    const jobs: JobDefinition[] = [
      { id: 100, orgId: "org-1", name: "Staff", abbr: "ST", showOnGrid: true, eligibleRoleIds: [], requiredCertificationIds: [], color: "#DBEAFE", border: "#93C5FD", text: "#1E40AF", sortOrder: 0, systemKey: null },
    ];
    const assignments: AssignmentDefinition[] = [
      { id: 1, orgId: "org-1", label: "DST", name: "Day Staff", color: "#DBEAFE", border: "#93C5FD", text: "#1E40AF", categoryId: 10, shiftId: 10, jobId: 100, focusAreaId: 1, sortOrder: 0 },
    ];
    const segmentCompatibility = createShiftJobCompatibilityMaps({
      assignments,
      shiftCategories,
      jobs,
      shiftDisplayMode: "code",
    });

    const row = {
      id: "cell-1",
      emp_id: "emp-1",
      date: "2026-08-02",
      org_id: "org-1",
      version: 0,
      series_id: null,
      from_recurring: false,
      created_by: null,
      updated_by: null,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      snapshots: [
        {
          id: "snap-1",
          cell_id: "cell-1",
          org_id: "org-1",
          snapshot_kind: "published",
          state_kind: "worked",
          absence_type_id: null,
          custom_start_time: null,
          custom_end_time: null,
          segments: [
            { id: "seg-1", snapshot_id: "snap-1", org_id: "org-1", position: 0, shift_id: 10, job_id: 100 },
          ],
        },
      ],
    };

    const query = chainableQuery({ data: [row], error: null });
    vi.mocked(supabase.from).mockReturnValue(
      query as unknown as ReturnType<typeof supabase.from>,
    );

    const map = await fetchShifts(
      "org-1",
      true,
      new Map([[1, "DST"]]),
      undefined,
      "2026-08-02",
      "2026-08-15",
      segmentCompatibility,
    );

    expect(query.eq).toHaveBeenCalledWith("org_id", "org-1");
    expect(query.gte).toHaveBeenCalledWith("date", "2026-08-02");
    expect(query.lte).toHaveBeenCalledWith("date", "2026-08-15");
    expect(query.order).toHaveBeenCalledWith("date", { ascending: true });
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(query.range).toHaveBeenCalledWith(0, DEFAULT_PAGE_SIZE - 1);
    expect(map["emp-1_2026-08-02"]).toMatchObject({ label: "DST" });
  });
});

describe("fetchScheduleNotes pagination wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies org/date filters, orders and ranges the query, and maps a short page into ScheduleNote[]", async () => {
    const row = {
      id: 1,
      org_id: "org-1",
      emp_id: "emp-1",
      date: "2026-08-02",
      indicator_type_id: 7,
      focus_area_id: 2,
      status: "published",
      created_by: "user-1",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    };

    const query = chainableQuery({ data: [row], error: null });
    vi.mocked(supabase.from).mockReturnValue(
      query as unknown as ReturnType<typeof supabase.from>,
    );

    const notes = await fetchScheduleNotes("org-1", "2026-08-02", "2026-08-15");

    expect(query.eq).toHaveBeenCalledWith("org_id", "org-1");
    expect(query.gte).toHaveBeenCalledWith("date", "2026-08-02");
    expect(query.lte).toHaveBeenCalledWith("date", "2026-08-15");
    expect(query.order).toHaveBeenCalledWith("date", { ascending: true });
    expect(query.range).toHaveBeenCalledWith(0, DEFAULT_PAGE_SIZE - 1);
    expect(notes).toEqual([
      {
        id: 1,
        orgId: "org-1",
        empId: "emp-1",
        date: "2026-08-02",
        indicatorTypeId: 7,
        focusAreaId: 2,
        status: "published",
        createdBy: "user-1",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
  });
});
