import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const steps: string[] = [];
const endUserSessions = vi.fn(async (_userId: string) => {
  steps.push("end sessions");
});
vi.mock("@/lib/auth/revocation", () => ({
  endUserSessions: (userId: string) => endUserSessions(userId),
}));

import { PartialTwoFactorResetError, resetPersonTwoFactor } from "./two-factor-reset";

function fakeClient(options: { failDelete?: boolean; failDeleteId?: string } = {}) {
  return {
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          steps.push(`profile ${Object.keys(values).join(",")}`);
          return { error: null };
        },
      }),
    }),
    auth: {
      admin: {
        mfa: {
          listFactors: async () => ({
            data: { factors: [{ id: "f-1" }, { id: "f-2" }] },
            error: null,
          }),
          deleteFactor: async ({ id }: { id: string }) => {
            steps.push(`delete ${id}`);
            const fails = options.failDelete || options.failDeleteId === id;
            return { error: fails ? { message: "auth down" } : null };
          },
        },
      },
    },
  } as unknown as SupabaseClient;
}

describe("resetPersonTwoFactor", () => {
  beforeEach(() => {
    steps.length = 0;
    vi.clearAllMocks();
  });

  it("flags re-enrollment first, removes every factor, turns two-factor off, then ends sessions", async () => {
    expect(await resetPersonTwoFactor(fakeClient(), "user-1")).toEqual({ factorsRemoved: 2 });
    expect(steps).toEqual([
      "profile mfa_reenroll_required_at",
      "delete f-1",
      "delete f-2",
      "profile mfa_enabled",
      "end sessions",
    ]);
    expect(endUserSessions).toHaveBeenCalledWith("user-1");
  });

  it("stops with the flag set when a factor cannot be removed", async () => {
    await expect(resetPersonTwoFactor(fakeClient({ failDelete: true }), "user-1")).rejects.toEqual({
      message: "auth down",
    });
    expect(steps).toEqual(["profile mfa_reenroll_required_at", "delete f-1"]);
    expect(endUserSessions).not.toHaveBeenCalled();
  });

  it("reports how many factors it removed when it stops part way (F-90)", async () => {
    const failure = await resetPersonTwoFactor(fakeClient({ failDeleteId: "f-2" }), "user-1").catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(PartialTwoFactorResetError);
    expect(failure).toMatchObject({ factorsRemoved: 1, cause: { message: "auth down" } });
    expect(endUserSessions).not.toHaveBeenCalled();
  });
});
