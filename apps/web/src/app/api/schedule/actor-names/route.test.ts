import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: () => null,
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom }),
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER_ID = "44444444-4444-4444-8444-444444444444";
const SAME_ORG_USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_USER_ID = "33333333-3333-4333-8333-333333333333";

// Each table gets a queue of results; the query builder is both awaitable
// (profiles/employees end on `.in(...)`) and supports `.maybeSingle()` (the
// viewer-membership access check). organization_memberships is queried
// twice per request now (viewer access check, then the ids-scoping query),
// so tests that use it enqueue two results in order.
const tableResults = new Map<string, Array<{ data: unknown; error: unknown }>>();
// Records the args passed to `.in(...)` per table, in call order, so tests
// can assert which ids actually reached a given table's query.
const inCalls = new Map<string, unknown[][]>();

function enqueue(table: string, ...results: Array<{ data: unknown; error?: unknown }>) {
  tableResults.set(
    table,
    results.map((result) => ({ data: result.data, error: result.error ?? null })),
  );
}

function nextResult(table: string) {
  return tableResults.get(table)?.shift() ?? { data: null, error: null };
}

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn((_column: string, values: unknown[]) => {
      const calls = inCalls.get(table) ?? [];
      calls.push(values);
      inCalls.set(table, calls);
      return query;
    }),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(nextResult(table))),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(nextResult(table)).then(resolve, reject),
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
    inCalls.clear();
    serviceFrom.mockImplementation((table: string) => makeQuery(table));
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: VIEWER_ID, email: "viewer@example.com" },
      session: { access_token: "test-token" },
      claims: { sub: VIEWER_ID, org_id: ORG_ID, platform_role: "none" },
    });
  });

  it("resolves names only for profile ids found for the requested org", async () => {
    // Viewer is a member of the org -> access granted. Second result is the
    // ids-scoping query: only the same-org id is an active member.
    enqueue(
      "organization_memberships",
      { data: { user_id: VIEWER_ID } },
      { data: [{ user_id: SAME_ORG_USER_ID }] },
    );
    enqueue("profiles", {
      data: [{ id: SAME_ORG_USER_ID, first_name: "Ada", last_name: "Lovelace" }],
    });
    // The unresolved (cross-org) id is not found among the org's employees.
    enqueue("employees", { data: [] });

    const response = await POST(makeRequest([SAME_ORG_USER_ID, OTHER_ORG_USER_ID]));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      names: { [SAME_ORG_USER_ID]: "Ada Lovelace" },
    });
  });

  it("never queries profiles with a cross-org id, even if the caller requests one", async () => {
    // The ids-scoping query only reports SAME_ORG_USER_ID as a member —
    // OTHER_ORG_USER_ID must never reach the profiles.in(...) call.
    enqueue(
      "organization_memberships",
      { data: { user_id: VIEWER_ID } },
      { data: [{ user_id: SAME_ORG_USER_ID }] },
    );
    enqueue("profiles", {
      data: [{ id: SAME_ORG_USER_ID, first_name: "Ada", last_name: "Lovelace" }],
    });
    enqueue("employees", { data: [] });

    await POST(makeRequest([SAME_ORG_USER_ID, OTHER_ORG_USER_ID]));

    const profilesInCalls = inCalls.get("profiles") ?? [];
    expect(profilesInCalls).toHaveLength(1);
    expect(profilesInCalls[0]).toEqual([SAME_ORG_USER_ID]);
    expect(profilesInCalls[0]).not.toContain(OTHER_ORG_USER_ID);
  });

  it("returns no name for arbitrary ids the org has no record of", async () => {
    enqueue("organization_memberships", { data: { user_id: VIEWER_ID } }, { data: [] });
    enqueue("profiles", { data: [] });
    enqueue("employees", { data: [] });

    const response = await POST(makeRequest([OTHER_ORG_USER_ID]));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ names: {} });
    // No org members among the requested ids -> profiles is never queried.
    expect(inCalls.get("profiles") ?? []).toHaveLength(0);
  });

  it("forbids a non-gridmaster viewer who is not a member of the org", async () => {
    enqueue("organization_memberships", { data: null });

    const response = await POST(makeRequest([SAME_ORG_USER_ID]));

    expect(response.status).toBe(403);
    expect(serviceFrom).not.toHaveBeenCalledWith("profiles");
  });
});
