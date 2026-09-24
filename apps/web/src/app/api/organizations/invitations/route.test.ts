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

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
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
  organizationMaybeSingle.mockResolvedValue({ data: { name: "Calm Haven" }, error: null });
  getInvitationEmailConfig.mockReturnValue({ apiKey: "key", from: "DubGrid <a@b.c>" });
  sendInvitationEmail.mockResolvedValue(undefined);
  auditInsert.mockResolvedValue({ error: null });
});

describe("POST /api/organizations/invitations", () => {
  const replacementId = "33333333-3333-4333-8333-333333333333";
  const pendingInvitation = {
    ...CURRENT_INVITATION_ROW,
    expires_at: "2099-02-01T00:00:00.000Z",
  };
  const replacementInvitation = {
    ...pendingInvitation,
    id: replacementId,
    role_to_assign: "admin",
    token: "replacement-token",
    updated_at: "2026-01-01T00:00:01.000Z",
  };

  it("revokes the old invite, creates a replacement, and sends its token", async () => {
    invitationSelectMaybeSingle
      .mockResolvedValueOnce({ data: pendingInvitation, error: null })
      .mockResolvedValueOnce({ data: replacementInvitation, error: null });
    serviceRpc.mockResolvedValue({
      data: {
        previous_invitation_id: INVITATION_ID,
        invitation_id: replacementId,
        token: "replacement-token",
        expires_at: "2099-02-01T00:00:00.000Z",
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
    expect(sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "old@test.com",
        token: "replacement-token",
      }),
    );
    expect(payload.previousInvitationId).toBe(INVITATION_ID);
    expect(payload.invitation.id).toBe(replacementId);
  });

  it("restores the old invite when the replacement email cannot be sent", async () => {
    invitationSelectMaybeSingle
      .mockResolvedValueOnce({ data: pendingInvitation, error: null })
      .mockResolvedValueOnce({ data: replacementInvitation, error: null });
    serviceRpc
      .mockResolvedValueOnce({
        data: {
          previous_invitation_id: INVITATION_ID,
          invitation_id: replacementId,
          token: "replacement-token",
          expires_at: "2099-02-01T00:00:00.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
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
    expect(serviceRpc).toHaveBeenNthCalledWith(
      2,
      "rollback_pending_invitation_access_replacement",
      {
        p_org_id: ORG_ID,
        p_previous_invitation_id: INVITATION_ID,
        p_replacement_invitation_id: replacementId,
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
    expect(sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.any(String), email: "old@test.com" }),
    );
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

  it("does not consult the tier ceiling when the role is not being changed", async () => {
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
    expect(canAssignOrgRole).not.toHaveBeenCalled();
  });
});
