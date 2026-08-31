import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const requireAuthenticatedUser = vi.fn();
const checkRateLimit = vi.fn();
const requireOrgPermissions = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const dispatchNotificationEvent = vi.fn();
const buildInvitationChanges = vi.fn();
const invitationSelectMaybeSingle = vi.fn();
const invitationUpdateMaybeSingle = vi.fn();
const auditInsert = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
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
    from: (table: string) => {
      if (table === "audit_log") {
        return { insert: (...args: unknown[]) => auditInsert(...args) };
      }
      // invitations table: fetchInvitation's select().eq().eq().maybeSingle()
      // vs. the PATCH update().eq().eq().eq().select().maybeSingle() chain.
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => invitationSelectMaybeSingle(),
        update: () => updateChain,
      };
      const updateChain: Record<string, unknown> = {
        eq: () => updateChain,
        select: () => updateChain,
        maybeSingle: () => invitationUpdateMaybeSingle(),
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

async function importRoute() {
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  forbidIfSandboxCookie.mockReturnValue(null);
  requireAuthenticatedUser.mockResolvedValue({ user: { id: "actor-1", email: "actor@test.com" } });
  checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
  requireOrgPermissions.mockResolvedValue({ ok: true });
  buildInvitationChanges.mockReturnValue([
    { key: "email", label: "Email", previousValue: "old@test.com", nextValue: "new@test.com" },
  ]);
  invitationSelectMaybeSingle.mockResolvedValue({ data: CURRENT_INVITATION_ROW, error: null });
  auditInsert.mockResolvedValue({ error: null });
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
