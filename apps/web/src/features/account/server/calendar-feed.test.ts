// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchPublishedShiftRows = vi.fn();

vi.mock("@/lib/published-shifts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/published-shifts")>()),
  fetchPublishedShiftRows: (...args: unknown[]) => fetchPublishedShiftRows(...args),
}));

import { renderPublishedEmployeeCalendar } from "./calendar-feed";

function makeClient(absenceTypes: Array<{ id: number; label: string }> = []) {
  const result = { data: absenceTypes, error: null };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => Promise.resolve(result)),
  };
  return { from: vi.fn(() => builder) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TZ", "Africa/Nairobi");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("renderPublishedEmployeeCalendar", () => {
  it("scopes the load to the organization and employee and emits published content only", async () => {
    fetchPublishedShiftRows.mockResolvedValue([
      {
        emp_id: "employee-1",
        date: "2026-09-03",
        resolvedAssignmentIds: [],
        resolvedSegments: [
          {
            shiftId: 1,
            jobId: 2,
            label: "Published day shift",
            startTime: "08:00",
            endTime: "16:00",
          },
        ],
        published_absence_type_id: null,
        published_custom_start_time: null,
        published_custom_end_time: null,
        draft_label: "Private draft shift",
      },
    ]);

    const result = await renderPublishedEmployeeCalendar(
      makeClient() as never,
      {
        id: "employee-1",
        orgId: "org-1",
        userId: "user-1",
        firstName: "Avery",
        lastName: "Stone",
        timeZone: "Pacific/Honolulu",
      },
      12,
      new Date("2026-09-07T01:30:00.000Z"),
    );

    expect(fetchPublishedShiftRows).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        employeeId: "employee-1",
        startDate: "2026-09-06",
        endDateExclusive: "2026-11-29",
      }),
    );
    expect(result).toContain("SUMMARY:Published day shift (DubGrid)");
    expect(result).toContain("X-WR-TIMEZONE:Pacific/Honolulu");
    expect(result).toContain("DTSTART;TZID=Pacific/Honolulu:20260903T080000");
    expect(result).toContain("DTEND;TZID=Pacific/Honolulu:20260903T160000");
    expect(result).not.toContain("Private draft shift");
  });

  it("emits absences as calendar dates and advances overnight shifts without UTC conversion", async () => {
    fetchPublishedShiftRows.mockResolvedValue([
      {
        emp_id: "employee-1",
        date: "2026-09-03",
        resolvedAssignmentIds: [],
        resolvedSegments: [],
        published_absence_type_id: 4,
        published_custom_start_time: null,
        published_custom_end_time: null,
      },
      {
        emp_id: "employee-1",
        date: "2026-09-04",
        resolvedAssignmentIds: [],
        resolvedSegments: [
          {
            shiftId: 8,
            jobId: 3,
            label: "Night shift",
            startTime: "20:00",
            endTime: "06:00",
          },
        ],
        published_absence_type_id: null,
        published_custom_start_time: null,
        published_custom_end_time: null,
      },
    ]);
    const result = await renderPublishedEmployeeCalendar(
      makeClient([{ id: 4, label: "Vacation" }]) as never,
      {
        id: "employee-1",
        orgId: "org-1",
        userId: "user-1",
        firstName: "Avery",
        lastName: "Stone",
        timeZone: "America/Los_Angeles",
      },
      12,
      new Date("2026-09-01T12:00:00.000Z"),
    );

    expect(result).toContain("DTSTART;VALUE=DATE:20260903");
    expect(result).toContain("DTEND;VALUE=DATE:20260904");
    expect(result).toContain("DTSTART;TZID=America/Los_Angeles:20260904T200000");
    expect(result).toContain("DTEND;TZID=America/Los_Angeles:20260905T060000");
    expect(result).not.toContain("20260905T030000Z");
  });
});
