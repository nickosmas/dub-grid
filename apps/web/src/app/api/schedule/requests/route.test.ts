import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireOrgPermissions = vi.fn();
const dispatchNotificationEvent = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

vi.mock("@/app/api/shared/schedule", () => ({
  fetchSegmentResolutionMaps: async () => ({
    assignmentIdByPair: new Map(),
    segmentCompatibility: null,
  }),
}));

vi.mock("@/features/notifications/server", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

import { POST } from "./route";

describe("POST /api/schedule/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
  });

  it("rejects CSRF failures before parsing, auth, or notification work", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const request = new NextRequest("http://localhost/api/schedule/requests", {
      method: "POST",
      body: "{",
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  const ORG_ID = "11111111-1111-4111-8111-111111111111";
  const MY_EMP_ID = "22222222-2222-4222-8222-222222222222";

  function chainableQuery(result: { data: unknown; error: unknown }) {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "gte", "lte", "is", "or", "in", "order", "range"]) {
      query[method] = vi.fn(() => query);
    }
    query.maybeSingle = vi.fn(async () => result);
    (query as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve(result);
    return query;
  }

  function mockFetchContext(permissions: Record<string, boolean>) {
    const requestsQuery = chainableQuery({ data: [], error: null });
    const employeesQuery = chainableQuery({ data: { id: MY_EMP_ID }, error: null });
    requireOrgPermissions.mockImplementation(async () => ({
      serviceClient: {
        from: (table: string) => (table === "employees" ? employeesQuery : requestsQuery),
      },
      actor: { id: "actor-user" },
      orgId: ORG_ID,
      permissions,
    }));
    return requestsQuery;
  }

  function fetchRequest() {
    return new NextRequest("http://localhost/api/schedule/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "fetchShiftRequests",
        orgId: ORG_ID,
        assignmentLabels: [],
      }),
    });
  }

  it("scopes a staff caller to their own requests plus the open pickup pool", async () => {
    const requestsQuery = mockFetchContext({
      isGridmaster: false,
      isSuperAdmin: false,
      canManageEmployees: false,
      canApproveShiftRequests: false,
      canEditShifts: false,
      canViewSchedule: true,
    });

    const response = await POST(fetchRequest());

    expect(response.status).toBe(200);
    const filters = requestsQuery.or.mock.calls.map((call) => call[0] as string);
    expect(filters).toHaveLength(1);
    // Their own requests, either side of a swap, and nothing else.
    expect(filters[0]).toContain(`requester_emp_id.eq.${MY_EMP_ID}`);
    expect(filters[0]).toContain(`target_emp_id.eq.${MY_EMP_ID}`);
    // Plus the volunteer pool, or the Available Shifts tab would come up empty.
    expect(filters[0]).toContain("and(type.eq.pickup,status.eq.open,target_emp_id.is.null)");
  });

  it("leaves an approver's fetch unscoped", async () => {
    const requestsQuery = mockFetchContext({
      isGridmaster: false,
      isSuperAdmin: false,
      canManageEmployees: false,
      canApproveShiftRequests: true,
      canEditShifts: false,
      canViewSchedule: true,
    });

    const response = await POST(fetchRequest());

    expect(response.status).toBe(200);
    expect(requestsQuery.or).not.toHaveBeenCalled();
  });

  it("falls back to the open pool for a caller with no employee record", async () => {
    const requestsQuery = chainableQuery({ data: [], error: null });
    const employeesQuery = chainableQuery({ data: null, error: null });
    requireOrgPermissions.mockImplementation(async () => ({
      serviceClient: {
        from: (table: string) => (table === "employees" ? employeesQuery : requestsQuery),
      },
      actor: { id: "actor-user" },
      orgId: ORG_ID,
      permissions: { canViewSchedule: true },
    }));

    const response = await POST(fetchRequest());

    expect(response.status).toBe(200);
    // A management-only account is on nobody's schedule, so "mine" matches
    // nothing and the clause must not degenerate into an unscoped fetch.
    expect(requestsQuery.or).toHaveBeenCalledWith(
      "and(type.eq.pickup,status.eq.open,target_emp_id.is.null)",
    );
  });

  it("captures the pre-resolve target_emp_id and forwards it to the notification dispatch", async () => {
    const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
    const CLAIMANT_EMP_ID = "44444444-4444-4444-8444-444444444444";
    const shiftRequestsQuery = chainableQuery({
      data: { target_emp_id: CLAIMANT_EMP_ID },
      error: null,
    });
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    requireOrgPermissions.mockImplementation(async () => ({
      serviceClient: {
        from: (table: string) =>
          table === "shift_requests"
            ? shiftRequestsQuery
            : chainableQuery({ data: null, error: null }),
      },
      userClient: { rpc },
      actor: { id: "admin-user" },
      orgId: ORG_ID,
      permissions: { canApproveShiftRequests: true },
    }));

    const request = new NextRequest("http://localhost/api/schedule/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "resolveShiftRequest",
        orgId: ORG_ID,
        requestId: REQUEST_ID,
        approved: false,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "resolve_shift_request",
      expect.objectContaining({ p_request_id: REQUEST_ID, p_approved: false }),
    );
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "admin-user",
      expect.objectContaining({
        action: "shift_request_resolved",
        requestId: REQUEST_ID,
        approved: false,
        previousTargetEmpId: CLAIMANT_EMP_ID,
      }),
    );
  });
});
