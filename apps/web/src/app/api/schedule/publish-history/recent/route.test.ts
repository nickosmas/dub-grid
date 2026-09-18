import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const organizationsSingle = vi.fn();
const publishHistoryOrder = vi.fn();
const publishHistoryLimit = vi.fn();
/** The second, baseline query: publications older than the result for the dates in question. */
const priorPeriodsLimit = vi.fn();

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
          select: vi.fn((columns: string) => {
            if (columns === "start_date, end_date, published_at") {
              const builder = {
                eq: () => builder,
                lte: () => builder,
                gte: () => builder,
                lt: () => builder,
                order: () => builder,
                limit: priorPeriodsLimit,
              };
              return builder;
            }
            return {
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({ order: publishHistoryOrder })),
                lte: vi.fn(() => ({
                  gte: vi.fn(() => ({ order: publishHistoryOrder })),
                })),
              })),
            };
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  organizationsSingle.mockResolvedValue({ data: { timezone: "UTC" } });
  publishHistoryOrder.mockReturnValue({ limit: publishHistoryLimit });
  priorPeriodsLimit.mockResolvedValue({ data: [], error: null });
  publishHistoryLimit.mockResolvedValue({
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
            isNewAddition: false,
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
        noteChanges: [],
        publishedAt: "2026-05-06T17:00:00.000Z",
      },
    ]);
  });

  it("returns published note changes separately from cell changes", async () => {
    const serviceClient = createServiceClient();
    publishHistoryLimit.mockResolvedValue({
      data: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          org_id: ORG_ID,
          published_by: "22222222-2222-4222-8222-222222222222",
          start_date: "2026-05-04",
          end_date: "2026-05-10",
          change_count: 2,
          schedule_publish_changes: [
            {
              emp_id: "emp-1",
              date: "2026-05-04",
              kind: "new",
              from_state: null,
              to_state: {
                type: "note",
                indicatorTypeId: 7,
                focusAreaId: 3,
                indicatorName: "Float",
                indicatorColor: "#ff0000",
              },
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
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      orgId: ORG_ID,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    const response = await GET(makeRequest({ orgId: ORG_ID, since: "2026-05-05T00:00:00.000Z" }));
    const body = await response.json();

    // A note row carries no cell state, so it must not reach the shift-change
    // paths — or it lands on the grid as a "New" with nothing in it.
    expect(body.entries[0].changes).toEqual([]);
    expect(body.entries[0].noteChanges).toEqual([
      {
        empId: "emp-1",
        date: "2026-05-04",
        kind: "new",
        // Only publication of this period, so the note is baseline, not an
        // addition — the same rule its neighbouring shifts follow.
        isNewAddition: false,
        indicatorTypeId: 7,
        focusAreaId: 3,
        indicatorName: "Float",
        indicatorColor: "#ff0000",
        updatedBy: null,
      },
    ]);
  });

  it("marks a note added by a later publish of an already-published date", async () => {
    const serviceClient = createServiceClient();
    const noteRow = {
      emp_id: "emp-1",
      date: "2026-05-04",
      kind: "new",
      from_state: null,
      to_state: {
        type: "note",
        indicatorTypeId: 7,
        focusAreaId: 3,
        indicatorName: "Float",
        indicatorColor: "#ff0000",
      },
      from_absence_type_id: null,
      to_absence_type_id: null,
      updated_by: null,
      from_custom_start: null,
      from_custom_end: null,
      to_custom_start: null,
      to_custom_end: null,
    };
    publishHistoryLimit.mockResolvedValue({
      data: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          org_id: ORG_ID,
          published_by: "22222222-2222-4222-8222-222222222222",
          start_date: "2026-05-04",
          end_date: "2026-05-10",
          change_count: 1,
          schedule_publish_changes: [noteRow],
          published_at: "2026-05-07T17:00:00.000Z",
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          org_id: ORG_ID,
          published_by: "22222222-2222-4222-8222-222222222222",
          start_date: "2026-05-04",
          end_date: "2026-05-10",
          change_count: 0,
          schedule_publish_changes: [],
          published_at: "2026-05-06T17:00:00.000Z",
        },
      ],
      error: null,
    });
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      orgId: ORG_ID,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    const response = await GET(makeRequest({ orgId: ORG_ID, since: "2026-05-05T00:00:00.000Z" }));
    const body = await response.json();

    expect(body.entries[0].noteChanges[0].isNewAddition).toBe(true);
  });

  it("marks a cell added to a week first published before the last visit as an addition", async () => {
    const serviceClient = createServiceClient();
    publishHistoryLimit.mockResolvedValue({
      data: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          org_id: ORG_ID,
          published_by: "22222222-2222-4222-8222-222222222222",
          start_date: "2026-05-04",
          end_date: "2026-05-10",
          change_count: 1,
          schedule_publish_changes: [
            {
              emp_id: "emp-1",
              date: "2026-05-06",
              kind: "new",
              from_state: null,
              to_state: { kind: "worked", segments: [{ shiftId: 1, jobId: 10, position: 0 }] },
              from_absence_type_id: null,
              to_absence_type_id: null,
              updated_by: null,
              from_custom_start: null,
              from_custom_end: null,
              to_custom_start: null,
              to_custom_end: null,
            },
          ],
          published_at: "2026-05-07T17:00:00.000Z",
        },
      ],
      error: null,
    });
    // The week's first publication predates `since`, so it is not in the
    // result; the baseline query is what knows about it.
    priorPeriodsLimit.mockResolvedValue({
      data: [
        {
          start_date: "2026-05-04",
          end_date: "2026-05-10",
          published_at: "2026-05-01T09:00:00.000Z",
        },
      ],
      error: null,
    });
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      orgId: ORG_ID,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    const response = await GET(makeRequest({ orgId: ORG_ID, since: "2026-05-05T00:00:00.000Z" }));
    const body = await response.json();

    expect(body.entries[0].changes[0].isNewAddition).toBe(true);
    expect(priorPeriodsLimit).toHaveBeenCalledTimes(1);
  });

  it("skips the baseline query when every new change already has an older covering row", async () => {
    const serviceClient = createServiceClient();
    publishHistoryLimit.mockResolvedValue({
      data: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          org_id: ORG_ID,
          published_by: "22222222-2222-4222-8222-222222222222",
          start_date: "2026-05-04",
          end_date: "2026-05-10",
          change_count: 1,
          schedule_publish_changes: [
            {
              emp_id: "emp-1",
              date: "2026-05-06",
              kind: "new",
              from_state: null,
              to_state: { kind: "worked", segments: [{ shiftId: 1, jobId: 10, position: 0 }] },
              from_absence_type_id: null,
              to_absence_type_id: null,
              updated_by: null,
              from_custom_start: null,
              from_custom_end: null,
              to_custom_start: null,
              to_custom_end: null,
            },
          ],
          published_at: "2026-05-07T17:00:00.000Z",
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          org_id: ORG_ID,
          published_by: "22222222-2222-4222-8222-222222222222",
          start_date: "2026-05-04",
          end_date: "2026-05-10",
          change_count: 0,
          schedule_publish_changes: [],
          published_at: "2026-05-06T17:00:00.000Z",
        },
      ],
      error: null,
    });
    requireOrgPermissions.mockResolvedValue({
      serviceClient,
      orgId: ORG_ID,
      actor: { id: "user-1" },
      permissions: { canViewSchedule: true },
      userClient: {},
    });

    const response = await GET(makeRequest({ orgId: ORG_ID, since: "2026-05-05T00:00:00.000Z" }));
    const body = await response.json();

    expect(body.entries[0].changes[0].isNewAddition).toBe(true);
    expect(priorPeriodsLimit).not.toHaveBeenCalled();
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
