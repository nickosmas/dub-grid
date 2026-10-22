import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INTERNAL_IDS, VIEWERS, internalProfilesFrom } from "@/__tests__/helpers/internal-people";

const requireOrgPermissions = vi.fn();
const getServiceClient = vi.fn();

vi.mock("@/app/api/shared/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/shared/permissions")>()),
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => getServiceClient() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_IDS = ["member-1", "qa-person", "qa-viewer"];

function membershipsAndProfiles() {
  const resolved = (data: unknown[]) => {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      in: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(resolve),
    };
    return query;
  };
  return {
    from: (table: string) =>
      table === "organization_memberships"
        ? resolved(MEMBER_IDS.map((id) => ({ id: `m-${id}`, user_id: id, org_id: ORG_ID })))
        : resolved(MEMBER_IDS.map((id) => ({ id, first_name: id, platform_role: "none" }))),
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@example.com` } } }),
      },
    },
  };
}

async function usersFor(viewer: (typeof VIEWERS)[keyof typeof VIEWERS]) {
  requireOrgPermissions.mockResolvedValue({
    orgId: ORG_ID,
    actor: viewer.actor,
    permissions: { isGridmaster: viewer.isGridmaster, isSuperAdmin: true },
    serviceClient: { from: internalProfilesFrom(INTERNAL_IDS) },
  });
  const response = await GET(
    new NextRequest(`http://localhost/api/organizations/users?orgId=${ORG_ID}`),
  );
  expect(response.status).toBe(200);
  const { users } = (await response.json()) as { users: Array<{ id: string }> };
  return users.map((user) => user.id);
}

describe("GET /api/organizations/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceClient.mockReturnValue(membershipsAndProfiles());
  });

  it("leaves internal accounts out for a client super admin", async () => {
    expect(await usersFor(VIEWERS.client)).toEqual(["member-1"]);
  });

  it("keeps them for an internal viewer and a Gridmaster", async () => {
    expect(await usersFor(VIEWERS.internal)).toEqual(MEMBER_IDS);
    expect(await usersFor(VIEWERS.gridmaster)).toEqual(MEMBER_IDS);
  });
});
