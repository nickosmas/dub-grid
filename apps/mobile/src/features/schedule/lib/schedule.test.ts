import { describe, expect, it } from "vitest";
import {
  addMonthsToIsoDate,
  buildAvailableOpenShiftFeed,
  buildAvailableShiftDateGroups,
  buildMeShiftRequestSections,
  buildMeScheduleSegmentItems,
  buildScheduleMonthDays,
  buildScheduleSections,
  buildScheduleShiftGroups,
  buildScheduleTimeGroups,
  buildScheduleWeekDays,
  buildUpcomingMeScheduleItems,
  buildWeeklyHoursSummary,
  buildTeamScheduleFocusAreaTabs,
  doScheduleEntrySegmentsShareShiftAndFocusArea,
  filterTeamScheduleEntriesByFocusArea,
  filterScheduleEntriesByDate,
  formatScheduleDayLabel,
  formatSchedulePillDateLabel,
  formatScheduleRange,
  getFeaturedMeScheduleSegment,
  getScheduleEntryBaseTimeRange,
  getScheduleEntryCustomTimeRange,
  getScheduleEntryMemberTimeRange,
  getScheduleEntrySegmentFocusAreaName,
  getScheduleEntrySegmentShiftTimeRange,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  getScheduleEntryTimeRange,
  getScheduleMonthStartDate,
  getScheduleShiftGroupTimeRange,
  getSplitShiftBadgeLabel,
  getSplitShiftSegmentLabel,
  getSplitShiftSegmentsForEntry,
  getSplitShiftSegmentsFromPresentation,
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
      getScheduleRange(0, "America/Los_Angeles", new Date("2026-04-16T06:30:00.000Z")),
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
    expect(formatScheduleTimeRange("07:00:00", "19:30:00")).toBe("7:00 AM - 7:30 PM");
    expect(formatScheduleTimeRange(null, "19:30:00")).toBeNull();
    expect(
      getScheduleEntryTimeRange({
        startTime: null,
        endTime: null,
        customStartTime: "08:00:00",
        customEndTime: "12:00:00",
      } as never),
    ).toBe("8:00 AM - 12:00 PM");
    expect(
      getScheduleEntryTimeRange({
        startTime: null,
        endTime: null,
        customStartTime: null,
        customEndTime: null,
      } as never),
    ).toBeNull();
    expect(
      getScheduleEntryBaseTimeRange({
        startTime: "07:00:00",
        endTime: "15:00:00",
      } as never),
    ).toBe("7:00 AM - 3:00 PM");
    expect(
      getScheduleEntryCustomTimeRange({
        customStartTime: "08:00:00",
        customEndTime: "16:00:00",
      } as never),
    ).toBe("8:00 AM - 4:00 PM");
    expect(
      getScheduleEntryCustomTimeRange({
        customStartTime: "07:00:00|16:00:00",
        customEndTime: "16:30:00|00:00:00",
      } as never),
    ).toBeNull();
    expect(
      getScheduleEntryTimeRange({
        startTime: "07:00:00",
        endTime: "00:00:00",
        customStartTime: "07:00:00|16:00:00",
        customEndTime: "16:30:00|00:00:00",
        segments: [
          {
            shiftName: "Day Shift",
            startTime: "07:00:00",
            endTime: "16:30:00",
          },
        ],
      } as never),
    ).toBe("7:00 AM - 4:30 PM");
    expect(
      getScheduleEntryCustomTimeRange({
        customStartTime: "07:00:00|16:00:00",
        customEndTime: "16:30:00|00:00:00",
        segments: [
          {
            shiftName: "Day Shift",
            startTime: "07:00:00",
            endTime: "16:30:00",
          },
        ],
      } as never),
    ).toBe("7:00 AM - 4:30 PM");
    expect(
      getScheduleEntrySegmentShiftTimeRange({
        shiftStartTime: "07:00:00",
        shiftEndTime: "15:00:00",
      }),
    ).toBe("7:00 AM - 3:00 PM");
    expect(
      getScheduleEntryMemberTimeRange(
        {
          employeeId: "00000000-0000-0000-0000-000000000001",
          employeeName: "Alex Kim",
          date: "2026-04-16",
          customStartTime: null,
          customEndTime: null,
          segments: [
            {
              shiftName: "Day Shift",
              shiftStartTime: "07:00:00",
              shiftEndTime: "15:00:00",
              startTime: "06:15:00",
              endTime: "15:00:00",
            },
          ],
        },
        "7:00 AM - 3:00 PM",
      ),
    ).toBe("6:15 AM - 3:00 PM");
    expect(
      getScheduleEntryMemberTimeRange(
        {
          employeeId: "00000000-0000-0000-0000-000000000001",
          employeeName: "Alex Kim",
          date: "2026-04-16",
          customStartTime: "08:00:00",
          customEndTime: "16:00:00",
          segments: [
            {
              shiftName: "Day Shift",
              shiftStartTime: "07:00:00",
              shiftEndTime: "15:00:00",
              startTime: "07:00:00",
              endTime: "15:00:00",
            },
          ],
        },
        "7:00 AM - 3:00 PM",
      ),
    ).toBe("8:00 AM - 4:00 PM");
    expect(
      getScheduleShiftGroupTimeRange([
        {
          employeeId: "00000000-0000-0000-0000-000000000001",
          employeeName: "Alex Kim",
          date: "2026-04-16",
          shiftIds: [1],
          shiftLabel: "D",
          assignmentLabel: "D",
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

    expect(formatScheduleDayLabel("2026-04-14", now, "America/Los_Angeles")).toBe(
      "Yesterday, Apr 14",
    );
    expect(formatScheduleDayLabel("2026-04-15", now, "America/Los_Angeles")).toBe("Today, Apr 15");
    expect(formatScheduleDayLabel("2026-04-16", now, "America/Los_Angeles")).toBe(
      "Tomorrow, Apr 16",
    );
  });

  it("groups entries into ordered daily sections", () => {
    const sections = buildScheduleSections(
      [
        {
          employeeId: "00000000-0000-0000-0000-000000000002",
          employeeName: "Bri Shaw",
          date: "2026-04-17",
          shiftIds: [2],
          shiftLabel: "Night",
          assignmentLabel: "N",
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
          shiftIds: [1],
          shiftLabel: "Day",
          assignmentLabel: "D",
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
        shiftIds: [2],
        shiftLabel: "E",
        assignmentLabel: "E",
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
        shiftIds: [1],
        shiftLabel: "D",
        assignmentLabel: "D",
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
        shiftIds: [3],
        shiftLabel: "N",
        assignmentLabel: "N",
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
    ];

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
        shiftIds: [2],
        shiftLabel: "E",
        assignmentLabel: "E",
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
        employeeSeniority: 2,
        date: "2026-04-16",
        shiftIds: [1],
        shiftLabel: "D",
        assignmentLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: null,
        focusAreaName: null,
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        segments: [
          {
            shiftId: 1,
            jobId: 11,
            jobName: "Supervisor",
            jobSortOrder: 1,
            shiftName: "Day Shift",
            startTime: "07:00:00",
            endTime: "15:00:00",
          },
        ],
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "emp-4",
        employeeName: "Casey Lane",
        employeeSeniority: 1,
        date: "2026-04-16",
        shiftIds: [1],
        shiftLabel: "D",
        assignmentLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: null,
        focusAreaName: null,
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        segments: [
          {
            shiftId: 1,
            jobId: 11,
            jobName: "Supervisor",
            jobSortOrder: 1,
            shiftName: "Day Shift",
            startTime: "07:00:00",
            endTime: "15:00:00",
          },
        ],
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        employeeSeniority: 1,
        date: "2026-04-16",
        shiftIds: [1],
        shiftLabel: "D",
        assignmentLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: null,
        focusAreaName: null,
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            jobName: "Mentor",
            jobSortOrder: 2,
            shiftName: "Day Shift",
            startTime: "07:00:00",
            endTime: "15:00:00",
          },
        ],
        publishedAt: null,
        publishedByName: null,
      },
    ];

    expect(sortScheduleEntries(entries)).toEqual([entries[3], entries[1], entries[2], entries[0]]);
    expect(buildScheduleShiftGroups(entries)).toEqual([
      {
        key: "shift:1",
        title: "Day Shift",
        entries: [entries[2], entries[1], entries[3]],
      },
      {
        key: "shift:2",
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
      shiftIds: [1],
      shiftLabel: "D",
      assignmentLabel: "D",
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
    expect(getScheduleEntrySegmentTimeRange(entry.segments[0]!)).toBe("7:00 AM - 3:00 PM");
    expect(
      getScheduleEntrySegments({
        shiftName: "Night Shift",
        startTime: "23:00:00",
        endTime: "07:00:00",
        displayFocusAreaName: null,
      } as never),
    ).toEqual([
      {
        label: "Night Shift",
        shiftName: "Night Shift",
        startTime: "23:00:00",
        endTime: "07:00:00",
        displayFocusAreaName: null,
      },
    ]);
  });

  it("identifies multiple shifts only for worked multi-segment entries and sorts earliest first", () => {
    const splitState = {
      kind: "worked",
      segments: [
        { shiftId: 1, jobId: 10, position: 0 },
        { shiftId: 2, jobId: 11, position: 1, isMentored: true },
      ],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    } as const;
    const splitEntry = {
      employeeId: "00000000-0000-0000-0000-000000000001",
      employeeName: "Alex Kim",
      date: "2026-04-16",
      state: splitState,
      presentation: {
        label: "Day Shift / Evening Shift",
        startTime: "07:00:00",
        endTime: "23:00:00",
        segments: [
          {
            shiftId: 2,
            jobId: 11,
            shiftName: "Evening Shift",
            jobName: "Lead",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "ICU",
            isMentored: true,
          },
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Day Shift",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "ICU",
          },
        ],
      },
      publishedAt: null,
      publishedByName: null,
    };

    const absenceEntry = {
      ...splitEntry,
      state: {
        ...splitState,
        kind: "absence",
        absenceTypeId: 1,
      },
    };
    const generalSplitPresentation = {
      segments: [
        {
          shiftId: null,
          jobId: 10,
          shiftName: "General Admin",
          startTime: "08:00:00",
          endTime: "12:00:00",
        },
        {
          shiftId: null,
          jobId: 11,
          shiftName: "General Desk",
          startTime: "13:00:00",
          endTime: "17:00:00",
        },
      ],
    };

    const sortedSplitSegments = getSplitShiftSegmentsForEntry(splitEntry as never);

    expect(sortedSplitSegments).toHaveLength(2);
    expect(sortedSplitSegments[0]?.shiftName).toBe("Day Shift");
    expect(sortedSplitSegments[1]?.shiftName).toBe("Evening Shift");
    expect(getSplitShiftSegmentsForEntry(absenceEntry as never)).toEqual([]);
    expect(
      getSplitShiftSegmentsFromPresentation(generalSplitPresentation, {
        kind: "worked",
      }),
    ).toHaveLength(2);
    expect(
      getSplitShiftSegmentsFromPresentation(
        { segments: [generalSplitPresentation.segments[0]!] },
        { kind: "worked" },
      ),
    ).toEqual([]);
    expect(getSplitShiftBadgeLabel(2)).toBe("2 shifts");
    expect(getSplitShiftSegmentLabel(0, 2)).toBe("Shift 1");
    expect(getSplitShiftSegmentLabel(1, 2)).toBe("Shift 2");
    expect(sortedSplitSegments[1]?.isMentored).toBe(true);
  });

  it("matches shiftmate segments only when the shift and focus area both match", () => {
    const sourceEntry = {
      employeeId: "emp-1",
      employeeName: "Alex Kim",
      date: "2026-04-16",
      focusAreaId: 2,
      presentation: {
        label: "Day Shift",
        focusAreaId: 2,
        focusAreaName: "ICU",
        displayFocusAreaName: "ICU",
        startTime: "07:00:00",
        endTime: "15:00:00",
        segments: [],
      },
    };
    const sameShiftSameAreaEntry = {
      ...sourceEntry,
      employeeId: "emp-2",
      employeeName: "Bri Shaw",
    };
    const sameShiftDifferentAreaEntry = {
      ...sourceEntry,
      employeeId: "emp-3",
      employeeName: "Chris Hall",
      focusAreaId: 1,
      presentation: {
        ...sourceEntry.presentation,
        focusAreaId: 1,
        focusAreaName: "Emergency",
        displayFocusAreaName: "Emergency",
      },
    };
    const sourceSegment = {
      shiftId: 1,
      jobId: 10,
      shiftName: "Day Shift",
      startTime: "07:00:00",
      endTime: "15:00:00",
      focusAreaId: 2,
      displayFocusAreaName: "ICU",
    };
    const sameShiftSameAreaSegment = {
      ...sourceSegment,
      jobId: 11,
    };
    const sameShiftDifferentAreaSegment = {
      ...sourceSegment,
      jobId: 12,
      focusAreaId: 1,
      displayFocusAreaName: "Emergency",
    };
    const differentShiftSameAreaSegment = {
      ...sourceSegment,
      shiftId: 3,
      shiftName: "Evening Shift",
      startTime: "15:00:00",
      endTime: "23:00:00",
    };
    const generalSegment = {
      ...sourceSegment,
      shiftId: null,
      shiftName: "General shift",
    };

    expect(
      doScheduleEntrySegmentsShareShiftAndFocusArea(
        sourceEntry as never,
        sourceSegment,
        sameShiftSameAreaEntry as never,
        sameShiftSameAreaSegment,
      ),
    ).toBe(true);
    expect(
      doScheduleEntrySegmentsShareShiftAndFocusArea(
        sourceEntry as never,
        sourceSegment,
        sameShiftDifferentAreaEntry as never,
        sameShiftDifferentAreaSegment,
      ),
    ).toBe(false);
    expect(
      doScheduleEntrySegmentsShareShiftAndFocusArea(
        sourceEntry as never,
        sourceSegment,
        sameShiftSameAreaEntry as never,
        differentShiftSameAreaSegment,
      ),
    ).toBe(false);
    expect(
      doScheduleEntrySegmentsShareShiftAndFocusArea(
        sourceEntry as never,
        generalSegment,
        sameShiftSameAreaEntry as never,
        generalSegment,
      ),
    ).toBe(false);
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
    ];

    const entries = [
      {
        employeeId: "00000000-0000-0000-0000-000000000001",
        employeeName: "Alex Kim",
        date: "2026-04-16",
        shiftIds: [1],
        shiftLabel: "D",
        assignmentLabel: "D",
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
        shiftIds: [2],
        shiftLabel: "E",
        assignmentLabel: "E",
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
        shiftIds: [3],
        shiftLabel: "N",
        assignmentLabel: "N",
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
    ];

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
      filterTeamScheduleEntriesByFocusArea(entries, TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY),
    ).toHaveLength(3);
    expect(filterTeamScheduleEntriesByFocusArea(entries, "focus-area:2")).toEqual([entries[0]]);
    expect(filterTeamScheduleEntriesByFocusArea(entries, "focus-area:3")).toEqual([]);
  });

  it("builds team focus area tabs from entries when bootstrap focus areas are missing", () => {
    const entries = [
      {
        employeeId: "00000000-0000-0000-0000-000000000001",
        employeeName: "Alex Kim",
        date: "2026-04-16",
        shiftIds: [1],
        shiftLabel: "D",
        assignmentLabel: "D",
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
        shiftIds: [2],
        shiftLabel: "E",
        assignmentLabel: "E",
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
    ];

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

  it("formats hero pill labels for today, tomorrow, and later dates", () => {
    const now = new Date("2026-04-16T12:00:00.000Z");

    expect(formatSchedulePillDateLabel("2026-04-16", now)).toBe("Today");
    expect(formatSchedulePillDateLabel("2026-04-17", now)).toBe("Tomorrow");
    expect(formatSchedulePillDateLabel("2026-04-19", now)).toBe("Sun, Apr 19");
  });

  it("picks the active me segment first and keeps later segments for upcoming", () => {
    const entries = [
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-16",
        shiftIds: [1, 2],
        jobIds: [10, 20],
        shiftLabel: "D/E",
        assignmentLabel: "D/E",
        shiftName: "Day / Evening",
        absenceTypeId: null,
        focusAreaId: 2,
        focusAreaName: "ICU",
        displayFocusAreaName: "ICU",
        startTime: "07:00:00",
        endTime: "23:00:00",
        customStartTime: "07:00:00",
        customEndTime: "23:00:00",
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Day Shift",
            jobName: "Mentor",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "ICU",
          },
          {
            shiftId: 2,
            jobId: 20,
            shiftName: "Evening Shift",
            jobName: "Nurse",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Telemetry",
          },
        ],
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-17",
        shiftIds: [3],
        jobIds: [21],
        shiftLabel: "D",
        assignmentLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: 2,
        focusAreaName: "ICU",
        displayFocusAreaName: "ICU",
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        segments: [
          {
            shiftId: 3,
            jobId: 21,
            shiftName: "Day Shift",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "ICU",
          },
        ],
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-18",
        shiftIds: [],
        jobIds: [],
        shiftLabel: "PTO",
        assignmentLabel: null,
        shiftName: "Paid Time Off",
        absenceTypeId: 1,
        focusAreaId: null,
        focusAreaName: null,
        displayFocusAreaName: null,
        startTime: null,
        endTime: null,
        customStartTime: null,
        customEndTime: null,
        segments: [],
        publishedAt: null,
        publishedByName: null,
      },
    ];

    const featured = getFeaturedMeScheduleSegment({
      entries,
      selectedDate: "2026-04-16",
      todayDate: "2026-04-16",
      currentTime: "12:00:00",
    });
    const upcoming = buildUpcomingMeScheduleItems({
      entries,
      featuredItem: featured.item,
      selectedDate: "2026-04-16",
    });

    expect(featured.status).toBe("active");
    expect(featured.item?.segment.jobName).toBe("Mentor");
    expect(upcoming.map((item) => item.segment.shiftName)).toEqual([
      "Day Shift",
      "Evening Shift",
      "Day Shift",
      "Paid Time Off",
    ]);
  });

  it("does not feature a completed remaining shift today after a split shift is reduced", () => {
    const featured = getFeaturedMeScheduleSegment({
      entries: [
        {
          employeeId: "emp-1",
          employeeName: "Alex Kim",
          date: "2026-04-30",
          shiftIds: [1],
          jobIds: [10],
          shiftLabel: "D",
          assignmentLabel: "D",
          shiftName: "Day Shift",
          absenceTypeId: null,
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "07:00:00",
          endTime: "16:30:00",
          customStartTime: "07:00:00|16:00:00",
          customEndTime: "16:30:00|00:00:00",
          segments: [
            {
              shiftId: 1,
              jobId: 10,
              shiftName: "Day Shift",
              jobName: "Nurse",
              startTime: "07:00:00",
              endTime: "16:30:00",
              displayFocusAreaName: "Skilled Nursing",
            },
          ],
          publishedAt: null,
          publishedByName: null,
        },
      ],
      selectedDate: "2026-04-30",
      todayDate: "2026-04-30",
      currentTime: "16:40:00",
    });

    expect(featured.status).toBe("empty");
    expect(featured.item).toBeNull();
  });

  it("uses the first shift in a future selected week for the me hero", () => {
    const entries = [
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-19",
        shiftIds: [],
        jobIds: [],
        shiftLabel: "PTO",
        assignmentLabel: null,
        shiftName: "Paid Time Off",
        absenceTypeId: 1,
        focusAreaId: null,
        focusAreaName: null,
        displayFocusAreaName: null,
        startTime: null,
        endTime: null,
        customStartTime: null,
        customEndTime: null,
        segments: [],
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-20",
        shiftIds: [1],
        jobIds: [10],
        shiftLabel: "M",
        assignmentLabel: "M",
        shiftName: "Monday First Shift",
        absenceTypeId: null,
        focusAreaId: 2,
        focusAreaName: "ICU",
        displayFocusAreaName: "ICU",
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Monday First Shift",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "ICU",
          },
        ],
        publishedAt: null,
        publishedByName: null,
      },
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-23",
        shiftIds: [2],
        jobIds: [20],
        shiftLabel: "T",
        assignmentLabel: "T",
        shiftName: "Selected Day Shift",
        absenceTypeId: null,
        focusAreaId: 3,
        focusAreaName: "Telemetry",
        displayFocusAreaName: "Telemetry",
        startTime: "15:00:00",
        endTime: "23:00:00",
        customStartTime: null,
        customEndTime: null,
        segments: [
          {
            shiftId: 2,
            jobId: 20,
            shiftName: "Selected Day Shift",
            jobName: "Mentor",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Telemetry",
          },
        ],
        publishedAt: null,
        publishedByName: null,
      },
    ];

    const featured = getFeaturedMeScheduleSegment({
      entries,
      rangeStartDate: "2026-04-19",
      selectedDate: "2026-04-23",
      todayDate: "2026-04-16",
      currentTime: "12:00:00",
    });

    expect(featured.status).toBe("upcoming");
    expect(featured.item?.date).toBe("2026-04-20");
    expect(featured.item?.segment.shiftName).toBe("Monday First Shift");
  });

  it("does not fall back to the entry focus area when a segment is explicitly general", () => {
    const items = buildMeScheduleSegmentItems([
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-16",
        shiftIds: [1],
        jobIds: [10],
        shiftLabel: "D",
        assignmentLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: 2,
        focusAreaName: "ICU",
        displayFocusAreaName: "ICU",
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Day Shift",
            jobName: "Mentor",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: null,
          },
        ],
        publishedAt: null,
        publishedByName: null,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(getScheduleEntrySegmentFocusAreaName(items[0]!.entry, items[0]!.segment)).toBeNull();
  });

  it("splits open shift claims from targeted cover requests", () => {
    const sections = buildMeShiftRequestSections({
      linkedEmployeeId: "emp-1",
      requests: [
        {
          id: "pickup-open",
          orgId: "org-1",
          type: "pickup",
          status: "open",
          requesterEmpId: "emp-2",
          requesterName: "Sarah Jenkins",
          requesterShiftDate: "2026-04-17",
          requesterShiftIds: [1],
          requesterJobIds: [20],
          requesterSegments: [],
          requesterShiftLabel: "Day Shift",
          requesterFocusAreaId: 2,
          requesterCustomStartTime: "07:00:00",
          requesterCustomEndTime: "15:00:00",
          targetEmpId: null,
          targetName: null,
          targetShiftDate: null,
          targetShiftIds: null,
          targetJobIds: null,
          targetSegments: null,
          targetShiftLabel: null,
          targetFocusAreaId: null,
          targetCustomStartTime: null,
          targetCustomEndTime: null,
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-18T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
        {
          id: "cover-open",
          orgId: "org-1",
          type: "swap",
          status: "open",
          requesterEmpId: "emp-2",
          requesterName: "Sarah Jenkins",
          requesterShiftDate: "2026-04-18",
          requesterShiftIds: [2],
          requesterJobIds: [21],
          requesterSegments: [],
          requesterShiftLabel: "Evening Shift",
          requesterFocusAreaId: 2,
          requesterCustomStartTime: "15:00:00",
          requesterCustomEndTime: "23:00:00",
          targetEmpId: "emp-1",
          targetName: "Alex Kim",
          targetShiftDate: "2026-04-19",
          targetShiftIds: [3],
          targetJobIds: [10],
          targetSegments: [],
          targetShiftLabel: "Day Shift",
          targetFocusAreaId: 2,
          targetCustomStartTime: "07:00:00",
          targetCustomEndTime: "15:00:00",
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-18T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ] as never,
      now: new Date("2026-04-16T18:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(sections.openShiftRequests.map((request) => request.id)).toEqual(["pickup-open"]);
    expect(sections.coverRequests.map((request) => request.id)).toEqual(["cover-open"]);
  });

  it("groups available open shifts and pickup requests by date before rendering", () => {
    const groups = buildAvailableShiftDateGroups({
      openShifts: [
        {
          id: "open-late",
          date: "2026-04-19",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 1,
          state: {
            kind: "worked",
            segments: [{ shiftId: 1, jobId: 10, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Evening Shift",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "15:00:00",
            endTime: "23:00:00",
            segments: [],
          },
        },
        {
          id: "open-mid",
          date: "2026-04-18",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 1,
          state: {
            kind: "worked",
            segments: [{ shiftId: 2, jobId: 11, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Mid Shift",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "09:00:00",
            endTime: "17:00:00",
            segments: [],
          },
        },
      ] as never,
      requests: [
        {
          id: "request-early",
          orgId: "org-1",
          type: "pickup",
          status: "open",
          requesterEmpId: "emp-2",
          requesterName: "Sarah Jenkins",
          requesterShiftDate: "2026-04-18",
          requesterShiftIds: [3],
          requesterJobIds: [12],
          requesterSegments: [],
          requesterShiftLabel: "Day Shift",
          requesterFocusAreaId: 2,
          requesterCustomStartTime: "07:00:00",
          requesterCustomEndTime: "15:00:00",
          targetEmpId: null,
          targetName: null,
          targetShiftDate: null,
          targetShiftIds: null,
          targetJobIds: null,
          targetSegments: null,
          targetShiftLabel: null,
          targetFocusAreaId: null,
          targetCustomStartTime: null,
          targetCustomEndTime: null,
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
          requesterPresentation: {
            label: "Day Shift",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
          requesterState: {
            kind: "worked",
            segments: [{ shiftId: 3, jobId: 12, position: 0 }],
            absenceTypeId: null,
            customStartTime: "07:00:00",
            customEndTime: "15:00:00",
            seriesId: null,
            fromRecurring: false,
          },
          targetPresentation: null,
          targetState: null,
        },
      ] as never,
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      date: "2026-04-18",
      items: [
        { kind: "request", key: "request-early" },
        { kind: "open_shift", key: "open-mid" },
      ],
    });
    expect(groups[1]).toMatchObject({
      date: "2026-04-19",
      items: [{ kind: "open_shift", key: "open-late" }],
    });
  });

  it("filters available open shifts down to claimable items without schedule conflicts", () => {
    const feed = buildAvailableOpenShiftFeed({
      linkedEmployeeId: "emp-1",
      scheduleEntries: [
        {
          employeeId: "emp-1",
          employeeName: "Alex Kim",
          date: "2026-04-18",
          shiftIds: [1],
          jobIds: [10],
          shiftLabel: "D",
          assignmentLabel: "D",
          shiftName: "Day Shift",
          absenceTypeId: null,
          focusAreaId: 2,
          focusAreaName: "ICU",
          startTime: "07:00:00",
          endTime: "15:00:00",
          customStartTime: null,
          customEndTime: null,
          segments: [
            {
              shiftId: 1,
              jobId: 10,
              shiftName: "Day Shift",
              jobName: "Nurse",
              startTime: "07:00:00",
              endTime: "15:00:00",
              displayFocusAreaName: "ICU",
            },
          ],
        },
      ] as never,
      openShifts: [
        {
          id: "open-conflict",
          date: "2026-04-18",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 1,
          state: {
            kind: "worked",
            segments: [{ shiftId: 1, jobId: 10, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Conflicting Open",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
        },
        {
          id: "open-clear",
          date: "2026-04-18",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 3,
          state: {
            kind: "worked",
            segments: [{ shiftId: 2, jobId: 11, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Clear Open",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "15:00:00",
            endTime: "23:00:00",
            segments: [],
          },
        },
        {
          id: "open-blocked",
          date: "2026-04-18",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 1,
          canVolunteer: false,
          volunteerBlockReason: "You do not meet the eligibility requirements for this shift.",
          state: {
            kind: "worked",
            segments: [{ shiftId: 6, jobId: 15, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Blocked Open",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "23:00:00",
            endTime: "07:00:00",
            segments: [],
          },
        },
      ] as never,
      requests: [
        {
          id: "request-conflict",
          orgId: "org-1",
          type: "pickup",
          status: "open",
          requesterEmpId: "emp-2",
          requesterName: "Jordan Lee",
          requesterShiftDate: "2026-04-18",
          requesterShiftIds: [3],
          requesterJobIds: [12],
          requesterSegments: [],
          requesterShiftLabel: "Conflicting Pickup",
          requesterFocusAreaId: 2,
          requesterCustomStartTime: "07:00:00",
          requesterCustomEndTime: "15:00:00",
          targetEmpId: null,
          targetName: null,
          targetShiftDate: null,
          targetShiftIds: null,
          targetJobIds: null,
          targetSegments: null,
          targetShiftLabel: null,
          targetFocusAreaId: null,
          targetCustomStartTime: null,
          targetCustomEndTime: null,
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
          requesterPresentation: {
            label: "Conflicting Pickup",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
          requesterState: {
            kind: "worked",
            segments: [{ shiftId: 3, jobId: 12, position: 0 }],
            absenceTypeId: null,
            customStartTime: "07:00:00",
            customEndTime: "15:00:00",
            seriesId: null,
            fromRecurring: false,
          },
          targetPresentation: null,
          targetState: null,
        },
        {
          id: "request-clear",
          orgId: "org-1",
          type: "pickup",
          status: "open",
          requesterEmpId: "emp-3",
          requesterName: "Ivy Stone",
          requesterShiftDate: "2026-04-18",
          requesterShiftIds: [4],
          requesterJobIds: [13],
          requesterSegments: [],
          requesterShiftLabel: "Clear Pickup",
          requesterFocusAreaId: 2,
          requesterCustomStartTime: "15:00:00",
          requesterCustomEndTime: "23:00:00",
          targetEmpId: null,
          targetName: null,
          targetShiftDate: null,
          targetShiftIds: null,
          targetJobIds: null,
          targetSegments: null,
          targetShiftLabel: null,
          targetFocusAreaId: null,
          targetCustomStartTime: null,
          targetCustomEndTime: null,
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
          requesterPresentation: {
            label: "Clear Pickup",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "15:00:00",
            endTime: "23:00:00",
            segments: [],
          },
          requesterState: {
            kind: "worked",
            segments: [{ shiftId: 4, jobId: 13, position: 0 }],
            absenceTypeId: null,
            customStartTime: "15:00:00",
            customEndTime: "23:00:00",
            seriesId: null,
            fromRecurring: false,
          },
          targetPresentation: null,
          targetState: null,
        },
        {
          id: "request-own",
          orgId: "org-1",
          type: "pickup",
          status: "open",
          requesterEmpId: "emp-1",
          requesterName: "Alex Kim",
          requesterShiftDate: "2026-04-18",
          requesterShiftIds: [5],
          requesterJobIds: [14],
          requesterSegments: [],
          requesterShiftLabel: "Own Pickup",
          requesterFocusAreaId: 2,
          requesterCustomStartTime: "23:00:00",
          requesterCustomEndTime: "07:00:00",
          targetEmpId: null,
          targetName: null,
          targetShiftDate: null,
          targetShiftIds: null,
          targetJobIds: null,
          targetSegments: null,
          targetShiftLabel: null,
          targetFocusAreaId: null,
          targetCustomStartTime: null,
          targetCustomEndTime: null,
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
          requesterPresentation: {
            label: "Own Pickup",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "23:00:00",
            endTime: "07:00:00",
            segments: [],
          },
          requesterState: {
            kind: "worked",
            segments: [{ shiftId: 5, jobId: 14, position: 0 }],
            absenceTypeId: null,
            customStartTime: "23:00:00",
            customEndTime: "07:00:00",
            seriesId: null,
            fromRecurring: false,
          },
          targetPresentation: null,
          targetState: null,
        },
      ] as never,
      now: new Date("2026-04-16T18:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(feed.totalCount).toBe(4);
    expect(feed.openShifts.map((shift) => shift.id)).toEqual(["open-clear"]);
    expect(feed.openShiftRequests.map((request) => request.id)).toEqual(["request-clear"]);
    expect(feed.groups).toMatchObject([
      {
        date: "2026-04-18",
        itemCount: 2,
        slotCount: 4,
        items: [
          { kind: "open_shift", key: "open-clear" },
          { kind: "request", key: "request-clear" },
        ],
      },
    ]);
  });

  const makeOpenShiftVisibilityFixture = () => ({
    linkedEmployeeId: "emp-1",
    scheduleEntries: [
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-18",
        shiftIds: [1],
        jobIds: [10],
        shiftLabel: "D",
        assignmentLabel: "D",
        shiftName: "Day Shift",
        absenceTypeId: null,
        focusAreaId: 2,
        focusAreaName: "ICU",
        startTime: "07:00:00",
        endTime: "15:00:00",
        customStartTime: null,
        customEndTime: null,
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Day Shift",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "ICU",
          },
        ],
      },
    ] as never,
    openShifts: [
      {
        id: "open-conflict",
        date: "2026-04-18",
        focusAreaId: 2,
        focusAreaName: "ICU",
        needed: 1,
        state: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 10, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        presentation: {
          label: "Conflicting Open",
          focusAreaId: 2,
          focusAreaName: "ICU",
          displayFocusAreaName: "ICU",
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [],
        },
      },
      {
        id: "open-clear",
        date: "2026-04-18",
        focusAreaId: 2,
        focusAreaName: "ICU",
        needed: 1,
        state: {
          kind: "worked",
          segments: [{ shiftId: 2, jobId: 11, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        presentation: {
          label: "Clear Open",
          focusAreaId: 2,
          focusAreaName: "ICU",
          displayFocusAreaName: "ICU",
          startTime: "15:00:00",
          endTime: "23:00:00",
          segments: [],
        },
      },
    ] as never,
    requests: [
      {
        id: "request-conflict",
        orgId: "org-1",
        type: "pickup",
        status: "open",
        requesterEmpId: "emp-2",
        requesterName: "Jordan Lee",
        requesterShiftDate: "2026-04-18",
        requesterShiftIds: [3],
        requesterJobIds: [12],
        requesterSegments: [],
        requesterShiftLabel: "Conflicting Pickup",
        requesterFocusAreaId: 2,
        requesterCustomStartTime: "07:00:00",
        requesterCustomEndTime: "15:00:00",
        targetEmpId: null,
        targetName: null,
        targetShiftDate: null,
        targetShiftIds: null,
        targetJobIds: null,
        targetSegments: null,
        targetShiftLabel: null,
        targetFocusAreaId: null,
        targetCustomStartTime: null,
        targetCustomEndTime: null,
        absenceTypeId: null,
        parentRequestId: null,
        adminUserId: null,
        adminNote: null,
        expiresAt: "2026-04-19T00:00:00.000Z",
        resolvedAt: null,
        createdAt: "2026-04-15T00:00:00.000Z",
        updatedAt: "2026-04-15T00:00:00.000Z",
        requesterPresentation: {
          label: "Conflicting Pickup",
          focusAreaId: 2,
          focusAreaName: "ICU",
          displayFocusAreaName: "ICU",
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [],
        },
        requesterState: {
          kind: "worked",
          segments: [{ shiftId: 3, jobId: 12, position: 0 }],
          absenceTypeId: null,
          customStartTime: "07:00:00",
          customEndTime: "15:00:00",
          seriesId: null,
          fromRecurring: false,
        },
        targetPresentation: null,
        targetState: null,
      },
      {
        id: "request-clear",
        orgId: "org-1",
        type: "pickup",
        status: "open",
        requesterEmpId: "emp-3",
        requesterName: "Ivy Stone",
        requesterShiftDate: "2026-04-18",
        requesterShiftIds: [4],
        requesterJobIds: [13],
        requesterSegments: [],
        requesterShiftLabel: "Clear Pickup",
        requesterFocusAreaId: 2,
        requesterCustomStartTime: "15:00:00",
        requesterCustomEndTime: "23:00:00",
        targetEmpId: null,
        targetName: null,
        targetShiftDate: null,
        targetShiftIds: null,
        targetJobIds: null,
        targetSegments: null,
        targetShiftLabel: null,
        targetFocusAreaId: null,
        targetCustomStartTime: null,
        targetCustomEndTime: null,
        absenceTypeId: null,
        parentRequestId: null,
        adminUserId: null,
        adminNote: null,
        expiresAt: "2026-04-19T00:00:00.000Z",
        resolvedAt: null,
        createdAt: "2026-04-15T00:00:00.000Z",
        updatedAt: "2026-04-15T00:00:00.000Z",
        requesterPresentation: {
          label: "Clear Pickup",
          focusAreaId: 2,
          focusAreaName: "ICU",
          displayFocusAreaName: "ICU",
          startTime: "15:00:00",
          endTime: "23:00:00",
          segments: [],
        },
        requesterState: {
          kind: "worked",
          segments: [{ shiftId: 4, jobId: 13, position: 0 }],
          absenceTypeId: null,
          customStartTime: "15:00:00",
          customEndTime: "23:00:00",
          seriesId: null,
          fromRecurring: false,
        },
        targetPresentation: null,
        targetState: null,
      },
    ] as never,
    now: new Date("2026-04-16T18:00:00.000Z"),
    timeZone: "America/Los_Angeles",
  });

  it("defaults open-shift visibility to availability-matched (legacy behavior)", () => {
    const feed = buildAvailableOpenShiftFeed(makeOpenShiftVisibilityFixture());

    // The conflicting open shift and pickup overlap emp-1's own 07:00-15:00
    // shift, so only the clear (non-overlapping) items survive.
    expect(feed.openShifts.map((shift) => shift.id)).toEqual(["open-clear"]);
    expect(feed.openShiftRequests.map((request) => request.id)).toEqual(["request-clear"]);
  });

  it("shows every eligible open shift regardless of availability when visibility is 'always'", () => {
    const feed = buildAvailableOpenShiftFeed({
      ...makeOpenShiftVisibilityFixture(),
      coverageGapVisibility: "always",
      calloffVisibility: "always",
    });

    // Availability filtering is bypassed, so the conflicting items reappear.
    // Hard eligibility (canVolunteer) and own-request exclusion still apply,
    // but neither is present in this fixture.
    expect(feed.openShifts.map((shift) => shift.id)).toEqual(["open-conflict", "open-clear"]);
    expect(feed.openShiftRequests.map((request) => request.id)).toEqual([
      "request-conflict",
      "request-clear",
    ]);
  });

  it("hides each open-shift source when its visibility is 'hidden'", () => {
    const feed = buildAvailableOpenShiftFeed({
      ...makeOpenShiftVisibilityFixture(),
      coverageGapVisibility: "hidden",
      calloffVisibility: "hidden",
    });

    expect(feed.openShifts).toEqual([]);
    expect(feed.openShiftRequests).toEqual([]);
    expect(feed.totalCount).toBe(0);
  });

  it("scopes 'hidden' to one source without affecting the other", () => {
    const feed = buildAvailableOpenShiftFeed({
      ...makeOpenShiftVisibilityFixture(),
      coverageGapVisibility: "hidden",
      calloffVisibility: "always",
    });

    expect(feed.openShifts).toEqual([]);
    expect(feed.openShiftRequests.map((request) => request.id)).toEqual([
      "request-conflict",
      "request-clear",
    ]);
  });

  it("replaces a volunteered open shift with the user's pending approval request", () => {
    const feed = buildAvailableOpenShiftFeed({
      linkedEmployeeId: "emp-1",
      scheduleEntries: [],
      openShifts: [
        {
          id: "open-volunteered",
          date: "2026-04-18",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 1,
          state: {
            kind: "worked",
            segments: [{ shiftId: 1, jobId: 10, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Day Shift",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
        },
      ] as never,
      requests: [
        {
          id: "pending-volunteer",
          orgId: "org-1",
          type: "pickup",
          status: "pending_approval",
          requesterEmpId: "emp-1",
          requesterName: "Alex Kim",
          requesterShiftDate: "2026-04-18",
          requesterState: {
            kind: "worked",
            focusAreaId: 2,
            segments: [{ shiftId: 1, jobId: 10, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          requesterPresentation: {
            label: "Day Shift",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
          targetEmpId: null,
          targetName: null,
          targetShiftDate: null,
          targetState: null,
          targetPresentation: null,
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ] as never,
      now: new Date("2026-04-16T18:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(feed.openShifts).toEqual([]);
    expect(feed.openShiftRequests.map((request) => request.id)).toEqual(["pending-volunteer"]);
    expect(feed.groups[0]?.items).toMatchObject([{ kind: "request", key: "pending-volunteer" }]);
  });

  it("keeps partially filled open shifts visible to other mobile users", () => {
    const feed = buildAvailableOpenShiftFeed({
      linkedEmployeeId: "emp-2",
      scheduleEntries: [],
      openShifts: [
        {
          id: "open-partial",
          date: "2026-04-18",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 1,
          state: {
            kind: "worked",
            segments: [{ shiftId: 1, jobId: 10, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Day Shift",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
        },
      ] as never,
      requests: [
        {
          id: "pending-volunteer",
          orgId: "org-1",
          type: "pickup",
          status: "pending_approval",
          requesterEmpId: "emp-1",
          requesterName: "Alex Kim",
          requesterShiftDate: "2026-04-18",
          requesterState: {
            kind: "worked",
            focusAreaId: 2,
            segments: [{ shiftId: 1, jobId: 10, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          requesterPresentation: {
            label: "Day Shift",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
          targetEmpId: null,
          targetName: null,
          targetShiftDate: null,
          targetState: null,
          targetPresentation: null,
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ] as never,
      now: new Date("2026-04-16T18:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(feed.openShifts).toMatchObject([
      {
        id: "open-partial",
        needed: 1,
      },
    ]);
    expect(feed.openShiftRequests).toEqual([]);
  });

  it("does not hide a focused open shift for a pending volunteer request in another focus area", () => {
    const feed = buildAvailableOpenShiftFeed({
      linkedEmployeeId: "emp-1",
      scheduleEntries: [],
      openShifts: [
        {
          id: "open-icu",
          date: "2026-04-18",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 1,
          state: {
            kind: "worked",
            focusAreaId: 2,
            segments: [{ shiftId: 1, jobId: 10, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Day Shift",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
        },
      ] as never,
      requests: [
        {
          id: "pending-other-focus",
          orgId: "org-1",
          type: "pickup",
          status: "pending_approval",
          requesterEmpId: "emp-1",
          requesterName: "Alex Kim",
          requesterShiftDate: "2026-04-18",
          requesterState: {
            kind: "worked",
            focusAreaId: 99,
            segments: [{ shiftId: 1, jobId: 10, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          requesterPresentation: {
            label: "Day Shift",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
          targetEmpId: null,
          targetName: null,
          targetShiftDate: null,
          targetState: null,
          targetPresentation: null,
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ] as never,
      now: new Date("2026-04-16T18:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(feed.openShifts).toMatchObject([{ id: "open-icu" }]);
    expect(feed.openShiftRequests.map((request) => request.id)).toEqual(["pending-other-focus"]);
  });

  it("filters started open requests and open shifts using org-local time", () => {
    const now = new Date("2026-04-18T18:30:00.000Z");
    const sections = buildMeShiftRequestSections({
      linkedEmployeeId: "emp-1",
      requests: [
        {
          id: "started-cover",
          orgId: "org-1",
          type: "swap",
          status: "open",
          requesterEmpId: "emp-2",
          requesterName: "Sarah Jenkins",
          requesterShiftDate: "2026-04-18",
          requesterShiftIds: [1],
          requesterJobIds: [10],
          requesterSegments: [],
          requesterShiftLabel: "Morning Shift",
          requesterFocusAreaId: 2,
          requesterCustomStartTime: "08:00:00",
          requesterCustomEndTime: "16:00:00",
          targetEmpId: "emp-1",
          targetName: "Alex Kim",
          targetShiftDate: "2026-04-19",
          targetShiftIds: [2],
          targetJobIds: [11],
          targetSegments: [],
          targetShiftLabel: "Day Shift",
          targetFocusAreaId: 2,
          targetCustomStartTime: "15:00:00",
          targetCustomEndTime: "23:00:00",
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
        {
          id: "future-cover",
          orgId: "org-1",
          type: "swap",
          status: "open",
          requesterEmpId: "emp-2",
          requesterName: "Sarah Jenkins",
          requesterShiftDate: "2026-04-19",
          requesterShiftIds: [3],
          requesterJobIds: [12],
          requesterSegments: [],
          requesterShiftLabel: "Day Shift",
          requesterFocusAreaId: 2,
          requesterCustomStartTime: "07:00:00",
          requesterCustomEndTime: "15:00:00",
          targetEmpId: "emp-1",
          targetName: "Alex Kim",
          targetShiftDate: "2026-04-20",
          targetShiftIds: [4],
          targetJobIds: [13],
          targetSegments: [],
          targetShiftLabel: "Evening Shift",
          targetFocusAreaId: 2,
          targetCustomStartTime: "15:00:00",
          targetCustomEndTime: "23:00:00",
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ] as never,
      now,
      timeZone: "America/Los_Angeles",
    });

    const feed = buildAvailableOpenShiftFeed({
      linkedEmployeeId: "emp-1",
      scheduleEntries: [] as never,
      openShifts: [
        {
          id: "started-open",
          date: "2026-04-18",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 1,
          state: {
            kind: "worked",
            segments: [{ shiftId: 1, jobId: 10, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Morning Open",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "08:00:00",
            endTime: "16:00:00",
            segments: [],
          },
        },
        {
          id: "future-open",
          date: "2026-04-19",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 1,
          state: {
            kind: "worked",
            segments: [{ shiftId: 2, jobId: 11, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Future Open",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "15:00:00",
            endTime: "23:00:00",
            segments: [],
          },
        },
      ] as never,
      requests: [
        {
          id: "started-request",
          orgId: "org-1",
          type: "pickup",
          status: "open",
          requesterEmpId: "emp-2",
          requesterName: "Jordan Lee",
          requesterShiftDate: "2026-04-18",
          requesterShiftIds: [5],
          requesterJobIds: [14],
          requesterSegments: [],
          requesterShiftLabel: "Started Pickup",
          requesterFocusAreaId: 2,
          requesterCustomStartTime: "08:00:00",
          requesterCustomEndTime: "16:00:00",
          targetEmpId: null,
          targetName: null,
          targetShiftDate: null,
          targetShiftIds: null,
          targetJobIds: null,
          targetSegments: null,
          targetShiftLabel: null,
          targetFocusAreaId: null,
          targetCustomStartTime: null,
          targetCustomEndTime: null,
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
        {
          id: "future-request",
          orgId: "org-1",
          type: "pickup",
          status: "open",
          requesterEmpId: "emp-3",
          requesterName: "Ivy Stone",
          requesterShiftDate: "2026-04-19",
          requesterShiftIds: [6],
          requesterJobIds: [15],
          requesterSegments: [],
          requesterShiftLabel: "Future Pickup",
          requesterFocusAreaId: 2,
          requesterCustomStartTime: "15:00:00",
          requesterCustomEndTime: "23:00:00",
          targetEmpId: null,
          targetName: null,
          targetShiftDate: null,
          targetShiftIds: null,
          targetJobIds: null,
          targetSegments: null,
          targetShiftLabel: null,
          targetFocusAreaId: null,
          targetCustomStartTime: null,
          targetCustomEndTime: null,
          absenceTypeId: null,
          parentRequestId: null,
          adminUserId: null,
          adminNote: null,
          expiresAt: "2026-04-19T00:00:00.000Z",
          resolvedAt: null,
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ] as never,
      now,
      timeZone: "America/Los_Angeles",
    });

    expect(sections.coverRequests.map((request) => request.id)).toEqual(["future-cover"]);
    expect(feed.openShifts.map((shift) => shift.id)).toEqual(["future-open"]);
    expect(feed.openShiftRequests.map((request) => request.id)).toEqual(["future-request"]);
  });

  it("keeps org-wide open shifts visible for editor-style show-all feeds", () => {
    const feed = buildAvailableOpenShiftFeed({
      linkedEmployeeId: "emp-1",
      scheduleEntries: [
        {
          employeeId: "emp-1",
          employeeName: "Alex Kim",
          date: "2026-04-19",
          shiftIds: [1],
          jobIds: [10],
          shiftLabel: "D",
          assignmentLabel: "D",
          shiftName: "Day Shift",
          absenceTypeId: null,
          focusAreaId: 2,
          focusAreaName: "ICU",
          startTime: "07:00:00",
          endTime: "15:00:00",
          customStartTime: null,
          customEndTime: null,
          segments: [
            {
              shiftId: 1,
              jobId: 10,
              shiftName: "Day Shift",
              jobName: "Nurse",
              startTime: "07:00:00",
              endTime: "15:00:00",
              displayFocusAreaName: "ICU",
            },
          ],
        },
      ] as never,
      openShifts: [
        {
          id: "open-overlap",
          date: "2026-04-19",
          focusAreaId: 2,
          focusAreaName: "ICU",
          needed: 1,
          state: {
            kind: "worked",
            segments: [{ shiftId: 1, jobId: 10, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "Overlapping Open",
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
        },
      ] as never,
      requests: [] as never,
      now: new Date("2026-04-16T18:00:00.000Z"),
      showAll: true,
      timeZone: "America/Los_Angeles",
    });

    expect(feed.openShifts.map((shift) => shift.id)).toEqual(["open-overlap"]);
    expect(feed.totalCount).toBe(1);
  });

  it("calculates weekly scheduled hours against a 40h target", () => {
    const summary = buildWeeklyHoursSummary([
      {
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-16",
        shiftIds: [1],
        jobIds: [10],
        shiftLabel: "D",
        assignmentLabel: "D",
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
        employeeId: "emp-1",
        employeeName: "Alex Kim",
        date: "2026-04-17",
        shiftIds: [2],
        jobIds: [20],
        shiftLabel: "E",
        assignmentLabel: "E",
        shiftName: "Evening Shift",
        absenceTypeId: null,
        focusAreaId: 2,
        focusAreaName: "ICU",
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
        date: "2026-04-18",
        shiftIds: [],
        jobIds: [],
        shiftLabel: "Off",
        assignmentLabel: null,
        shiftName: "Off Day",
        absenceTypeId: 1,
        focusAreaId: null,
        focusAreaName: null,
        startTime: null,
        endTime: null,
        customStartTime: null,
        customEndTime: null,
        publishedAt: null,
        publishedByName: null,
      },
    ]);

    expect(summary).toEqual({
      scheduledHours: 16,
      targetHours: 40,
      progress: 0.4,
      statusLabel: "Needs attention",
    });
  });

  it("counts custom, split, and duration-only jobs in weekly hours", () => {
    const summary = buildWeeklyHoursSummary(
      [
        {
          employeeId: "emp-1",
          employeeName: "Alex Kim",
          date: "2026-04-16",
          shiftIds: [1],
          jobIds: [10],
          shiftLabel: "D",
          assignmentLabel: "D",
          shiftName: "Day Shift",
          absenceTypeId: null,
          focusAreaId: 2,
          focusAreaName: "ICU",
          startTime: "07:00:00",
          endTime: "15:00:00",
          customStartTime: "08:00:00",
          customEndTime: "12:30:00",
          segments: [
            {
              shiftId: 1,
              jobId: 10,
              shiftName: "Day Shift",
              jobName: "Nurse",
              startTime: "07:00:00",
              endTime: "15:00:00",
              breakMinutes: 30,
              displayFocusAreaName: "ICU",
            },
          ],
          publishedAt: null,
          publishedByName: null,
        },
        {
          employeeId: "emp-1",
          employeeName: "Alex Kim",
          date: "2026-04-17",
          shiftIds: [2, 3],
          jobIds: [20, 21],
          shiftLabel: "D/E",
          assignmentLabel: "D/E",
          shiftName: "Day Shift / Evening Shift",
          absenceTypeId: null,
          focusAreaId: 2,
          focusAreaName: "ICU",
          startTime: "07:00:00",
          endTime: "17:30:00",
          customStartTime: "07:00:00|13:00:00",
          customEndTime: "11:00:00|17:30:00",
          segments: [
            {
              shiftId: 2,
              jobId: 20,
              shiftName: "Morning",
              jobName: "Nurse",
              startTime: "07:00:00",
              endTime: "11:00:00",
              displayFocusAreaName: "ICU",
            },
            {
              shiftId: 3,
              jobId: 21,
              shiftName: "Afternoon",
              jobName: "Mentor",
              startTime: "13:00:00",
              endTime: "17:30:00",
              displayFocusAreaName: "ICU",
            },
          ],
          publishedAt: null,
          publishedByName: null,
        },
        {
          employeeId: "emp-1",
          employeeName: "Alex Kim",
          date: "2026-04-18",
          shiftIds: [null],
          jobIds: [30],
          shiftLabel: "Admin",
          assignmentLabel: "Admin",
          shiftName: "Admin",
          absenceTypeId: null,
          focusAreaId: null,
          focusAreaName: null,
          startTime: null,
          endTime: null,
          customStartTime: null,
          customEndTime: null,
          segments: [
            {
              shiftId: null,
              jobId: 30,
              shiftName: "Admin",
              jobName: "Admin",
              startTime: null,
              endTime: null,
              defaultDurationHours: 2,
              defaultDurationMinutes: 30,
              displayFocusAreaName: null,
            },
          ],
          publishedAt: null,
          publishedByName: null,
        },
      ],
      40,
    );

    expect(summary.scheduledHours).toBe(15);
  });
});
