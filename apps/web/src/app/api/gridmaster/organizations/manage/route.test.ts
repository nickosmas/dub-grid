import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const requestRpc = vi.fn();
const serviceFrom = vi.fn();
const serviceRpc = vi.fn();
const organizationUpdate = vi.fn();
const organizationInsert = vi.fn();
const organizationEq = vi.fn();
const auditInsert = vi.fn();
const organizationWorkspaceKindMaybeSingle = vi.fn();
const sendPendingInvitationEmail = vi.fn();
const invitationDeleteEq = vi.fn();

vi.mock("@/features/organization/server/invitation-delivery", () => ({
  sendPendingInvitationEmail: (...args: unknown[]) => sendPendingInvitationEmail(...args),
  isEmailNotConfigured: () => false,
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({
    rpc: requestRpc,
  }),
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
    rpc: serviceRpc,
  }),
}));

vi.mock("@/lib/db/mappers", () => ({
  rowToOrganization: (row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    updatedAt: row.updated_at ?? null,
  }),
}));

vi.mock("@/lib/db/shared", () => ({
  ORGANIZATION_COLS: "id,name,slug,updated_at",
  ORGANIZATION_WITH_BILLING_COLS: "id,name,slug,updated_at,stripe_customer_id,subscription_seats",
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

const cacheDel = vi.fn();
vi.mock("@/lib/cache", () => ({
  cacheDel: (...args: unknown[]) => cacheDel(...args),
  CacheKey: {
    orgBySlug: (slug: string) => `dg:org:slug:${slug}`,
    mwOrgAccess: (orgId: string) => `dg:mw:orgAccess:${orgId}`,
    organization: (orgId: string) => `dg:org:${orgId}:organization`,
  },
}));

const cancelSubscription = vi.fn();
vi.mock("@/lib/stripe", () => ({
  cancelSubscription: (...args: unknown[]) => cancelSubscription(...args),
}));
const subscriptionMaybeSingle = vi.fn();
const subscriptionUpdate = vi.fn();

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/gridmaster/organizations/manage", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/gridmaster/organizations/manage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireSensitiveActionAuth.mockResolvedValue({ user: { id: "gridmaster-user" } });
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    // Supports both `await update().eq(...)` (restoreOrganization) and
    // `update().eq(...).select(...).maybeSingle()` (archiveOrganization,
    // which needs the slug back to invalidate the subdomain-lookup cache).
    organizationEq.mockReturnValue({
      then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
      select: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: { slug: "acme" }, error: null })),
      })),
    });
    organizationUpdate.mockReturnValue({ eq: organizationEq });
    organizationInsert.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: {
              id: ORG_ID,
              name: "Acme Health",
              slug: "acme",
              updated_at: "2026-05-01T00:00:00.000Z",
            },
            error: null,
          }),
        ),
      })),
    });
    requestRpc.mockResolvedValue({ error: null });
    auditInsert.mockResolvedValue({ error: null });
    sendPendingInvitationEmail.mockResolvedValue(undefined);
    // Every action targeting an existing org id is preceded by a
    // workspace_kind guard (sandbox orgs aren't managed here). Default to a
    // real org so the existing action-specific tests are unaffected.
    organizationWorkspaceKindMaybeSingle.mockResolvedValue({
      data: { workspace_kind: "real" },
      error: null,
    });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "organizations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: organizationWorkspaceKindMaybeSingle,
            })),
          })),
          update: organizationUpdate,
          insert: organizationInsert,
        };
      }
      if (table === "employees") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { id: "employee-id" }, error: null })),
            })),
          })),
        };
      }
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      if (table === "invitations") {
        const chain = {
          eq: (...args: unknown[]) => {
            invitationDeleteEq(...args);
            return chain;
          },
          is: () => chain,
        };
        return { delete: () => chain };
      }
      if (table === "subscriptions") {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: subscriptionMaybeSingle })) })),
          update: subscriptionUpdate,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects CSRF failures before gridmaster auth", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(makeRequest({ action: "archiveOrganization", orgId: ORG_ID }));

    expect(response.status).toBe(403);
    expect(requireGridmasterSession).not.toHaveBeenCalled();
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("rejects non-gridmaster sessions before validation", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await POST(makeRequest({ action: "unknown" }));

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("validates bad input before mutating", async () => {
    const response = await POST(
      makeRequest({ action: "archiveOrganization", orgId: "not-a-uuid" }),
    );

    expect(response.status).toBe(400);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("refuses to act on a sandbox organization", async () => {
    organizationWorkspaceKindMaybeSingle.mockResolvedValue({
      data: { workspace_kind: "sandbox" },
      error: null,
    });

    const response = await POST(makeRequest({ action: "archiveOrganization", orgId: ORG_ID }));

    expect(response.status).toBe(400);
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it("archives an organization, cancels its billing, drops its caches, and writes an audit event", async () => {
    subscriptionMaybeSingle.mockResolvedValue({
      data: { stripe_subscription_id: "sub_123" },
      error: null,
    });
    subscriptionUpdate.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
    cancelSubscription.mockResolvedValue({});

    const response = await POST(makeRequest({ action: "archiveOrganization", orgId: ORG_ID }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, stripeCanceled: true });
    expect(cancelSubscription).toHaveBeenCalledWith("sub_123");
    expect(organizationUpdate).toHaveBeenCalledWith({
      archived_at: expect.any(String),
    });
    expect(organizationEq).toHaveBeenCalledWith("id", ORG_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: "gridmaster-user",
        action: "org.archived",
        resource_type: "organization",
        resource_id: ORG_ID,
        details: expect.objectContaining({ stripeCanceled: true }),
      }),
    );
    // Members keep passing the proxy for the cached access window and the
    // slug lookup keeps resolving for a day unless both are dropped (F-95).
    expect(cacheDel).toHaveBeenCalledWith(
      `dg:mw:orgAccess:${ORG_ID}`,
      `dg:org:${ORG_ID}:organization`,
      "dg:org:slug:acme",
    );
  });

  it("archives without billing when the organization has no Stripe subscription", async () => {
    subscriptionMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(makeRequest({ action: "archiveOrganization", orgId: ORG_ID }));

    await expect(response.json()).resolves.toEqual({ success: true, stripeCanceled: false });
    expect(cancelSubscription).not.toHaveBeenCalled();
  });

  it("suspending drops the org access and slug caches", async () => {
    const response = await POST(
      makeRequest({ action: "suspendOrganization", orgId: ORG_ID, reason: "Unpaid invoices" }),
    );

    expect(response.status).toBe(200);
    expect(cacheDel).toHaveBeenCalledWith(
      `dg:mw:orgAccess:${ORG_ID}`,
      `dg:org:${ORG_ID}:organization`,
      "dg:org:slug:acme",
    );
  });

  // A role grant can make anyone Super Admin of any organization (41d3, F-16).
  it("grants no role without fresh proof", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json(
        {
          code: "STEP_UP_REQUIRED",
          method: "totp",
          error: "Confirm your identity, then try again.",
        },
        { status: 403 },
      ),
    });

    const response = await POST(
      makeRequest({
        action: "assignOrgRoleByEmail",
        orgId: ORG_ID,
        email: "admin@example.com",
        role: "super_admin",
      }),
    );

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("asks no fresh proof for an action that grants nothing", async () => {
    await POST(makeRequest({ action: "unsuspendOrganization", orgId: ORG_ID }));

    expect(requireSensitiveActionAuth).not.toHaveBeenCalled();
  });

  it("assigns an org role by email and writes an audit event", async () => {
    const response = await POST(
      makeRequest({
        action: "assignOrgRoleByEmail",
        orgId: ORG_ID,
        email: "admin@example.com",
        role: "admin",
      }),
    );

    expect(response.status).toBe(200);
    expect(requestRpc).toHaveBeenCalledWith("assign_org_role_by_email", {
      p_email: "admin@example.com",
      p_org_id: ORG_ID,
      p_org_role: "admin",
    });
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "role.assigned",
        resource_type: "organization_membership",
        details: expect.objectContaining({
          target_email: "admin@example.com",
          role: "admin",
        }),
      }),
    );
  });

  it("creates org setup and includes success plus org payload", async () => {
    const response = await POST(
      makeRequest({
        action: "createOrganizationSetup",
        input: {
          name: "Acme Health",
          addressLine1: "",
          addressLine2: "",
          addressCity: "",
          addressState: "",
          addressPostalCode: "",
          addressCountry: "",
          phone: "",
          timezone: "America/Los_Angeles",
          focusAreaLabel: "",
          certificationLabel: "",
          roleLabel: "",
          shiftDisplayMode: "code",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        org: expect.objectContaining({
          id: ORG_ID,
          name: "Acme Health",
        }),
      }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "org.created",
        resource_type: "organization",
        resource_id: ORG_ID,
      }),
    );
    // Trial is "pending" at creation: subscription_status is trialing but
    // trial_ends_at is left unset until the first super_admin signs in.
    expect(organizationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "acme-health",
        subscription_status: "trialing",
      }),
    );
    expect(organizationInsert.mock.calls[0][0]).not.toHaveProperty("trial_ends_at");
  });

  const SETUP_WITH_NEW_SUPER_ADMIN = {
    action: "createOrganizationSetup",
    input: {
      name: "Acme Health",
      addressLine1: "",
      addressLine2: "",
      addressCity: "",
      addressState: "",
      addressPostalCode: "",
      addressCountry: "",
      phone: "",
      timezone: "America/Los_Angeles",
      focusAreaLabel: "",
      certificationLabel: "",
      roleLabel: "",
      shiftDisplayMode: "code",
      superAdminFirstName: "Ada",
      superAdminLastName: "Lovelace",
      superAdminEmail: "ada@example.com",
      superAdminPhone: "",
    },
  };

  function inviteInsteadOfAssign() {
    requestRpc.mockImplementation(async (fn: string) => {
      if (fn === "assign_org_role_by_email") {
        return { error: { code: "P0002", message: "no account" } };
      }
      if (fn === "send_invitation") {
        return {
          data: {
            invitation_id: "invite-1",
            token: "raw-invite-token",
            expires_at: "2026-03-03T00:00:00Z",
          },
          error: null,
        };
      }
      return { error: null };
    });
  }

  it("emails the super admin's invitation as part of setup and keeps the token private", async () => {
    inviteInsteadOfAssign();

    const response = await POST(makeRequest(SETUP_WITH_NEW_SUPER_ADMIN));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.superAdmin).toEqual({ kind: "invited", displayName: "Ada Lovelace" });
    expect(JSON.stringify(body)).not.toContain("raw-invite-token");
    expect(sendPendingInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "raw-invite-token",
        email: "ada@example.com",
        expiresAt: "2026-03-03T00:00:00Z",
        kind: "new",
      }),
    );

    const auditRow = auditInsert.mock.calls.find(([row]) => row.action === "org.created")?.[0];
    expect(auditRow.details.super_admin).toEqual({
      kind: "invited",
      displayName: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(JSON.stringify(auditRow)).not.toContain("raw-invite-token");
  });

  it("removes the super admin's invitation when its email cannot be sent", async () => {
    inviteInsteadOfAssign();
    sendPendingInvitationEmail.mockRejectedValue(new Error("Resend email failed (500)"));

    const response = await POST(makeRequest(SETUP_WITH_NEW_SUPER_ADMIN));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.superAdmin.kind).toBe("invite-error");
    expect(invitationDeleteEq).toHaveBeenCalledWith("id", "invite-1");
    expect(invitationDeleteEq).toHaveBeenCalledWith("token", "raw-invite-token");
  });

  it("leaves the time zone to the database default when the gridmaster skips it", async () => {
    const response = await POST(
      makeRequest({
        action: "createOrganizationSetup",
        input: {
          name: "Acme Health",
          addressLine1: "",
          addressLine2: "",
          addressCity: "",
          addressState: "",
          addressPostalCode: "",
          addressCountry: "",
          phone: "",
          timezone: "",
          focusAreaLabel: "",
          certificationLabel: "",
          roleLabel: "",
          shiftDisplayMode: "code",
        },
      }),
    );

    expect(response.status).toBe(200);
    // organizations.timezone is NOT NULL DEFAULT 'UTC': sending null was a 500.
    expect(organizationInsert.mock.calls[0][0]).not.toHaveProperty("timezone");
  });

  it("retries with a numeric suffix when the generated slug already exists", async () => {
    organizationInsert.mockReturnValueOnce({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: null, error: { code: "23505" } })),
      })),
    });

    const response = await POST(
      makeRequest({
        action: "createOrganizationSetup",
        input: {
          name: "Acme Health",
          addressLine1: "",
          addressLine2: "",
          addressCity: "",
          addressState: "",
          addressPostalCode: "",
          addressCountry: "",
          phone: "",
          timezone: "America/Los_Angeles",
          focusAreaLabel: "",
          certificationLabel: "",
          roleLabel: "",
          shiftDisplayMode: "code",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(organizationInsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ slug: "acme-health" }),
    );
    expect(organizationInsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ slug: "acme-health-2" }),
    );
  });
});
