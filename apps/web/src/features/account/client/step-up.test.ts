import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmBrowserStepUp, getStepUpMethod, readStepUpContext } from "./step-up";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  factors: vi.fn(),
  password: vi.fn(),
  totp: vi.fn(),
}));
vi.mock("./auth", () => ({
  getBrowserAuthSession: mocks.session,
  listBrowserMfaFactors: mocks.factors,
  reauthenticateBrowserMfa: mocks.password,
  verifyBrowserTotpEnrollment: mocks.totp,
}));

describe("browser step-up transport", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    null,
    new Error("failure"),
    { code: "STEP_UP_REQUIRED", method: "password" },
    { status: 500, code: "STEP_UP_REQUIRED", method: "password" },
    { status: 403, code: "STEP_UP_REQUIRED", method: "email" },
    { status: 403, code: "OTHER", method: "totp" },
  ])("does not treat malformed or unrelated errors as permission to retry: %j", (error) => {
    expect(getStepUpMethod(error)).toBeNull();
  });

  it("returns the exact newly installed password session token", async () => {
    mocks.password.mockResolvedValue({ access_token: "new-password-token" });
    expect(await confirmBrowserStepUp("password", "test-password")).toBe("new-password-token");
    expect(mocks.password).toHaveBeenCalledExactlyOnceWith("test-password");
    expect(mocks.totp).not.toHaveBeenCalled();
  });

  it("uses only a live verified TOTP factor and its promoted session token", async () => {
    mocks.factors.mockResolvedValue({
      error: null,
      data: {
        totp: [
          { id: "pending", status: "unverified" },
          { id: "verified", status: "verified" },
        ],
      },
    });
    mocks.totp.mockResolvedValue({ error: null, data: { access_token: "promoted-token" } });
    expect(await confirmBrowserStepUp("totp", "123456")).toBe("promoted-token");
    expect(mocks.totp).toHaveBeenCalledExactlyOnceWith({ factorId: "verified", code: "123456" });
    expect(mocks.password).not.toHaveBeenCalled();
  });

  it.each([
    { error: new Error("unavailable") },
    { error: null, data: { totp: [] } },
    { error: null, data: { totp: [{ id: "pending", status: "unverified" }] } },
  ])("fails closed when a verified factor cannot be established", async (response) => {
    mocks.factors.mockResolvedValue(response);
    await expect(confirmBrowserStepUp("totp", "123456")).rejects.toThrow();
    expect(mocks.totp).not.toHaveBeenCalled();
    expect(mocks.password).not.toHaveBeenCalled();
  });

  it("does not return a token after a rejected code", async () => {
    mocks.factors.mockResolvedValue({ data: { totp: [{ id: "verified", status: "verified" }] } });
    mocks.totp.mockResolvedValue({ error: new Error("provider detail"), data: null });
    await expect(confirmBrowserStepUp("totp", "123456")).rejects.toThrow(
      "We couldn't confirm that code",
    );
  });

  it("snapshots the user and signed organization, not the session or token creation time", async () => {
    const token = `header.${btoa(JSON.stringify({ org_id: "org-a", iat: 100 }))}.signature`;
    mocks.session.mockResolvedValue({ user: { id: "user-a" }, access_token: token });
    expect(await readStepUpContext()).toEqual({
      key: JSON.stringify(["user-a", "org-a"]),
      accessToken: token,
    });
  });

  it.each([null, { access_token: "bad" }, { user: { id: "user-a" }, access_token: "malformed" }])(
    "fails closed without a usable session",
    async (session) => {
      mocks.session.mockResolvedValue(session);
      await expect(readStepUpContext()).rejects.toThrow();
    },
  );
});
