import { describe, expect, it } from "vitest";
import {
  buildShiftRecords,
  shiftRecordStateLabel,
  shiftRecordsToCsv,
  type ShiftRecordLookups,
} from "./shift-records";
import type { AbsenceType, AssignmentDefinition, ShiftCategory, ShiftMap } from "@/types";

const lookups: ShiftRecordLookups = {
  assignmentById: new Map([
    [
      1,
      {
        id: 1,
        name: "Day Sup",
        shiftId: 10,
        categoryId: 10,
        jobId: 100,
        focusAreaId: 5,
      } as AssignmentDefinition,
    ],
    [
      2,
      {
        id: 2,
        name: "Eve",
        shiftId: 11,
        categoryId: 11,
        jobId: null,
        focusAreaId: 5,
      } as AssignmentDefinition,
    ],
  ]),
  shiftById: new Map([
    [10, { id: 10, name: "Day Shift", startTime: "07:00", endTime: "15:00" } as ShiftCategory],
    [11, { id: 11, name: "Evening Shift", startTime: "15:00", endTime: "23:00" } as ShiftCategory],
  ]),
  jobById: new Map([[100, { name: "Day Shift Supervisor" }]]),
  focusAreaById: new Map([[5, { name: "Skilled Nursing" }]]),
  absenceById: new Map([[7, { id: 7, name: "Sick", label: "S" } as AbsenceType]]),
};

function cell(overrides: Partial<ShiftMap[string]>): ShiftMap[string] {
  return {
    assignmentIds: [1],
    publishedAssignmentDefinitionIds: [1],
    isDraft: false,
    isDelete: false,
    draftKind: null,
    ...overrides,
  } as ShiftMap[string];
}

const RANGE = { startDate: "2026-10-01", endDate: "2026-10-31" };

describe("buildShiftRecords", () => {
  it("lists worked days newest first, spelled out, with hours", () => {
    const records = buildShiftRecords(
      "emp",
      {
        "emp_2026-10-02": cell({}),
        "emp_2026-10-05": cell({ assignmentIds: [2], publishedAssignmentDefinitionIds: [2] }),
        "emp_2026-11-01": cell({}),
        "emp_2026-10-06": cell({ assignmentIds: [], publishedAssignmentDefinitionIds: [] }),
      },
      RANGE,
      lookups,
    );
    expect(records.map((record) => record.date)).toEqual(["2026-10-05", "2026-10-02"]);
    expect(records[1]).toMatchObject({
      shifts: [{ name: "Day Shift", jobName: "Day Shift Supervisor", time: "7:00 AM - 3:00 PM" }],
      focusArea: "Skilled Nursing",
      hours: 8,
      state: "published",
    });
  });

  it("names a draft's change and what it replaces", () => {
    const [changed] = buildShiftRecords(
      "emp",
      {
        "emp_2026-10-09": cell({
          assignmentIds: [2],
          publishedAssignmentDefinitionIds: [1],
          isDraft: true,
          draftKind: "modified",
        }),
      },
      RANGE,
      lookups,
    );
    expect(changed).toMatchObject({ state: "draft", draftKind: "modified", was: "Day Shift" });
    expect(shiftRecordStateLabel(changed)).toBe("Draft: changed");
  });

  it("keeps a shift a draft removes, at no hours", () => {
    const [removed] = buildShiftRecords(
      "emp",
      {
        "emp_2026-10-09": cell({
          assignmentIds: [],
          isDelete: true,
          isDraft: true,
          draftKind: "deleted",
        }),
      },
      RANGE,
      lookups,
    );
    expect(removed).toMatchObject({ draftKind: "deleted", hours: 0 });
    expect(removed.shifts[0].name).toBe("Day Shift");
    expect(shiftRecordStateLabel(removed)).toBe("Draft: removed");
  });

  it("marks a corrected day, its absence beside the shift, and its notes", () => {
    const [record] = buildShiftRecords(
      "emp",
      {
        "emp_2026-10-12": cell({
          restOfDayAbsenceTypeId: 7,
          customStartTime: "07:00",
          customEndTime: "11:00",
        }),
      },
      RANGE,
      lookups,
      {
        corrections: new Map([["2026-10-12", "Left early"]]),
        noteCounts: new Map([["2026-10-12", 2]]),
      },
    );
    expect(record).toMatchObject({
      state: "corrected",
      correctionReason: "Left early",
      absenceName: "Sick",
      noteCount: 2,
      hours: 4,
    });
    expect(record.shifts[0].time).toBe("7:00 AM - 11:00 AM");
  });
});

describe("shiftRecordsToCsv", () => {
  it("writes a header and one escaped row per record", () => {
    const records = buildShiftRecords("emp", { "emp_2026-10-02": cell({}) }, RANGE, lookups);
    expect(shiftRecordsToCsv(records).split("\r\n")).toEqual([
      "Date,Shift,Job,Time,Focus area,Hours,State,Was,Absence",
      "2026-10-02,Day Shift,Day Shift Supervisor,7:00 AM - 3:00 PM,Skilled Nursing,8,Published,,",
    ]);
  });
});
