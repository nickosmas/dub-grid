import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const getClaims = vi.fn();
const fetchMobileOrganizationMembershipRows = vi.fn();
const fetchMobileOrganizationRowById = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    auth: { getUser, getClaims },
  }),
}));

vi.mock("@dubgrid/data-access", () => ({
  fetchMobileOrganizationMembershipRows: (...args: unknown[]) =>
    fetchMobileOrganizationMembershipRows(...args),
  fetchMobileOrganizationRowById: (...args: unknown[]) => fetchMobileOrganizationRowById(...args),
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
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    getClaims.mockResolvedValue({ data: { claims: { org_id: "org-1" } } });
    fetchMobileOrganizationMembershipRows.mockResolvedValue([
      { organization: { id: "org-1", name: "DubGrid Health", slug: "dubgrid-health" }, org_role: "user" },
    ]);
    fetchMobileOrganizationRowById.mockResolvedValue(ORG_ROW);
  });

  it("rejects requests with no bearer token", async () => {
    const { GET } = await import("./org-status");
    const response = await GET(makeRequest(null));
    expect(response.status).toBe(401);
  });

  it("rejects an invalid session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("bad token") });

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    expect(response.status).toBe(401);
  });

  it("returns real billing state for a healthy org, unlike the old canned-message-only path", async () => {
    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    const body = await response.json();

    expect(response.status).toBe(200);
    // No trial_ends_at yet means the trial clock hasn't started (see
    // project_trial_activation_rule) — not locked, just pending.
    expect(body).toEqual({
      state: "trial_pending",
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

  it("still returns billing detail (not just a 403) when the org is locked", async () => {
    fetchMobileOrganizationRowById.mockResolvedValue({
      ...ORG_ROW,
      subscription_status: "canceled",
    });

    const { GET } = await import("./org-status");
    const response = await GET(makeRequest("Bearer token-123"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state).toBe("locked");
    expect(body.isLocked).toBe(true);
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
});
