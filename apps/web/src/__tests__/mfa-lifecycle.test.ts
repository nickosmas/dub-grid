import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST as webPost } from "@/app/api/account/mfa-lifecycle/route";
import { POST as mobilePost } from "@/app/api/mobile/v1/profile/mfa-lifecycle/route";

const mocks = vi.hoisted(() => ({
  live: vi.fn(),
  sensitive: vi.fn(),
  mobileLive: vi.fn(),
  mobileSensitive: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  signIn: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
  scoped: vi.fn(),
  verify: vi.fn(),
  rate: vi.fn(),
  csrf: vi.fn(),
}));
vi.mock("@/lib/api-auth", () => ({
  requireLiveAuthenticatedSession: mocks.live,
  requireSensitiveActionAuth: mocks.sensitive,
  createTokenScopedClient: mocks.scoped,
  createAnonClient: () => ({
    auth: {
      signInWithPassword: mocks.signIn,
      refreshSession: mocks.refresh,
      signOut: mocks.signOut,
    },
  }),
}));
vi.mock("@/features/mobile/server/auth", () => ({
  requireMobileStepUpSession: mocks.mobileLive,
  requireMobileSensitiveActionAuth: mocks.mobileSensitive,
}));
vi.mock("@/lib/auth/verify-token", () => ({ verifyAccessToken: mocks.verify }));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  loginLimiter: {},
  checkRateLimit: mocks.rate,
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: mocks.csrf }));

const factorId = "00000000-0000-4000-8000-000000000001";
const user = { id: "user-1", email: "test@example.com", factors: [] as object[] };
const session = { access_token: "password-session", refresh_token: "test-refresh" };
const identity = () => ({
  user,
  claims: { org_id: "org-1" },
  accessToken: "original-session",
  session: { access_token: "original-session" },
});
function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/account/mfa-lifecycle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  user.factors = [];
  for (const gate of [mocks.live, mocks.sensitive, mocks.mobileLive, mocks.mobileSensitive])
    gate.mockImplementation(async () => identity());
  mocks.csrf.mockReturnValue(null);
  mocks.rate.mockResolvedValue({ limited: false });
  mocks.scoped.mockReturnValue({
    auth: { mfa: { enroll: mocks.enroll, unenroll: mocks.unenroll } },
    rpc: mocks.rpc,
  });
  mocks.enroll.mockResolvedValue({
    data: {
      id: factorId,
      totp: { qr_code: "data:image/svg+xml,test", secret: "test-only", uri: "otpauth://test" },
    },
    error: null,
  });
  mocks.unenroll.mockResolvedValue({ error: null });
  mocks.signIn.mockResolvedValue({ data: { user, session }, error: null });
  mocks.refresh.mockResolvedValue({ data: { session }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.verify.mockResolvedValue({ userId: user.id, claims: { org_id: "org-1" } });
});

describe.each([
  ["web", webPost],
  ["mobile", mobilePost],
] as const)("%s MFA lifecycle", (surface, post) => {
  it.each(["enroll", "remove"])("rejects stale assurance before %s", async (action) => {
    const denial = () => ({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED", method: "totp" }, { status: 403 }),
    });
    mocks.sensitive.mockImplementation(denial);
    mocks.mobileSensitive.mockImplementation(denial);
    const response = await post(request({ action, factorId }));
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });

  it("enrolls with a user token and preserves the existing issuer/label", async () => {
    expect((await post(request({ action: "enroll" }))).status).toBe(200);
    expect(mocks.scoped).toHaveBeenCalledWith("original-session");
    expect(mocks.enroll).toHaveBeenCalledWith(
      surface === "web"
        ? { factorType: "totp", friendlyName: "DubGrid Authenticator", issuer: "DubGrid" }
        : { factorType: "totp", friendlyName: "Mobile App Authenticator" },
    );
  });

  it("does not enroll when another session already verified a factor", async () => {
    user.factors = [{ id: factorId, factor_type: "totp", status: "verified" }];
    expect((await post(request({ action: "enroll" }))).status).toBe(409);
    expect(mocks.enroll).not.toHaveBeenCalled();
  });

  it("cleanup cannot remove a verified factor", async () => {
    user.factors = [{ id: factorId, factor_type: "totp", status: "verified" }];
    expect((await post(request({ action: "cleanup", factorId }))).status).toBe(409);
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });

  it("cleans up an unverified factor but never accepts an arbitrary path", async () => {
    user.factors = [{ id: factorId, factor_type: "totp", status: "unverified" }];
    expect((await post(request({ action: "cleanup", factorId }))).status).toBe(200);
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId });
    expect((await post(request({ action: "remove", factorId: "../user" }))).status).toBe(400);
    expect(mocks.unenroll).toHaveBeenCalledTimes(1);
  });

  it("removes verified factors only through the sensitive gate", async () => {
    user.factors = [{ id: factorId, factor_type: "totp", status: "verified" }];
    expect((await post(request({ action: "remove", factorId }))).status).toBe(200);
    expect(surface === "web" ? mocks.sensitive : mocks.mobileSensitive).toHaveBeenCalledOnce();
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId });
  });

  it("reauthenticates the live identity and retains its signed organization", async () => {
    const response = await post(
      request({
        action: "reauthenticate",
        password: "test-password",
        email: "someone-else@example.com",
        orgId: "other-org",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.signIn).toHaveBeenCalledWith({ email: user.email, password: "test-password" });
    expect(mocks.rpc).toHaveBeenCalledWith("switch_org", { target_org_id: "org-1" });
    expect(await response.json()).toEqual(session);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("does not downgrade a TOTP account to password", async () => {
    user.factors = [{ factor_type: "totp", status: "verified" }];
    const response = await post(request({ action: "reauthenticate", password: "test-password" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "STEP_UP_REQUIRED", method: "totp" });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it.each(["password", "identity", "organization", "refresh", "claims"])(
    "preserves the original session on %s failure",
    async (failure) => {
      if (failure === "password")
        mocks.signIn.mockResolvedValue({ data: {}, error: new Error("provider detail") });
      if (failure === "identity")
        mocks.signIn.mockResolvedValue({
          data: { session, user: { ...user, id: "other-user" } },
          error: null,
        });
      if (failure === "organization")
        mocks.rpc.mockResolvedValue({ error: new Error("membership detail") });
      if (failure === "refresh")
        mocks.refresh.mockResolvedValue({ data: {}, error: new Error("refresh detail") });
      if (failure === "claims")
        mocks.verify.mockResolvedValue({ userId: user.id, claims: { org_id: "other-org" } });
      const response = await post(request({ action: "reauthenticate", password: "test-password" }));
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(await response.text()).not.toMatch(
        /provider detail|membership detail|refresh detail|test-password|test-refresh/,
      );
    },
  );

  it("fails closed on malformed factors and provider/rate-limit outages", async () => {
    user.factors = [{ status: "verified" }];
    expect((await post(request({ action: "enroll" }))).status).toBe(503);
    user.factors = [];
    mocks.rate.mockResolvedValueOnce({ misconfigured: true });
    expect((await post(request({ action: "enroll" }))).status).toBe(503);
    mocks.rate.mockResolvedValueOnce({ limited: true });
    expect((await post(request({ action: "enroll" }))).status).toBe(429);
    mocks.enroll.mockRejectedValue(new Error("private provider detail"));
    const response = await post(request({ action: "enroll" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider detail");
  });
});

it("retains web CSRF rejection before authentication", async () => {
  mocks.csrf.mockReturnValue(NextResponse.json({ error: "Invalid origin" }, { status: 403 }));
  expect((await webPost(request({ action: "enroll" }))).status).toBe(403);
  expect(mocks.sensitive).not.toHaveBeenCalled();
});
