import { afterEach, describe, expect, it, vi } from "vitest";

import { forceLogoutGridmasterUser } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("Gridmaster sensitive-action transport", () => {
  it("forwards the exact proof token for force logout", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await forceLogoutGridmasterUser("target-user", "fresh-proof-token");

    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("/api/gridmaster/users/target-user/force-logout"),
      {
        method: "POST",
        headers: { Authorization: "Bearer fresh-proof-token" },
      },
    );
  });

  it("preserves a server-selected step-up method", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "STEP_UP_REQUIRED",
          method: "totp",
          error: "Confirm your identity, then try again.",
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(forceLogoutGridmasterUser("target-user", "stale-token")).rejects.toMatchObject({
      status: 403,
      code: "STEP_UP_REQUIRED",
      method: "totp",
    });
  });
});
