import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const publishHistoryRange = vi.fn();
const publishHistoryOrder = vi.fn();
const publishHistoryEq = vi.fn();
const profilesIn = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(query: Record<string, string>) {
  const url = new URL("http://localhost/api/schedule/publish-history");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function createServiceClient() {
  const serviceClient = {
    from: vi.fn((table: string) => {
      if (table === "publish_history") {
        return {
          select: vi.fn(() => ({
            eq: publishHistoryEq,
          })),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            in: profilesIn,
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  publishHistoryEq.mockReturnValue({
    order: publishHistoryOrder,
  });
  publishHistoryOrder.mockReturnValue({
    range: publishHistoryRange,
  });

  return serviceClient;
}

describe("GET /api/schedule/publish-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishHistoryRange.mockResolvedValue({
      data: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          published_by: "22222222-2222-4222-8222-222222222222",
          start_date: "2026-05-04",
          end_date: "2026-05-10",
          change_count: 1,
          schedule_publish_changes: [
            {
              emp_id: "emp-1",
              date: "2026-05-04",
              kind: "new",
              from_state: null,
              to_state: null,
              from_absence_type_id: null,
              to_absence_type_id: null,
              updated_by: null,
              from_custom_start: null,
              from_custom_end: null,
              to_custom_start: null,
              to_custom_end: null,
            },
          ],
          published_at: "2026-05-06T17:00:00.000Z",
        },
      ],
      error: null,
    });
    profilesIn.mockResolvedValue({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          first_name: "Rae",
          last_name: "Wong",
        },
      ],
      error: null,
    });
  });

  it("loads authorized publish history through org-scoped service queries", async () => {
    const serviceClient = createServiceClient();
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      orgId: ORG_ID,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    const response = await GET(makeRequest({ orgId: ORG_ID, limit: "5", offset: "10" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledTimes(1);
    expect(serviceClient.from).toHaveBeenCalledWith("publish_history");
    expect(publishHistoryEq).toHaveBeenCalledWith("org_id", ORG_ID);
    expect(publishHistoryOrder).toHaveBeenCalledWith("published_at", {
      ascending: false,
    });
    expect(publishHistoryRange).toHaveBeenCalledWith(10, 14);
    expect(serviceClient.from).toHaveBeenCalledWith("profiles");
    expect(profilesIn).toHaveBeenCalledWith("id", ["22222222-2222-4222-8222-222222222222"]);
    expect(body.entries).toEqual([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        publishedBy: "22222222-2222-4222-8222-222222222222",
        publishedByName: "Rae Wong",
        startDate: "2026-05-04",
        endDate: "2026-05-10",
        changeCount: 1,
        changes: [
          {
            empId: "emp-1",
            date: "2026-05-04",
            kind: "new",
            fromState: null,
            toState: null,
            fromAbsenceTypeId: null,
            toAbsenceTypeId: null,
            updatedBy: null,
            fromCustomStart: null,
            fromCustomEnd: null,
            toCustomStart: null,
            toCustomEnd: null,
          },
        ],
        publishedAt: "2026-05-06T17:00:00.000Z",
      },
    ]);
  });

  it("falls back to Unknown when a publisher profile is missing", async () => {
    const serviceClient = createServiceClient();
    profilesIn.mockResolvedValueOnce({ data: [], error: null });
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    const response = await GET(makeRequest({ orgId: ORG_ID }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries[0].publishedByName).toBe("Unknown");
  });

  it("admits management capabilities and refuses plain schedule viewers", async () => {
    const serviceClient = createServiceClient();
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      orgId: ORG_ID,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    await GET(makeRequest({ orgId: ORG_ID }));

    // The gate itself is mocked, so evaluate the predicate the route handed it.
    const isAllowed = requireOrgPermissions.mock.calls[0][2] as (
      permissions: Record<string, boolean>,
    ) => boolean;

    // Regular staff: canViewSchedule is true for every authenticated member, so
    // it can't be the gate here. Who published what is a management record.
    expect(isAllowed({ canViewSchedule: true, canViewDashboardAnalytics: false })).toBe(false);

    // authz derives canViewDashboardAnalytics from canEditShifts,
    // canManageEmployees, canPublishSchedule and canApproveShiftRequests, so
    // every scheduler, publisher, approver and staff manager still qualifies.
    expect(isAllowed({ canViewSchedule: true, canViewDashboardAnalytics: true })).toBe(true);
    expect(isAllowed({ isSuperAdmin: true })).toBe(true);
    expect(isAllowed({ isGridmaster: true })).toBe(true);
  });

  it("does not authorize invalid queries", async () => {
    const response = await GET(makeRequest({ orgId: "not-a-uuid" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: API_ERRORS.INVALID_REQUEST });
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  it("returns permission responses from the org gate", async () => {
    requireOrgPermissions.mockResolvedValue({
      response: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
    });

    const response = await GET(makeRequest({ orgId: ORG_ID }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Insufficient permissions" });
  });
});
