import { ApiResponseError } from "@dubgrid/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmMobileStepUp,
  getMobileStepUpContextKey,
  getMobileStepUpMethod,
  readMobileStepUpContext,
} from "./step-up";

const reauthenticateMobileMfa = vi.hoisted(() => vi.fn());
const replaceAuthSession = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const listFactors = vi.hoisted(() => vi.fn());
const challengeAndVerify = vi.hoisted(() => vi.fn());

vi.mock("../../../shared/lib/mfa-lifecycle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/lib/mfa-lifecycle")>()),
  reauthenticateMobileMfa,
}));
vi.mock("../../../shared/providers/AuthSessionProvider", () => ({ replaceAuthSession }));
vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient: () => ({
    auth: { getSession, mfa: { listFactors, challengeAndVerify } },
  }),
}));

const token = (claims: Record<string, unknown>) =>
  `header.${btoa(JSON.stringify(claims)).replace(/=/g, "")}.signature`;

afterEach(() => {
  vi.resetAllMocks();
});

describe("mobile sensitive-action step-up", () => {
  it("accepts only the structured server denial methods", () => {
    expect(
      getMobileStepUpMethod(
        new ApiResponseError("Confirm", 403, {
          code: "STEP_UP_REQUIRED",
          method: "totp",
        }),
      ),
    ).toBe("totp");
    expect(
      getMobileStepUpMethod(
        new ApiResponseError("Confirm", 403, {
          code: "STEP_UP_REQUIRED",
          method: "password",
        }),
      ),
    ).toBe("password");
    expect(
      getMobileStepUpMethod(
        new ApiResponseError("Forbidden", 403, { code: "FORBIDDEN", method: "password" }),
      ),
    ).toBeNull();
    expect(getMobileStepUpMethod(new Error("STEP_UP_REQUIRED"))).toBeNull();
  });

  it("keys pending work to the account and organization, not token rotation", () => {
    const first = token({ sub: "user-1", org_id: "org-1", iat: 1 });
    const rotated = token({ sub: "user-1", org_id: "org-1", iat: 2 });
    const otherOrg = token({ sub: "user-1", org_id: "org-2", iat: 2 });

    expect(getMobileStepUpContextKey(first)).toBe(getMobileStepUpContextKey(rotated));
    expect(getMobileStepUpContextKey(first)).not.toBe(getMobileStepUpContextKey(otherOrg));
  });

  it("reads the currently installed session instead of a captured render token", async () => {
    const currentToken = token({ sub: "user-1", org_id: "org-1" });
    getSession.mockResolvedValue({
      data: { session: { access_token: currentToken } },
      error: null,
    });

    await expect(readMobileStepUpContext()).resolves.toEqual({
      key: getMobileStepUpContextKey(currentToken),
      accessToken: currentToken,
    });
  });

  it("returns the newly password-authenticated access token", async () => {
    reauthenticateMobileMfa.mockResolvedValue({
      access_token: "password-session",
      refresh_token: "password-refresh",
    });

    await expect(confirmMobileStepUp("password", "test-password", "old-token")).resolves.toBe(
      "password-session",
    );
    expect(reauthenticateMobileMfa).toHaveBeenCalledWith("old-token", "test-password");
  });

  it("installs and returns the exact TOTP-promoted session", async () => {
    const verifiedSession = {
      access_token: "aal2-token",
      refresh_token: "aal2-refresh",
      user: { id: "user-1" },
    };
    listFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-1", factor_type: "totp", status: "verified" }] },
      error: null,
    });
    challengeAndVerify.mockResolvedValue({ data: verifiedSession, error: null });
    replaceAuthSession.mockReturnValue(true);

    await expect(confirmMobileStepUp("totp", "123456", "aal1-token")).resolves.toBe("aal2-token");
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor-1", code: "123456" });
    expect(replaceAuthSession).toHaveBeenCalledWith(verifiedSession);
  });

  it("does not replace the session after a rejected TOTP code", async () => {
    listFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-1", factor_type: "totp", status: "verified" }] },
      error: null,
    });
    challengeAndVerify.mockResolvedValue({ data: null, error: new Error("Wrong code") });

    await expect(confirmMobileStepUp("totp", "000000", "aal1-token")).rejects.toThrow("Wrong code");
    expect(replaceAuthSession).not.toHaveBeenCalled();
  });
});
