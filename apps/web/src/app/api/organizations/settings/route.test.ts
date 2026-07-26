import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const loggerError = vi.fn();
const captureException = vi.fn();
const membershipMaybeSingle = vi.fn();
const profileMaybeSingle = vi.fn();
const organizationBillingMaybeSingle = vi.fn();
const organizationSingle = vi.fn();
const organizationUpdateMaybeSingle = vi.fn();
const auditInsert = vi.fn();
const organizationUpdate = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: vi.fn(() => ({})),
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

const cacheDel = vi.fn();
vi.mock("@/lib/cache", () => ({
  cacheDel: (...args: unknown[]) => cacheDel(...args),
  CacheKey: { orgBySlug: (slug: string) => `dg:org:slug:${slug}` },
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "organization_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: membershipMaybeSingle,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: profileMaybeSingle,
              single: profileMaybeSingle,
            })),
          })),
        };
      }

      if (table === "organizations") {
        return {
          select: vi.fn((columns: string) => ({
            eq: vi.fn(() => ({
              maybeSingle: columns.includes("subscription_status")
                ? organizationBillingMaybeSingle
                : organizationSingle,
              single: organizationSingle,
            })),
          })),
          update: organizationUpdate,
        };
      }

      if (table === "audit_log") {
        return {
          insert: auditInsert,
        };
      }

      if (table === "employees") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { PUT } from "@/app/api/organizations/settings/route";

function makeOrganizationRow(updatedAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Acme Health",
    slug: "acme-health",
    address: "123 Main St, Springfield, CA 90210, United States",
    address_line_1: "123 Main St",
    address_line_2: "",
    address_city: "Springfield",
    address_state: "CA",
    address_postal_code: "90210",
    address_country: "United States",
    phone: "(415) 555-0100",
    employee_count: 42,
    focus_area_label: "Focus Areas",
    certification_label: "Certifications",
    role_label: "Roles",
    department_label: "Departments",
    shift_display_mode: "code",
    timezone: "America/Los_Angeles",
    pay_period_start_date: null,
    archived_at: null,
    suspended_at: null,
    suspended_reason: null,
    enforce_conflict_prevention: true,
    stripe_customer_id: null,
    subscription_status: "active",
    trial_ends_at: null,
    subscription_seats: null,
    data_retention_days: 90,
    feature_overrides: {},
    updated_at: updatedAt,
    ...overrides,
  };
}

function makeUpdateBuilder() {
  return {
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: organizationUpdateMaybeSingle,
        })),
      })),
    })),
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/organizations/settings", {
    method: "PUT",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      "user-agent": "vitest",
    },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/organizations/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        email: "admin@example.com",
      },
    });
    checkRateLimit.mockResolvedValue({
      limited: false,
      reset: null,
      misconfigured: false,
    });
    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileMaybeSingle.mockResolvedValue({
      data: { platform_role: "none" },
      error: null,
    });
    organizationBillingMaybeSingle.mockResolvedValue({
      data: {
        suspended_at: null,
        subscription_status: "active",
        trial_ends_at: null,
      },
      error: null,
    });
    organizationUpdate.mockImplementation(() => makeUpdateBuilder());
    auditInsert.mockResolvedValue({ error: null });
  });

  it("returns a conflict response with the latest organization when updated_at changed", async () => {
    const latestRow = makeOrganizationRow("2026-04-15T18:05:00.000000+00:00");
    organizationSingle.mockResolvedValueOnce({ data: latestRow, error: null });

    const response = await PUT(
      makeRequest({
        orgId: latestRow.id,
        expectedUpdatedAt: "2026-04-15T18:00:00.000000+00:00",
        name: "Acme North",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: "ORG_SETTINGS_CONFLICT",
        organization: expect.objectContaining({
          id: latestRow.id,
          updatedAt: latestRow.updated_at,
        }),
      }),
    );
    expect(organizationUpdate).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("persists changed fields and records an audit entry for successful guarded saves", async () => {
    const currentRow = makeOrganizationRow("2026-04-15T18:00:00.000000+00:00");
    const updatedRow = makeOrganizationRow("2026-04-15T18:10:00.000000+00:00", {
      name: "Acme North",
      address: "456 Market St, Suite 800, San Francisco, CA 94103, United States",
      address_line_1: "456 Market St",
      address_line_2: "Suite 800",
      address_city: "San Francisco",
      address_state: "CA",
      address_postal_code: "94103",
      timezone: "America/Denver",
      pay_period_start_date: "2026-04-20",
    });

    organizationSingle.mockResolvedValueOnce({ data: currentRow, error: null });
    organizationUpdateMaybeSingle.mockResolvedValueOnce({
      data: updatedRow,
      error: null,
    });

    const response = await PUT(
      makeRequest({
        orgId: currentRow.id,
        expectedUpdatedAt: currentRow.updated_at,
        name: "Acme North",
        addressLine1: "456 Market St",
        addressLine2: "Suite 800",
        addressCity: "San Francisco",
        addressState: "CA",
        addressPostalCode: "94103",
        addressCountry: "United States",
        timezone: "America/Denver",
        payPeriodStartDate: "2026-04-20",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        organization: expect.objectContaining({
          name: "Acme North",
          addressLine1: "456 Market St",
          addressLine2: "Suite 800",
          addressCity: "San Francisco",
          timezone: "America/Denver",
          payPeriodStartDate: "2026-04-20",
          updatedAt: updatedRow.updated_at,
        }),
      }),
    );

    expect(organizationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        updated_by: "22222222-2222-4222-8222-222222222222",
        name: "Acme North",
        address_line_1: "456 Market St",
        address_line_2: "Suite 800",
        address_city: "San Francisco",
        address_state: "CA",
        address_postal_code: "94103",
        address_country: "United States",
        timezone: "America/Denver",
        pay_period_start_date: "2026-04-20",
      }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "org.updated",
        resource_type: "organization",
        details: expect.objectContaining({
          changedFields: expect.arrayContaining([
            "name",
            "addressLine1",
            "addressLine2",
            "addressCity",
            "addressPostalCode",
            "timezone",
          ]),
          changes: expect.arrayContaining([
            expect.objectContaining({
              field: "name",
              from: "Acme Health",
              to: "Acme North",
            }),
            expect.objectContaining({
              field: "timezone",
              from: "America/Los_Angeles",
              to: "America/Denver",
            }),
          ]),
        }),
        ip_address: "203.0.113.10",
        user_agent: "vitest",
      }),
    );
    expect(captureException).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
    // Renaming invalidates the subdomain-lookup cache (keyed by slug, which
    // doesn't change) so the cached display name isn't stale for the TTL.
    expect(cacheDel).toHaveBeenCalledWith("dg:org:slug:acme-health");
  });

  it("does not touch the subdomain-lookup cache when name doesn't change", async () => {
    const currentRow = makeOrganizationRow("2026-04-15T18:00:00.000000+00:00");
    const updatedRow = makeOrganizationRow("2026-04-15T18:10:00.000000+00:00", {
      timezone: "America/Denver",
    });

    organizationSingle.mockResolvedValueOnce({ data: currentRow, error: null });
    organizationUpdateMaybeSingle.mockResolvedValueOnce({
      data: updatedRow,
      error: null,
    });

    const response = await PUT(
      makeRequest({
        orgId: currentRow.id,
        expectedUpdatedAt: currentRow.updated_at,
        timezone: "America/Denver",
      }),
    );

    expect(response.status).toBe(200);
    expect(cacheDel).not.toHaveBeenCalled();
  });

  it("rejects invalid organization phone numbers with field errors", async () => {
    const currentRow = makeOrganizationRow("2026-04-15T18:00:00.000000+00:00");

    const response = await PUT(
      makeRequest({
        orgId: currentRow.id,
        expectedUpdatedAt: currentRow.updated_at,
        phone: "123",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "Enter a 10-digit US phone number",
        fieldErrors: expect.objectContaining({
          phone: "Enter a 10-digit US phone number",
        }),
      }),
    );
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it("records a dedicated runtime controls audit event when feature overrides change", async () => {
    const currentRow = makeOrganizationRow("2026-04-15T18:00:00.000000+00:00", {
      feature_overrides: {},
    });
    const updatedRow = makeOrganizationRow("2026-04-15T18:10:00.000000+00:00", {
      feature_overrides: { disable_realtime: true },
    });

    organizationSingle.mockResolvedValueOnce({ data: currentRow, error: null });
    organizationUpdateMaybeSingle.mockResolvedValueOnce({
      data: updatedRow,
      error: null,
    });

    const response = await PUT(
      makeRequest({
        orgId: currentRow.id,
        expectedUpdatedAt: currentRow.updated_at,
        featureOverrides: { disable_realtime: true },
      }),
    );

    expect(response.status).toBe(200);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "org.updated",
        details: expect.objectContaining({
          changedFields: expect.arrayContaining(["featureOverrides"]),
        }),
      }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "feature_flags.updated",
        resource_type: "organization",
        details: {
          from: {},
          to: { disable_realtime: true },
        },
      }),
    );
  });
});
