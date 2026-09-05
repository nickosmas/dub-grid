import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();

// Each table read ends in `.in(...)`; capture the filters so the tests can
// prove what the route actually scoped by.
const membershipIn = vi.fn();
const employeeIn = vi.fn();
const membershipIsArchived = vi.fn(() => ({ in: membershipIn }));
const membershipEqOrg = vi.fn(() => ({ is: membershipIsArchived }));
const employeeEqOrg = vi.fn(() => ({ in: employeeIn }));
const membershipSelect = vi.fn(() => ({ eq: membershipEqOrg }));
const employeeSelect = vi.fn(() => ({ eq: employeeEqOrg }));

const from = vi.fn((table: string) => {
  if (table === "organization_memberships") return { select: membershipSelect };
  if (table === "employees") return { select: employeeSelect };
  throw new Error(`unexpected table ${table}`);
});

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const EFFECTIVE_ORG_ID = "99999999-9999-4999-8999-999999999999";
const USER_A = "22222222-2222-4222-8222-222222222222";
const USER_B = "33333333-3333-4333-8333-333333333333";

function get(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return GET(new NextRequest(`http://localhost/api/schedule/presence-profiles?${search}`));
}

describe("/api/schedule/presence-profiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "user-1" },
      orgId: ORG_ID,
      serviceClient: { from },
    });
    membershipIn.mockResolvedValue({
      data: [
        { user_id: USER_A, org_role: "admin" },
        { user_id: USER_B, org_role: "user" },
      ],
      error: null,
    });
    employeeIn.mockResolvedValue({
      data: [{ user_id: USER_A, email: "alex@example.com" }],
      error: null,
    });
  });

  it("returns a labelled role and email for members of the organization", async () => {
    const response = await get({ orgId: ORG_ID, userIds: `${USER_A},${USER_B}` });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profiles: [
        { userId: USER_A, orgRole: "Admin", email: "alex@example.com" },
        { userId: USER_B, orgRole: "User", email: null },
      ],
    });
  });

  it("scopes every read to the effective organization, not the requested one", async () => {
    // Sandbox redirects the caller to a different organization; the route must
    // follow `auth.orgId` so a client-supplied id can never widen the read.
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "user-1" },
      orgId: EFFECTIVE_ORG_ID,
      serviceClient: { from },
    });

    await get({ orgId: ORG_ID, userIds: USER_A });

    expect(membershipEqOrg).toHaveBeenCalledWith("org_id", EFFECTIVE_ORG_ID);
    expect(employeeEqOrg).toHaveBeenCalledWith("org_id", EFFECTIVE_ORG_ID);
    expect(membershipEqOrg).not.toHaveBeenCalledWith("org_id", ORG_ID);
  });

  it("returns nothing for a user outside the organization", async () => {
    membershipIn.mockResolvedValue({ data: [], error: null });

    const response = await get({ orgId: ORG_ID, userIds: USER_A });

    await expect(response.json()).resolves.toEqual({ profiles: [] });
    // No membership means no reason to touch employee records at all.
    expect(employeeSelect).not.toHaveBeenCalled();
  });

  it("never looks up an employee record for a non-member", async () => {
    membershipIn.mockResolvedValue({
      data: [{ user_id: USER_A, org_role: "user" }],
      error: null,
    });

    await get({ orgId: ORG_ID, userIds: `${USER_A},${USER_B}` });

    expect(employeeIn).toHaveBeenCalledWith("user_id", [USER_A]);
  });

  it("excludes archived members", async () => {
    await get({ orgId: ORG_ID, userIds: USER_A });

    expect(membershipIsArchived).toHaveBeenCalledWith("archived_at", null);
  });

  it("treats a blank employee email as absent", async () => {
    employeeIn.mockResolvedValue({
      data: [{ user_id: USER_A, email: "   " }],
      error: null,
    });

    const response = await get({ orgId: ORG_ID, userIds: USER_A });
    const body = (await response.json()) as { profiles: { email: string | null }[] };

    expect(body.profiles[0].email).toBeNull();
  });

  it("passes the permission failure straight through", async () => {
    requireOrgPermissions.mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await get({ orgId: ORG_ID, userIds: USER_A });

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a malformed organization id", async () => {
    const response = await get({ orgId: "not-a-uuid", userIds: USER_A });

    expect(response.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  it("rejects a missing or empty user list", async () => {
    expect((await get({ orgId: ORG_ID, userIds: "" })).status).toBe(400);
    expect((await get({ orgId: ORG_ID })).status).toBe(400);
  });

  it("rejects an unbounded user list", async () => {
    const tooMany = Array.from({ length: 51 }, () => USER_A).join(",");

    expect((await get({ orgId: ORG_ID, userIds: tooMany })).status).toBe(400);
  });

  it("deduplicates repeated ids before querying", async () => {
    await get({ orgId: ORG_ID, userIds: `${USER_A},${USER_A},${USER_B}` });

    expect(membershipIn).toHaveBeenCalledWith("user_id", [USER_A, USER_B]);
  });

  it("fails closed when the membership read errors", async () => {
    membershipIn.mockResolvedValue({ data: null, error: new Error("boom") });

    const response = await get({ orgId: ORG_ID, userIds: USER_A });

    expect(response.status).toBe(500);
  });
});
