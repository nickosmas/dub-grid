import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn() } }));
vi.mock("@/features/notifications/server", () => ({ dispatchNotificationEvent: vi.fn() }));

const claimResult = vi.fn();
const existingResult = vi.fn();
const updates: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        const filters: Array<[string, unknown]> = [];
        const chain = {
          eq: (column: string, value: unknown) => (filters.push([column, value]), chain),
          is: (column: string, value: unknown) => (filters.push([`is:${column}`, value]), chain),
          select: () => claimResult(filters),
        };
        return chain;
      },
      select: () => {
        const chain = { eq: () => chain, limit: () => existingResult() };
        return chain;
      },
    }),
  }),
}));

import { claimNewSignIn, signedInRecently } from "./security-alerts";

const now = () => Math.floor(Date.now() / 1000);
const freshClaims = { amr: [{ method: "password", timestamp: now() - 30 }] };

function claim(claims: unknown = freshClaims) {
  return claimNewSignIn({
    userId: "user-1",
    supabaseSessionId: "session-1",
    platform: "web",
    claims,
  });
}

describe("claimNewSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    claimResult.mockResolvedValue({ data: [], error: null });
    existingResult.mockResolvedValue({ data: [{ id: "row" }], error: null });
  });

  // The token hook creates the row at mint with no platform; the first app
  // report fills it. That report, and only that one, is the new sign-in.
  it("treats the report that fills the hook-created row as the new sign-in", async () => {
    claimResult.mockImplementation(async (filters: Array<[string, unknown]>) => {
      expect(filters).toContainEqual(["is:platform", null]);
      expect(filters).toContainEqual(["supabase_session_id", "session-1"]);
      return { data: [{ id: "row" }], error: null };
    });

    await expect(claim()).resolves.toBe(true);
    expect(updates).toEqual([{ platform: "web" }]);
  });

  it("stays quiet when the session was already reported", async () => {
    await expect(claim()).resolves.toBe(false);
  });

  it("treats a session with no row at all as new", async () => {
    existingResult.mockResolvedValue({ data: [], error: null });

    await expect(claim()).resolves.toBe(true);
  });

  it("stays quiet for an old session whose row was recreated by a refresh", async () => {
    claimResult.mockResolvedValue({ data: [{ id: "row" }], error: null });

    await expect(
      claim({ amr: [{ method: "password", timestamp: now() - 3 * 3600 }] }),
    ).resolves.toBe(false);
    expect(updates).toEqual([]);
  });

  it("never blocks sign-in when detection fails", async () => {
    claimResult.mockResolvedValue({ data: null, error: new Error("db down") });

    await expect(claim()).resolves.toBe(false);
  });
});

describe("signedInRecently", () => {
  it("reads the most recent authentication method", () => {
    expect(
      signedInRecently({
        amr: [
          { method: "password", timestamp: now() - 3 * 3600 },
          { method: "totp", timestamp: now() - 20 },
        ],
      }),
    ).toBe(true);
    expect(signedInRecently({})).toBe(false);
    expect(signedInRecently(null)).toBe(false);
  });
});
