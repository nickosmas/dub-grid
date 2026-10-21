import { describe, expect, it } from "vitest";

import type {
  AbsenceType,
  AssignmentDefinition,
  FocusArea,
  JobDefinition,
  PublishChange,
  ScheduleCellState,
  ShiftCategory,
} from "@/types";
import {
  buildShiftChangeResolvers,
  cellStateFromParts,
  describeCellStateChange,
  formatShiftChangeWasText,
  mergeCellPublishChanges,
} from "./shift-change-web";
import { DEFAULT_SHIFT_JOB_SYSTEM_KEY } from "./system-jobs";

const ORG = "org-1";

function category(id: number, name: string, extra: Partial<ShiftCategory> = {}): ShiftCategory {
  return { id, orgId: ORG, name, sortOrder: id, startTime: "07:00", endTime: "15:00", ...extra };
}

function job(id: number, name: string, extra: Partial<JobDefinition> = {}): JobDefinition {
  return {
    id,
    orgId: ORG,
    name,
    abbr: name.slice(0, 2),
    showOnGrid: true,
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "",
    border: "",
    text: "",
    sortOrder: id,
    ...extra,
  };
}

function assignment(
  id: number,
  shiftId: number,
  jobId: number,
  extra: Partial<AssignmentDefinition> = {},
): AssignmentDefinition {
  return {
    id,
    orgId: ORG,
    label: "D",
    name: "Day Shift",
    color: "",
    border: "",
    text: "",
    sortOrder: id,
    shiftId,
    jobId,
    focusAreaId: 1,
    ...extra,
  };
}

const focusAreas: FocusArea[] = [
  { id: 1, orgId: ORG, departmentId: null, name: "Skilled Nursing", sortOrder: 1 },
  { id: 2, orgId: ORG, departmentId: null, name: "Memory Care", sortOrder: 2 },
];
const absenceTypes: AbsenceType[] = [
  {
    id: 4,
    orgId: ORG,
    label: "S",
    name: "Sick",
    color: "",
    border: "",
    text: "",
    sortOrder: 1,
  },
];

const resolvers = buildShiftChangeResolvers({
  assignments: [
    assignment(100, 1, 10),
    assignment(101, 2, 10, { name: "Evening Shift", focusAreaId: 1 }),
    assignment(102, 9, 10, { name: "Weekend Day", archivedAt: "2026-09-01" }),
    assignment(103, 1, 30),
  ],
  shiftCategories: [
    category(1, "Day Shift", { breakMinutes: 30 }),
    category(2, "Evening Shift", { startTime: "15:00", endTime: "23:00" }),
    category(9, "Weekend Day", { endTime: "19:00", archivedAt: "2026-09-01" }),
  ],
  jobs: [
    job(10, "Registered Nurse"),
    job(30, "Day shift job", { systemKey: DEFAULT_SHIFT_JOB_SYSTEM_KEY }),
  ],
  absenceTypes,
  focusAreas,
});

function worked(
  shiftId: number,
  jobId = 10,
  extra: Partial<ScheduleCellState> = {},
): ScheduleCellState {
  return {
    kind: "worked",
    segments: [{ shiftId, jobId, position: 0 }],
    absenceTypeId: null,
    customStartTime: null,
    customEndTime: null,
    seriesId: null,
    fromRecurring: false,
    ...extra,
  };
}

describe("buildShiftChangeResolvers", () => {
  it("names the shift and job, with defaults and the shift's break", () => {
    expect(resolvers.segment(1, 10)).toMatchObject({
      shiftName: "Day Shift",
      jobName: "Registered Nurse",
      defaultStart: "07:00",
      defaultEnd: "15:00",
      breakMinutes: 30,
      focusAreaId: 1,
    });
  });

  it("keeps archived definitions and marks them", () => {
    expect(resolvers.segment(9, 10)).toMatchObject({
      shiftName: "Weekend Day",
      shiftArchived: true,
      defaultEnd: "19:00",
    });
  });

  it("shows a shift-only job as the shift alone", () => {
    expect(resolvers.segment(1, 30)).toMatchObject({ shiftName: null, jobName: "Day Shift" });
  });

  it("resolves absences and focus areas, and nothing it cannot find", () => {
    expect(resolvers.absenceType(4)).toEqual({ name: "Sick", archived: false });
    expect(resolvers.focusArea(2)).toBe("Memory Care");
    expect(resolvers.segment(77, 78)).toBeNull();
  });
});

describe("describeCellStateChange", () => {
  it("reads two stored cells as a single change", () => {
    const change = describeCellStateChange(
      worked(1),
      worked(1, 10, { customEndTime: "12:00", absenceTypeId: 4 }),
      "2026-10-22",
      resolvers,
    );
    expect(change.kind).toBe("multi");
    expect(change.after.items.map((item) => item.plain)).toEqual([
      "Day Shift · Registered Nurse · 7:00 AM - 12:00 PM (4.5 hrs) · Skilled Nursing",
      "Sick (rest of day)",
    ]);
  });

  it("names a retired shift with (archived)", () => {
    const change = describeCellStateChange(worked(9), worked(1), "2026-10-25", resolvers);
    expect(change.before.items[0].plain).toContain("Weekend Day (archived)");
  });
});

function publishChange(
  fromState: ScheduleCellState | null,
  toState: ScheduleCellState | null,
  extra: Partial<PublishChange> = {},
): PublishChange {
  return {
    empId: "e1",
    date: "2026-10-21",
    kind: !fromState ? "new" : toState?.kind === "deleted" ? "deleted" : "modified",
    fromState,
    toState,
    ...extra,
  };
}

describe("mergeCellPublishChanges", () => {
  const day = worked(1);
  const evening = worked(2);
  const night = worked(9);
  const deleted: ScheduleCellState = { ...worked(1), kind: "deleted", segments: [] };

  it("compares the earliest before with the newest after", () => {
    const merged = mergeCellPublishChanges([
      publishChange(day, evening, { fromCustomEnd: "15:00", updatedBy: "a" }),
      publishChange(evening, night, { updatedBy: "b" }),
    ]);
    expect(merged).toMatchObject({
      kind: "modified",
      fromState: day,
      toState: night,
      fromCustomEnd: "15:00",
      updatedBy: "b",
    });
  });

  it("drops a cell that went back to its original", () => {
    expect(
      mergeCellPublishChanges([publishChange(day, evening), publishChange(evening, day)]),
    ).toBeNull();
  });

  it("drops a shift added and removed in the window", () => {
    expect(
      mergeCellPublishChanges([publishChange(null, day), publishChange(day, deleted)]),
    ).toBeNull();
  });

  it("derives new and deleted kinds from the ends", () => {
    expect(
      mergeCellPublishChanges([publishChange(null, day), publishChange(day, evening)])?.kind,
    ).toBe("new");
    expect(
      mergeCellPublishChanges([publishChange(day, evening), publishChange(evening, deleted)])?.kind,
    ).toBe("deleted");
  });

  it("falls back to the newest change when states are missing", () => {
    const legacy = publishChange(null, null, { kind: "modified", from: [100], to: [101] });
    const newest = publishChange(evening, night);
    expect(mergeCellPublishChanges([legacy, newest])).toBe(newest);
  });
});

describe("cellStateFromParts", () => {
  it("rebuilds worked, absence and empty cells", () => {
    expect(
      cellStateFromParts({
        segments: [
          { shiftId: 1, jobId: 10 },
          { shiftId: 2, jobId: 10 },
        ],
        absenceTypeId: null,
        restOfDayAbsenceTypeId: 4,
        customTimes: {
          start: "07:00",
          end: "12:00",
          perPill: [
            { start: "07:00", end: "15:00" },
            { start: "15:00", end: "12:00" },
          ],
        },
      }),
    ).toMatchObject({
      kind: "worked",
      segments: [
        { shiftId: 1, jobId: 10, position: 0 },
        { shiftId: 2, jobId: 10, position: 1 },
      ],
      absenceTypeId: 4,
      customStartTime: "07:00|15:00",
      customEndTime: "15:00|12:00",
    });
    expect(
      cellStateFromParts({
        segments: [],
        absenceTypeId: 3,
        restOfDayAbsenceTypeId: null,
        customTimes: null,
      }),
    ).toMatchObject({ kind: "absence", absenceTypeId: 3 });
    expect(
      cellStateFromParts({
        segments: [],
        absenceTypeId: null,
        restOfDayAbsenceTypeId: null,
        customTimes: null,
      }).kind,
    ).toBe("deleted");
  });
});

describe("formatShiftChangeWasText", () => {
  it("writes Was, Added and Removed for one item", () => {
    const day = worked(1);
    const evening = worked(2);
    expect(
      formatShiftChangeWasText(describeCellStateChange(day, evening, "2026-10-21", resolvers)),
    ).toBe("Was Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (7.5 hrs) · Skilled Nursing");
    expect(
      formatShiftChangeWasText(describeCellStateChange(null, evening, "2026-10-21", resolvers)),
    ).toBe(
      "Added: Evening Shift · Registered Nurse · 3:00 PM - 11:00 PM (8 hrs) · Skilled Nursing",
    );
    expect(
      formatShiftChangeWasText(describeCellStateChange(evening, null, "2026-10-21", resolvers)),
    ).toBe(
      "Removed: Evening Shift · Registered Nurse · 3:00 PM - 11:00 PM (8 hrs) · Skilled Nursing",
    );
  });

  it("writes the whole old day for a multi-item day", () => {
    const double: ScheduleCellState = {
      ...worked(1),
      segments: [
        { shiftId: 1, jobId: 10, position: 0 },
        { shiftId: 2, jobId: 10, position: 1 },
      ],
    };
    const text = formatShiftChangeWasText(
      describeCellStateChange(
        double,
        worked(1, 10, { customEndTime: "12:00", absenceTypeId: 4 }),
        "2026-10-22",
        resolvers,
      ),
    );
    expect(text).toBe(
      [
        "Was (15.5 hrs):",
        "Shift 1: Day Shift · Registered Nurse · 7:00 AM - 3:00 PM (7.5 hrs) · Skilled Nursing",
        "Shift 2: Evening Shift · Registered Nurse · 3:00 PM - 11:00 PM (8 hrs) · Skilled Nursing (removed)",
      ].join("\n"),
    );
  });
});
