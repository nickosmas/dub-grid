import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SERIES_OCCURRENCES } from "@/lib/constants";

const requireOrgPermissions = vi.fn();
const userRpc = vi.fn();
const serviceFrom = vi.fn();
const serviceRpc = vi.fn();
const resolveEffectiveOrgId = vi.fn();

/** Answers the cell-snapshot lookup that gates indicator writes. */
function stubCellSnapshot(stateKind: "worked" | "absence" | "deleted" | null) {
  serviceRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn !== "get_schedule_cell_snapshot_payload") return { data: null, error: null };
    // Only the draft is answered, which is the snapshot the guard prefers.
    if (args.p_snapshot_kind !== "draft" || stateKind == null) return { data: [], error: null };
    return { data: [{ state_kind: stateKind, shift_ids: [1], job_ids: [1] }], error: null };
  });
}

/**
 * Records the writes clearScheduleNotesForCells makes, so a test can assert
 * which cells were cleared without standing up a real query builder.
 */
function captureNoteClearing() {
  const deleted: Array<Record<string, unknown>> = [];
  const softDeleted: Array<Record<string, unknown>> = [];

  function chain(record: Record<string, unknown>, sink: Array<Record<string, unknown>>) {
    const builder = {
      eq(column: string, value: unknown) {
        record[column] = value;
        return builder;
      },
      then(resolve: (value: { error: null }) => unknown) {
        sink.push(record);
        return Promise.resolve({ error: null } as const).then(resolve);
      },
    };
    return builder;
  }

  serviceFrom.mockImplementation((table: string) =>
    table === "schedule_notes"
      ? {
          delete: () => chain({}, deleted),
          update: (payload: Record<string, unknown>) => chain({ ...payload }, softDeleted),
        }
      : { insert: vi.fn(async () => ({ error: null })) },
  );

  return { deleted, softDeleted };
}

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
  const seriesRequest = {
    action: "createShiftSeries",
    orgId: "11111111-1111-4111-8111-111111111111",
    employeeId: "22222222-2222-4222-8222-222222222222",
    input: { kind: "absence", segments: [], absenceTypeId: 7 },
    shiftLabel: "Vacation",
    frequency: "daily",
    daysOfWeek: null,
    startDate: "2026-09-23",
    endDate: null,
    maxOccurrences: null,
  };

  function seriesEndDate(days: number) {
    return new Date(Date.parse(seriesRequest.startDate) + days * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }

  it.each([
    { maxOccurrences: MAX_SERIES_OCCURRENCES + 1 },
    { maxOccurrences: 100_000, endDate: "2099-12-31" },
    { endDate: seriesEndDate(MAX_SERIES_OCCURRENCES * 14 + 1) },
    { endDate: seriesEndDate(-1) },
    { maxOccurrences: 0 },
    { maxOccurrences: -1 },
  ])("rejects invalid series bounds before permissions or writes: %j", async (bounds) => {
    const response = await POST(makeRequest({ ...seriesRequest, ...bounds }));
    expect(response.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
    expect(userRpc).not.toHaveBeenCalled();
  });

  it.each([
    { maxOccurrences: MAX_SERIES_OCCURRENCES },
    { maxOccurrences: 1 },
    { endDate: seriesEndDate(0) },
    { frequency: "biweekly", endDate: seriesEndDate(MAX_SERIES_OCCURRENCES * 14) },
    {},
  ])("accepts supported series bounds: %j", async (bounds) => {
    const request = { ...seriesRequest, ...bounds };
    const response = await POST(makeRequest(request));
    expect(response.status).toBe(200);
    expect(userRpc).toHaveBeenCalledWith(
      "create_shift_series",
      expect.objectContaining({
        p_start_date: request.startDate,
        p_end_date: request.endDate,
        p_max_occurrences: request.maxOccurrences,
      }),
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    userRpc.mockResolvedValue({ data: 0, error: null });
    resolveEffectiveOrgId.mockImplementation((_req, _userId, orgId) => Promise.resolve(orgId));
    requireOrgPermissions.mockImplementation(async (_req, orgId) => ({
      userClient: { rpc: userRpc },
      serviceClient: { from: serviceFrom, rpc: serviceRpc },
      actor: { id: "actor-user" },
      orgId,
      permissions: { canEditShifts: true },
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

    // A bulk delete also clears each cell's notes, so the stub has to answer
    // schedule_notes as well as the audit insert.
    const { deleted } = captureNoteClearing();

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
    expect(deleted.map((row) => row.emp_id).sort()).toEqual(
      [firstEmployeeId, secondEmployeeId].sort(),
    );
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

  function draftedCellQuery(orgId: string, empId: string) {
    return chainableQuery({
      data: [
        {
          id: "cell-1",
          emp_id: empId,
          date: "2026-08-02",
          org_id: orgId,
          version: 3,
          series_id: null,
          from_recurring: false,
          created_by: "author-user",
          updated_by: "author-user",
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
          snapshots: [
            {
              id: "snap-published",
              cell_id: "cell-1",
              org_id: orgId,
              snapshot_kind: "published",
              state_kind: "absence",
              absence_type_id: 5,
              custom_start_time: null,
              custom_end_time: null,
              segments: [],
            },
            {
              id: "snap-draft",
              cell_id: "cell-1",
              org_id: orgId,
              snapshot_kind: "draft",
              state_kind: "absence",
              absence_type_id: 6,
              custom_start_time: null,
              custom_end_time: null,
              segments: [],
            },
          ],
        },
      ],
      error: null,
    });
  }

  const DRAFT_LABELS = [
    [5, "Vacation"],
    [6, "Bereavement"],
  ];

  it("withholds the draft from a viewer even when the body claims isScheduler", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const empId = "22222222-2222-4222-8222-222222222222";

    requireOrgPermissions.mockImplementation(async (_req, id) => ({
      userClient: { rpc: userRpc },
      serviceClient: { from: serviceFrom, rpc: serviceRpc },
      actor: { id: "actor-user" },
      orgId: id,
      permissions: { canEditShifts: false },
    }));
    serviceFrom.mockReturnValue(draftedCellQuery(orgId, empId));

    const response = await POST(
      makeRequest({
        action: "fetchShifts",
        orgId,
        // The exact escalation this guards: a staff caller asking for drafts.
        isScheduler: true,
        assignmentLabels: [],
        absenceTypeLabels: DRAFT_LABELS,
      }),
    );

    expect(response.status).toBe(200);
    const entry = (await response.json()).shifts[`${empId}_2026-08-02`];
    expect(entry.draft).toBeNull();
    expect(entry.draftKind).toBeNull();
    expect(entry.isDraft).toBe(false);
    expect(entry.createdBy).toBeNull();
    expect(entry.updatedBy).toBeNull();
    // The published absence still resolves, so the viewer keeps their schedule.
    expect(entry.publishedAbsenceTypeId).toBe(5);
    expect(entry.absenceTypeId).toBe(5);
    expect(JSON.stringify(entry)).not.toContain("Bereavement");
  });

  it("still hands a scheduler both snapshots", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const empId = "22222222-2222-4222-8222-222222222222";

    serviceFrom.mockReturnValue(draftedCellQuery(orgId, empId));

    const response = await POST(
      makeRequest({
        action: "fetchShifts",
        orgId,
        // Deliberately false: the session decides, not the body.
        isScheduler: false,
        assignmentLabels: [],
        absenceTypeLabels: DRAFT_LABELS,
      }),
    );

    expect(response.status).toBe(200);
    const entry = (await response.json()).shifts[`${empId}_2026-08-02`];
    expect(entry.draft).not.toBeNull();
    expect(entry.absenceTypeId).toBe(6);
    expect(entry.publishedAbsenceTypeId).toBe(5);
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

  it("hands a viewer only the published notes and hides a pending removal", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const empId = "22222222-2222-4222-8222-222222222222";
    const note = (id: number, status: string) => ({
      id,
      org_id: orgId,
      emp_id: empId,
      date: "2026-08-02",
      indicator_type_id: id,
      focus_area_id: 2,
      status,
      created_by: "user-1",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    });
    const rows = [note(1, "published"), note(2, "draft"), note(3, "draft_deleted")];

    requireOrgPermissions.mockImplementation(async (_req, id) => ({
      userClient: { rpc: userRpc },
      serviceClient: { from: serviceFrom, rpc: serviceRpc },
      actor: { id: "actor-user" },
      orgId: id,
      permissions: { canEditShifts: false, canEditNotes: false },
    }));
    serviceFrom.mockReturnValue(chainableQuery({ data: rows, error: null }));

    const viewer = await (await POST(makeRequest({ action: "fetchScheduleNotes", orgId }))).json();
    expect(viewer.notes.map((n: { id: number; status: string }) => [n.id, n.status])).toEqual([
      [1, "published"],
      [3, "published"],
    ]);

    requireOrgPermissions.mockImplementation(async (_req, id) => ({
      userClient: { rpc: userRpc },
      serviceClient: { from: serviceFrom, rpc: serviceRpc },
      actor: { id: "actor-user" },
      orgId: id,
      permissions: { canEditShifts: false, canEditNotes: true },
    }));
    serviceFrom.mockReturnValue(chainableQuery({ data: rows, error: null }));

    const editor = await (await POST(makeRequest({ action: "fetchScheduleNotes", orgId }))).json();
    expect(editor.notes.map((n: { id: number; status: string }) => [n.id, n.status])).toEqual([
      [1, "published"],
      [2, "draft"],
      [3, "draft_deleted"],
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

describe("POST /api/schedule/manage permission gates", () => {
  const orgId = "11111111-1111-4111-8111-111111111111";
  const employeeId = "22222222-2222-4222-8222-222222222222";

  // Runs the route's own predicate against a fixed permission set, the way
  // the real helper would, so a 403 here means the gate itself refused.
  function grant(permissions: Record<string, boolean>) {
    requireOrgPermissions.mockImplementation(
      async (_req, requestedOrgId, isAllowed: (p: Record<string, boolean>) => boolean) =>
        isAllowed(permissions)
          ? {
              userClient: { rpc: userRpc },
              serviceClient: { from: serviceFrom, rpc: serviceRpc },
              actor: { id: "actor-user" },
              orgId: requestedOrgId,
              permissions,
            }
          : { response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) },
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveOrgId.mockImplementation((_req, _userId, requestedOrgId) =>
      Promise.resolve(requestedOrgId),
    );
  });

  it("refuses a recurring apply without schedule edit, even with the recurring key", async () => {
    grant({ canApplyRecurringSchedule: true, canEditShifts: false });

    const response = await POST(
      makeRequest({
        action: "applyRecurringSchedules",
        orgId,
        startDate: "2026-08-03",
        endDate: "2026-08-09",
      }),
    );

    expect(response.status).toBe(403);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("refuses a series change without schedule edit, even with the series key", async () => {
    grant({ canManageShiftSeries: true, canEditShifts: false });

    const response = await POST(
      makeRequest({
        action: "deleteShiftSeries",
        orgId,
        seriesId: "33333333-3333-4333-8333-333333333333",
      }),
    );

    expect(response.status).toBe(403);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it("refuses a schedule note without the indicators key, even with notes", async () => {
    grant({ canEditNotes: true, canEditScheduleIndicators: false });

    const response = await POST(
      makeRequest({
        action: "upsertScheduleNote",
        orgId,
        employeeId,
        date: "2026-08-03",
        indicatorTypeId: 1,
        focusAreaId: 1,
      }),
    );

    expect(response.status).toBe(403);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("refuses an indicator on a cell that carries no shift", async () => {
    grant({ canEditNotes: true, canEditScheduleIndicators: true });
    stubCellSnapshot(null);
    captureNoteClearing();

    const response = await POST(
      makeRequest({
        action: "upsertScheduleNote",
        orgId,
        employeeId,
        date: "2026-08-03",
        indicatorTypeId: 1,
        focusAreaId: 1,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot add an indicator to a cell without a shift",
    });
    expect(serviceFrom).not.toHaveBeenCalledWith("schedule_notes");
  });

  it("refuses an indicator on an absence, which is not a shift", async () => {
    grant({ canEditNotes: true, canEditScheduleIndicators: true });
    stubCellSnapshot("absence");
    captureNoteClearing();

    const response = await POST(
      makeRequest({
        action: "upsertScheduleNote",
        orgId,
        employeeId,
        date: "2026-08-03",
        indicatorTypeId: 1,
        focusAreaId: 1,
      }),
    );

    expect(response.status).toBe(400);
    expect(serviceFrom).not.toHaveBeenCalledWith("schedule_notes");
  });

  it("admits an indicator on a drafted shift, since schedulers tag as they build", async () => {
    grant({ canEditNotes: true, canEditScheduleIndicators: true });
    stubCellSnapshot("worked");
    const upsert = vi.fn(async () => ({ error: null }));
    serviceFrom.mockImplementation((table: string) =>
      table === "schedule_notes" ? { upsert } : { insert: vi.fn(async () => ({ error: null })) },
    );

    const response = await POST(
      makeRequest({
        action: "upsertScheduleNote",
        orgId,
        employeeId,
        date: "2026-08-03",
        indicatorTypeId: 1,
        focusAreaId: 1,
      }),
    );

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ emp_id: employeeId, indicator_type_id: 1, status: "draft" }),
      expect.anything(),
    );
  });

  it("drops a cell's notes when its shift is deleted", async () => {
    grant({ canEditShifts: true });
    const { deleted, softDeleted } = captureNoteClearing();

    const response = await POST(
      makeRequest({
        action: "deleteShift",
        orgId,
        employeeId,
        date: "2026-08-03",
        expectedVersion: 3,
      }),
    );

    expect(response.status).toBe(200);
    // A draft note goes outright; a published one is marked for the next publish.
    expect(deleted).toEqual([
      { org_id: orgId, emp_id: employeeId, date: "2026-08-03", status: "draft" },
    ]);
    expect(softDeleted).toEqual([
      {
        status: "published",
        org_id: orgId,
        emp_id: employeeId,
        date: "2026-08-03",
      },
    ]);
  });

  it("drops notes from both cells on a move but only the target on a copy", async () => {
    const targetEmployeeId = "44444444-4444-4444-8444-444444444444";
    const moveBody = {
      action: "moveShift",
      orgId,
      sourceEmpId: employeeId,
      sourceDate: "2026-08-03",
      targetEmpId: targetEmployeeId,
      targetDate: "2026-08-04",
      input: { kind: "absence", segments: [], absenceTypeId: 7 },
    };

    grant({ canEditShifts: true });
    const moved = captureNoteClearing();
    expect((await POST(makeRequest({ ...moveBody, dragMode: "move" }))).status).toBe(200);
    expect(moved.deleted.map((row) => row.emp_id)).toEqual([employeeId, targetEmployeeId]);

    grant({ canEditShifts: true });
    const copied = captureNoteClearing();
    expect((await POST(makeRequest({ ...moveBody, dragMode: "copy" }))).status).toBe(200);
    // The copy leaves the source shift in place, so its notes stay with it.
    expect(copied.deleted.map((row) => row.emp_id)).toEqual([targetEmployeeId]);
  });

  it("drops the target's notes only when a write replaces the shift", async () => {
    const input = { kind: "absence", segments: [], absenceTypeId: 7 };

    grant({ canEditShifts: true });
    const edited = captureNoteClearing();
    expect(
      (
        await POST(
          makeRequest({ action: "upsertShift", orgId, employeeId, date: "2026-08-03", input }),
        )
      ).status,
    ).toBe(200);
    expect(edited.deleted).toEqual([]);

    grant({ canEditShifts: true });
    const pasted = captureNoteClearing();
    expect(
      (
        await POST(
          makeRequest({
            action: "upsertShift",
            orgId,
            employeeId,
            date: "2026-08-03",
            input,
            clearNotes: true,
          }),
        )
      ).status,
    ).toBe(200);
    expect(pasted.deleted.map((row) => row.emp_id)).toEqual([employeeId]);
  });

  it("drops notes across every cell a deleted series covered", async () => {
    const secondEmployeeId = "55555555-5555-4555-8555-555555555555";
    grant({ canEditShifts: true, canManageShiftSeries: true });

    const notes = captureNoteClearing();
    // schedule_cells is read before the RPC, since the delete clears the link.
    const previousFrom = serviceFrom.getMockImplementation()!;
    serviceFrom.mockImplementation((table: string) =>
      table === "schedule_cells"
        ? {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [
                    { emp_id: employeeId, date: "2026-08-03" },
                    { emp_id: secondEmployeeId, date: "2026-08-10" },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        : previousFrom(table),
    );

    const response = await POST(
      makeRequest({
        action: "deleteShiftSeries",
        orgId,
        seriesId: "33333333-3333-4333-8333-333333333333",
      }),
    );

    expect(response.status).toBe(200);
    expect(notes.deleted.map((row) => `${row.emp_id}_${row.date}`).sort()).toEqual([
      `${employeeId}_2026-08-03`,
      `${secondEmployeeId}_2026-08-10`,
    ]);
  });

  it("still admits the schedule editor who holds both halves of each pair", async () => {
    grant({ canEditShifts: true, canApplyRecurringSchedule: true });
    serviceFrom.mockImplementation(() => {
      throw new Error("reached the handler");
    });

    const response = await POST(
      makeRequest({
        action: "applyRecurringSchedules",
        orgId,
        startDate: "2026-08-03",
        endDate: "2026-08-09",
      }),
    );

    expect(response.status).not.toBe(403);
    expect(serviceFrom).toHaveBeenCalled();
  });
});
