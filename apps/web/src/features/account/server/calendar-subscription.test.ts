// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const getServiceClient = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));

import {
  CalendarSubscriptionError,
  createCalendarFeedToken,
  getCalendarSubscriptionStatus,
  getLinkedCalendarEmployee,
  hashCalendarFeedToken,
  issueCalendarSubscription,
  isCalendarFeedToken,
  resolveCalendarFeed,
  revokeCalendarSubscription,
} from "./calendar-subscription";

interface QueryResult {
  data: unknown;
  error: null | { code?: string; message?: string };
}

interface QueryCall {
  table: string;
  method: string;
  args: unknown[];
}

function makeClient(responses: Record<string, QueryResult[]>) {
  const calls: QueryCall[] = [];
  const client = {
    from(table: string) {
      const result = responses[table]?.shift() ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "not", "update", "insert"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      builder.maybeSingle = async () => result;
      builder.then = (resolvePromise: (value: QueryResult) => unknown) =>
        Promise.resolve(result).then(resolvePromise);
      return builder;
    },
  };
  return { client, calls };
}

const EMPLOYEE = {
  id: "employee-1",
  org_id: "org-1",
  user_id: "user-1",
  first_name: "Avery",
  last_name: "Stone",
};

function activeScopeResponses(token: QueryResult = { data: null, error: null }) {
  return {
    employees: [{ data: EMPLOYEE, error: null }],
    organization_memberships: [{ data: { id: 1 }, error: null }],
    organizations: [{ data: { id: "org-1", timezone: "America/Los_Angeles" }, error: null }],
    profiles: [{ data: { id: "user-1" }, error: null }],
    calendar_feed_tokens: [token],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("calendar feed tokens", () => {
  it("creates a random opaque token and stores a different SHA-256 representation", () => {
    const token = createCalendarFeedToken();
    const hash = hashCalendarFeedToken(token);

    expect(isCalendarFeedToken(token)).toBe(true);
    expect(token).toHaveLength(43);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("carries the organization's timezone into the resolved employee scope", async () => {
    const { client, calls } = makeClient(activeScopeResponses());
    getServiceClient.mockReturnValue(client);

    await expect(getLinkedCalendarEmployee("user-1", "org-1")).resolves.toMatchObject({
      id: "employee-1",
      orgId: "org-1",
      timeZone: "America/Los_Angeles",
    });
    expect(calls).toContainEqual({
      table: "organizations",
      method: "select",
      args: ["id, timezone"],
    });
  });

  it("returns subscription status without disclosing the token hash", async () => {
    const row = {
      id: "feed-1",
      user_id: "user-1",
      org_id: "org-1",
      employee_id: "employee-1",
      token_hash: "a".repeat(64),
      issued_at: "2026-09-01T00:00:00.000Z",
      revoked_at: null,
    };
    const { client } = makeClient(activeScopeResponses({ data: row, error: null }));
    getServiceClient.mockReturnValue(client);

    const status = await getCalendarSubscriptionStatus("user-1", "org-1");

    expect(status).toEqual({ active: true, issuedAt: row.issued_at });
    expect(JSON.stringify(status)).not.toContain(row.token_hash);
  });

  it("rotates only the active token in the caller's exact scope", async () => {
    const current = {
      id: "feed-1",
      user_id: "user-1",
      org_id: "org-1",
      employee_id: "employee-1",
      token_hash: "b".repeat(64),
      issued_at: "2026-08-01T00:00:00.000Z",
      revoked_at: null,
    };
    const responses = activeScopeResponses({ data: current, error: null });
    responses.calendar_feed_tokens.push({ data: { issued_at: "new" }, error: null });
    const { client, calls } = makeClient(responses);
    getServiceClient.mockReturnValue(client);

    const issued = await issueCalendarSubscription("user-1", "org-1", "rotate");

    expect(isCalendarFeedToken(issued.rawToken)).toBe(true);
    expect(calls).toContainEqual({
      table: "calendar_feed_tokens",
      method: "eq",
      args: ["token_hash", current.token_hash],
    });
    const update = calls.find(
      (call) => call.table === "calendar_feed_tokens" && call.method === "update",
    );
    expect(update?.args[0]).toMatchObject({
      token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      revoked_at: null,
    });
    expect(JSON.stringify(update?.args[0])).not.toContain(issued.rawToken);
  });

  it("revokes only the linked employee token for the caller's organization", async () => {
    const responses = activeScopeResponses();
    responses.calendar_feed_tokens = [{ data: { id: "feed-1" }, error: null }];
    const { client, calls } = makeClient(responses);
    getServiceClient.mockReturnValue(client);

    await revokeCalendarSubscription("user-1", "org-1");

    expect(calls).toContainEqual({
      table: "calendar_feed_tokens",
      method: "eq",
      args: ["user_id", "user-1"],
    });
    expect(calls).toContainEqual({
      table: "calendar_feed_tokens",
      method: "eq",
      args: ["org_id", "org-1"],
    });
    expect(calls).toContainEqual({
      table: "calendar_feed_tokens",
      method: "eq",
      args: ["employee_id", "employee-1"],
    });
  });

  it("rejects a token when its employee is not active and linked in the same organization", async () => {
    const token = createCalendarFeedToken();
    const tokenRow = { user_id: "user-1", org_id: "org-1", employee_id: "employee-1" };
    const { client, calls } = makeClient({
      calendar_feed_tokens: [{ data: tokenRow, error: null }],
      employees: [{ data: null, error: null }],
      organization_memberships: [{ data: { id: 1 }, error: null }],
      organizations: [{ data: { id: "org-1", timezone: "America/Los_Angeles" }, error: null }],
      profiles: [{ data: { id: "user-1" }, error: null }],
    });
    getServiceClient.mockReturnValue(client);

    await expect(resolveCalendarFeed(token)).resolves.toBeNull();
    expect(calls).toContainEqual({
      table: "employees",
      method: "eq",
      args: ["org_id", "org-1"],
    });
    expect(calls).toContainEqual({
      table: "employees",
      method: "eq",
      args: ["id", "employee-1"],
    });
  });

  it("does not query account details for malformed or revoked tokens", async () => {
    const { client, calls } = makeClient({
      calendar_feed_tokens: [{ data: null, error: null }],
    });
    getServiceClient.mockReturnValue(client);

    await expect(resolveCalendarFeed("not-a-token")).resolves.toBeNull();
    await expect(resolveCalendarFeed(createCalendarFeedToken())).resolves.toBeNull();
    expect(calls.some((call) => call.table === "employees")).toBe(false);
  });

  it("does not silently create over an active subscription", async () => {
    const current = {
      id: "feed-1",
      user_id: "user-1",
      org_id: "org-1",
      employee_id: "employee-1",
      token_hash: "c".repeat(64),
      issued_at: "2026-08-01T00:00:00.000Z",
      revoked_at: null,
    };
    const { client } = makeClient(activeScopeResponses({ data: current, error: null }));
    getServiceClient.mockReturnValue(client);

    await expect(issueCalendarSubscription("user-1", "org-1", "create")).rejects.toEqual(
      expect.objectContaining<Partial<CalendarSubscriptionError>>({ code: "already_active" }),
    );
  });
});
