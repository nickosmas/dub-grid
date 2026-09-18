import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUserWithClaims = vi.fn();
const createRequestSupabaseClient = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
  createRequestSupabaseClient: (req: NextRequest) => createRequestSupabaseClient(req),
}));

vi.mock("../route", () => ({
  // Echo the row back unchanged so the test can read the query path,
  // not the mapping.
  mapNotificationRow: (row: unknown) => row,
}));

import { POST } from "./route";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/notifications/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface MockBuilder {
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => unknown;
}

function makeBuilder(): MockBuilder {
  const builder = {} as MockBuilder;
  const passthrough = vi.fn(() => builder);
  builder.eq = passthrough;
  builder.is = passthrough;
  builder.not = passthrough;
  builder.or = passthrough;
  builder.order = passthrough;
  builder.limit = passthrough;
  builder.then = (resolve) => resolve({ data: [], error: null });
  return builder;
}

describe("POST /api/notifications/search org-scoping", () => {
  let builder: MockBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: USER_ID },
      session: { access_token: "test-token" },
      claims: { sub: USER_ID, org_id: ORG_ID },
    });

    builder = makeBuilder();
    createRequestSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({ select: vi.fn(() => builder) })),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  it("restricts results to the caller's session org_id OR platform notifications", async () => {
    // Cross-org leak guard: a user belonging to org A and org B used to be
    // able to read both orgs' notifications by hitting search from either
    // session. We now scope by claims.org_id with an OR for null (platform
    // notifications, e.g. gridmaster org-lifecycle events).
    const response = await POST(makeRequest({ limit: 10 }));
    expect(response.status).toBe(200);

    expect(builder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(builder.eq).toHaveBeenCalledWith("channel", "in_app");
    expect(builder.or).toHaveBeenCalledWith(`org_id.eq.${ORG_ID},org_id.is.null`);
  });

  it("restricts to platform-only when the caller has no current org", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { access_token: "test-token" },
      claims: { sub: USER_ID, org_id: null },
    });

    const response = await POST(makeRequest({ limit: 10 }));
    expect(response.status).toBe(200);

    expect(builder.is).toHaveBeenCalledWith("org_id", null);
    expect(builder.or).not.toHaveBeenCalledWith(expect.stringContaining("org_id.eq."));
  });
});

describe("POST /api/notifications/search by id", () => {
  const NOTIFICATION_ID = "22222222-2222-4222-8222-222222222222";
  let calls: Array<[string, ...unknown[]]>;

  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: USER_ID },
      session: { access_token: "test-token" },
      claims: { sub: USER_ID, org_id: ORG_ID },
    });

    // Distinct spies per method so a filter that must be skipped is provable.
    calls = [];
    const builder = {} as MockBuilder;
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        calls.push([name, ...args]);
        return builder;
      };
    builder.eq = vi.fn(record("eq"));
    builder.is = vi.fn(record("is"));
    builder.not = vi.fn(record("not"));
    builder.or = vi.fn(record("or"));
    builder.order = vi.fn(record("order"));
    builder.limit = vi.fn(record("limit"));
    builder.then = (resolve) => resolve({ data: [], error: null });
    createRequestSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({ select: vi.fn(() => builder) })),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  it("scopes the id lookup to the caller and skips the inbox filters", async () => {
    const response = await POST(
      makeRequest({ id: NOTIFICATION_ID, read: "unread", includeArchived: false, search: "x" }),
    );
    expect(response.status).toBe(200);

    expect(calls).toContainEqual(["eq", "user_id", USER_ID]);
    expect(calls).toContainEqual(["eq", "channel", "in_app"]);
    expect(calls).toContainEqual(["or", `org_id.eq.${ORG_ID},org_id.is.null`]);
    expect(calls).toContainEqual(["eq", "id", NOTIFICATION_ID]);
    expect(calls).toContainEqual(["limit", 1]);
    expect(calls.filter(([name]) => name === "is")).toEqual([]);
    expect(calls.filter(([name]) => name === "not")).toEqual([]);
    expect(calls.filter(([name, arg]) => name === "or" && String(arg).includes("ilike"))).toEqual(
      [],
    );
  });

  it("rejects a malformed id", async () => {
    const response = await POST(makeRequest({ id: "not-a-uuid" }));
    expect(response.status).toBe(400);
  });
});
