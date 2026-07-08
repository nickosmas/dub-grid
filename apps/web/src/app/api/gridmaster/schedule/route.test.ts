import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
  }),
}));

vi.mock("@/lib/assignable-shifts", () => ({
  buildScheduleAssignmentOptions: () => [
    {
      id: 101,
      orgId: "11111111-1111-4111-8111-111111111111",
      label: "D RN",
      name: "Day Registered Nurse",
      color: "#dbeafe",
      border: "#60a5fa",
      text: "#0f172a",
      categoryId: 2,
      shiftId: 2,
      jobId: 3,
      focusAreaId: 1,
      sortOrder: 1,
      defaultStartTime: "07:00",
      defaultEndTime: "19:00",
      archivedAt: null,
    },
  ],
  buildShiftDisplayParts: () => ({
    primaryLabel: "Day",
    secondaryLabel: "Registered Nurse",
    isShiftless: false,
    isShiftOnly: false,
  }),
}));

vi.mock("@/lib/db/mappers", () => ({
  rowToAbsenceType: (row: Record<string, unknown>) => ({
    id: row.id,
    label: row.label,
  }),
  rowToCoverageRequirement: (row: Record<string, unknown>) => ({
    id: row.id,
    orgId: row.org_id,
    focusAreaId: row.focus_area_id,
    jobId: row.job_id,
    preferredShiftId: row.preferred_shift_id,
    dayOfWeek: row.day_of_week,
    minStaff: row.min_staff,
  }),
  rowToFocusArea: (row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name,
    archivedAt: row.archived_at ?? null,
  }),
  rowToJobDefinition: (row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name,
    abbr: row.abbr,
    archivedAt: row.archived_at ?? null,
  }),
  rowToShiftCategory: (row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name,
    abbr: row.abbr,
    focusAreaId: row.focus_area_id,
    archivedAt: row.archived_at ?? null,
  }),
}));

vi.mock("@/lib/schedule-cells", () => ({
  mapNormalizedScheduleCellRowToScheduleEntry: () => ({
    assignmentIds: [101],
    absenceTypeId: null,
    draftKind: "modified",
  }),
}));

vi.mock("@/lib/shift-job-segments", () => ({
  createAssignmentDefinitionIdByPairMap: () => new Map([["2:3", 101]]),
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const EMP_ID = "22222222-2222-4222-8222-222222222222";

function makeQuery(data: unknown[]) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve({ data: data[0] ?? null, error: null })),
    then: (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject: (reason?: unknown) => unknown,
    ) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return query;
}

function makeRequest(search = `orgId=${ORG_ID}&startDate=2026-05-04&endDate=2026-05-17`) {
  return new NextRequest(`http://localhost/api/gridmaster/schedule?${search}`);
}

describe("GET /api/gridmaster/schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "focus_areas") {
        return makeQuery([{ id: 1, org_id: ORG_ID, name: "Emergency", archived_at: null }]);
      }
      if (table === "shift_categories") {
        return makeQuery([
          { id: 2, org_id: ORG_ID, name: "Day", abbr: "D", focus_area_id: 1, archived_at: null },
        ]);
      }
      if (table === "jobs") {
        return makeQuery([
          { id: 3, org_id: ORG_ID, name: "Registered Nurse", abbr: "RN", archived_at: null },
        ]);
      }
      if (table === "absence_types") {
        return makeQuery([]);
      }
      if (table === "coverage_requirements") {
        return makeQuery([
          {
            id: 4,
            org_id: ORG_ID,
            focus_area_id: 1,
            job_id: 3,
            preferred_shift_id: 2,
            day_of_week: null,
            min_staff: 2,
          },
        ]);
      }
      if (table === "shift_requests") {
        return makeQuery([
          {
            id: "request-1",
            type: "pickup",
            status: "open",
            requester_emp_id: EMP_ID,
            requester_shift_date: "2026-05-04",
            target_emp_id: null,
            target_shift_date: null,
          },
        ]);
      }
      if (table === "schedule_cells") {
        return makeQuery([
          {
            id: "cell-1",
            emp_id: EMP_ID,
            date: "2026-05-04",
            org_id: ORG_ID,
            employees: { first_name: "Alex", last_name: "Stone" },
            focus_areas: { name: "Emergency" },
          },
        ]);
      }
      if (table === "organizations") {
        return makeQuery([{ shift_display_mode: "name" }]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects non-gridmaster access", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("validates query input before loading schedule data", async () => {
    const response = await GET(makeRequest("orgId=bad&startDate=2026-05-04&endDate=2026-05-17"));

    expect(response.status).toBe(400);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("returns draft, request, coverage, and display-mode-aware assignment details", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      shifts: [
        expect.objectContaining({
          empId: EMP_ID,
          empName: "Alex Stone",
          date: "2026-05-04",
          assignments: ["Day · Registered Nurse"],
          isDraft: true,
          draftKind: "modified",
          focusAreaName: "Emergency",
          requestIndicators: [
            {
              id: "request-1",
              type: "pickup",
              status: "open",
              relation: "requester",
            },
          ],
          assignmentDetails: [
            expect.objectContaining({
              id: 101,
              label: "Day · Registered Nurse",
              focusAreaName: "Emergency",
              focusAreaId: 1,
              coverageStatus: {
                actual: 1,
                required: 2,
                isMet: false,
              },
            }),
          ],
        }),
      ],
    });
  });
});
