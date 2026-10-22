import { describe, expect, it } from "vitest";

import { createShiftJobCompatibilityMaps } from "@/lib/shift-job-segments";
import {
  mapNormalizedScheduleCellRowToScheduleEntry,
  resolveScheduleCellSnapshotFromInput,
  scheduleCellSnapshotToInput,
} from "@/lib/schedule-cells";
import type { DbScheduleCell } from "@/lib/db/types";
import type { JobDefinition, ShiftCategory, AssignmentDefinition } from "@/types";

const shiftCategories: ShiftCategory[] = [
  {
    id: 10,
    orgId: "org-1",
    name: "Day Shift",
    abbr: "D",
    startTime: "07:00",
    endTime: "15:00",
    sortOrder: 0,
    focusAreaId: 1,
  },
];

const jobs: JobDefinition[] = [
  {
    id: 100,
    orgId: "org-1",
    name: "Staff",
    abbr: "ST",
    showOnGrid: true,
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "#DBEAFE",
    border: "#93C5FD",
    text: "#1E40AF",
    sortOrder: 0,
    systemKey: null,
  },
];

const assignments: AssignmentDefinition[] = [
  {
    id: 1,
    orgId: "org-1",
    label: "DST",
    name: "Day Staff",
    color: "#DBEAFE",
    border: "#93C5FD",
    text: "#1E40AF",
    categoryId: 10,
    shiftId: 10,
    jobId: 100,
    focusAreaId: 1,
    sortOrder: 0,
  },
];

function makeCell(overrides: Partial<DbScheduleCell> = {}): DbScheduleCell {
  return {
    id: "cell-1",
    emp_id: "emp-1",
    date: "2026-04-15",
    org_id: "org-1",
    version: 4,
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

describe("mapNormalizedScheduleCellRowToScheduleEntry", () => {
  const segmentCompatibility = createShiftJobCompatibilityMaps({
    assignments,
    shiftCategories,
    jobs,
    shiftDisplayMode: "code",
  });
  const assignmentLabelMap = new Map([[1, "DST"]]);

  it("builds draft, published, and effective snapshots from normalized records", () => {
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
        assignmentLabelMap,
        segmentCompatibility,
      },
    );

    expect(entry).toMatchObject({
      label: "DST",
      assignmentIds: [1],
      draftKind: "modified",
      customStartTime: "08:00",
      customEndTime: "16:00",
      publishedCustomStartTime: "07:00",
      publishedCustomEndTime: "15:00",
    });
    expect(entry?.draft).toMatchObject({
      kind: "worked",
      assignmentIds: [1],
      label: "DST",
    });
    expect(entry?.published).toMatchObject({
      kind: "worked",
      assignmentIds: [1],
      label: "DST",
    });
    expect(entry?.effective).toMatchObject({
      kind: "worked",
      assignmentIds: [1],
      customStartTime: "08:00",
      customEndTime: "16:00",
    });
  });

  it("treats a draft delete snapshot as a deleted draft while keeping published content", () => {
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
        assignmentLabelMap,
        segmentCompatibility,
      },
    );

    expect(entry).toMatchObject({
      label: "OFF",
      draftKind: "deleted",
      isDelete: true,
      publishedLabel: "DST",
    });
    expect(entry?.draft).toMatchObject({ kind: "deleted" });
    expect(entry?.published).toMatchObject({ kind: "worked", label: "DST" });
  });
});

describe("a worked cell with a rest-of-day absence (item 45)", () => {
  const segmentCompatibility = createShiftJobCompatibilityMaps({
    assignments,
    shiftCategories,
    jobs,
    shiftDisplayMode: "code",
  });

  function workedSnapshot(kind: "draft" | "published", absenceTypeId: number | null) {
    return {
      id: `snap-${kind}`,
      cell_id: "cell-1",
      org_id: "org-1",
      snapshot_kind: kind,
      state_kind: "worked" as const,
      absence_type_id: absenceTypeId,
      custom_start_time: null,
      custom_end_time: null,
      segments: [
        {
          id: `seg-${kind}`,
          snapshot_id: `snap-${kind}`,
          org_id: "org-1",
          position: 0,
          shift_id: 10,
          job_id: 100,
        },
      ],
    };
  }

  it("keeps the rest-of-day absence apart from the whole-day absence id", () => {
    const entry = mapNormalizedScheduleCellRowToScheduleEntry(
      makeCell({ snapshots: [workedSnapshot("draft", 7), workedSnapshot("published", null)] }),
      { isScheduler: true, assignmentLabelMap: new Map([[1, "DST"]]), segmentCompatibility },
    );

    expect(entry?.effective).toMatchObject({
      kind: "worked",
      assignmentIds: [1],
      absenceTypeId: null,
      restOfDayAbsenceTypeId: 7,
    });
    expect(entry?.published).toMatchObject({ absenceTypeId: null, restOfDayAbsenceTypeId: null });
    expect(entry?.absenceTypeId).toBeNull();
    expect(entry).toMatchObject({
      restOfDayAbsenceTypeId: 7,
      publishedRestOfDayAbsenceTypeId: null,
    });
    expect(entry?.draftKind).toBe("modified");
  });

  it("round-trips the rest-of-day absence between a snapshot and saved input", () => {
    const snapshot = resolveScheduleCellSnapshotFromInput(
      {
        kind: "worked",
        segments: [{ shiftId: 10, jobId: 100, position: 0, isMentored: false }],
        absenceTypeId: 7,
        customStartTime: "07:00",
        customEndTime: "12:00",
        seriesId: null,
        fromRecurring: false,
      },
      { segmentCompatibility },
    );

    expect(snapshot).toMatchObject({ absenceTypeId: null, restOfDayAbsenceTypeId: 7 });
    expect(scheduleCellSnapshotToInput(snapshot)).toMatchObject({
      kind: "worked",
      absenceTypeId: 7,
      customStartTime: "07:00",
      customEndTime: "12:00",
    });
  });
});
