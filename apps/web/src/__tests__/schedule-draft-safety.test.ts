import { describe, expect, it } from "vitest";

import type { DbScheduleCell } from "@/lib/db/types";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";

function makeCell(overrides: Partial<DbScheduleCell> = {}): DbScheduleCell {
  return {
    id: "cell-1",
    emp_id: "emp-1",
    date: "2026-04-15",
    org_id: "org-1",
    version: 1,
    series_id: null,
    from_recurring: false,
    created_by: "creator-1",
    updated_by: "editor-1",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-02T00:00:00.000Z",
    snapshots: [],
    ...overrides,
  };
}

describe("schedule draft safety helpers", () => {
  it("ignores cleanup-only deleted draft rows in the reviewed summary", () => {
    const entry = mapNormalizedScheduleCellRowToScheduleEntry(
      makeCell({
        snapshots: [
          {
            id: "snap-draft",
            cell_id: "cell-1",
            org_id: "org-1",
            snapshot_kind: "draft",
            state_kind: "deleted",
            absence_type_id: null,
            custom_start_time: null,
            custom_end_time: null,
            segments: [],
          },
        ],
      }),
      {
        isScheduler: true,
        assignmentLabelMap: new Map<number, string>(),
        absenceTypeMap: new Map<number, string>(),
      },
    );

    expect(entry?.draftKind ?? null).toBeNull();
  });

  it("still counts a published shift marked for deletion as a real deleted change", () => {
    const entry = mapNormalizedScheduleCellRowToScheduleEntry(
      makeCell({
        snapshots: [
          {
            id: "snap-draft",
            cell_id: "cell-1",
            org_id: "org-1",
            snapshot_kind: "draft",
            state_kind: "deleted",
            absence_type_id: null,
            custom_start_time: null,
            custom_end_time: null,
            segments: [],
          },
          {
            id: "snap-published",
            cell_id: "cell-1",
            org_id: "org-1",
            snapshot_kind: "published",
            state_kind: "worked",
            absence_type_id: null,
            custom_start_time: "07:00",
            custom_end_time: "15:00",
            segments: [
              {
                id: "seg-published",
                snapshot_id: "snap-published",
                org_id: "org-1",
                position: 0,
                shift_id: 10,
                job_id: 100,
              },
            ],
          },
        ],
      }),
      {
        isScheduler: true,
        assignmentLabelMap: new Map([[3, "DST"]]),
        absenceTypeMap: new Map<number, string>(),
      },
    );

    expect(entry?.draftKind).toBe("deleted");
  });

  it("counts custom-time-only edits as modified changes", () => {
    const entry = mapNormalizedScheduleCellRowToScheduleEntry(
      makeCell({
        snapshots: [
          {
            id: "snap-draft",
            cell_id: "cell-1",
            org_id: "org-1",
            snapshot_kind: "draft",
            state_kind: "worked",
            absence_type_id: null,
            custom_start_time: "08:00",
            custom_end_time: "16:00",
            segments: [
              {
                id: "seg-draft",
                snapshot_id: "snap-draft",
                org_id: "org-1",
                position: 0,
                shift_id: 10,
                job_id: 100,
              },
            ],
          },
          {
            id: "snap-published",
            cell_id: "cell-1",
            org_id: "org-1",
            snapshot_kind: "published",
            state_kind: "worked",
            absence_type_id: null,
            custom_start_time: "07:00",
            custom_end_time: "15:00",
            segments: [
              {
                id: "seg-published",
                snapshot_id: "snap-published",
                org_id: "org-1",
                position: 0,
                shift_id: 10,
                job_id: 100,
              },
            ],
          },
        ],
      }),
      {
        isScheduler: true,
        assignmentLabelMap: new Map([[3, "DST"]]),
        absenceTypeMap: new Map<number, string>(),
      },
    );

    expect(entry?.draftKind).toBe("modified");
  });
});
