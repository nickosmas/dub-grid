import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { RealtimeChangePayload } from "@dubgrid/realtime-core";
import {
  createGridmasterInvalidationBatcher,
  getGridmasterRealtimeInvalidationKeys,
  resolveGridmasterRealtimeOrgId,
  resolveGridmasterRealtimeUserId,
  useGridmasterRealtimeInvalidation,
  type GridmasterRealtimeTable,
} from "@/hooks/useGridmasterRealtimeInvalidation";
import { queryKeys } from "@/lib/query-keys";

type Listener = {
  table: GridmasterRealtimeTable;
  onEvent: (table: GridmasterRealtimeTable, payload: RealtimeChangePayload) => void;
};

const { mockBroadcast, mockUnsubscribe, subscription } = vi.hoisted(() => ({
  mockBroadcast: vi.fn(),
  mockUnsubscribe: vi.fn(),
  subscription: { listeners: [] as Listener[] },
}));

vi.mock("@/lib/cache-broadcast", () => ({
  broadcastInvalidation: (...args: unknown[]) => mockBroadcast(...args),
}));

vi.mock("@/features/account/client", () => ({
  getBrowserSupabaseClient: () => ({}),
}));

vi.mock("@dubgrid/realtime-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dubgrid/realtime-core")>()),
  subscribeToPostgresChanges: (_client: unknown, _name: string, listeners: Listener[]) => {
    subscription.listeners = listeners;
    return mockUnsubscribe;
  },
}));

const orgId = "11111111-1111-4111-8111-111111111111";

describe("getGridmasterRealtimeInvalidationKeys", () => {
  it("refreshes platform and selected organization data for organization changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("organizations", orgId)).toEqual([
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.billing(),
      queryKeys.gridmaster.compliance(),
      queryKeys.gridmaster.org(orgId),
      queryKeys.gridmaster.orgHealth(orgId),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
    ]);
  });

  it("refreshes billing summaries and derived risk views for subscription changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("subscriptions", orgId)).toEqual([
      queryKeys.gridmaster.billing(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.orgHealth(orgId),
    ]);
  });

  it("refreshes every audit-log page through the audit prefix", () => {
    expect(getGridmasterRealtimeInvalidationKeys("audit_log", orgId)).toEqual([
      queryKeys.gridmaster.auditAll(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.security(),
      queryKeys.gridmaster.compliance(),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
    ]);
  });

  it("refreshes impersonation history, compliance/security summaries, and every audit page", () => {
    expect(getGridmasterRealtimeInvalidationKeys("impersonation_sessions", orgId)).toEqual([
      queryKeys.gridmaster.impersonation(),
      queryKeys.gridmaster.security(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.compliance(),
      queryKeys.gridmaster.auditAll(),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
    ]);
  });

  it("refreshes every audit-log page through the audit prefix for role changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("role_change_log", orgId)).toEqual([
      queryKeys.gridmaster.auditAll(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.security(),
      queryKeys.gridmaster.compliance(),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
    ]);
  });

  it("refreshes the security sessions view and compliance summary for session changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("user_sessions", orgId)).toEqual([
      queryKeys.gridmaster.security(),
      queryKeys.gridmaster.compliance(),
      queryKeys.gridmaster.personAll(),
    ]);
  });

  it("refreshes the accounts and all-users views for profile changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("profiles", orgId)).toEqual([
      queryKeys.gridmaster.accounts(),
      queryKeys.gridmaster.allUsers(),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.personAll(),
    ]);
  });

  it("refreshes the affected person's record when a userId is resolved", () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    expect(
      getGridmasterRealtimeInvalidationKeys("organization_memberships", orgId, userId),
    ).toEqual([
      queryKeys.gridmaster.allUsers(),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.orgUsers(orgId),
      queryKeys.gridmaster.orgHealth(orgId),
      queryKeys.gridmaster.person("user", userId),
    ]);
  });

  it("refreshes invitations through the audit prefix as well", () => {
    expect(getGridmasterRealtimeInvalidationKeys("invitations", orgId)).toEqual([
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.auditAll(),
      queryKeys.gridmaster.personAll(),
      queryKeys.gridmaster.orgInvitations(orgId),
      queryKeys.gridmaster.orgHealth(orgId),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
    ]);
  });

  it("refreshes the org's live schedule view and the platform dashboard for schedule cell changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("schedule_cells", orgId)).toEqual([
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.org(orgId),
      queryKeys.gridmaster.orgHealth(orgId),
      queryKeys.gridmaster.orgScheduleAll(orgId),
    ]);
  });

  it("refreshes organization detail, config, and oversight data for settings tables", () => {
    expect(getGridmasterRealtimeInvalidationKeys("jobs", orgId)).toEqual([
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.org(orgId),
      queryKeys.gridmaster.orgConfig(orgId),
      queryKeys.gridmaster.orgHealth(orgId),
    ]);
  });
});

describe("resolveGridmasterRealtimeOrgId", () => {
  it("uses id for organization rows", () => {
    expect(
      resolveGridmasterRealtimeOrgId("organizations", {
        new: { id: orgId },
      }),
    ).toBe(orgId);
  });

  it("uses target_org_id for impersonation rows", () => {
    expect(
      resolveGridmasterRealtimeOrgId("impersonation_sessions", {
        new: { target_org_id: orgId },
      }),
    ).toBe(orgId);
  });

  it("falls back to old row data for deletes", () => {
    expect(
      resolveGridmasterRealtimeOrgId("employees", {
        old: { org_id: orgId },
      }),
    ).toBe(orgId);
  });
});

describe("resolveGridmasterRealtimeUserId", () => {
  const userId = "22222222-2222-4222-8222-222222222222";

  it("resolves user_id for organization_memberships rows", () => {
    expect(
      resolveGridmasterRealtimeUserId("organization_memberships", {
        new: { user_id: userId },
      }),
    ).toBe(userId);
  });

  it("returns null for tables with no per-user invalidation target", () => {
    expect(
      resolveGridmasterRealtimeUserId("invitations", {
        new: { user_id: userId },
      }),
    ).toBeNull();
  });

  it("refreshes every open person page when a change names no one", () => {
    expect(getGridmasterRealtimeInvalidationKeys("employees", orgId)).toContainEqual(
      queryKeys.gridmaster.personAll(),
    );
  });

  it("refreshes only the named person's page when it can", () => {
    const userId = "33333333-3333-4333-8333-333333333333";
    for (const table of ["user_sessions", "profiles", "employees"] as const) {
      const keys = getGridmasterRealtimeInvalidationKeys(table, orgId, userId);
      expect(keys).toContainEqual(queryKeys.gridmaster.person("user", userId));
      expect(keys).not.toContainEqual(queryKeys.gridmaster.personAll());
    }
  });

  it("finds the person in session, profile and staff changes", () => {
    const userId = "33333333-3333-4333-8333-333333333333";
    expect(resolveGridmasterRealtimeUserId("user_sessions", { new: { user_id: userId } })).toBe(
      userId,
    );
    expect(resolveGridmasterRealtimeUserId("profiles", { old: { id: userId } })).toBe(userId);
    expect(resolveGridmasterRealtimeUserId("employees", { new: { user_id: null } })).toBeNull();
    expect(resolveGridmasterRealtimeUserId("invitations", { new: { user_id: userId } })).toBeNull();
  });
});

describe("Gridmaster realtime batching", () => {
  const otherOrg = "22222222-2222-4222-8222-222222222222";
  let queryClient: QueryClient;
  let invalidate: MockInstance<QueryClient["invalidateQueries"]>;

  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);

  beforeEach(() => {
    vi.useFakeTimers();
    mockBroadcast.mockClear();
    mockUnsubscribe.mockClear();
    subscription.listeners = [];
    queryClient = new QueryClient();
    invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fire(table: GridmasterRealtimeTable, row: Record<string, unknown>) {
    const listener = subscription.listeners.find((entry) => entry.table === table);
    listener?.onEvent(table, { new: row });
  }

  it("refreshes each key once per burst, after the window and not before", () => {
    const batcher = createGridmasterInvalidationBatcher(queryClient);
    for (let row = 0; row < 50; row += 1) {
      batcher.markChanged("employees", orgId, null);
      batcher.markChanged("invitations", otherOrg, null);
    }

    vi.advanceTimersByTime(149);
    expect(invalidate).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    const expected = new Set(
      [
        ...getGridmasterRealtimeInvalidationKeys("employees", orgId),
        ...getGridmasterRealtimeInvalidationKeys("invitations", otherOrg),
      ].map((key) => JSON.stringify(key)),
    );
    expect(invalidate).toHaveBeenCalledTimes(expected.size);
    expect(new Set(invalidatedKeys().map((key) => JSON.stringify(key)))).toEqual(expected);
    expect(mockBroadcast).toHaveBeenCalledTimes(expected.size);
    // Shared by both tables, so one refresh however many rows changed.
    expect(
      invalidatedKeys().filter(
        (key) => JSON.stringify(key) === JSON.stringify(queryKeys.gridmaster.overview()),
      ),
    ).toHaveLength(1);
  });

  it("starts a new batch for changes after a flush", () => {
    const batcher = createGridmasterInvalidationBatcher(queryClient);
    batcher.markChanged("audit_log", null, null);
    vi.advanceTimersByTime(150);
    const first = invalidate.mock.calls.length;

    batcher.markChanged("audit_log", null, null);
    vi.advanceTimersByTime(150);
    expect(invalidate.mock.calls.length).toBe(first * 2);
  });

  it("batches the live subscription's row events", () => {
    renderHook(() => useGridmasterRealtimeInvalidation({ enabled: true, queryClient }));
    for (let row = 0; row < 20; row += 1) {
      fire("employees", { org_id: orgId, user_id: null });
    }
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(invalidate).toHaveBeenCalledTimes(
      getGridmasterRealtimeInvalidationKeys("employees", orgId).length,
    );
  });

  it("drops a pending batch when the subscription is torn down", () => {
    const { unmount } = renderHook(() =>
      useGridmasterRealtimeInvalidation({ enabled: true, queryClient }),
    );
    fire("organizations", { id: orgId });
    unmount();

    vi.advanceTimersByTime(1_000);
    expect(invalidate).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
