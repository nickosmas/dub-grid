import type { MobileScheduleEntry, MobileScheduleEntrySegment } from "@dubgrid/contracts";
import { describe, expect, it } from "vitest";
import {
  getScheduleEntrySegmentChange,
  getScheduleSegmentAlignmentKey,
} from "./scheduleScreenChips";

type Presentation = MobileScheduleEntry["presentation"];

const day: MobileScheduleEntrySegment = {
  shiftId: 1,
  jobId: 10,
  label: "D",
  shiftName: "Day Shift",
  jobName: "Nurse",
  startTime: "07:00:00",
  endTime: "15:30:00",
  focusAreaId: 5,
  displayFocusAreaName: "Skilled Nursing",
  isMentored: false,
};

const evening: MobileScheduleEntrySegment = {
  ...day,
  shiftId: 2,
  label: "E",
  shiftName: "Evening Shift",
  startTime: "15:30:00",
  endTime: "00:00:00",
};

const night: MobileScheduleEntrySegment = {
  ...day,
  shiftId: 3,
  label: "N",
  shiftName: "Night Shift",
  startTime: "23:00:00",
  endTime: "07:00:00",
};

const absence: MobileScheduleEntrySegment = {
  label: "PTO",
  shiftName: "PTO",
  startTime: null,
  endTime: null,
  displayFocusAreaName: null,
};

function presentation(segments: MobileScheduleEntrySegment[]): Presentation {
  const [first] = segments;
  return {
    label: segments.map((segment) => segment.label ?? "?").join("/"),
    shiftName: first?.shiftName ?? null,
    focusAreaId: first?.focusAreaId ?? null,
    focusAreaName: first?.displayFocusAreaName ?? null,
    displayFocusAreaName: first?.displayFocusAreaName ?? null,
    startTime: first?.startTime ?? null,
    endTime: first?.endTime ?? null,
    segments,
  };
}

function entry(
  segments: MobileScheduleEntrySegment[],
  change: MobileScheduleEntry["change"],
): MobileScheduleEntry {
  return {
    employeeId: "00000000-0000-0000-0000-000000000001",
    employeeName: "Richard Bennett",
    employeeFocusAreaIds: [5],
    date: "2026-09-18",
    state: {
      kind: "worked",
      segments: segments.map((segment, position) => ({
        shiftId: segment.shiftId ?? null,
        jobId: segment.jobId ?? 0,
        position,
      })),
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
    presentation: presentation(segments),
    change,
    publishedAt: "2026-09-18T03:31:00.000Z",
    publishedByName: "Nic Kosmas",
  };
}

function modified(previous: MobileScheduleEntrySegment[]): MobileScheduleEntry["change"] {
  return { kind: "modified", previousPresentation: presentation(previous) };
}

describe("getScheduleSegmentAlignmentKey", () => {
  it("keys a worked segment by shift and job", () => {
    expect(getScheduleSegmentAlignmentKey(day)).toBe("1:10");
    expect(getScheduleSegmentAlignmentKey({ ...day, shiftId: null })).toBe("general:10");
  });

  it("gives an absence segment no key", () => {
    expect(getScheduleSegmentAlignmentKey(absence)).toBeNull();
  });
});

describe("getScheduleEntrySegmentChange", () => {
  it("passes a new, deleted, or absent change through unchanged", () => {
    const newChange: MobileScheduleEntry["change"] = {
      kind: "new",
      isNewAddition: true,
      previousPresentation: null,
    };
    expect(getScheduleEntrySegmentChange(entry([day], newChange), day)).toBe(newChange);

    const deletedChange = { kind: "deleted" as const, previousPresentation: presentation([day]) };
    expect(getScheduleEntrySegmentChange(entry([day], deletedChange), day)).toBe(deletedChange);

    expect(getScheduleEntrySegmentChange(entry([day], null), day)).toBeNull();
  });

  it("marks a second shift added beside a kept one as new, and the kept one as unchanged", () => {
    const double = entry([day, evening], modified([day]));
    const [keptDay, addedEvening] = double.presentation.segments;

    expect(getScheduleEntrySegmentChange(double, keptDay!)).toBeNull();
    expect(getScheduleEntrySegmentChange(double, addedEvening!)).toMatchObject({
      kind: "new",
      isNewAddition: true,
    });
  });

  it("pairs an edited segment with the published one it continues, not with its index", () => {
    const reordered = entry([{ ...evening, isMentored: true }, day], modified([day, evening]));
    const [editedEvening, keptDay] = reordered.presentation.segments;

    expect(getScheduleEntrySegmentChange(reordered, editedEvening!)).toMatchObject({
      kind: "modified",
      previousSegment: evening,
    });
    expect(getScheduleEntrySegmentChange(reordered, keptDay!)).toBeNull();
  });

  it("reads a replaced single shift as edited with the old shift attached", () => {
    const replaced = entry([night], modified([day]));

    expect(
      getScheduleEntrySegmentChange(replaced, replaced.presentation.segments[0]!),
    ).toMatchObject({ kind: "modified", previousSegment: day });
  });

  it("pairs a shift that replaced an absence with that absence", () => {
    const fromAbsence = entry([day], modified([absence]));

    expect(
      getScheduleEntrySegmentChange(fromAbsence, fromAbsence.presentation.segments[0]!),
    ).toMatchObject({ kind: "modified", previousSegment: absence });
  });

  it("lets the first surviving segment carry a removed sibling", () => {
    const shrunk = entry([night], modified([day, night]));

    expect(getScheduleEntrySegmentChange(shrunk, shrunk.presentation.segments[0]!)).toMatchObject({
      kind: "modified",
      previousSegment: null,
      removedSegments: [day],
    });
  });

  it("matches the synthetic single segment by content", () => {
    const bare = entry([], modified([day]));
    bare.presentation = { ...presentation([night]), segments: [] };
    const [synthetic] = [
      {
        label: "N",
        shiftName: "Night Shift",
        startTime: "23:00:00",
        endTime: "07:00:00",
        displayFocusAreaName: "Skilled Nursing",
      },
    ];

    expect(getScheduleEntrySegmentChange(bare, synthetic)).toMatchObject({
      kind: "modified",
      previousSegment: day,
    });
  });
});
