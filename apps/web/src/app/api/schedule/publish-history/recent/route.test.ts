import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const organizationsSingle = vi.fn();
const publishHistoryOrder = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(query: Record<string, string>) {
  const url = new URL("http://localhost/api/schedule/publish-history/recent");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function createServiceClient() {
  const serviceClient = {
    from: vi.fn((table: string) => {
      if (table === "organizations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: organizationsSingle })),
          })),
        };
      }
      if (table === "publish_history") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                gte: vi.fn(() => ({ order: publishHistoryOrder })),
              })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  organizationsSingle.mockResolvedValue({ data: { timezone: "UTC" } });
  publishHistoryOrder.mockResolvedValue({
    data: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        org_id: ORG_ID,
        published_by: "22222222-2222-4222-8222-222222222222",
        start_date: "2026-05-04",
        end_date: "2026-05-10",
        change_count: 1,
        schedule_publish_changes: [
          {
            emp_id: "emp-1",
            date: "2026-05-04",
            kind: "new",
            from_state: null,
            to_state: null,
            from_absence_type_id: null,
            to_absence_type_id: null,
            updated_by: null,
            from_custom_start: null,
            from_custom_end: null,
            to_custom_start: null,
            to_custom_end: null,
          },
        ],
        published_at: "2026-05-06T17:00:00.000Z",
      },
    ],
    error: null,
  });

  return serviceClient;
}

describe("GET /api/schedule/publish-history/recent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no entries and skips the publish_history query when there is no last-viewed baseline", async () => {
    const serviceClient = createServiceClient();
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      orgId: ORG_ID,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    const response = await GET(makeRequest({ orgId: ORG_ID }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ entries: [] });
    expect(serviceClient.from).not.toHaveBeenCalled();
  });

  it("loads publish history since the given timestamp", async () => {
    const serviceClient = createServiceClient();
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      orgId: ORG_ID,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    const response = await GET(makeRequest({ orgId: ORG_ID, since: "2026-05-05T00:00:00.000Z" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(serviceClient.from).toHaveBeenCalledWith("publish_history");
    expect(body.entries).toEqual([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        publishedBy: "22222222-2222-4222-8222-222222222222",
        startDate: "2026-05-04",
        endDate: "2026-05-10",
        changeCount: 1,
        changes: [
          {
            empId: "emp-1",
            date: "2026-05-04",
            kind: "new",
            fromState: null,
            toState: null,
            fromAbsenceTypeId: null,
            toAbsenceTypeId: null,
            updatedBy: null,
            fromCustomStart: null,
            fromCustomEnd: null,
            toCustomStart: null,
            toCustomEnd: null,
          },
        ],
        publishedAt: "2026-05-06T17:00:00.000Z",
      },
    ]);
  });

  it("does not authorize invalid queries", async () => {
    const response = await GET(makeRequest({ orgId: "not-a-uuid" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: API_ERRORS.INVALID_REQUEST });
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  it("returns permission responses from the org gate", async () => {
    requireOrgPermissions.mockResolvedValue({
      response: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
    });

    const response = await GET(makeRequest({ orgId: ORG_ID }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Insufficient permissions" });
  });
});
