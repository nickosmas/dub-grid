import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyAccessToken = vi.fn();
const isSessionRevoked = vi.fn();
const fetchMobileOrganizationMembershipRows = vi.fn();
const fetchMobileOrganizationRowById = vi.fn();
const fetchMobileProfilePlatformRole = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({}),
}));

// This route verifies the token locally against Supabase's JWKS instead of
// calling Supabase Auth; see lib/auth/verify-token.ts.
vi.mock("@/lib/auth/verify-token", () => ({
  verifyAccessToken: (...args: unknown[]) => verifyAccessToken(...args),
}));

vi.mock("@/lib/auth/revocation", () => ({
  isSessionRevoked: (...args: unknown[]) => isSessionRevoked(...args),
}));

vi.mock("@dubgrid/data-access", () => ({
  fetchMobileOrganizationMembershipRows: (...args: unknown[]) =>
    fetchMobileOrganizationMembershipRows(...args),
  fetchMobileOrganizationRowById: (...args: unknown[]) => fetchMobileOrganizationRowById(...args),
  fetchMobileProfilePlatformRole: (...args: unknown[]) => fetchMobileProfilePlatformRole(...args),
}));

function makeRequest(authHeader: string | null) {
  return {
    headers: { get: (name: string) => (name === "authorization" ? authHeader : null) },
  } as never;
}

const ORG_ROW = {
  id: "org-1",
  name: "DubGrid Health",
  slug: "dubgrid-health",
  address: "",
  address_line_1: "",
  address_line_2: "",
  address_city: "",
  address_state: "",
  address_postal_code: "",
  address_country: "",
  phone: "",
  employee_count: null,
  focus_area_label: "Focus Areas",
  certification_label: "Certification",
  role_label: "Roles",
  department_label: "Departments",
  shift_display_mode: "name",
  timezone: null,
  pay_period_start_date: null,
  archived_at: null,
  suspended_at: null,
  suspended_reason: null,
  enforce_conflict_prevention: false,
  subscription_status: null,
  trial_ends_at: null,
  data_retention_days: null,
  feature_overrides: {},
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("GET mobile org-status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccessToken.mockResolvedValue({
      userId: "user-1",
      sessionId: "session-1",
      email: "user@example.com",
      issuedAtMs: Date.now(),
      claims: { sub: "user-1", org_id: "org-1" },
    });
    isSessionRevoked.mockResolvedValue(false);
    fetchMobileProfilePlatformRole.mockResolvedValue("none");
    fetchMobileOrganizationMembershipRows.mockResolvedValue([
      {
        organization: { id: "org-1", name: "DubGrid Health", slug: "dubgrid-health" },
        org_role: "user",
      },
    ]);
    fetchMobileOrganizationRowById.mockResolvedValue(ORG_ROW);
  });

  it("rejects requests with no bearer token", async () => {
    const { GET } = await import("./org-status");
    const response = await GET(makeRequest(null));
    expect(response.status).toBe(401);
  });

  it("rejects an invalid session", async () => {
    verifyAccessToken.mockResolvedValue(null);

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    expect(response.status).toBe(401);
  });

  it("rejects a revoked session even though the token still verifies", async () => {
    isSessionRevoked.mockResolvedValue(true);

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    expect(response.status).toBe(401);
  });

  it("rejects a missing organization claim instead of choosing another membership", async () => {
    verifyAccessToken.mockResolvedValue({
      userId: "user-1",
      sessionId: "session-1",
      email: "user@example.com",
      issuedAtMs: Date.now(),
      claims: { sub: "user-1" },
    });

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));

    expect(response.status).toBe(403);
    expect(fetchMobileOrganizationRowById).not.toHaveBeenCalled();
  });

  it("rejects a stale cross-organization claim instead of falling back to another membership", async () => {
    verifyAccessToken.mockResolvedValue({
      userId: "user-1",
      sessionId: "session-1",
      email: "user@example.com",
      issuedAtMs: Date.now(),
      claims: { sub: "user-1", org_id: "other-org" },
    });

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Organization context does not match this user",
    });
    expect(fetchMobileOrganizationRowById).not.toHaveBeenCalled();
  });

  it("rejects an archived organization", async () => {
    fetchMobileOrganizationRowById.mockResolvedValue({
      ...ORG_ROW,
      archived_at: "2026-09-10T00:00:00.000Z",
    });

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "We're having trouble completing that right now. Try again in a moment.",
    });
  });

  it("redacts a pending trial from a regular user", async () => {
    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      state: "unavailable",
      isLocked: false,
      trialGraceEndsAt: null,
      orgRole: "user",
    });
  });

  it("returns active state once the trial has genuinely started and is running", async () => {
    fetchMobileOrganizationRowById.mockResolvedValue({
      ...ORG_ROW,
      subscription_status: "active",
    });

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state).toBe("active");
    expect(body.isLocked).toBe(false);
  });

  it("does not return billing detail when a regular user's org is locked", async () => {
    fetchMobileOrganizationRowById.mockResolvedValue({
      ...ORG_ROW,
      subscription_status: "canceled",
    });

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state).toBe("unavailable");
    expect(body.isLocked).toBe(true);
  });

  it("does not return grace timing to a regular user", async () => {
    fetchMobileOrganizationRowById.mockResolvedValue({
      ...ORG_ROW,
      subscription_status: "trialing",
      trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
    });

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    const body = await response.json();

    expect(body.state).toBe("active");
    expect(body.isLocked).toBe(false);
    expect(body.trialGraceEndsAt).toBeNull();
  });

  it("returns payment attention without locking an admin", async () => {
    fetchMobileOrganizationMembershipRows.mockResolvedValue([
      {
        organization: { id: "org-1", name: "DubGrid Health", slug: "dubgrid-health" },
        org_role: "admin",
      },
    ]);
    fetchMobileOrganizationRowById.mockResolvedValue({
      ...ORG_ROW,
      subscription_status: "past_due",
    });

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    const body = await response.json();

    expect(body).toMatchObject({
      state: "active",
      isLocked: false,
      trialGraceEndsAt: null,
      orgRole: "admin",
    });
  });

  it("reports the super_admin's own org role for role-appropriate copy", async () => {
    fetchMobileOrganizationMembershipRows.mockResolvedValue([
      {
        organization: { id: "org-1", name: "DubGrid Health", slug: "dubgrid-health" },
        org_role: "super_admin",
      },
    ]);
    fetchMobileOrganizationRowById.mockResolvedValue({
      ...ORG_ROW,
      suspended_at: "2026-01-01T00:00:00.000Z",
    });

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    const body = await response.json();

    expect(body.state).toBe("suspended");
    expect(body.orgRole).toBe("super_admin");
  });

  it("rejects live Gridmaster accounts even when the token claim is stale", async () => {
    verifyAccessToken.mockResolvedValue({
      userId: "gridmaster-1",
      sessionId: "session-1",
      email: "gridmaster@example.com",
      issuedAtMs: Date.now(),
      claims: { sub: "gridmaster-1", org_id: "org-1", platform_role: "none" },
    });
    fetchMobileProfilePlatformRole.mockResolvedValue("gridmaster");

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Gridmaster mobile access is not supported",
    });
    expect(fetchMobileOrganizationMembershipRows).not.toHaveBeenCalled();
  });
});
