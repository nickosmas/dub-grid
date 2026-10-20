import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const fetchWeeklyShiftHours = vi.fn();
const fetchEmployeeUtilization = vi.fn();

vi.mock("@/app/api/shared/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/shared/permissions")>()),
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/analytics", () => ({
  fetchWeeklyShiftHours: (...args: unknown[]) => fetchWeeklyShiftHours(...args),
  fetchEmployeeUtilization: (...args: unknown[]) => fetchEmployeeUtilization(...args),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { INTERNAL_IDS, VIEWERS, internalProfilesFrom } from "@/__tests__/helpers/internal-people";

/** Answers the internal-accounts lookup, then the staff-id lookup for those accounts. */
function hiddenStaffClient() {
  return {
    from: internalProfilesFrom(INTERNAL_IDS, () => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: "emp-qa" }], error: null }).then(resolve),
      };
      return query;
    }),
  };
}

const REQUESTED_ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

function makeRequest(orgId: string) {
  const url = new URL("http://localhost/api/dashboard/analytics");
  url.searchParams.set("orgId", orgId);
  return new NextRequest(url);
}

describe("GET /api/dashboard/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWeeklyShiftHours.mockResolvedValue([]);
    fetchEmployeeUtilization.mockResolvedValue([]);
  });

  it("fetches analytics for the effective (sandbox-redirected) org, not the raw query org id (M-1)", async () => {
    // Caller's query string carries the REAL org, but a sandbox cookie is
    // active, so requireOrgPermissions redirects to the sandbox org.
    requireOrgPermissions.mockResolvedValue({
      orgId: SANDBOX_ORG_ID,
      actor: VIEWERS.gridmaster.actor,
      permissions: { isGridmaster: true },
      serviceClient: hiddenStaffClient(),
    });

    const { GET } = await import("./route");
    const res = await GET(makeRequest(REQUESTED_ORG_ID));

    expect(res.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.anything(),
      REQUESTED_ORG_ID,
      expect.any(Function),
    );
    expect(fetchWeeklyShiftHours).toHaveBeenCalledWith(SANDBOX_ORG_ID, 13, new Set());
    expect(fetchEmployeeUtilization).toHaveBeenCalledWith(SANDBOX_ORG_ID, 13, undefined, new Set());
  });

  it("leaves internal staff's shifts out of a client's analytics", async () => {
    requireOrgPermissions.mockResolvedValue({
      orgId: REQUESTED_ORG_ID,
      actor: VIEWERS.client.actor,
      permissions: { isGridmaster: false },
      serviceClient: hiddenStaffClient(),
    });

    const { GET } = await import("./route");
    await GET(makeRequest(REQUESTED_ORG_ID));

    const hidden = new Set(["emp-qa"]);
    expect(fetchWeeklyShiftHours).toHaveBeenCalledWith(REQUESTED_ORG_ID, 13, hidden);
    expect(fetchEmployeeUtilization).toHaveBeenCalledWith(REQUESTED_ORG_ID, 13, undefined, hidden);
  });
});
