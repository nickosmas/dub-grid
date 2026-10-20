import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPublishedShiftRows = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/published-shifts", () => ({
  fetchPublishedShiftRows: (...args: unknown[]) => fetchPublishedShiftRows(...args),
  // Every row is one eight-hour shift on its own date.
  resolvePublishedScheduleEntry: (row: { date: string }) => ({
    kind: "shift",
    date: row.date,
    durationHours: 8,
  }),
}));

import { fetchEmployeeUtilization, fetchWeeklyShiftHours } from "./analytics";

const ROWS = [
  { emp_id: "emp-member", date: "2026-10-12", employees: { first_name: "Rosa", last_name: "M" } },
  { emp_id: "emp-qa", date: "2026-10-12", employees: { first_name: "QA", last_name: "Admin" } },
];

describe("dashboard analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPublishedShiftRows.mockResolvedValue(ROWS);
  });

  it("leaves hidden staff's shifts out of weekly hours", async () => {
    const [week] = await fetchWeeklyShiftHours("org-1", 1, new Set(["emp-qa"]));
    expect(week).toEqual(expect.objectContaining({ totalHours: 8, shiftCount: 1 }));

    const [everyone] = await fetchWeeklyShiftHours("org-1", 1);
    expect(everyone).toEqual(expect.objectContaining({ totalHours: 16, shiftCount: 2 }));
  });

  it("never lists hidden staff in utilization", async () => {
    const rows = await fetchEmployeeUtilization("org-1", 1, 15, new Set(["emp-qa"]));
    expect(rows.map((row) => row.employeeId)).toEqual(["emp-member"]);
  });
});
