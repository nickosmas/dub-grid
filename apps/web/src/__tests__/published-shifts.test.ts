import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildShiftJobPairKey } from "@/lib/shift-job-segments";
import {
  fetchPublishedShiftRows,
  mapNormalizedScheduleCellToPublishedShiftRow,
  hasPublishedScheduleContent,
  resolvePublishedScheduleEntry,
  type PublishedShiftRow,
} from "@/lib/published-shifts";

describe("published shift helpers", () => {
  const assignmentById = new Map([
    [
      1,
      {
        label: "DAY",
        defaultStartTime: "07:00",
        defaultEndTime: "15:00",
      },
    ],
    [
      2,
      {
        label: "EVE",
        defaultStartTime: "15:00",
        defaultEndTime: "23:00",
      },
    ],
  ]);

  it("ignores rows with no published content", () => {
    const row: PublishedShiftRow = {
      emp_id: "emp-1",
      date: "2026-04-13",
      resolvedAssignmentIds: [],
      published_absence_type_id: null,
      published_custom_start_time: null,
      published_custom_end_time: null,
    };

    expect(hasPublishedScheduleContent(row)).toBe(false);
    expect(resolvePublishedScheduleEntry(row, assignmentById)).toBeNull();
  });

  it("resolves published shift labels, times, and duration from the current schema", () => {
    const row: PublishedShiftRow = {
      emp_id: "emp-1",
      date: "2026-04-13",
      resolvedAssignmentIds: [1, 2],
      published_absence_type_id: null,
      published_custom_start_time: "06:30|16:00",
      published_custom_end_time: "14:30|22:00",
    };

    expect(resolvePublishedScheduleEntry(row, assignmentById)).toEqual({
      kind: "shift",
      empId: "emp-1",
      date: "2026-04-13",
      label: "DAY/EVE",
      assignmentIds: [1, 2],
      absenceTypeId: null,
      startTime: "06:30",
      endTime: "22:00",
      durationHours: 14,
      segments: [],
    });
  });

  it("resolves published absences without treating them as timed shifts", () => {
    const row: PublishedShiftRow = {
      emp_id: "emp-1",
      date: "2026-04-14",
      resolvedAssignmentIds: [],
      published_absence_type_id: 7,
      published_custom_start_time: null,
      published_custom_end_time: null,
    };

    expect(resolvePublishedScheduleEntry(row, assignmentById, new Map([[7, "Vacation"]]))).toEqual({
      kind: "absence",
      empId: "emp-1",
      date: "2026-04-14",
      label: "Vacation",
      assignmentIds: [],
      absenceTypeId: 7,
      startTime: null,
      endTime: null,
      durationHours: 0,
      segments: [],
    });
  });

  it("maps a normalized published worked snapshot into the shared published row shape", () => {
    const row = mapNormalizedScheduleCellToPublishedShiftRow(
      {
        id: "cell-1",
        emp_id: "emp-1",
        date: "2026-04-14",
        org_id: "org-1",
        version: 2,
        snapshots: [
          {
            id: "snap-1",
            cell_id: "cell-1",
            org_id: "org-1",
            snapshot_kind: "published",
            state_kind: "worked",
            absence_type_id: null,
            custom_start_time: "06:30|16:00",
            custom_end_time: "14:30|22:00",
            segments: [
              {
                id: "seg-2",
                snapshot_id: "snap-1",
                org_id: "org-1",
                position: 1,
                shift_id: 2,
                job_id: 20,
              },
              {
                id: "seg-1",
                snapshot_id: "snap-1",
                org_id: "org-1",
                position: 0,
                shift_id: 1,
                job_id: 10,
              },
            ],
          },
        ],
      },
      new Map([
        [
          buildShiftJobPairKey(1, 10),
          {
            shiftId: 1,
            jobId: 10,
            label: "D · Nurse",
            startTime: "07:00",
            endTime: "15:00",
          },
        ],
        [
          buildShiftJobPairKey(2, 20),
          {
            shiftId: 2,
            jobId: 20,
            label: "E · Nurse",
            startTime: "15:00",
            endTime: "23:00",
          },
        ],
      ]),
    );

    expect(row).toMatchObject({
      emp_id: "emp-1",
      date: "2026-04-14",
      published_shift_ids: [1, 2],
      published_job_ids: [10, 20],
      resolvedAssignmentIds: [],
      resolvedSegments: [
        {
          shiftId: 1,
          jobId: 10,
          label: "D · Nurse",
          startTime: "07:00",
          endTime: "15:00",
        },
        {
          shiftId: 2,
          jobId: 20,
          label: "E · Nurse",
          startTime: "15:00",
          endTime: "23:00",
        },
      ],
      published_absence_type_id: null,
      published_custom_start_time: "06:30|16:00",
      published_custom_end_time: "14:30|22:00",
    });
  });

  it("maps a normalized published absence snapshot into the shared published row shape", () => {
    const row = mapNormalizedScheduleCellToPublishedShiftRow(
      {
        id: "cell-2",
        emp_id: "emp-2",
        date: "2026-04-15",
        org_id: "org-1",
        version: 1,
        snapshots: [
          {
            id: "snap-2",
            cell_id: "cell-2",
            org_id: "org-1",
            snapshot_kind: "published",
            state_kind: "absence",
            absence_type_id: 7,
            custom_start_time: null,
            custom_end_time: null,
            segments: [],
          },
        ],
      },
      new Map(),
    );

    expect(row).toMatchObject({
      emp_id: "emp-2",
      date: "2026-04-15",
      published_shift_ids: [],
      published_job_ids: [],
      resolvedAssignmentIds: [],
      published_absence_type_id: 7,
      published_custom_start_time: null,
      published_custom_end_time: null,
    });
  });
});

describe("fetchPublishedShiftRows reads past the API row cap", () => {
  const ORG = "11111111-1111-4111-8111-111111111111";

  /**
   * PostgREST answers at most `db.max_rows` rows for every role, the service
   * role included, so one request returned the first page and nothing said
   * so. Each call builds its own chain, mirroring the single-use builder the
   * real client hands back.
   */
  function pagingClient(totalCells: number) {
    const ranges: Array<[number, number]> = [];
    const cells = Array.from({ length: totalCells }, (_, index) => ({
      id: `cell-${index}`,
      org_id: ORG,
      emp_id: `emp-${index}`,
      date: "2026-09-21",
      focus_area_id: 1,
      snapshots: [
        {
          id: `snap-${index}`,
          cell_id: `cell-${index}`,
          org_id: ORG,
          snapshot_kind: "published",
          state_kind: "worked",
          absence_type_id: null,
          custom_start_time: null,
          custom_end_time: null,
          segments: [],
        },
      ],
    }));

    const client = {
      from(table: string) {
        if (table !== "schedule_cells") {
          const other: Record<string, unknown> = {};
          for (const method of ["select", "eq", "is", "in", "order", "gte", "lte", "lt"]) {
            other[method] = vi.fn(() => other);
          }
          (other as { then: unknown }).then = (resolve: (value: unknown) => unknown) =>
            resolve({ data: [], error: null });
          return other;
        }
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "is", "in", "order", "gte", "lte", "lt", "limit"]) {
          chain[method] = vi.fn(() => chain);
        }
        chain.range = vi.fn(async (from: number, to: number) => {
          ranges.push([from, to]);
          return { data: cells.slice(from, to + 1), error: null };
        });
        return chain;
      },
    } as unknown as SupabaseClient;

    return { client, ranges };
  }

  it("keeps paging until a page comes back short", async () => {
    const { client, ranges } = pagingClient(1203);

    const rows = await fetchPublishedShiftRows(client, {
      orgId: ORG,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });

    expect(rows).toHaveLength(1203);
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it("treats a caller's own limit as a ceiling, in one request", async () => {
    const { client, ranges } = pagingClient(1203);

    const rows = await fetchPublishedShiftRows(client, {
      orgId: ORG,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      limit: 5,
    });

    expect(rows).toHaveLength(5);
    expect(ranges).toEqual([[0, 4]]);
  });
});
