import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INTERNAL_IDS, VIEWERS, internalProfilesFrom } from "@/__tests__/helpers/internal-people";

const requireOrgPermissions = vi.fn();

vi.mock("@/app/api/shared/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/shared/permissions")>()),
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
// Staff in the organization: one client member, two internal accounts, one with no account.
const STAFF_USER_IDS = ["member-1", "qa-person", "qa-viewer", null];

function staffCountQuery() {
  let rows = STAFF_USER_IDS;
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    or: (filter: string) => {
      const dropped = filter.match(/not\.in\.\((.*)\)$/)?.[1]?.split(",") ?? [];
      rows = rows.filter((id) => id === null || !dropped.includes(id));
      return query;
    },
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ count: rows.length, error: null }).then(resolve),
  };
  return query;
}

async function countFor(viewer: (typeof VIEWERS)[keyof typeof VIEWERS]) {
  requireOrgPermissions.mockResolvedValue({
    orgId: ORG_ID,
    actor: viewer.actor,
    permissions: { isGridmaster: viewer.isGridmaster },
    serviceClient: { from: internalProfilesFrom(INTERNAL_IDS, staffCountQuery) },
  });
  const response = await GET(
    new NextRequest(`http://localhost/api/organization/employee-count?orgId=${ORG_ID}`),
  );
  return ((await response.json()) as { employeeCount: number }).employeeCount;
}

describe("GET /api/organization/employee-count", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts no internal account for a client", async () => {
    expect(await countFor(VIEWERS.client)).toBe(2);
  });

  it("counts everyone for an internal viewer and a Gridmaster", async () => {
    expect(await countFor(VIEWERS.internal)).toBe(4);
    expect(await countFor(VIEWERS.gridmaster)).toBe(4);
  });
});
