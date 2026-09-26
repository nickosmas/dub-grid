import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ERRORS } from "@dubgrid/client-errors";

const validateCsrfOrigin = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const requireAuthenticatedUser = vi.fn();
const checkRateLimit = vi.fn();
const requireOrgPermissions = vi.fn();
const canAssignOrgRole = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const dispatchNotificationEvent = vi.fn();
const buildInvitationChanges = vi.fn();
const invitationSelectMaybeSingle = vi.fn();
const invitationUpdateMaybeSingle = vi.fn();
const invitationListOrder = vi.fn();
const invitationUpdateOperations: Array<{
  values: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}> = [];
const organizationMaybeSingle = vi.fn();
const serviceRpc = vi.fn();
const auditInsert = vi.fn();
const getInvitationEmailConfig = vi.fn();
const sendInvitationEmail = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const isGridmasterActor = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  emailTargetLimiter: {},
  hashEmail: (email: string) => email,
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));
vi.mock("@/app/api/employees/shared", () => ({
  canAssignOrgRole: (...args: unknown[]) => canAssignOrgRole(...args),
  isGridmasterActor: (...args: unknown[]) => isGridmasterActor(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/access-management", () => ({
  buildInvitationChanges: (...args: unknown[]) => buildInvitationChanges(...args),
  buildInvitationRevocationChanges: vi.fn(() => []),
}));
vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));
vi.mock("@/features/mobile/server/invitation-email", () => ({
  getInvitationEmailConfig,
  sendInvitationEmail,
}));
vi.mock("@/lib/staff-validation", () => ({
  getStaffFieldErrors: () => ({}),
  buildStaffValidationErrorResponse: () => new Response(null, { status: 422 }),
}));
// Identity mapper so tests control the returned invitation shape directly via
// the mocked row, instead of round-tripping the real column mapping.
vi.mock("@/lib/db/mappers", () => ({
  rowToInvitation: (row: Record<string, unknown>) => ({
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    roleToAssign: row.role_to_assign,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at ?? null,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    employeeId: row.employee_id ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    phone: row.phone ?? null,
    departmentIds: row.department_ids ?? [],
    deptAdminIds: row.dept_admin_ids ?? [],
  }),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: (...args: unknown[]) => serviceRpc(...args),
    from: (table: string) => {
      if (table === "audit_log") {
        return { insert: (...args: unknown[]) => auditInsert(...args) };
      }
      if (table === "organizations") {
        const organizationChain: Record<string, unknown> = {
          select: () => organizationChain,
          eq: () => organizationChain,
          maybeSingle: () => organizationMaybeSingle(),
        };
        return organizationChain;
      }
      // invitations table: fetchInvitation's select().eq().eq().maybeSingle()
      // vs. the PATCH update().eq().eq().eq().select().maybeSingle() chain.
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => invitationSelectMaybeSingle(),
        // GET's list: select().eq().order()
        order: () => invitationListOrder(),
        update: (values: Record<string, unknown>) => {
          const operation = { values, filters: [] as Array<[string, unknown]> };
          invitationUpdateOperations.push(operation);
          const updateChain: Record<string, unknown> = {
            eq: (column: string, value: unknown) => {
              operation.filters.push([column, value]);
              return updateChain;
            },
            is: () => updateChain,
            select: () => updateChain,
            maybeSingle: () => invitationUpdateMaybeSingle(),
          };
          return updateChain;
        },
      };
      return chain;
    },
  }),
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const INVITATION_ID = "22222222-2222-2222-2222-222222222222";
const EXPECTED_UPDATED_AT = "2026-01-01T00:00:00.000Z";

const CURRENT_INVITATION_ROW = {
  id: INVITATION_ID,
  org_id: ORG_ID,
  invited_by: null,
  email: "old@test.com",
  role_to_assign: "user",
  token: "original-token",
  expires_at: "2026-02-01T00:00:00.000Z",
  accepted_at: null,
  revoked_at: null,
  created_at: "2025-12-01T00:00:00.000Z",
  updated_at: EXPECTED_UPDATED_AT,
  employee_id: null,
  first_name: null,
  last_name: null,
  phone: null,
  department_ids: [],
  dept_admin_ids: [],
};

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/organizations/invitations", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/organizations/invitations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  invitationUpdateOperations.length = 0;
  validateCsrfOrigin.mockReturnValue(null);
  forbidIfSandboxCookie.mockReturnValue(null);
  requireAuthenticatedUser.mockResolvedValue({ user: { id: "actor-1", email: "actor@test.com" } });
  checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
  requireOrgPermissions.mockResolvedValue({ ok: true });
  canAssignOrgRole.mockResolvedValue(true);
  buildInvitationChanges.mockReturnValue([
    { key: "email", label: "Email", previousValue: "old@test.com", nextValue: "new@test.com" },
  ]);
  invitationSelectMaybeSingle.mockResolvedValue({ data: CURRENT_INVITATION_ROW, error: null });
  organizationMaybeSingle.mockResolvedValue({
    data: { name: "Calm Haven", timezone: "America/Los_Angeles" },
    error: null,
  });
  getInvitationEmailConfig.mockReturnValue({ apiKey: "key", from: "DubGrid <a@b.c>" });
  sendInvitationEmail.mockResolvedValue(undefined);
  auditInsert.mockResolvedValue({ error: null });
  isGridmasterActor.mockResolvedValue(false);
  requireSensitiveActionAuth.mockResolvedValue({ user: { id: "actor-1" } });
});

describe("POST /api/organizations/invitations", () => {
  const pendingInvitation = {
    ...CURRENT_INVITATION_ROW,
    expires_at: "2099-02-01T00:00:00.000Z",
  };
  const rotatedInvitation = {
    ...pendingInvitation,
    role_to_assign: "admin",
    token: "rotated-token",
    updated_at: "2026-01-01T00:00:01.000Z",
  };

  it("rotates the invitation in place and sends its new token", async () => {
    invitationSelectMaybeSingle
      .mockResolvedValueOnce({ data: pendingInvitation, error: null })
      .mockResolvedValueOnce({ data: rotatedInvitation, error: null });
    serviceRpc.mockResolvedValue({
      data: {
        invitation_id: INVITATION_ID,
        token: "rotated-token",
        expires_at: "2099-02-01T00:00:00.000Z",
        previous_token: "original-token",
        previous_expires_at: "2099-01-01T00:00:00.000Z",
      },
      error: null,
    });

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "replace_access",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        roleToAssign: "admin",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(serviceRpc).toHaveBeenCalledWith("replace_pending_invitation_access", {
      p_org_id: ORG_ID,
      p_invitation_id: INVITATION_ID,
      p_expected_updated_at: EXPECTED_UPDATED_AT,
      p_role: "admin",
      p_invited_by: "actor-1",
    });
    // The same invitation with a new link: the email says it replaces the
    // earlier one and states the deadline the rotation just stored.
    expect(sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "old@test.com",
        token: "rotated-token",
        orgName: "Calm Haven",
        expiresAt: "2099-02-01T00:00:00.000Z",
        timeZone: "America/Los_Angeles",
        kind: "reissue",
      }),
    );
    // One invitation, one identity: re-issuing does not mint a successor.
    expect(payload.invitation.id).toBe(INVITATION_ID);
    // Nothing was canceled, so super admins must not be told it was.
    expect(dispatchNotificationEvent).toHaveBeenCalledTimes(1);
    expect(dispatchNotificationEvent).toHaveBeenCalledWith(
      "actor-1",
      expect.objectContaining({ action: "invitation_resent", invitationId: INVITATION_ID }),
    );
  });

  it("restores the old invite when the replacement email cannot be sent", async () => {
    invitationSelectMaybeSingle
      .mockResolvedValueOnce({ data: pendingInvitation, error: null })
      .mockResolvedValueOnce({ data: rotatedInvitation, error: null });
    serviceRpc
      .mockResolvedValueOnce({
        data: {
          invitation_id: INVITATION_ID,
          token: "rotated-token",
          expires_at: "2099-02-01T00:00:00.000Z",
          previous_token: "original-token",
          previous_expires_at: "2099-01-01T00:00:00.000Z",
          previous_role: "user",
          previous_invited_by: "original-inviter",
          previous_department_ids: [3],
          previous_dept_admin_ids: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { restored: true }, error: null });
    sendInvitationEmail.mockRejectedValue(new Error("provider down"));

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "replace_access",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        roleToAssign: "admin",
      }),
    );

    expect(response.status).toBe(502);
    // Restoring means putting the previous link back on the same row, and only
    // while it still carries the token this rotation issued.
    expect(serviceRpc).toHaveBeenNthCalledWith(
      2,
      "rollback_pending_invitation_access_replacement",
      {
        p_org_id: ORG_ID,
        p_invitation_id: INVITATION_ID,
        p_rotated_token: "rotated-token",
        p_previous_token: "original-token",
        p_previous_expires_at: "2099-01-01T00:00:00.000Z",
        // The access goes back with the link: a surviving old link must not
        // carry the role the failed change asked for.
        p_previous_role: "user",
        p_previous_invited_by: "original-inviter",
        p_previous_department_ids: [3],
        p_previous_dept_admin_ids: [],
      },
    );
  });

  it("emails the new token when an unchanged invitation is resent", async () => {
    invitationSelectMaybeSingle.mockResolvedValue({ data: pendingInvitation, error: null });
    invitationUpdateMaybeSingle.mockResolvedValue({
      data: { ...pendingInvitation, token: "fresh-token" },
      error: null,
    });

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "resend",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      }),
    );

    expect(response.status).toBe(200);
    // The deadline the email states is the one the resend stored.
    const expiresAt = invitationUpdateOperations[0]?.values.expires_at;
    expect(expiresAt).toEqual(expect.any(String));
    expect(sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.any(String),
        email: "old@test.com",
        expiresAt,
        timeZone: "America/Los_Angeles",
        kind: "reissue",
      }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invitation.resent",
        resource_id: INVITATION_ID,
        actor_id: "actor-1",
      }),
    );
  });

  // A retry cannot succeed while the platform kill switch is off, so it must
  // read as unavailable, as create reports it, not as a failed send.
  it("reports the email kill switch as unavailable, not as a failed send", async () => {
    invitationSelectMaybeSingle.mockResolvedValue({ data: pendingInvitation, error: null });
    invitationUpdateMaybeSingle
      .mockResolvedValueOnce({
        data: {
          ...pendingInvitation,
          token: "fresh-token",
          updated_at: "2026-01-01T00:01:00.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: INVITATION_ID }, error: null });
    sendInvitationEmail.mockRejectedValue(
      new Error("Email service not configured: sending is disabled by a platform kill switch"),
    );

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "resend",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Email service not configured" });
  });

  it("restores the previous token and expiry when a resend email cannot be delivered", async () => {
    const refreshedAt = "2026-01-01T00:01:00.000Z";
    invitationSelectMaybeSingle.mockResolvedValue({ data: pendingInvitation, error: null });
    invitationUpdateMaybeSingle
      .mockResolvedValueOnce({
        data: { ...pendingInvitation, token: "fresh-token", updated_at: refreshedAt },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: INVITATION_ID }, error: null });
    sendInvitationEmail.mockRejectedValue(new Error("provider down"));

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "resend",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      }),
    );

    expect(response.status).toBe(502);
    expect(invitationUpdateOperations).toHaveLength(2);
    const rotatedToken = invitationUpdateOperations[0].values.token;
    expect(rotatedToken).toEqual(expect.any(String));
    expect(invitationUpdateOperations[1]).toEqual({
      values: {
        token: "original-token",
        expires_at: pendingInvitation.expires_at,
        revoked_at: null,
      },
      filters: expect.arrayContaining([
        ["org_id", ORG_ID],
        ["id", INVITATION_ID],
        ["updated_at", refreshedAt],
        ["token", rotatedToken],
      ]),
    });
    expect(dispatchNotificationEvent).not.toHaveBeenCalledWith(
      "actor-1",
      expect.objectContaining({ action: "invitation_resent" }),
    );
  });
});

describe("PATCH /api/organizations/invitations", () => {
  it("updates the invitation when the email is free", async () => {
    invitationUpdateMaybeSingle.mockResolvedValue({
      data: { ...CURRENT_INVITATION_ROW, email: "new@test.com" },
      error: null,
    });

    const { PATCH } = await importRoute();
    const res = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        email: "new@test.com",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitation.email).toBe("new@test.com");
  });

  it("rejects editing an already-revoked invitation instead of silently rewriting its fields", async () => {
    invitationSelectMaybeSingle.mockResolvedValue({
      data: { ...CURRENT_INVITATION_ROW, revoked_at: "2026-01-05T00:00:00.000Z" },
      error: null,
    });

    const { PATCH } = await importRoute();
    const res = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        email: "new@test.com",
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no longer pending/i);
    expect(invitationUpdateMaybeSingle).not.toHaveBeenCalled();
  });

  it("rejects editing an already-accepted invitation instead of silently rewriting its fields", async () => {
    invitationSelectMaybeSingle.mockResolvedValue({
      data: { ...CURRENT_INVITATION_ROW, accepted_at: "2026-01-05T00:00:00.000Z" },
      error: null,
    });

    const { PATCH } = await importRoute();
    const res = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        email: "new@test.com",
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no longer pending/i);
    expect(invitationUpdateMaybeSingle).not.toHaveBeenCalled();
  });

  it("maps a one_pending_invite_per_email unique violation to a friendly 409 instead of a generic 500", async () => {
    invitationUpdateMaybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "one_pending_invite_per_email"',
        details: "Key (org_id, email)=(...) already exists.",
      },
    });

    const { PATCH } = await importRoute();
    const res = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        email: "already-pending@test.com",
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already has a separate pending invitation/i);
  });

  it("falls through to a generic 500 for an unrelated database error", async () => {
    invitationUpdateMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });

    const { PATCH } = await importRoute();
    const res = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        email: "new@test.com",
      }),
    );

    expect(res.status).toBe(500);
  });
});

describe("GET /api/organizations/invitations", () => {
  // Runs the route's real predicate against a fixed permission context, so
  // the test proves who the list is open to rather than stubbing the answer.
  function allowFor(permissions: {
    isGridmaster: boolean;
    isSuperAdmin: boolean;
    canManageEmployees: boolean;
  }) {
    requireOrgPermissions.mockImplementation(
      async (_req: unknown, _orgId: unknown, isAllowed: (p: typeof permissions) => boolean) =>
        isAllowed(permissions)
          ? { ok: true }
          : { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) },
    );
  }

  function makeGetRequest() {
    return new NextRequest(`http://localhost/api/organizations/invitations?orgId=${ORG_ID}`);
  }

  it("lists invitations for an admin who can manage employees", async () => {
    resolveEffectiveOrgId.mockResolvedValue(ORG_ID);
    invitationListOrder.mockResolvedValue({ data: [CURRENT_INVITATION_ROW], error: null });
    allowFor({ isGridmaster: false, isSuperAdmin: false, canManageEmployees: true });

    const { GET } = await importRoute();
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitations).toHaveLength(1);
    expect(body.invitations[0].id).toBe(INVITATION_ID);
  });

  it("refuses a management member who cannot manage employees", async () => {
    resolveEffectiveOrgId.mockResolvedValue(ORG_ID);
    invitationListOrder.mockResolvedValue({ data: [CURRENT_INVITATION_ROW], error: null });
    allowFor({ isGridmaster: false, isSuperAdmin: false, canManageEmployees: false });

    const { GET } = await importRoute();
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/organizations/invitations - super_admin tier ceiling", () => {
  it("refuses an admin who cannot assign super_admin, leaving the row untouched", async () => {
    canAssignOrgRole.mockResolvedValue(false);

    const { PATCH } = await importRoute();
    const response = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        roleToAssign: "super_admin",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: API_ERRORS.CANNOT_ASSIGN_SUPER_ADMIN });
    expect(canAssignOrgRole).toHaveBeenCalledWith(
      expect.anything(),
      "actor-1",
      ORG_ID,
      "super_admin",
    );
    expect(invitationUpdateOperations).toHaveLength(0);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: "actor-1",
        action: "invitation.access_denied",
        resource_id: INVITATION_ID,
        details: expect.objectContaining({
          requestedRole: "super_admin",
          currentRole: "user",
          outcome: "rejected",
          reason: "policy_denied",
          path: "edit",
        }),
      }),
    );
  });

  it("lets a caller who may assign super_admin through", async () => {
    invitationUpdateMaybeSingle.mockResolvedValue({
      data: { ...CURRENT_INVITATION_ROW, role_to_assign: "super_admin" },
      error: null,
    });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        roleToAssign: "super_admin",
      }),
    );

    expect(response.status).toBe(200);
    expect(invitationUpdateOperations).toHaveLength(1);
    expect(invitationUpdateOperations[0]?.values.role_to_assign).toBe("super_admin");
  });

  it("checks a redirect against the invitation's current role", async () => {
    invitationUpdateMaybeSingle.mockResolvedValue({
      data: CURRENT_INVITATION_ROW,
      error: null,
    });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        email: "new@test.com",
      }),
    );

    expect(response.status).toBe(200);
    expect(canAssignOrgRole).toHaveBeenCalledWith(expect.anything(), "actor-1", ORG_ID, "user");
  });
});

describe("POST /api/organizations/invitations - replace_access tier ceiling", () => {
  const pendingInvitation = {
    ...CURRENT_INVITATION_ROW,
    expires_at: "2099-02-01T00:00:00.000Z",
  };

  it("refuses an admin raising a pending invitation to super_admin", async () => {
    invitationSelectMaybeSingle.mockResolvedValue({ data: pendingInvitation, error: null });
    canAssignOrgRole.mockResolvedValue(false);

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "replace_access",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        roleToAssign: "super_admin",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: API_ERRORS.CANNOT_ASSIGN_SUPER_ADMIN });
    // The RPC stamps invited_by with the caller, so refusing before it runs is
    // what keeps a lower tier from writing an inviter that outranks them.
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(sendInvitationEmail).not.toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invitation.access_denied",
        details: expect.objectContaining({ requestedRole: "super_admin", path: "replace_access" }),
      }),
    );
  });

  it("lets a caller who may assign super_admin replace access", async () => {
    invitationSelectMaybeSingle
      .mockResolvedValueOnce({ data: pendingInvitation, error: null })
      .mockResolvedValueOnce({
        data: { ...pendingInvitation, role_to_assign: "super_admin", token: "rotated-token" },
        error: null,
      });
    serviceRpc.mockResolvedValue({
      data: {
        invitation_id: INVITATION_ID,
        token: "rotated-token",
        expires_at: "2099-02-01T00:00:00.000Z",
        previous_token: "original-token",
        previous_expires_at: "2099-01-01T00:00:00.000Z",
      },
      error: null,
    });

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "replace_access",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        roleToAssign: "super_admin",
      }),
    );

    expect(response.status).toBe(200);
    expect(serviceRpc).toHaveBeenCalledWith(
      "replace_pending_invitation_access",
      expect.objectContaining({ p_role: "super_admin", p_invited_by: "actor-1" }),
    );
  });
});

describe("POST /api/organizations/invitations - resend and revocation", () => {
  it("does not revive a revoked invitation", async () => {
    const revoked = {
      ...CURRENT_INVITATION_ROW,
      revoked_at: "2026-01-02T00:00:00.000Z",
      expires_at: "2099-02-01T00:00:00.000Z",
    };
    invitationSelectMaybeSingle.mockResolvedValue({ data: revoked, error: null });
    invitationUpdateMaybeSingle.mockResolvedValue({
      data: { ...revoked, revoked_at: null, token: "fresh-token" },
      error: null,
    });

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "resend",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      }),
    );

    // Revocation has to be durable: a resend must not hand the invitee a
    // working link again.
    expect(response.status).toBe(409);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
    expect(invitationUpdateOperations).toHaveLength(0);
  });
});

describe("POST /api/organizations/invitations - throttling", () => {
  it("answers a throttled caller with 429 and a Retry-After in seconds", async () => {
    checkRateLimit.mockResolvedValue({
      limited: true,
      misconfigured: false,
      reset: Date.now() + 45_000,
    });

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "resend",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      }),
    );

    expect(response.status).toBe(429);
    const retryAfter = Number(response.headers.get("Retry-After"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(45);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("treats a limiter that cannot answer as unavailable, not throttled", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: true });

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "resend",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBeNull();
  });
});

describe("a Gridmaster's invitation changes (41d4, F-59)", () => {
  const staleSession = () => ({
    response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
  });
  const pendingInvitation = {
    ...CURRENT_INVITATION_ROW,
    expires_at: "2099-02-01T00:00:00.000Z",
  };

  it("changes no role on a stale session", async () => {
    isGridmasterActor.mockResolvedValue(true);
    requireSensitiveActionAuth.mockResolvedValue(staleSession());

    const { PATCH } = await importRoute();
    const response = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        roleToAssign: "super_admin",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "STEP_UP_REQUIRED" });
    expect(invitationUpdateOperations).toHaveLength(0);
  });

  it("redirects no invitation to another address on a stale session", async () => {
    isGridmasterActor.mockResolvedValue(true);
    requireSensitiveActionAuth.mockResolvedValue(staleSession());

    const { PATCH } = await importRoute();
    const response = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        email: "new@test.com",
      }),
    );

    expect(response.status).toBe(403);
    expect(invitationUpdateOperations).toHaveLength(0);
  });

  it("records a fresh Gridmaster as the inviter of the raised role", async () => {
    isGridmasterActor.mockResolvedValue(true);
    invitationUpdateMaybeSingle.mockResolvedValue({
      data: { ...CURRENT_INVITATION_ROW, role_to_assign: "super_admin", invited_by: "actor-1" },
      error: null,
    });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        roleToAssign: "super_admin",
      }),
    );

    expect(response.status).toBe(200);
    expect(requireSensitiveActionAuth).toHaveBeenCalledTimes(1);
    expect(invitationUpdateOperations[0]?.values).toMatchObject({
      role_to_assign: "super_admin",
      invited_by: "actor-1",
    });
  });

  it("asks an organization admin for no fresh proof and keeps the inviter on a name edit", async () => {
    buildInvitationChanges.mockReturnValue([
      { key: "firstName", label: "First name", previousValue: null, nextValue: "Ada" },
    ]);
    invitationUpdateMaybeSingle.mockResolvedValue({ data: CURRENT_INVITATION_ROW, error: null });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        firstName: "Ada",
      }),
    );

    expect(response.status).toBe(200);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
    expect(invitationUpdateOperations[0]?.values).not.toHaveProperty("invited_by");
  });

  it("replaces no access on a stale session", async () => {
    isGridmasterActor.mockResolvedValue(true);
    requireSensitiveActionAuth.mockResolvedValue(staleSession());
    invitationSelectMaybeSingle.mockResolvedValue({ data: pendingInvitation, error: null });

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "replace_access",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        roleToAssign: "super_admin",
      }),
    );

    expect(response.status).toBe(403);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("answers the function's tier refusal on replacement with 403", async () => {
    invitationSelectMaybeSingle.mockResolvedValue({ data: pendingInvitation, error: null });
    serviceRpc.mockResolvedValue({ data: null, error: { message: "INVITATION_TIER_DENIED" } });

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "replace_access",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        roleToAssign: "super_admin",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: API_ERRORS.CANNOT_ASSIGN_SUPER_ADMIN });
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
});

describe("an invitation's grant stays with the person who could make it (41d4 audit)", () => {
  it("refuses an Admin redirecting a Super Admin invitation to another address", async () => {
    invitationSelectMaybeSingle.mockResolvedValue({
      data: { ...CURRENT_INVITATION_ROW, role_to_assign: "super_admin" },
      error: null,
    });
    canAssignOrgRole.mockResolvedValue(false);

    const { PATCH } = await importRoute();
    const response = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        email: "mine@test.com",
      }),
    );

    expect(response.status).toBe(403);
    expect(canAssignOrgRole).toHaveBeenCalledWith(
      expect.anything(),
      "actor-1",
      ORG_ID,
      "super_admin",
    );
    expect(invitationUpdateOperations).toHaveLength(0);
  });

  it("never hands a resent token back to the caller", async () => {
    const pending = { ...CURRENT_INVITATION_ROW, expires_at: "2099-02-01T00:00:00.000Z" };
    invitationSelectMaybeSingle
      .mockResolvedValueOnce({ data: pending, error: null })
      .mockResolvedValue({
        data: { ...pending, token: "rotated-token", updated_at: "2026-01-01T00:00:01.000Z" },
        error: null,
      });
    invitationUpdateMaybeSingle.mockResolvedValue({
      data: { ...pending, token: "rotated-token", updated_at: "2026-01-01T00:00:01.000Z" },
      error: null,
    });
    serviceRpc.mockResolvedValue({
      data: {
        invitation_id: INVITATION_ID,
        token: "rotated-token",
        expires_at: "2099-02-01T00:00:00.000Z",
        previous_token: "original-token",
        previous_expires_at: "2099-01-01T00:00:00.000Z",
      },
      error: null,
    });

    const { POST } = await importRoute();
    const response = await POST(
      makePostRequest({
        action: "resend",
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("rotated-token");
    expect(body).not.toHaveProperty("token");
  });
});

describe("a Gridmaster's invitation department change (41d3, F-68)", () => {
  it("changes no departments on a stale session", async () => {
    isGridmasterActor.mockResolvedValue(true);
    requireSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        departmentIds: [7],
        deptAdminIds: [7],
      }),
    );

    expect(response.status).toBe(403);
    expect(invitationUpdateOperations).toHaveLength(0);
  });

  it("asks no fresh proof when the departments are unchanged", async () => {
    isGridmasterActor.mockResolvedValue(true);
    buildInvitationChanges.mockReturnValue([
      { key: "firstName", label: "First name", previousValue: null, nextValue: "Ada" },
    ]);
    invitationUpdateMaybeSingle.mockResolvedValue({ data: CURRENT_INVITATION_ROW, error: null });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      makePatchRequest({
        orgId: ORG_ID,
        invitationId: INVITATION_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        firstName: "Ada",
        departmentIds: [],
      }),
    );

    expect(response.status).toBe(200);
    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });
});
