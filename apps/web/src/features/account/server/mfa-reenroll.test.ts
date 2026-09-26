// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileRead = vi.fn();
const getUserById = vi.fn();
const updateSelfMfaStatus = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => profileRead() }) }) }),
    auth: { admin: { getUserById: (id: string) => getUserById(id) } },
  }),
}));
vi.mock("./profile", () => ({
  updateSelfMfaStatus: (...args: unknown[]) => updateSelfMfaStatus(...args),
}));

import { resolveMfaReenrollRequired } from "./mfa-reenroll";

describe("resolveMfaReenrollRequired", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is false with no reset pending, without asking Auth", async () => {
    profileRead.mockResolvedValue({ data: { mfa_reenroll_required_at: null }, error: null });
    expect(await resolveMfaReenrollRequired("user-1")).toBe(false);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("is true after a reset with no verified factor", async () => {
    profileRead.mockResolvedValue({
      data: { mfa_reenroll_required_at: "2026-09-26" },
      error: null,
    });
    getUserById.mockResolvedValue({ data: { user: { factors: [] } }, error: null });
    expect(await resolveMfaReenrollRequired("user-1")).toBe(true);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
  });

  it("settles the reset when a verified factor exists", async () => {
    profileRead.mockResolvedValue({
      data: { mfa_reenroll_required_at: "2026-09-26" },
      error: null,
    });
    getUserById.mockResolvedValue({
      data: { user: { factors: [{ factor_type: "totp", status: "verified" }] } },
      error: null,
    });
    expect(await resolveMfaReenrollRequired("user-1")).toBe(false);
    expect(updateSelfMfaStatus).toHaveBeenCalledWith("user-1", true);
  });

  it("throws rather than guessing when a read fails", async () => {
    profileRead.mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(resolveMfaReenrollRequired("user-1")).rejects.toEqual({ message: "down" });
  });
});
