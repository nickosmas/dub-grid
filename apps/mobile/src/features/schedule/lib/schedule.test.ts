import { describe, expect, it } from "vitest";
import {
  addMonthsToIsoDate,
  buildScheduleMonthDays,
  buildScheduleShiftGroups,
  buildScheduleTimeGroups,
  buildScheduleWeekDays,
  buildScheduleSections,
  buildTeamScheduleFocusAreaTabs,
  filterTeamScheduleEntriesByFocusArea,
  filterScheduleEntriesByDate,
  formatScheduleDayLabel,
  formatScheduleRange,
  getScheduleEntryBaseTimeRange,
  getScheduleEntryCustomTimeRange,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  getScheduleEntryTimeRange,
  getScheduleMonthStartDate,
  getScheduleShiftGroupTimeRange,
  formatScheduleTimeRange,
  getScheduleRange,
  getScheduleRangeForDate,
  sortScheduleEntries,
  TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY,
} from "./schedule";

describe("mobile schedule helpers", () => {
  it("builds a sunday-first 7-day range from the current anchor week offset", () => {
    expect(getScheduleRange(0, undefined, new Date(2026, 3, 16))).toEqual({
      startDate: "2026-04-12",
      endDate: "2026-04-18",
    });

    expect(getScheduleRange(1, undefined, new Date(2026, 3, 16))).toEqual({
      startDate: "2026-04-19",
      endDate: "2026-04-25",
    });
  });

  it("anchors the visible range to the organization timezone instead of the device timezone", () => {
    expect(
      getScheduleRange(
        0,
        "America/Los_Angeles",
        new Date("2026-04-16T06:30:00.000Z"),
      ),
    ).toEqual({
      startDate: "2026-04-12",
      endDate: "2026-04-18",
    });
  });

  it("derives a sunday-first week range directly from a selected date", () => {
    expect(getScheduleRangeForDate("2026-04-16")).toEqual({
      startDate: "2026-04-12",
      endDate: "2026-04-18",
    });
  });

  it("formats the visible mobile schedule range label", () => {
    expect(
      formatScheduleRange({
        startDate: "2026-04-16",
        endDate: "2026-04-22",
      }),
    ).toBe("Apr 16 - Apr 22");
  });

  it("formats optional custom shift times", () => {
    expect(formatScheduleTimeRange("07:00:00", "19:30:00")).toBe(
      "7:00 AM - 7:30 PM",
    );
    expect(formatScheduleTimeRange(null, "19:30:00")).toBeNull();
    expect(
      getScheduleEntryTimeRange({
        startTime: null,
        endTime: null,
        customStartTime: "08:00:00",
        customEndTime: "12:00:00",
      }),
    ).toBe("8:00 AM - 12:00 PM");
    expect(
      getScheduleEntryTimeRange({
        startTime: null,
        endTime: null,
        customStartTime: null,
        customEndTime: null,
      }),
    ).toBeNull();
    expect(
      getScheduleEntryBaseTimeRange({
        startTime: "07:00:00",
        endTime: "15:00:00",
      }),
    ).toBe("7:00 AM - 3:00 PM");
    expect(
      getScheduleEntryCustomTimeRange({
        customStartTime: "08:00:00",
        customEndTime: "16:00:00",
      }),
    ).toBe("8:00 AM - 4:00 PM");
    expect(
      getScheduleShiftGroupTimeRange([
        {
          employeeId: "00000000-0000-0000-0000-000000000001",
          employeeName: "Alex Kim",
          date: "2026-04-16",
          shiftCodeIds: [1],
          shiftLabel: "D",
          shiftCodeLabel: "D",
          shiftName: "Day Shift",
          absenceTypeId: null,
          focusAreaId: 2,
          focusAreaName: "ICU",
          startTime: "07:00:00",
          endTime: "15:00:00",
          customStartTime: "08:00:00",
          customEndTime: "16:00:00",
          publishedAt: null,
          publishedByName: null,
        },
      ]),
    ).toBe("7:00 AM - 3:00 PM");
  });

  it("builds week-strip day chips with selected and today state", () => {
    const weekDays = buildScheduleWeekDays(
      {
        startDate: "2026-04-12",
        endDate: "2026-04-18",
      },
      "2026-04-18",
      "America/Los_Angeles",
      new Date("2026-04-16T06:30:00.000Z"),
    );

    expect(weekDays).toHaveLength(7);
    expect(weekDays[0]).toMatchObject({
      date: "2026-04-12",
      weekdayLabel: "Sun",
      dayLabel: "12",
      isToday: false,
      isSelected: false,
    });
    expect(weekDays[3]).toMatchObject({
      date: "2026-04-15",
      weekdayLabel: "Wed",
      dayLabel: "15",
      isToday: true,
      isSelected: false,
    });
    expect(weekDays[6]).toMatchObject({
      date: "2026-04-18",
      weekdayLabel: "Sat",
      dayLabel: "18",
      isSelected: true,
    });
  });

  it("builds a sunday-first month grid with outside-month days", () => {
    const monthWeeks = buildScheduleMonthDays(
      "2026-04-16",
      "2026-04-16",
      undefined,
      new Date("2026-04-16T12:00:00.000Z"),
    );

    expect(monthWeeks[0]?.[0]).toMatchObject({
      date: "2026-03-29",
      dayLabel: "29",
      isCurrentMonth: false,
      isSelected: false,
    });
    expect(monthWeeks[2]?.[4]).toMatchObject({
      date: "2026-04-16",
      dayLabel: "16",
      isCurrentMonth: true,
      isToday: true,
      isSelected: true,
    });
    expect(monthWeeks[4]?.[6]).toMatchObject({
      date: "2026-05-02",
      isCurrentMonth: false,
    });
  });

  it("navigates months while preserving the closest valid day", () => {
    expect(addMonthsToIsoDate("2026-03-31", 1)).toBe("2026-04-30");
    expect(getScheduleMonthStartDate("2026-04-16")).toBe("2026-04-01");
  });

  it("uses the organization timezone for Today and Tomorrow labels", () => {
    const now = new Date("2026-04-16T06:30:00.000Z");

    expect(
      formatScheduleDayLabel("2026-04-14", now, "America/Los_Angeles"),
    ).toBe("Yesterday, Apr 14");
    expect(
      formatScheduleDayLabel("2026-04-15", now, "America/Los_Angeles"),
    ).toBe("Today, Apr 15");
    expect(
      formatScheduleDayLabel("2026-04-16", now, "America/Los_Angeles"),
    ).toBe("Tomorrow, Apr 16");
  });

  it("groups entries into ordered daily sections", () => {
    const sections = buildScheduleSections(
      [
        {
          employeeId: "00000000-0000-0000-0000-000000000002",
          employeeName: "Bri Shaw",
          date: "2026-04-17",
          shiftCodeIds: [2],
          shiftLabel: "Night",
          shiftCodeLabel: "N",
          shiftName: "Night Shift",
          absenceTypeId: null,
          focusAreaId: null,
          focusAreaName: null,
          startTime: "19:00:00",
          endTime: "07:00:00",
          customStartTime: null,
          customEndTime: null,
          publishedAt: null,
          publishedByName: null,
        },
        {
          employeeId: "00000000-0000-0000-0000-000000000001",
          employeeName: "Alex Kim",
          date: "2026-04-16",
          shiftCodeIds: [1],
          shiftLabel: "Day",
          shiftCodeLabel: "D",
          shiftName: "Day Shift",
          absenceTypeId: null,
          focusAreaId: null,
          focusAreaName: null,
          startTime: "07:00:00",
          endTime: "15:00:00",
          customStartTime: "07:00:00",
          customEndTime: "15:00:00",
          publishedAt: null,
          publishedByName: null,
        },
      ],
      "team",
      "America/Los_Angeles",
    );

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({
      date: "2026-04-16",
      subtitle: "1 assignment",
    });
    expect(sections[1]).toMatchObject({
      date: "2026-04-17",
      subtitle: "1 assignment",
    });
  });

  it("filters entries to the selected date and groups them by ascending time", () => {
    const entries = [
      {
        employeeId: "emp-2",
        employeeName: "Bri Shaw",
        date: "2026-04-16",
        shiftCodeIds: [2],
        shiftLabel: "E",
        shiftCodeLabel: "E",
        shiftName: "Evening Shift",
        absenceTypeId: null,
        focusAreaId: null,
        focusAreaName: null,
        startTime: "15:00:00",
        endTime: "23:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-16",
        shiftCodeIds: [1],
        shiftLabel: "D",
        shiftCodeLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: null,
        focusAreaName: null,
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "emp-3",
        employeeName: "Chris Hall",
        date: "2026-04-17",
        shiftCodeIds: [3],
        shiftLabel: "N",
        shiftCodeLabel: "N",
        shiftName: "Night Shift",
        absenceTypeId: null,
        focusAreaId: null,
        focusAreaName: null,
        startTime: "23:00:00",
        endTime: "07:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
    ] as const;

    const selectedEntries = filterScheduleEntriesByDate(entries, "2026-04-16");
    const groups = buildScheduleTimeGroups(selectedEntries);

    expect(selectedEntries).toHaveLength(2);
    expect(groups).toEqual([
      {
        key: "07:00:00",
        title: "7:00 AM",
        entries: [entries[1]],
      },
      {
        key: "15:00:00",
        title: "3:00 PM",
        entries: [entries[0]],
      },
    ]);
  });

  it("sorts entries by time and groups team schedules by shift category", () => {
    const entries = [
      {
        employeeId: "emp-3",
        employeeName: "Chris Hall",
        date: "2026-04-16",
        shiftCodeIds: [2],
        shiftLabel: "E",
        shiftCodeLabel: "E",
        shiftName: "Evening Shift",
        absenceTypeId: null,
        focusAreaId: null,
        focusAreaName: null,
        startTime: "15:00:00",
        endTime: "23:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "emp-2",
        employeeName: "Bri Shaw",
        date: "2026-04-16",
        shiftCodeIds: [1],
        shiftLabel: "D",
        shiftCodeLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: null,
        focusAreaName: null,
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-16",
        shiftCodeIds: [1],
        shiftLabel: "D",
        shiftCodeLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: null,
        focusAreaName: null,
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
    ] as const;

    expect(sortScheduleEntries(entries)).toEqual([
      entries[2],
      entries[1],
      entries[0],
    ]);
    expect(buildScheduleShiftGroups(entries)).toEqual([
      {
        key: "shift:1:Day Shift",
        title: "Day Shift",
        entries: [entries[2], entries[1]],
      },
      {
        key: "shift:2:Evening Shift",
        title: "Evening Shift",
        entries: [entries[0]],
      },
    ]);
  });

  it("builds display segments for single and multi-shift entries", () => {
    const entry = {
      employeeId: "00000000-0000-0000-0000-000000000001",
      employeeName: "Alex Kim",
      date: "2026-04-16",
      shiftCodeIds: [1],
      shiftLabel: "D",
      shiftCodeLabel: "D",
      shiftName: "Day Shift",
      absenceTypeId: null,
      focusAreaId: null,
      focusAreaName: null,
      displayFocusAreaName: "ICU",
      startTime: "07:00:00",
      endTime: "15:00:00",
      customStartTime: null,
      customEndTime: null,
      segments: [
        {
          shiftName: "Day Shift",
          startTime: "07:00:00",
          endTime: "15:00:00",
          displayFocusAreaName: "ICU",
        },
        {
          shiftName: "Evening Shift",
          startTime: "15:00:00",
          endTime: "23:00:00",
          displayFocusAreaName: null,
        },
      ],
      publishedAt: null,
      publishedByName: null,
    } as const;

    expect(getScheduleEntrySegments(entry)).toEqual(entry.segments);
    expect(
      getScheduleEntrySegmentTimeRange(entry.segments[0]!),
    ).toBe("7:00 AM - 3:00 PM");
    expect(
      getScheduleEntrySegments({
        shiftName: "Night Shift",
        startTime: "23:00:00",
        endTime: "07:00:00",
        displayFocusAreaName: null,
      }),
    ).toEqual([
      {
        shiftName: "Night Shift",
        startTime: "23:00:00",
        endTime: "07:00:00",
        displayFocusAreaName: null,
      },
    ]);
  });

  it("builds team focus area tabs and filters entries from the active tab", () => {
    const focusAreas = [
      {
        id: 1,
        name: "Emergency",
      },
      {
        id: 2,
        name: "ICU",
      },
      {
        id: 3,
        name: "Telemetry",
      },
    ] as const;

    const entries = [
      {
        employeeId: "00000000-0000-0000-0000-000000000001",
        employeeName: "Alex Kim",
        date: "2026-04-16",
        shiftCodeIds: [1],
        shiftLabel: "D",
        shiftCodeLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: 2,
        focusAreaName: "ICU",
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "00000000-0000-0000-0000-000000000002",
        employeeName: "Bri Shaw",
        date: "2026-04-16",
        shiftCodeIds: [2],
        shiftLabel: "E",
        shiftCodeLabel: "E",
        shiftName: "Evening Shift",
        absenceTypeId: null,
        focusAreaId: 1,
        focusAreaName: "Emergency",
        startTime: "15:00:00",
        endTime: "23:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "00000000-0000-0000-0000-000000000003",
        employeeName: "Chris Hall",
        date: "2026-04-16",
        shiftCodeIds: [3],
        shiftLabel: "N",
        shiftCodeLabel: "N",
        shiftName: "Night Shift",
        absenceTypeId: null,
        focusAreaId: null,
        focusAreaName: null,
        startTime: "23:00:00",
        endTime: "07:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
    ] as const;

    const tabs = buildTeamScheduleFocusAreaTabs(focusAreas, entries);

    expect(tabs).toEqual([
      {
        key: "focus-area:1",
        label: "Emergency",
        count: 1,
        focusAreaId: 1,
      },
      {
        key: "focus-area:2",
        label: "ICU",
        count: 1,
        focusAreaId: 2,
      },
      {
        key: "focus-area:3",
        label: "Telemetry",
        count: 0,
        focusAreaId: 3,
      },
    ]);

    expect(
      filterTeamScheduleEntriesByFocusArea(
        entries,
        TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY,
      ),
    ).toHaveLength(3);
    expect(
      filterTeamScheduleEntriesByFocusArea(entries, "focus-area:2"),
    ).toEqual([entries[0]]);
    expect(
      filterTeamScheduleEntriesByFocusArea(entries, "focus-area:3"),
    ).toEqual([]);
  });

  it("builds team focus area tabs from entries when bootstrap focus areas are missing", () => {
    const entries = [
      {
        employeeId: "00000000-0000-0000-0000-000000000001",
        employeeName: "Alex Kim",
        date: "2026-04-16",
        shiftCodeIds: [1],
        shiftLabel: "D",
        shiftCodeLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: 2,
        focusAreaName: "ICU",
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "00000000-0000-0000-0000-000000000002",
        employeeName: "Bri Shaw",
        date: "2026-04-16",
        shiftCodeIds: [2],
        shiftLabel: "E",
        shiftCodeLabel: "E",
        shiftName: "Evening Shift",
        absenceTypeId: null,
        focusAreaId: 1,
        focusAreaName: "Emergency",
        startTime: "15:00:00",
        endTime: "23:00:00",
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
    ] as const;

    expect(buildTeamScheduleFocusAreaTabs([], entries)).toEqual([
      {
        key: "focus-area:2",
        label: "ICU",
        count: 1,
        focusAreaId: 2,
      },
      {
        key: "focus-area:1",
        label: "Emergency",
        count: 1,
        focusAreaId: 1,
      },
    ]);
  });
});
