import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const userRpc = vi.fn();
const serviceFrom = vi.fn();
const resolveEffectiveOrgId = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
  // The sandbox redirect resolves the effective org before permission checks;
  // defaults to a pass-through (see beforeEach) so most tests can use the
  // body orgId unchanged. Tests exercising the sandbox redirect itself
  // override this per-test.
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
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

vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: vi.fn(),
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
    resolveEffectiveOrgId.mockImplementation((_req, _userId, orgId) => Promise.resolve(orgId));
    requireOrgPermissions.mockImplementation(async (_req, orgId) => ({
      userClient: { rpc: userRpc },
      serviceClient: { from: serviceFrom },
      actor: { id: "actor-user" },
      orgId,
    }));
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

  it("upserts a shift against the effective (sandbox-redirected) org, not the raw body org id", async () => {
    const requestedOrgId = "11111111-1111-4111-8111-111111111111";
    const sandboxOrgId = "99999999-9999-4999-8999-999999999999";
    const employeeId = "22222222-2222-4222-8222-222222222222";

    // The top-level sandbox redirect (lines ~497-508 in route.ts) rewrites
    // data.orgId in place before any action-specific handler runs.
    resolveEffectiveOrgId.mockResolvedValue(sandboxOrgId);
    userRpc.mockResolvedValue({ error: null });

    const response = await POST(
      makeRequest({
        action: "upsertShift",
        orgId: requestedOrgId,
        employeeId,
        date: "2026-08-03",
        input: { kind: "absence", segments: [], absenceTypeId: 7 },
      }),
    );

    expect(response.status).toBe(200);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(
      expect.anything(),
      "actor-user",
      requestedOrgId,
    );
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.anything(),
      sandboxOrgId,
      expect.any(Function),
      // The caller verified once at the top of the handler is handed down, so
      // requireOrgPermissions does not re-run getUser() over the network.
      expect.objectContaining({ actor: expect.objectContaining({ id: "actor-user" }) }),
    );
    expect(userRpc).toHaveBeenCalledWith(
      "write_schedule_cell_snapshot",
      expect.objectContaining({ p_org_id: sandboxOrgId, p_emp_id: employeeId }),
    );
  });

  it("rejects a mismatched org id when the caller has no sandbox and requireOrgPermissions denies it", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const employeeId = "22222222-2222-4222-8222-222222222222";

    requireOrgPermissions.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });

    const response = await POST(
      makeRequest({
        action: "upsertShift",
        orgId,
        employeeId,
        date: "2026-08-03",
        input: { kind: "absence", segments: [], absenceTypeId: 7 },
      }),
    );

    expect(response.status).toBe(403);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it("bulk deletes selected shifts after one permission check", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const firstEmployeeId = "22222222-2222-4222-8222-222222222222";
    const secondEmployeeId = "33333333-3333-4333-8333-333333333333";

    serviceFrom.mockReturnValue({ insert: vi.fn(async () => ({ error: null })) });

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

  // Spy-enabled chainable query mock: every filter/order/range call is a
  // vi.fn() returning the same object (so calls can be asserted), and the
  // object itself is thenable, matching the real Supabase query builder.
  function chainableQuery(result: { data: unknown; error: unknown }) {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "gte", "lte", "is", "or", "in", "order", "range"]) {
      query[method] = vi.fn(() => query);
    }
    (query as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve(result);
    return query;
  }

  it("paginates fetchShifts through the service client and maps a short page into shifts", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const empId = "22222222-2222-4222-8222-222222222222";

    const query = chainableQuery({
      data: [
        {
          id: "cell-1",
          emp_id: empId,
          date: "2026-08-02",
          org_id: orgId,
          version: 0,
          series_id: null,
          from_recurring: false,
          created_by: null,
          updated_by: null,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
          snapshots: [
            {
              id: "snap-1",
              cell_id: "cell-1",
              org_id: orgId,
              snapshot_kind: "published",
              state_kind: "absence",
              absence_type_id: 5,
              custom_start_time: null,
              custom_end_time: null,
              segments: [],
            },
          ],
        },
      ],
      error: null,
    });
    serviceFrom.mockReturnValue(query);

    const response = await POST(
      makeRequest({
        action: "fetchShifts",
        orgId,
        isScheduler: true,
        assignmentLabels: [],
        absenceTypeLabels: [[5, "Vacation"]],
        startDate: "2026-08-02",
        endDate: "2026-08-15",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(query.eq).toHaveBeenCalledWith("org_id", orgId);
    expect(query.gte).toHaveBeenCalledWith("date", "2026-08-02");
    expect(query.lte).toHaveBeenCalledWith("date", "2026-08-15");
    expect(query.order).toHaveBeenCalledWith("date", { ascending: true });
    expect(query.range).toHaveBeenCalledWith(0, 499);
    expect(body.shifts[`${empId}_2026-08-02`]).toBeDefined();
  });

  it("paginates fetchScheduleNotes through the service client", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const empId = "22222222-2222-4222-8222-222222222222";

    const query = chainableQuery({
      data: [
        {
          id: 1,
          org_id: orgId,
          emp_id: empId,
          date: "2026-08-02",
          indicator_type_id: 7,
          focus_area_id: 2,
          status: "published",
          created_by: "user-1",
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      error: null,
    });
    serviceFrom.mockReturnValue(query);

    const response = await POST(
      makeRequest({
        action: "fetchScheduleNotes",
        orgId,
        startDate: "2026-08-02",
        endDate: "2026-08-15",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(query.eq).toHaveBeenCalledWith("org_id", orgId);
    expect(query.gte).toHaveBeenCalledWith("date", "2026-08-02");
    expect(query.lte).toHaveBeenCalledWith("date", "2026-08-15");
    expect(query.order).toHaveBeenCalledWith("date", { ascending: true });
    expect(query.range).toHaveBeenCalledWith(0, 499);
    expect(body.notes).toEqual([
      {
        id: 1,
        orgId,
        empId,
        date: "2026-08-02",
        indicatorTypeId: 7,
        focusAreaId: 2,
        status: "published",
        createdBy: "user-1",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
  });

  describe("applyRecurringSchedules", () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const empId = "22222222-2222-4222-8222-222222222222";
    // 2026-08-03 is a Monday (day_of_week 1 per iterateDateRange's UTC getUTCDay()).
    const dateKey = "2026-08-03";

    function recurringShiftRow() {
      return {
        id: "rec-1",
        emp_id: empId,
        org_id: orgId,
        day_of_week: 1,
        state: { kind: "absence", absenceTypeId: 9 },
        effective_from: "2026-01-01",
        effective_until: null,
      };
    }

    function mockTables(existingCellSnapshots: unknown[]) {
      const recurringQuery = chainableQuery({
        data: [recurringShiftRow()],
        error: null,
      });
      const cellsQuery = chainableQuery({
        data: existingCellSnapshots.length
          ? [
              {
                id: "cell-1",
                emp_id: empId,
                date: dateKey,
                org_id: orgId,
                version: 2,
                series_id: null,
                from_recurring: false,
                created_by: null,
                updated_by: null,
                created_at: "2026-08-01T00:00:00.000Z",
                updated_at: "2026-08-01T00:00:00.000Z",
                snapshots: existingCellSnapshots,
              },
            ]
          : [],
        error: null,
      });
      const absenceQuery = chainableQuery({
        data: [{ id: 9, name: "Vacation" }],
        error: null,
      });
      serviceFrom.mockImplementation((table: string) => {
        if (table === "recurring_shifts") return recurringQuery;
        if (table === "schedule_cells") return cellsQuery;
        if (table === "absence_types") return absenceQuery;
        if (table === "audit_log") return { insert: vi.fn(async () => ({ error: null })) };
        throw new Error(`unexpected table ${table}`);
      });
      return { recurringQuery, cellsQuery, absenceQuery };
    }

    it("does not resurrect a cell whose draft was explicitly deleted, and paginates the existing-cells lookup", async () => {
      const { cellsQuery } = mockTables([
        {
          id: "snap-1",
          cell_id: "cell-1",
          org_id: orgId,
          snapshot_kind: "draft",
          state_kind: "deleted",
          absence_type_id: null,
          custom_start_time: null,
          custom_end_time: null,
          segments: [],
        },
      ]);

      const response = await POST(
        makeRequest({
          action: "applyRecurringSchedules",
          orgId,
          startDate: dateKey,
          endDate: dateKey,
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.generated).toEqual([]);
      expect(userRpc).not.toHaveBeenCalled();
      // Guards against the query silently truncating at PostgREST's max_rows
      // cap on a large org/date range.
      expect(cellsQuery.range).toHaveBeenCalledWith(0, 499);
      expect(cellsQuery.order).toHaveBeenCalledWith("date", { ascending: true });
    });

    it("fills a genuinely empty cell from the recurring template", async () => {
      mockTables([]);

      const response = await POST(
        makeRequest({
          action: "applyRecurringSchedules",
          orgId,
          startDate: dateKey,
          endDate: dateKey,
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.generated).toEqual([
        { empId, date: dateKey, label: "Vacation", absenceTypeId: 9 },
      ]);
      expect(userRpc).toHaveBeenCalledWith(
        "write_schedule_cell_snapshot",
        expect.objectContaining({
          p_org_id: orgId,
          p_emp_id: empId,
          p_date: dateKey,
          p_state_kind: "absence",
          p_absence_type_id: 9,
          p_from_recurring: true,
        }),
      );
    });
  });
});
