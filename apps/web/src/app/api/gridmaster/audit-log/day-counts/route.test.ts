import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeAuditLogRead = vi.fn();

vi.mock("@/lib/audit/authorize", () => ({
  authorizeAuditLogRead: (...args: unknown[]) => authorizeAuditLogRead(...args),
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const START = "2026-08-30T04:00:00.000Z";
const END = "2026-09-06T03:59:59.999Z";

function makeQuery(rows: Array<{ created_at: string }>) {
  // A thenable builder: every filter returns itself, and awaiting it resolves
  // the rows, which is how the PostgREST client behaves.
  const query = {
    select: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return query;
}

function makeRequest(params: Record<string, string>) {
  const search = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/gridmaster/audit-log/day-counts?${search}`);
}

describe("GET /api/gridmaster/audit-log/day-counts", () => {
  let query: ReturnType<typeof makeQuery>;

  beforeEach(() => {
    vi.clearAllMocks();
    query = makeQuery([
      { created_at: "2026-09-04T14:00:00.000Z" },
      { created_at: "2026-09-04T16:00:00.000Z" },
      { created_at: "2026-09-01T16:00:00.000Z" },
    ]);
    authorizeAuditLogRead.mockResolvedValue({
      serviceClient: { from: vi.fn(() => query) },
      audience: "platform",
    });
  });

  it("counts a period's days in the organization's zone", async () => {
    const response = await GET(
      makeRequest({
        orgId: ORG_ID,
        startDate: START,
        endDate: END,
        timeZone: "America/New_York",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      counts: { "2026-09-04": 2, "2026-09-01": 1 },
      total: 3,
      truncated: false,
    });
    expect(query.gte).toHaveBeenCalledWith("created_at", START);
    expect(query.lte).toHaveBeenCalledWith("created_at", END);
    expect(query.eq).toHaveBeenCalledWith("org_id", ORG_ID);
  });

  it("scopes to the platform-wide log when no organization is named", async () => {
    await GET(makeRequest({ startDate: START, endDate: END }));

    expect(authorizeAuditLogRead).toHaveBeenCalledWith(expect.anything(), undefined);
    expect(query.eq).not.toHaveBeenCalledWith("org_id", expect.anything());
  });

  it("applies the category and record-type filters it can", async () => {
    await GET(
      makeRequest({
        orgId: ORG_ID,
        startDate: START,
        endDate: END,
        actionPrefixes: "billing.,role.",
        resourceType: "employee",
      }),
    );

    expect(query.or).toHaveBeenCalledWith("action.like.billing.%,action.like.role.%");
    expect(query.eq).toHaveBeenCalledWith("resource_type", "employee");
  });

  it("counts only org-visible actions for an organization's own admin", async () => {
    authorizeAuditLogRead.mockResolvedValue({
      serviceClient: { from: vi.fn(() => query) },
      audience: "org",
    });

    await GET(makeRequest({ orgId: ORG_ID, startDate: START, endDate: END }));

    expect(query.in).toHaveBeenCalledWith("action", expect.arrayContaining(["shift.created"]));
    const [, actions] = query.in.mock.calls[0] as unknown as [string, string[]];
    expect(actions).not.toContain("impersonation.started");
    expect(actions).not.toContain("security.auth.login");
    expect(query.or).not.toHaveBeenCalled();
  });

  it("returns an empty period to an org admin asking for a platform-only category", async () => {
    authorizeAuditLogRead.mockResolvedValue({
      serviceClient: { from: vi.fn(() => query) },
      audience: "org",
    });

    const response = await GET(
      makeRequest({ orgId: ORG_ID, startDate: START, endDate: END, actionPrefixes: "security." }),
    );

    expect(await response.json()).toEqual({ counts: {}, total: 0, truncated: false });
    expect(query.in).not.toHaveBeenCalled();
    expect(query.select).not.toHaveBeenCalled();
  });

  it("rejects a malformed range or time zone before querying", async () => {
    for (const params of [
      { orgId: ORG_ID, startDate: "yesterday", endDate: END },
      { orgId: ORG_ID, startDate: START },
      { orgId: ORG_ID, startDate: START, endDate: END, timeZone: "Mars/Olympus" },
    ]) {
      const response = await GET(makeRequest(params as Record<string, string>));
      expect(response.status).toBe(400);
    }
    expect(authorizeAuditLogRead).not.toHaveBeenCalled();
  });

  it("passes an authorization failure straight through", async () => {
    authorizeAuditLogRead.mockResolvedValue({
      response: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET(makeRequest({ orgId: ORG_ID, startDate: START, endDate: END }));

    expect(response.status).toBe(403);
  });
});
