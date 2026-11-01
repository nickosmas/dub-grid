import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const userRpc = vi.fn();
const serviceRpc = vi.fn();
const auditInsert = vi.fn(async () => ({ error: null }));
const dispatchNotificationEvent = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
  fetchHiddenStaffIds: async () => new Set<string>(),
  resolveEffectiveOrgId: async (_req: unknown, _userId: unknown, orgId: string) => orgId,
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: async () => ({ user: { id: "actor-user" } }),
}));
vi.mock("@/app/api/shared/schedule", () => ({
  fetchAssignmentIdByPairMap: vi.fn(),
  fetchAssignmentLabelMap: vi.fn(),
}));
vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

import { POST } from "./route";

const orgId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";

function correction(overrides: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/schedule/manage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "correctShift",
      orgId,
      employeeId,
      date: "2026-10-27",
      input: { kind: "absence", segments: [], absenceTypeId: 7 },
      expectedVersion: 3,
      reason: "Called out at 6 AM",
      ...overrides,
    }),
  });
}

type Predicate = (permissions: Record<string, boolean>) => boolean;

describe("POST /api/schedule/manage correctShift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRpc.mockResolvedValue({ data: 4, error: null });
    serviceRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) =>
      fn === "get_schedule_cell_snapshot_payload" && args.p_snapshot_kind === "published"
        ? { data: [{ state_kind: "worked", shift_ids: [1], job_ids: [1] }], error: null }
        : { data: [], error: null },
    );
    requireOrgPermissions.mockImplementation(async (_req, effectiveOrgId) => ({
      userClient: { rpc: userRpc },
      serviceClient: {
        rpc: serviceRpc,
        from: (table: string) =>
          table === "audit_log"
            ? { insert: auditInsert }
            : {
                select: () => ({ eq: () => ({ in: () => ({ in: async () => ({ data: [] }) }) }) }),
              },
      },
      actor: { id: "actor-user", email: "admin@example.test" },
      orgId: effectiveOrgId,
      permissions: { canEditShifts: true, canPublishSchedule: true },
    }));
  });

  it("needs Edit shifts and Publish schedule, or a Super Admin or Gridmaster", async () => {
    await POST(correction());
    const allowed = requireOrgPermissions.mock.calls[0][2] as Predicate;
    expect(allowed({ canEditShifts: true, canPublishSchedule: true })).toBe(true);
    expect(allowed({ canEditShifts: true, canPublishSchedule: false })).toBe(false);
    expect(allowed({ canEditShifts: false, canPublishSchedule: true })).toBe(false);
    expect(allowed({ isSuperAdmin: true })).toBe(true);
    expect(allowed({ isGridmaster: true })).toBe(true);
    expect(requireOrgPermissions.mock.calls[0][3]).toMatchObject({
      gridmasterNeedsImpersonation: true,
    });
  });

  it("corrects the day through the caller's client and logs it with Before and the reason", async () => {
    const response = await POST(correction({ reason: "  Sent home sick  " }));

    expect(response.status).toBe(200);
    expect(userRpc).toHaveBeenCalledWith(
      "correct_schedule_cell",
      expect.objectContaining({
        p_org_id: orgId,
        p_emp_id: employeeId,
        p_date: "2026-10-27",
        p_state_kind: "absence",
        p_absence_type_id: 7,
        p_expected_version: 3,
        p_reason: "Sent home sick",
      }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "shift.corrected",
        resource_type: "shift",
        resource_id: `${employeeId}:2026-10-27`,
        details: expect.objectContaining({
          reason: "Sent home sick",
          before: expect.objectContaining({ kind: "worked" }),
        }),
      }),
    );
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("takes no reason at all, and refuses one over 500 characters", async () => {
    expect((await POST(correction({ reason: undefined }))).status).toBe(200);
    expect(userRpc).toHaveBeenLastCalledWith(
      "correct_schedule_cell",
      expect.objectContaining({ p_reason: null }),
    );
    expect((await POST(correction({ reason: "x".repeat(501) }))).status).toBe(400);
    expect(userRpc).toHaveBeenCalledTimes(1);
  });

  it("passes the database's refusal on in plain words", async () => {
    userRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Correction not allowed: this day was never published" },
    });
    const neverPublished = await POST(correction());
    expect(neverPublished.status).toBe(422);
    expect(await neverPublished.json()).toMatchObject({
      error: "This day was never published.",
      code: "CORRECTION_REFUSED",
    });

    userRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Correction not allowed: a day more than 14 days ago needs a Super Admin" },
    });
    const tooOld = await POST(correction());
    expect(tooOld.status).toBe(403);
    expect(await tooOld.json()).toMatchObject({
      error: "A day more than 14 days ago needs a Super Admin.",
    });
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("answers a past day's draft refused by the database in plain words", async () => {
    userRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Past days are corrected, not drafted" },
    });
    const response = await POST(
      new NextRequest("http://localhost/api/schedule/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "upsertShift",
          orgId,
          employeeId,
          date: "2026-10-27",
          input: { kind: "absence", segments: [], absenceTypeId: 7 },
        }),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "PAST_DAY" });
  });
});

describe("POST /api/schedule/manage fetchCorrections", () => {
  function payload(overrides: Record<string, unknown>) {
    return {
      state_kind: "worked",
      shift_ids: [80],
      job_ids: [43],
      is_mentored_flags: [false],
      focus_area_id: 51,
      absence_type_id: null,
      custom_start_time: null,
      custom_end_time: null,
      series_id: null,
      from_recurring: false,
      ...overrides,
    };
  }

  it("gives each day its latest correction, Before from the first and After from the latest", async () => {
    const rows = [
      {
        id: "c1",
        emp_id: employeeId,
        date: "2026-10-27",
        reason: "Wrong shift recorded",
        corrected_by: "user-a",
        corrected_at: "2026-10-28T10:00:00Z",
        before: payload({}),
        after: payload({ shift_ids: [83], job_ids: [44] }),
      },
      {
        id: "c2",
        emp_id: employeeId,
        date: "2026-10-27",
        reason: null,
        corrected_by: "user-b",
        corrected_at: "2026-10-29T10:00:00Z",
        before: payload({ shift_ids: [83], job_ids: [44] }),
        after: payload({ shift_ids: [83], job_ids: [44], is_mentored_flags: [true] }),
      },
      {
        id: "c3",
        emp_id: employeeId,
        date: "2026-10-26",
        reason: "Called off",
        corrected_by: "user-a",
        corrected_at: "2026-10-28T11:00:00Z",
        before: null,
        after: payload({ state_kind: "deleted", shift_ids: [], job_ids: [] }),
      },
    ];
    const query = {
      select: () => query,
      eq: () => query,
      gte: () => query,
      lte: () => query,
      order: () => query,
      range: async () => ({ data: rows, error: null }),
    };
    requireOrgPermissions.mockResolvedValue({
      serviceClient: { from: () => query },
      orgId,
      permissions: { canEditShifts: true },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/schedule/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "fetchCorrections",
          orgId,
          startDate: "2026-10-25",
          endDate: "2026-10-31",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const { corrections } = await response.json();
    expect(corrections).toHaveLength(2);
    const twice = corrections.find((row: { date: string }) => row.date === "2026-10-27");
    expect(twice).toMatchObject({
      reason: null,
      correctedBy: "user-b",
      before: { kind: "worked", segments: [{ shiftId: 80, jobId: 43, isMentored: false }] },
      after: { kind: "worked", segments: [{ shiftId: 83, jobId: 44, isMentored: true }] },
    });
    const cleared = corrections.find((row: { date: string }) => row.date === "2026-10-26");
    expect(cleared).toMatchObject({ before: null, after: null });
  });
});
