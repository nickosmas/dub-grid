import { describe, expect, it } from "vitest";
import {
  addMonthsToIsoDate,
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

    expect(sortScheduleEntries(entries)).toEqual([
      entries[3],
      entries[1],
      entries[2],
      entries[0],
    ]);
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
    expect(getScheduleEntrySegmentTimeRange(entry.segments[0]!)).toBe(
      "7:00 AM - 3:00 PM",
    );
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
    expect(
      getScheduleEntrySegmentFocusAreaName(items[0]!.entry, items[0]!.segment),
    ).toBeNull();
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
    });

    expect(sections.openShiftRequests.map((request) => request.id)).toEqual([
      "pickup-open",
    ]);
    expect(sections.coverRequests.map((request) => request.id)).toEqual([
      "cover-open",
    ]);
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
          shiftLabel: "Split",
          assignmentLabel: "Split",
          shiftName: "Split Shift",
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
