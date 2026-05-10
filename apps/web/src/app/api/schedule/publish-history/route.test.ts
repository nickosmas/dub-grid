import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const publishHistoryRange = vi.fn();
const publishHistoryOrder = vi.fn();
const publishHistoryEq = vi.fn();
const profilesIn = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(query: Record<string, string>) {
  const url = new URL("http://localhost/api/schedule/publish-history");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function createServiceClient() {
  const serviceClient = {
    from: vi.fn((table: string) => {
      if (table === "publish_history") {
        return {
          select: vi.fn(() => ({
            eq: publishHistoryEq,
          })),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            in: profilesIn,
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  publishHistoryEq.mockReturnValue({
    order: publishHistoryOrder,
  });
  publishHistoryOrder.mockReturnValue({
    range: publishHistoryRange,
  });

  return serviceClient;
}

describe("GET /api/schedule/publish-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishHistoryRange.mockResolvedValue({
      data: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          published_by: "22222222-2222-4222-8222-222222222222",
          start_date: "2026-05-04",
          end_date: "2026-05-10",
          change_count: 1,
          changes: [
            {
              empId: "emp-1",
              date: "2026-05-04",
              kind: "new",
              to: [10],
            },
          ],
          published_at: "2026-05-06T17:00:00.000Z",
        },
      ],
      error: null,
    });
    profilesIn.mockResolvedValue({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          first_name: "Rae",
          last_name: "Wong",
        },
      ],
      error: null,
    });
  });

  it("loads authorized publish history through org-scoped service queries", async () => {
    const serviceClient = createServiceClient();
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    const response = await GET(
      makeRequest({ orgId: ORG_ID, limit: "5", offset: "10" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledTimes(1);
    expect(serviceClient.from).toHaveBeenCalledWith("publish_history");
    expect(publishHistoryEq).toHaveBeenCalledWith("org_id", ORG_ID);
    expect(publishHistoryOrder).toHaveBeenCalledWith("published_at", {
      ascending: false,
    });
    expect(publishHistoryRange).toHaveBeenCalledWith(10, 14);
    expect(serviceClient.from).toHaveBeenCalledWith("profiles");
    expect(profilesIn).toHaveBeenCalledWith("id", [
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(body.entries).toEqual([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        publishedBy: "22222222-2222-4222-8222-222222222222",
        publishedByName: "Rae Wong",
        startDate: "2026-05-04",
        endDate: "2026-05-10",
        changeCount: 1,
        changes: [
          {
            empId: "emp-1",
            date: "2026-05-04",
            kind: "new",
            to: [10],
          },
        ],
        publishedAt: "2026-05-06T17:00:00.000Z",
      },
    ]);
  });

  it("falls back to Unknown when a publisher profile is missing", async () => {
    const serviceClient = createServiceClient();
    profilesIn.mockResolvedValueOnce({ data: [], error: null });
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    const response = await GET(makeRequest({ orgId: ORG_ID }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries[0].publishedByName).toBe("Unknown");
  });

  it("does not authorize invalid queries", async () => {
    const response = await GET(makeRequest({ orgId: "not-a-uuid" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid query" });
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  it("returns permission responses from the org gate", async () => {
    requireOrgPermissions.mockResolvedValue({
      response: NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      ),
    });

    const response = await GET(makeRequest({ orgId: ORG_ID }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Insufficient permissions" });
  });
});
