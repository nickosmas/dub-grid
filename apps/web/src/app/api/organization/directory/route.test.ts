import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const rpc = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(query: Record<string, string>) {
  const url = new URL("http://localhost/api/organization/directory");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function makeRow(personId: string) {
  return {
    person_id: personId,
    source: "user_only",
    employee_id: null,
    employee_number: null,
    user_id: personId,
    first_name: "First",
    last_name: "Last",
    email: "person@example.com",
    phone: "",
    employee_status: null,
    org_role: "user",
    has_app_access: true,
    focus_area_ids: [],
    certification_id: null,
    role_ids: [],
    seniority: null,
    last_sign_in_at: null,
    invitation_status: null,
    scheduled_department_ids: [],
    scheduled_dept_admin_ids: [],
    management_department_ids: [],
    management_dept_admin_ids: [],
    membership_updated_at: null,
    membership_admin_permissions: null,
  };
}

describe("GET /api/organization/directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgPermissions.mockResolvedValue({
      orgId: ORG_ID,
      serviceClient: { rpc },
      permissions: { isGridmaster: false, isSuperAdmin: true, canManageEmployees: true },
    });
  });

  it("defaults to a 50-row page and requests it from the RPC", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(makeRequest({ orgId: ORG_ID }));

    expect(rpc).toHaveBeenCalledWith("get_org_directory", {
      p_org_id: ORG_ID,
      p_limit: 50,
      p_offset: 0,
    });
  });

  it("passes explicit limit/offset through to the RPC", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(makeRequest({ orgId: ORG_ID, limit: "25", offset: "75" }));

    expect(rpc).toHaveBeenCalledWith("get_org_directory", {
      p_org_id: ORG_ID,
      p_limit: 25,
      p_offset: 75,
    });
  });

  it("reports hasMore + nextOffset when a full page comes back", async () => {
    rpc.mockResolvedValue({
      data: Array.from({ length: 50 }, (_, i) => makeRow(`u:${i}`)),
      error: null,
    });

    const response = await GET(makeRequest({ orgId: ORG_ID }));
    const body = await response.json();

    expect(body.directory).toHaveLength(50);
    expect(body.hasMore).toBe(true);
    expect(body.nextOffset).toBe(50);
  });

  it("reports hasMore: false and nextOffset: null on a short page", async () => {
    rpc.mockResolvedValue({
      data: Array.from({ length: 12 }, (_, i) => makeRow(`u:${i}`)),
      error: null,
    });

    const response = await GET(makeRequest({ orgId: ORG_ID, offset: "100" }));
    const body = await response.json();

    expect(body.directory).toHaveLength(12);
    expect(body.hasMore).toBe(false);
    expect(body.nextOffset).toBeNull();
  });

  it("rejects a limit above 200", async () => {
    const response = await GET(makeRequest({ orgId: ORG_ID, limit: "500" }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
