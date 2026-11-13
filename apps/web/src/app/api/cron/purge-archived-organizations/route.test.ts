import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const deleteUserAccountWithCleanup = vi.fn();
const isFeatureEnabled = vi.fn(async (_key: string) => true);
const dueQuery = vi.fn();
let dueOrganizations: { data: unknown; error: unknown };
let membershipCounts: Record<string, number>;
let profiles: Record<string, { platform_role: string; is_internal: boolean }>;

function chain(result: () => unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "lte", "order"]) {
    query[method] = (...args: unknown[]) => {
      dueQuery(method, ...args);
      return query;
    };
  }
  query.limit = () => Promise.resolve(result());
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => {
      if (table === "organizations") return chain(() => dueOrganizations);
      if (table === "organization_memberships") {
        return {
          select: () => ({
            eq: (_column: string, userId: string) =>
              Promise.resolve({ count: membershipCounts[userId] ?? 0, error: null }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_column: string, userId: string) => ({
              maybeSingle: () => Promise.resolve({ data: profiles[userId] ?? null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (key: string) => isFeatureEnabled(key),
}));
vi.mock("@/features/account/server/account-deletion", () => ({
  deleteUserAccountWithCleanup: (...args: unknown[]) => deleteUserAccountWithCleanup(...args),
}));

import { GET } from "./route";

const SECRET = "test-cron-secret";

function request(authorization = `Bearer ${SECRET}`) {
  return new NextRequest("http://localhost/api/cron/purge-archived-organizations", {
    headers: { authorization },
  });
}

describe("GET /api/cron/purge-archived-organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    isFeatureEnabled.mockResolvedValue(true);
    dueOrganizations = { data: [{ id: "org-old" }], error: null };
    membershipCounts = {};
    profiles = {
      "only-here": { platform_role: "none", is_internal: false },
      "elsewhere-too": { platform_role: "none", is_internal: false },
      support: { platform_role: "gridmaster", is_internal: true },
    };
    rpc.mockResolvedValue({ data: ["only-here", "elsewhere-too", "support"], error: null });
    deleteUserAccountWithCleanup.mockResolvedValue({ success: true });
  });

  it("refuses a request without the cron secret", async () => {
    const response = await GET(request("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does nothing while its switch is off", async () => {
    isFeatureEnabled.mockResolvedValue(false);

    const response = await GET(request());

    expect(await response.json()).toEqual({ ok: true, skipped: true, reason: "disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("asks only for real organizations deleted at least 90 days ago", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-13T09:00:00Z") });
    await GET(request());
    vi.useRealTimers();

    expect(dueQuery).toHaveBeenCalledWith("eq", "workspace_kind", "real");
    expect(dueQuery).toHaveBeenCalledWith("not", "archived_at", "is", null);
    expect(dueQuery).toHaveBeenCalledWith("lte", "archived_at", "2026-08-15T09:00:00.000Z");
  });

  it("purges each due organization and deletes only accounts it leaves with nothing", async () => {
    membershipCounts["elsewhere-too"] = 1;

    const response = await GET(request());

    expect(rpc).toHaveBeenCalledWith("purge_archived_organization", { p_org_id: "org-old" });
    expect(deleteUserAccountWithCleanup).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        userId: "only-here",
        actorId: null,
        reason: "organization_purged",
      }),
    );
    expect(await response.json()).toEqual({ ok: true, purged: 1, accountsDeleted: 1, failed: 0 });
  });

  it("reports an organization it couldn't purge and carries on", async () => {
    dueOrganizations = { data: [{ id: "org-a" }, { id: "org-b" }], error: null };
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } })
      .mockResolvedValueOnce({ data: [], error: null });

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, purged: 1, accountsDeleted: 0, failed: 1 });
  });

  it("keeps going when one account can't be deleted", async () => {
    rpc.mockResolvedValue({ data: ["only-here", "also-only-here"], error: null });
    profiles["also-only-here"] = { platform_role: "none", is_internal: false };
    deleteUserAccountWithCleanup
      .mockRejectedValueOnce(new Error("auth down"))
      .mockResolvedValueOnce({ success: true });

    const response = await GET(request());

    expect(deleteUserAccountWithCleanup).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({ purged: 1, accountsDeleted: 1 });
  });
});
