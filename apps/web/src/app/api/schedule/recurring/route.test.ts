import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";

const validateCsrfOrigin = vi.fn();
const requireOrgPermissions = vi.fn();
const requireAuthenticatedUser = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
  resolveEffectiveOrgId: (_req: unknown, _userId: string, orgId: string) => Promise.resolve(orgId),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (...args: unknown[]) => requireAuthenticatedUser(...args),
}));

vi.mock("@/app/api/shared/schedule", () => ({
  fetchAssignmentIdByPairMap: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/schedule/recurring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({ user: { id: ACTOR_ID, email: null } });
  });

  it("rejects CSRF failures before parsing or auth", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const request = new NextRequest("http://localhost/api/schedule/recurring", {
      method: "POST",
      body: "{",
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  // Draft cells are objects. The schema behind them crosses a package boundary,
  // and zod's `record(key, value)` overload check is `instanceof`, so a second
  // copy of zod on disk once made this whole record decay to
  // `Record<string, string>` and rejected every real draft as invalid input.
  it("stores a recurring draft whose cells are schedule-cell objects", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const draftSession = {
      select: () => draftSession,
      eq: () => draftSession,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert,
    };
    requireOrgPermissions.mockResolvedValue({
      actor: { id: ACTOR_ID, email: null },
      serviceClient: { from: () => draftSession },
    });

    const workedCell = {
      kind: "worked",
      segments: [{ shiftId: 4, jobId: 9, position: 0, isMentored: false }],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: true,
    };
    const draftData = { [EMPLOYEE_ID]: { "0": workedCell, "1": null } };

    const request = new NextRequest("http://localhost/api/schedule/recurring", {
      method: "POST",
      body: JSON.stringify({ action: "saveRecurringDraft", orgId: ORG_ID, draftData }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: ORG_ID, saved_by: ACTOR_ID, draft_data: draftData }),
    );
  });

  it.each([
    {
      action: "upsertRecurringShift",
      employeeId: EMPLOYEE_ID,
      dayOfWeek: 1,
      effectiveFrom: "2026-09-21",
    },
    {
      action: "saveRecurringShifts",
      effectiveFrom: "2026-09-21",
    },
  ])("refuses an absence on a recurring shift ($action) before writing (item 45)", async (body) => {
    const rpc = vi.fn();
    requireOrgPermissions.mockResolvedValue({
      actor: { id: ACTOR_ID, email: null },
      userClient: { rpc },
    });
    const input = {
      kind: "worked",
      segments: [{ shiftId: 4, jobId: 9, position: 0 }],
      absenceTypeId: 7,
    };
    const payload =
      body.action === "saveRecurringShifts"
        ? { ...body, orgId: ORG_ID, changes: [{ employeeId: EMPLOYEE_ID, dayOfWeek: 1, input }] }
        : { ...body, orgId: ORG_ID, input };

    const response = await POST(
      new NextRequest("http://localhost/api/schedule/recurring", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/absence beside it/),
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  describe("shift preferences", () => {
    type Result = { data: unknown; error: null };
    // A chainable query that answers with what each table is given.
    function client(tables: Record<string, Result>) {
      const calls: { table: string; method: string; args: unknown[] }[] = [];
      const from = (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "in", "delete"]) {
          chain[method] = (...args: unknown[]) => {
            calls.push({ table, method, args });
            return chain;
          };
        }
        chain.maybeSingle = () => Promise.resolve(tables[table]);
        chain.upsert = (...args: unknown[]) => {
          calls.push({ table, method: "upsert", args });
          return Promise.resolve({ error: null });
        };
        chain.insert = () => ({ then: () => undefined });
        chain.then = (resolve: (value: Result) => unknown) =>
          Promise.resolve(tables[table] ?? { data: null, error: null }).then(resolve);
        return chain;
      };
      return { calls, from };
    }
    const post = (body: Record<string, unknown>) =>
      POST(
        new NextRequest("http://localhost/api/schedule/recurring", {
          method: "POST",
          body: JSON.stringify({ orgId: ORG_ID, ...body }),
        }),
      );

    it("reads the organization's preferences", async () => {
      const db = client({
        employee_shift_preferences: {
          data: [{ employee_id: EMPLOYEE_ID, mode: "only", shift_ids: ["80", "82"] }],
          error: null,
        },
      });
      requireOrgPermissions.mockResolvedValue({
        actor: { id: ACTOR_ID, email: null },
        serviceClient: db,
      });

      const response = await post({ action: "fetchShiftPreferences" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        preferences: [{ employeeId: EMPLOYEE_ID, mode: "only", shiftIds: [80, 82] }],
      });
      expect(db.calls).toContainEqual({
        table: "employee_shift_preferences",
        method: "eq",
        args: ["org_id", ORG_ID],
      });
    });

    it("saves a preference for the organization's own person and shifts", async () => {
      const db = client({
        employees: { data: { id: EMPLOYEE_ID }, error: null },
        shift_categories: { data: [{ id: 80 }, { id: 82 }], error: null },
      });
      requireOrgPermissions.mockResolvedValue({
        actor: { id: ACTOR_ID, email: null },
        serviceClient: db,
      });

      const response = await post({
        action: "saveShiftPreference",
        employeeId: EMPLOYEE_ID,
        preference: { mode: "prefers", shiftIds: [80, 82, 80] },
      });

      expect(response.status).toBe(200);
      expect(db.calls).toContainEqual({
        table: "employees",
        method: "eq",
        args: ["org_id", ORG_ID],
      });
      expect(db.calls).toContainEqual({
        table: "employee_shift_preferences",
        method: "upsert",
        args: [
          expect.objectContaining({
            employee_id: EMPLOYEE_ID,
            org_id: ORG_ID,
            mode: "prefers",
            shift_ids: [80, 82],
            updated_by: ACTOR_ID,
          }),
          { onConflict: "employee_id" },
        ],
      });
      // Only someone who manages recurring shifts may save.
      const allowed = requireOrgPermissions.mock.calls[0][2] as (
        p: Record<string, boolean>,
      ) => boolean;
      expect(allowed({ canViewRecurringShifts: true })).toBeFalsy();
      expect(allowed({ canManageRecurringShifts: true })).toBeTruthy();
    });

    it("refuses a person or a shift from another organization", async () => {
      requireOrgPermissions.mockResolvedValue({
        actor: { id: ACTOR_ID, email: null },
        serviceClient: client({ employees: { data: null, error: null } }),
      });
      const foreignPerson = await post({
        action: "saveShiftPreference",
        employeeId: EMPLOYEE_ID,
        preference: { mode: "only", shiftIds: [80] },
      });
      expect(foreignPerson.status).toBe(400);

      const db = client({
        employees: { data: { id: EMPLOYEE_ID }, error: null },
        shift_categories: { data: [{ id: 80 }], error: null },
      });
      requireOrgPermissions.mockResolvedValue({
        actor: { id: ACTOR_ID, email: null },
        serviceClient: db,
      });
      const foreignShift = await post({
        action: "saveShiftPreference",
        employeeId: EMPLOYEE_ID,
        preference: { mode: "only", shiftIds: [80, 999] },
      });
      expect(foreignShift.status).toBe(400);
      expect(db.calls.some((call) => call.method === "upsert")).toBe(false);
    });

    it("reads and saves a job preference against the organization's jobs", async () => {
      const read = client({
        employee_job_preferences: {
          data: [{ employee_id: EMPLOYEE_ID, mode: "only", job_ids: ["43"] }],
          error: null,
        },
      });
      requireOrgPermissions.mockResolvedValue({
        actor: { id: ACTOR_ID, email: null },
        serviceClient: read,
      });
      const fetched = await post({ action: "fetchJobPreferences" });
      expect(await fetched.json()).toEqual({
        preferences: [{ employeeId: EMPLOYEE_ID, mode: "only", jobIds: [43] }],
      });

      const db = client({
        employees: { data: { id: EMPLOYEE_ID }, error: null },
        jobs: { data: [{ id: 43 }], error: null },
      });
      requireOrgPermissions.mockResolvedValue({
        actor: { id: ACTOR_ID, email: null },
        serviceClient: db,
      });
      const saved = await post({
        action: "saveJobPreference",
        employeeId: EMPLOYEE_ID,
        preference: { mode: "only", jobIds: [43, 43] },
      });
      expect(saved.status).toBe(200);
      expect(db.calls).toContainEqual({ table: "jobs", method: "eq", args: ["org_id", ORG_ID] });
      expect(db.calls).toContainEqual({
        table: "employee_job_preferences",
        method: "upsert",
        args: [
          expect.objectContaining({ employee_id: EMPLOYEE_ID, mode: "only", job_ids: [43] }),
          { onConflict: "employee_id" },
        ],
      });

      const foreign = client({
        employees: { data: { id: EMPLOYEE_ID }, error: null },
        jobs: { data: [], error: null },
      });
      requireOrgPermissions.mockResolvedValue({
        actor: { id: ACTOR_ID, email: null },
        serviceClient: foreign,
      });
      const refused = await post({
        action: "saveJobPreference",
        employeeId: EMPLOYEE_ID,
        preference: { mode: "prefers", jobIds: [999] },
      });
      expect(refused.status).toBe(400);
      expect(foreign.calls.some((call) => call.method === "upsert")).toBe(false);
    });

    it("clears a preference", async () => {
      const db = client({ employees: { data: { id: EMPLOYEE_ID }, error: null } });
      requireOrgPermissions.mockResolvedValue({
        actor: { id: ACTOR_ID, email: null },
        serviceClient: db,
      });

      const response = await post({
        action: "saveShiftPreference",
        employeeId: EMPLOYEE_ID,
        preference: null,
      });

      expect(response.status).toBe(200);
      expect(db.calls).toContainEqual({
        table: "employee_shift_preferences",
        method: "delete",
        args: [],
      });
      expect(db.calls).toContainEqual({
        table: "employee_shift_preferences",
        method: "eq",
        args: ["employee_id", EMPLOYEE_ID],
      });
    });
  });
});
