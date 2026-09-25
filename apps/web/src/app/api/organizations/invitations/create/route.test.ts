import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const requireAuthenticatedUser = vi.fn();
const getServiceClient = vi.fn();
const canManageEmployees = vi.fn();
const isOrgSuperAdminOrGridmaster = vi.fn();
const dispatchNotificationEvent = vi.fn();
const checkRateLimit = vi.fn();
const sendPendingInvitationEmail = vi.fn();
const getInvitationEmailConfig = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));
vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: (...args: unknown[]) => canManageEmployees(...args),
  isOrgSuperAdminOrGridmaster: (...args: unknown[]) => isOrgSuperAdminOrGridmaster(...args),
  // The route now asks the shared ceiling helper, which defers to the tier
  // check these cases already drive.
  canAssignOrgRole: (client: unknown, actorId: unknown, orgId: unknown, role: unknown) =>
    role !== "super_admin"
      ? Promise.resolve(true)
      : Promise.resolve(isOrgSuperAdminOrGridmaster(client, actorId, orgId)),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/features/mobile/server/invitation-email", () => ({
  getInvitationEmailConfig: () => getInvitationEmailConfig(),
  createInvitationEmailUnavailableResponse: () =>
    NextResponse.json({ error: "Email service not configured" }, { status: 503 }),
}));
vi.mock("@/features/organization/server/invitation-delivery", () => ({
  sendPendingInvitationEmail: (...args: unknown[]) => sendPendingInvitationEmail(...args),
  isEmailNotConfigured: (error: unknown) =>
    error instanceof Error && error.message.startsWith("Email service not configured"),
}));
vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));
vi.mock("@/lib/staff-validation", () => ({
  getStaffFieldErrors: () => ({}),
  buildStaffValidationErrorResponse: () => NextResponse.json({ error: "invalid" }, { status: 422 }),
}));
vi.mock("@dubgrid/contracts", () => ({
  normalizeRequiredStaffEmail: (v: string) => v,
  normalizeStaffName: (v: string) => v,
  normalizeOptionalUsPhone: (v: string) => v,
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/organizations/invitations/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  forbidIfSandboxCookie.mockReturnValue(null);
  requireAuthenticatedUser.mockResolvedValue({ user: { id: "actor-1" } });
  canManageEmployees.mockResolvedValue(true);
  isOrgSuperAdminOrGridmaster.mockResolvedValue(false);
  checkRateLimit.mockResolvedValue({ limited: false });
  getInvitationEmailConfig.mockReturnValue({ apiKey: "re_test", from: "DubGrid <t@test>" });
  sendPendingInvitationEmail.mockResolvedValue(undefined);
});

describe("POST /api/organizations/invitations/create", () => {
  it("blocks invitation creation while in sandbox mode and never hits the RPC", async () => {
    forbidIfSandboxCookie.mockReturnValue(NextResponse.json({ error: "sandbox" }, { status: 403 }));

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "admin" }));

    expect(res.status).toBe(403);
    // Hard 403 before auth/service-client: no invitation is ever created.
    expect(requireAuthenticatedUser).not.toHaveBeenCalled();
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it("answers a throttled caller with the seconds left in the window", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, reset: Date.now() + 30_000 });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "user" }));

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(30);
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it("creates the invitation when not in sandbox mode", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        invitation_id: "inv-1",
        token: "tok-1",
        expires_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    }));
    getServiceClient.mockReturnValue({ rpc });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "admin" }));

    expect(res.status).toBe(200);
    // The token is emailed, never returned: the browser has no use for it.
    await expect(res.json()).resolves.toEqual({
      invitationId: "inv-1",
      expiresAt: "2026-01-01T00:00:00Z",
    });
    expect(sendPendingInvitationEmail).toHaveBeenCalledWith({
      orgId: ORG_ID,
      token: "tok-1",
      email: "new@test.com",
    });
    expect(rpc).toHaveBeenCalledWith(
      "send_invitation",
      expect.objectContaining({ p_org_id: ORG_ID }),
    );
    // The service client has no auth.uid(), so the inviter has to be stated
    // from the session or the invitation is created with none and cannot be
    // accepted at the super_admin tier.
    expect(rpc).toHaveBeenCalledWith(
      "send_invitation",
      expect.objectContaining({ p_invited_by: "actor-1" }),
    );
  });

  it("rejects super_admin role when caller is not super_admin/gridmaster", async () => {
    const rpc = vi.fn();
    const auditInsert = vi.fn(async () => ({ error: null }));
    getServiceClient.mockReturnValue({ rpc, from: () => ({ insert: auditInsert }) });
    isOrgSuperAdminOrGridmaster.mockResolvedValue(false);

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "super_admin" }),
    );

    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    // No invitation row exists to hang the refusal on, so it is recorded
    // against the organization with the address that was attempted.
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invitation.access_denied",
        resource_id: ORG_ID,
        details: expect.objectContaining({
          email: "new@test.com",
          requestedRole: "super_admin",
          outcome: "rejected",
          reason: "policy_denied",
          path: "create",
        }),
      }),
    );
  });

  it("allows super_admin role when caller is super_admin or gridmaster", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        invitation_id: "inv-2",
        token: "tok-2",
        expires_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    }));
    getServiceClient.mockReturnValue({ rpc });
    isOrgSuperAdminOrGridmaster.mockResolvedValue(true);

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "super_admin" }),
    );

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "send_invitation",
      expect.objectContaining({ p_role: "super_admin", p_org_id: ORG_ID }),
    );
  });

  // A pending row granting exactly what the "admin" requests below ask for.
  const SAME_ACCESS_AS_ADMIN = { role_to_assign: "admin", department_ids: [], dept_admin_ids: [] };

  // Chainable stub for the refreshPendingInvitation update: .update().eq().ilike()
  // .is().is().gte().select().maybeSingle()
  function makeRefreshChain(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    for (const method of ["update", "delete", "eq", "ilike", "is", "gte", "select"]) {
      chain[method] = () => chain;
    }
    chain.maybeSingle = async () => result;
    return chain;
  }

  it("audits the creation with the acting user, the invitee and the tier", async () => {
    const rpc = vi.fn(async () => ({
      data: { invitation_id: "inv-9", token: "tok-9", expires_at: "2026-01-01T00:00:00Z" },
      error: null,
    }));
    const auditInsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) =>
      table === "audit_log"
        ? { insert: auditInsert }
        : makeRefreshChain({ data: null, error: null }),
    );
    getServiceClient.mockReturnValue({ rpc, from });

    const res = await (
      await importRoute()
    ).POST(makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "admin" }));

    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("audit_log");
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: "actor-1",
        action: "invitation.created",
        resource_type: "invitation",
        resource_id: "inv-9",
        details: expect.objectContaining({ email: "new@test.com", role: "admin" }),
      }),
    );
  });

  it("still returns the invitation when the audit write fails", async () => {
    const rpc = vi.fn(async () => ({
      data: { invitation_id: "inv-10", token: "tok-10", expires_at: "2026-01-01T00:00:00Z" },
      error: null,
    }));
    const from = vi.fn((table: string) => {
      if (table === "audit_log") throw new Error("audit unavailable");
      return makeRefreshChain({ data: null, error: null });
    });
    getServiceClient.mockReturnValue({ rpc, from });

    const res = await (
      await importRoute()
    ).POST(makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "admin" }));

    // The invitation exists by now, so losing its record must not turn a
    // successful create into a 500 the caller would retry.
    expect(res.status).toBe(200);
  });

  it("refreshes an orphaned pending invite (from a failed first send) instead of 409", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "An active invitation already exists for this email" },
    }));
    const auditInsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) =>
      table === "audit_log"
        ? { insert: auditInsert }
        : makeRefreshChain({
            data: {
              id: "inv-orphan",
              token: "fresh-tok",
              expires_at: "2026-02-02T00:00:00Z",
              ...SAME_ACCESS_AS_ADMIN,
            },
            error: null,
          }),
    );
    getServiceClient.mockReturnValue({ rpc, from });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "orphan@test.com", role: "admin" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      invitationId: "inv-orphan",
      expiresAt: "2026-02-02T00:00:00Z",
      resent: true,
    });
    expect(sendPendingInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ token: "fresh-tok", email: "orphan@test.com" }),
    );
    expect(from).toHaveBeenCalledWith("invitations");
    // Rotating the token and sending it again is a re-invite, so it is logged.
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invitation.resent",
        resource_id: "inv-orphan",
        actor_id: "actor-1",
        details: expect.objectContaining({
          email: "orphan@test.com",
          reason: "refreshed_orphaned_pending",
        }),
      }),
    );
  });

  // Inviting someone as an Admin must not re-send a pending Super Admin link
  // and report success (F-30): only an invitation granting the same access is
  // refreshed.
  it("refuses to refresh a pending invitation that grants different access", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "An active invitation already exists for this email" },
    }));
    const updates: unknown[] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ["delete", "eq", "ilike", "is", "gte", "select"]) {
      chain[method] = () => chain;
    }
    chain.update = (values: unknown) => (updates.push(values), chain);
    chain.maybeSingle = async () => ({
      data: {
        id: "inv-owner",
        token: "owner-tok",
        expires_at: "2026-02-02T00:00:00Z",
        role_to_assign: "super_admin",
        department_ids: [],
        dept_admin_ids: [],
      },
      error: null,
    });
    getServiceClient.mockReturnValue({ rpc, from: vi.fn(() => chain) });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "owner@test.com", role: "admin" }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: expect.stringContaining("different access"),
    });
    expect(updates).toEqual([]);
    expect(sendPendingInvitationEmail).not.toHaveBeenCalled();
  });

  it("still 409s when the guard fires but no pending row can be refreshed", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "An active invitation already exists for this email" },
    }));
    const from = vi.fn(() => makeRefreshChain({ data: null, error: null }));
    getServiceClient.mockReturnValue({ rpc, from });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "gone@test.com", role: "admin" }));

    expect(res.status).toBe(409);
  });

  // Tracks whether the update chain was scoped to a specific employee_id (or
  // explicitly "no employee"), and only "finds" a row when that scope
  // matches — models the real partial-unique-index behavior where a pending
  // row belongs to exactly one employee_id (or none).
  function makeEmployeeScopedRefreshChain(
    rowsByEmployeeKey: Record<string, { id: string; token: string; expires_at: string }>,
  ) {
    let scopeKey: string | null = null;
    let byId: string | null = null;
    const chain: Record<string, unknown> = {
      update: () => chain,
      ilike: () => chain,
      gte: () => chain,
      select: () => chain,
      eq: (column: string, value: unknown) => {
        if (column === "employee_id") scopeKey = String(value);
        // The rotation after the read targets the row it found by id.
        if (column === "id") byId = String(value);
        return chain;
      },
      is: (column: string, value: unknown) => {
        if (column === "employee_id" && value === null) scopeKey = "null";
        return chain;
      },
    };
    chain.maybeSingle = async () => ({
      data: byId
        ? (Object.values(rowsByEmployeeKey).find((row) => row.id === byId) ?? null)
        : scopeKey !== null
          ? (rowsByEmployeeKey[scopeKey] ?? null)
          : null,
      error: null,
    });
    return chain;
  }

  it("does not hijack a different employee's pending invitation for the same email", async () => {
    const EMPLOYEE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const EMPLOYEE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "An active invitation already exists for this email" },
    }));
    // A live pending row exists for employee A only.
    const from = vi.fn(() =>
      makeEmployeeScopedRefreshChain({
        [EMPLOYEE_A]: {
          id: "inv-a",
          token: "fresh-tok",
          expires_at: "2026-02-02T00:00:00Z",
          ...SAME_ACCESS_AS_ADMIN,
        },
      }),
    );
    getServiceClient.mockReturnValue({ rpc, from });

    const { POST } = await importRoute();
    // Inviting employee B with the SAME email must NOT silently refresh and
    // return employee A's invitation — it must fail with the normal
    // already-pending error instead.
    const res = await POST(
      makeRequest({
        orgId: ORG_ID,
        email: "shared@test.com",
        role: "admin",
        employeeId: EMPLOYEE_B,
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already been sent/i);
  });

  it("refreshes correctly when the same employee retries after a failed send", async () => {
    const EMPLOYEE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "An active invitation already exists for this email" },
    }));
    const from = vi.fn(() =>
      makeEmployeeScopedRefreshChain({
        [EMPLOYEE_A]: {
          id: "inv-a",
          token: "fresh-tok",
          expires_at: "2026-02-02T00:00:00Z",
          ...SAME_ACCESS_AS_ADMIN,
        },
      }),
    );
    getServiceClient.mockReturnValue({ rpc, from });

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        orgId: ORG_ID,
        email: "shared@test.com",
        role: "admin",
        employeeId: EMPLOYEE_A,
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      invitationId: "inv-a",
      expiresAt: "2026-02-02T00:00:00Z",
      resent: true,
    });
  });

  it("does not refresh a management-only pending invite when the new request is employee-linked", async () => {
    const EMPLOYEE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "An active invitation already exists for this email" },
    }));
    // A live pending row exists with no employee_id (a management-only invite).
    const from = vi.fn(() =>
      makeEmployeeScopedRefreshChain({
        null: { id: "inv-mgmt", token: "fresh-tok", expires_at: "2026-02-02T00:00:00Z" },
      }),
    );
    getServiceClient.mockReturnValue({ rpc, from });

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        orgId: ORG_ID,
        email: "shared@test.com",
        role: "admin",
        employeeId: EMPLOYEE_B,
      }),
    );

    expect(res.status).toBe(409);
  });

  it("maps a genuine already-a-member RPC error to 409 without refreshing", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "User is already a member of this organization" },
    }));
    const from = vi.fn();
    getServiceClient.mockReturnValue({ rpc, from });

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, email: "member@test.com", role: "admin" }));

    expect(res.status).toBe(409);
    expect(from).not.toHaveBeenCalled();
  });

  describe("the invitation and its email are one operation", () => {
    function createdRpc() {
      return vi.fn(async () => ({
        data: { invitation_id: "inv-1", token: "tok-1", expires_at: "2026-01-01T00:00:00Z" },
        error: null,
      }));
    }

    it("removes a new invitation whose email cannot be sent", async () => {
      const deleteEq = vi.fn();
      const auditInsert = vi.fn(async () => ({ error: null }));
      const from = vi.fn((table: string) => {
        if (table === "audit_log") return { insert: auditInsert };
        const chain = {
          delete: () => chain,
          eq: (...args: unknown[]) => {
            deleteEq(...args);
            return chain;
          },
          is: async () => ({ error: null }),
        };
        return chain;
      });
      getServiceClient.mockReturnValue({ rpc: createdRpc(), from });
      sendPendingInvitationEmail.mockRejectedValue(new Error("Resend email failed (500)"));

      const { POST } = await importRoute();
      const res = await POST(makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "user" }));

      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toEqual({
        error: expect.stringMatching(/wasn't created/),
      });
      expect(deleteEq).toHaveBeenCalledWith("id", "inv-1");
      expect(deleteEq).toHaveBeenCalledWith("token", "tok-1");
      expect(auditInsert).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: "invitation.created" }),
      );
    });

    it("restores a refreshed invitation's previous link when its email fails", async () => {
      const rpc = vi.fn(async () => ({
        data: null,
        error: { message: "An active invitation already exists for this email" },
      }));
      const updates: unknown[] = [];
      let reads = 0;
      const from = vi.fn(() => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          ilike: () => chain,
          gte: () => chain,
          is: () => chain,
          eq: () => chain,
          update: (values: unknown) => {
            updates.push(values);
            return chain;
          },
          maybeSingle: async () =>
            reads++ === 0
              ? {
                  data: {
                    id: "inv-7",
                    token: "old-tok",
                    expires_at: "2026-01-01T00:00:00Z",
                    role_to_assign: "user",
                    department_ids: [],
                    dept_admin_ids: [],
                  },
                  error: null,
                }
              : {
                  data: { id: "inv-7", token: "new-tok", expires_at: "2026-02-01T00:00:00Z" },
                  error: null,
                },
        };
        chain.then = undefined;
        return chain;
      });
      getServiceClient.mockReturnValue({ rpc, from });
      sendPendingInvitationEmail.mockRejectedValue(new Error("Resend email failed (500)"));

      const { POST } = await importRoute();
      const res = await POST(makeRequest({ orgId: ORG_ID, email: "again@test.com", role: "user" }));

      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toEqual({
        error: expect.stringMatching(/existing invitation is unchanged/),
      });
      expect(updates.at(-1)).toEqual({ token: "old-tok", expires_at: "2026-01-01T00:00:00Z" });
    });

    it("creates nothing when there is no email service", async () => {
      const rpc = createdRpc();
      getServiceClient.mockReturnValue({ rpc });
      getInvitationEmailConfig.mockReturnValue(null);

      const { POST } = await importRoute();
      const res = await POST(makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "user" }));

      expect(res.status).toBe(503);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("limits invitations to one inbox, as the separate email route did", async () => {
      const rpc = createdRpc();
      getServiceClient.mockReturnValue({ rpc });
      checkRateLimit.mockImplementation(async (_limiter: unknown, key: string) =>
        key.startsWith("invite-email:")
          ? { limited: true, reset: Date.now() + 60_000 }
          : { limited: false },
      );

      const { POST } = await importRoute();
      const res = await POST(makeRequest({ orgId: ORG_ID, email: "new@test.com", role: "user" }));

      expect(res.status).toBe(429);
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
