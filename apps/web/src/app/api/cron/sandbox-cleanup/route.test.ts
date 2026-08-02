import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const selectEq = vi.fn();
const selectNot = vi.fn();
const selectLt = vi.fn();
const deleteIn = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table !== "organizations") throw new Error(`Unexpected table: ${table}`);
      return {
        select: vi.fn(() => ({
          eq: (...args: unknown[]) => {
            selectEq(...args);
            return {
              not: (...notArgs: unknown[]) => {
                selectNot(...notArgs);
                return {
                  lt: (...ltArgs: unknown[]) => {
                    selectLt(...ltArgs);
                    return selectResult;
                  },
                };
              },
            };
          },
        })),
        delete: vi.fn(() => ({
          in: (...args: unknown[]) => deleteIn(...args),
        })),
      };
    },
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));

const isFeatureEnabled = vi.fn(async (_key: string) => true);
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (key: string) => isFeatureEnabled(key),
}));

import { GET } from "./route";

const SECRET = "test-cron-secret";
let selectResult: { data: unknown; error: unknown };

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/sandbox-cleanup", { headers });
}

describe("GET /api/cron/sandbox-cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    isFeatureEnabled.mockResolvedValue(true);
    selectResult = { data: [], error: null };
    deleteIn.mockResolvedValue({ error: null });
  });

  it("rejects requests without the bearer token", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it("returns 503 when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it("returns 200 skipped (not 503) when intentionally disabled via kill switch", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, skipped: true, reason: "disabled" });
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it("only ever queries workspace_kind='sandbox' with a non-null owner", async () => {
    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(200);
    expect(selectEq).toHaveBeenCalledWith("workspace_kind", "sandbox");
    // Defense in depth: never delete a row missing an owner, even though no
    // current code path can produce one.
    expect(selectNot).toHaveBeenCalledWith("sandbox_owner_user_id", "is", null);
    expect(selectLt).toHaveBeenCalledWith("created_at", expect.any(String));
  });

  it("does not call delete when nothing is stale", async () => {
    selectResult = { data: [], error: null };

    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, deleted: 0 });
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it("deletes exactly the stale sandbox org ids returned by the query", async () => {
    selectResult = {
      data: [{ id: "sandbox-org-1" }, { id: "sandbox-org-2" }],
      error: null,
    };

    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(200);
    expect(deleteIn).toHaveBeenCalledWith("id", ["sandbox-org-1", "sandbox-org-2"]);
    await expect(res.json()).resolves.toEqual({ ok: true, deleted: 2 });
  });

  it("returns 500 when the select query fails", async () => {
    selectResult = { data: null, error: new Error("boom") };

    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(500);
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it("returns 500 when the delete fails", async () => {
    selectResult = { data: [{ id: "sandbox-org-1" }], error: null };
    deleteIn.mockResolvedValueOnce({ error: new Error("boom") });

    const res = await GET(makeReq({ authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(500);
  });
});
