import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const userRpc = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
  // The sandbox redirect resolves the effective org before permission checks;
  // in tests it is a pass-through so the body orgId is used unchanged.
  resolveEffectiveOrgId: async (_req: NextRequest, _userId: string, orgId: string) =>
    orgId,
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: () => null,
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: async () => ({ user: { id: "actor-user" } }),
}));

vi.mock("@/app/api/shared/schedule", () => ({
  fetchAssignmentIdByPairMap: vi.fn(),
  fetchAssignmentLabelMap: vi.fn(),
}));

import { POST } from "./route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/schedule/manage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/schedule/manage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRpc.mockResolvedValue({ data: 0, error: null });
    requireOrgPermissions.mockResolvedValue({
      userClient: { rpc: userRpc },
      serviceClient: { from: serviceFrom },
    });
  });

  it("delegates importPreviousSchedule to the SQL RPC and returns per-row outcomes", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const firstEmployeeId = "22222222-2222-4222-8222-222222222222";
    const secondEmployeeId = "33333333-3333-4333-8333-333333333333";

    userRpc.mockResolvedValueOnce({
      data: [
        {
          emp_id: firstEmployeeId,
          source_date: "2026-06-14",
          target_date: "2026-06-28",
          outcome: "imported",
          reason: null,
        },
        {
          emp_id: secondEmployeeId,
          source_date: "2026-06-15",
          target_date: "2026-06-29",
          outcome: "skipped",
          reason: "employee_inactive",
        },
      ],
      error: null,
    });

    const response = await POST(
      makeRequest({
        action: "importPreviousSchedule",
        orgId,
        sourceStartDate: "2026-06-14",
        sourceEndDate: "2026-06-27",
        targetStartDate: "2026-06-28",
        targetEndDate: "2026-07-11",
        dryRun: false,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      outcomes: [
        {
          employeeId: firstEmployeeId,
          sourceDate: "2026-06-14",
          targetDate: "2026-06-28",
          outcome: "imported",
          reason: null,
        },
        {
          employeeId: secondEmployeeId,
          sourceDate: "2026-06-15",
          targetDate: "2026-06-29",
          outcome: "skipped",
          reason: "employee_inactive",
        },
      ],
    });
    expect(requireOrgPermissions).toHaveBeenCalledTimes(1);
    expect(userRpc).toHaveBeenCalledTimes(1);
    expect(userRpc).toHaveBeenCalledWith("import_previous_schedule", {
      p_org_id: orgId,
      p_source_start: "2026-06-14",
      p_source_end: "2026-06-27",
      p_target_start: "2026-06-28",
      p_target_end: "2026-07-11",
      p_dry_run: false,
    });
  });

  it("passes the dryRun flag through to the RPC for the preview path", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";

    userRpc.mockResolvedValueOnce({ data: [], error: null });

    await POST(
      makeRequest({
        action: "importPreviousSchedule",
        orgId,
        sourceStartDate: "2026-06-14",
        sourceEndDate: "2026-06-27",
        targetStartDate: "2026-06-28",
        targetEndDate: "2026-07-11",
        dryRun: true,
      }),
    );

    expect(userRpc).toHaveBeenCalledWith(
      "import_previous_schedule",
      expect.objectContaining({ p_dry_run: true }),
    );
  });

  it("bulk deletes selected shifts after one permission check", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const firstEmployeeId = "22222222-2222-4222-8222-222222222222";
    const secondEmployeeId = "33333333-3333-4333-8333-333333333333";

    const response = await POST(
      makeRequest({
        action: "deleteShifts",
        orgId,
        shifts: [
          {
            employeeId: firstEmployeeId,
            date: "2026-05-10",
            expectedVersion: 5,
          },
          {
            employeeId: secondEmployeeId,
            date: "2026-05-11",
            expectedVersion: 6,
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      count: 2,
    });
    expect(requireOrgPermissions).toHaveBeenCalledTimes(1);
    expect(userRpc).toHaveBeenCalledTimes(2);
    expect(userRpc).toHaveBeenNthCalledWith(
      1,
      "delete_schedule_cell_draft",
      expect.objectContaining({
        p_org_id: orgId,
        p_emp_id: firstEmployeeId,
        p_date: "2026-05-10",
        p_expected_version: 5,
      }),
    );
    expect(userRpc).toHaveBeenNthCalledWith(
      2,
      "delete_schedule_cell_draft",
      expect.objectContaining({
        p_org_id: orgId,
        p_emp_id: secondEmployeeId,
        p_date: "2026-05-11",
        p_expected_version: 6,
      }),
    );
  });
});
