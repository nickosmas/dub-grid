import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const SAME_ORG_USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_USER_ID = "33333333-3333-4333-8333-333333333333";

const tableResults = new Map<string, Array<{ data: unknown[]; error: unknown }>>();

function enqueue(table: string, ...results: Array<{ data: unknown[]; error?: unknown }>) {
  tableResults.set(
    table,
    results.map((result) => ({
      data: result.data,
      error: result.error ?? null,
    })),
  );
}

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      const result =
        tableResults.get(table)?.shift() ?? { data: [], error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

function makeRequest(ids: string[]) {
  return new NextRequest("http://localhost/api/schedule/actor-names", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orgId: ORG_ID, ids }),
  });
}

describe("POST /api/schedule/actor-names", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults.clear();
    serviceFrom.mockImplementation((table: string) => makeQuery(table));
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "viewer-user" },
      permissions: { canViewSchedule: true },
      serviceClient: { from: serviceFrom },
    });
  });

  it("resolves names only for profile ids linked to the requested org", async () => {
    enqueue("organization_memberships", {
      data: [{ user_id: SAME_ORG_USER_ID }],
    });
    enqueue(
      "employees",
      { data: [] },
      { data: [] },
    );
    enqueue("audit_log", { data: [] });
    enqueue("publish_history", { data: [] });
    enqueue("profiles", {
      data: [
        {
          id: SAME_ORG_USER_ID,
          first_name: "Ada",
          last_name: "Lovelace",
        },
      ],
    });

    const response = await POST(
      makeRequest([SAME_ORG_USER_ID, OTHER_ORG_USER_ID]),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      names: {
        [SAME_ORG_USER_ID]: "Ada Lovelace",
      },
    });
  });

  it("returns no name for arbitrary cross-org ids", async () => {
    enqueue("organization_memberships", { data: [] });
    enqueue("employees", { data: [] });
    enqueue("audit_log", { data: [] });
    enqueue("publish_history", { data: [] });

    const response = await POST(makeRequest([OTHER_ORG_USER_ID]));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ names: {} });
    expect(serviceFrom).not.toHaveBeenCalledWith("profiles");
  });
});
