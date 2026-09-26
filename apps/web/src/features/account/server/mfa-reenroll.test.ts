// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileRead = vi.fn();
const getUserById = vi.fn();
const clearCalls: { filters: [string, string, unknown][] }[] = [];
let flaggedAt: string | null = null;

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => profileRead() }) }),
      update: () => {
        const call = { filters: [] as [string, string, unknown][] };
        clearCalls.push(call);
        const builder = {
          eq: (column: string, value: unknown) => {
            call.filters.push(["eq", column, value]);
            return builder;
          },
          lt: (column: string, value: string) => {
            call.filters.push(["lt", column, value]);
            return builder;
          },
          // Clears only when the stored flag is older than the factor.
          select: async () => {
            const bound = call.filters.find(([op]) => op === "lt")?.[2] as string;
            return { data: flaggedAt && flaggedAt < bound ? [{ id: "user-1" }] : [], error: null };
          },
        };
        return builder;
      },
    }),
    auth: { admin: { getUserById: (id: string) => getUserById(id) } },
  }),
}));

import { resolveMfaReenrollRequired, settleMfaReenrollment } from "./mfa-reenroll";

const RESET_AT = "2026-09-26T10:00:00.000Z";
const verified = (createdAt: string) => ({
  factor_type: "totp",
  status: "verified",
  created_at: createdAt,
});

describe("two-factor re-enrollment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCalls.length = 0;
    flaggedAt = RESET_AT;
  });

  it("is not required with no reset pending, without asking Auth", async () => {
    profileRead.mockResolvedValue({ data: { mfa_reenroll_required_at: null }, error: null });
    expect(await resolveMfaReenrollRequired("user-1")).toBe(false);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("is required after a reset with no verified factor", async () => {
    profileRead.mockResolvedValue({ data: { mfa_reenroll_required_at: RESET_AT }, error: null });
    getUserById.mockResolvedValue({ data: { user: { factors: [] } }, error: null });
    expect(await resolveMfaReenrollRequired("user-1")).toBe(true);
    expect(clearCalls).toHaveLength(0);
  });

  it("is settled by a factor verified after the reset", async () => {
    profileRead.mockResolvedValue({ data: { mfa_reenroll_required_at: RESET_AT }, error: null });
    getUserById.mockResolvedValue({
      data: { user: { factors: [verified("2026-09-26T11:00:00.000Z")] } },
      error: null,
    });
    expect(await resolveMfaReenrollRequired("user-1")).toBe(false);
    expect(clearCalls[0]!.filters).toEqual([
      ["eq", "id", "user-1"],
      ["lt", "mfa_reenroll_required_at", "2026-09-26T11:00:00.000Z"],
    ]);
  });

  it("is never settled by a factor from before the reset, still listed mid-reset", async () => {
    profileRead.mockResolvedValue({ data: { mfa_reenroll_required_at: RESET_AT }, error: null });
    getUserById.mockResolvedValue({
      data: { user: { factors: [verified("2026-02-01T00:00:00.000Z")] } },
      error: null,
    });
    expect(await resolveMfaReenrollRequired("user-1")).toBe(true);
  });

  it("settles nothing without a verified authenticator", async () => {
    expect(
      await settleMfaReenrollment("user-1", [{ factor_type: "totp", status: "unverified" }]),
    ).toBe(false);
    expect(await settleMfaReenrollment("user-1", undefined)).toBe(false);
    expect(clearCalls).toHaveLength(0);
  });

  it("throws rather than guessing when a read fails", async () => {
    profileRead.mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(resolveMfaReenrollRequired("user-1")).rejects.toEqual({ message: "down" });
  });
});
