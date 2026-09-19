import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireGridmasterSession = vi.fn();
const requestRpc = vi.fn();
const serviceFrom = vi.fn();
const serviceRpc = vi.fn();
const organizationUpdate = vi.fn();
const organizationInsert = vi.fn();
const organizationEq = vi.fn();
const auditInsert = vi.fn();
const organizationWorkspaceKindMaybeSingle = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({
    rpc: requestRpc,
  }),
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
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
  CacheKey: { orgBySlug: (slug: string) => `dg:org:slug:${slug}` },
}));

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

  it("archives an organization and writes an audit event", async () => {
    const response = await POST(makeRequest({ action: "archiveOrganization", orgId: ORG_ID }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
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
      }),
    );
    // Archiving no longer touches host-routing caches: organizations are
    // selected by authenticated session context, never by a subdomain.
    expect(cacheDel).not.toHaveBeenCalled();
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

  it("keeps the super admin's invitation token out of the org.created audit row", async () => {
    requestRpc.mockImplementation(async (fn: string) => {
      if (fn === "assign_org_role_by_email") {
        return { error: { code: "P0002", message: "no account" } };
      }
      if (fn === "send_invitation") {
        return { data: { token: "raw-invite-token" }, error: null };
      }
      return { error: null };
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
          superAdminFirstName: "Ada",
          superAdminLastName: "Lovelace",
          superAdminEmail: "ada@example.com",
          superAdminPhone: "",
        },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.superAdmin.pendingInvite.token).toBe("raw-invite-token");

    const auditRow = auditInsert.mock.calls.find(([row]) => row.action === "org.created")?.[0];
    expect(auditRow.details.super_admin).toEqual({
      kind: "pending-invite",
      displayName: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(JSON.stringify(auditRow)).not.toContain("raw-invite-token");
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
