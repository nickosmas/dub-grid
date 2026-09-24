import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const updateSelfMfaStatus = vi.fn();
const dispatchNotificationEvent = vi.fn();
const profileSnapshot = vi.fn();
const getUser = vi.fn();
const createRequestSupabaseClient = vi.fn();
const after = vi.fn((task: () => unknown) => void task());

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => after(task),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
  createRequestSupabaseClient: (req: NextRequest) => createRequestSupabaseClient(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/features/account/server", () => ({
  updateSelfMfaStatus: (...args: unknown[]) => updateSelfMfaStatus(...args),
}));
vi.mock("@/features/notifications/server/events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => profileSnapshot(),
        }),
      }),
    }),
  }),
}));

import { POST } from "./route";

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/mfa-status", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUser.mockResolvedValue({ user: { id: "user-1" } });
  createRequestSupabaseClient.mockReturnValue({ auth: { getUser } });
  getUser.mockResolvedValue({
    data: { user: { id: "user-1", factors: [{ factor_type: "totp", status: "verified" }] } },
    error: null,
  });
  validateCsrfOrigin.mockReturnValue(null);
  updateSelfMfaStatus.mockResolvedValue({ mfaEnabled: true });
  dispatchNotificationEvent.mockResolvedValue({ success: true });
  // Stored status is off; live Auth has a verified factor.
  profileSnapshot.mockResolvedValue({
    data: { mfa_enabled: false, org_id: "org-1" },
  });
});

describe("POST /api/account/mfa-status", () => {
  it("enables MFA for the authenticated user", async () => {
    const res = await POST(post({ enabled: true }));
    expect(res.status).toBe(200);
    expect(updateSelfMfaStatus).toHaveBeenCalledWith("user-1", true);
  });

  it("reconciles disabled status only when live Auth has no verified TOTP", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", factors: [] } }, error: null });
    updateSelfMfaStatus.mockResolvedValueOnce({ mfaEnabled: false });
    const res = await POST(post({ enabled: false }));
    expect(res.status).toBe(200);
    expect(updateSelfMfaStatus).toHaveBeenCalledWith("user-1", false);
  });

  it("rejects a non-boolean enabled value with 400", async () => {
    const res = await POST(post({ enabled: "yes" }));
    expect(res.status).toBe(400);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
  });

  it("accepts reconciliation without a client-provided boolean", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(200);
    expect(updateSelfMfaStatus).toHaveBeenCalledWith("user-1", true);
  });

  it("blocks unauthenticated callers", async () => {
    requireAuthenticatedUser.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });
    const res = await POST(post({ enabled: true }));
    expect(res.status).toBe(401);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects invalid CSRF", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(post({ enabled: true }));
    expect(res.status).toBe(403);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
  });

  it("dispatches security_mfa_changed when the value actually changes", async () => {
    const res = await POST(post({ enabled: true }));
    expect(res.status).toBe(200);
    // Kept alive past the response, which a bare promise was not.
    expect(after).toHaveBeenCalledTimes(1);
    expect(dispatchNotificationEvent).toHaveBeenCalledWith("user-1", {
      action: "security_mfa_changed",
      orgId: "org-1",
      targetUserId: "user-1",
      enabled: true,
    });
  });

  it("does not dispatch when live state matches the saved state despite a false client flag", async () => {
    profileSnapshot.mockResolvedValueOnce({
      data: { mfa_enabled: true, org_id: "org-1" },
    });
    const res = await POST(post({ enabled: false }));
    expect(res.status).toBe(200);
    expect(updateSelfMfaStatus).toHaveBeenCalledWith("user-1", true);
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it.each([
    { factors: undefined, enabled: false },
    { factors: [], enabled: false },
    { factors: [{ factor_type: "totp", status: "unverified" }], enabled: false },
    { factors: [{ factor_type: "totp", status: "verified" }], enabled: true },
    { factors: [{ factor_type: "phone", status: "verified" }], enabled: false },
    {
      factors: [
        { factor_type: "totp", status: "unverified" },
        { factor_type: "totp", status: "verified" },
      ],
      enabled: true,
    },
  ])(
    "uses live factors rather than the opposite client flag: $enabled",
    async ({ factors, enabled }) => {
      getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", factors } }, error: null });
      updateSelfMfaStatus.mockResolvedValueOnce({ mfaEnabled: enabled });
      const res = await POST(post({ enabled: !enabled, userId: "another-user" }));
      expect(res.status).toBe(200);
      expect(updateSelfMfaStatus).toHaveBeenCalledWith("user-1", enabled);
      expect(await res.json()).toEqual({ profile: { mfaEnabled: enabled } });
    },
  );

  it.each([
    { user: null, error: null, status: 401 },
    { user: { id: "another-user", factors: [] }, error: null, status: 401 },
    { user: { id: "user-1", factors: [] }, error: { message: "provider failure" }, status: 503 },
    { user: { id: "user-1", factors: null }, error: null, status: 503 },
    { user: { id: "user-1", factors: {} }, error: null, status: 503 },
    { user: { id: "user-1", factors: [{ status: "verified" }] }, error: null, status: 503 },
  ])(
    "does not write or notify on invalid provider state: $status",
    async ({ user, error, status }) => {
      getUser.mockResolvedValueOnce({ data: { user }, error });
      const res = await POST(post({}));
      expect(res.status).toBe(status);
      expect(updateSelfMfaStatus).not.toHaveBeenCalled();
      expect(profileSnapshot).not.toHaveBeenCalled();
      expect(dispatchNotificationEvent).not.toHaveBeenCalled();
    },
  );

  it("does not write or notify if the prior state lookup fails", async () => {
    profileSnapshot.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    const res = await POST(post({}));
    expect(res.status).toBe(503);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("forwards the original request to the live identity client", async () => {
    const req = new NextRequest("http://localhost/api/account/mfa-status", {
      method: "POST",
      headers: { authorization: "Bearer promoted-token" },
      body: "{}",
    });
    expect((await POST(req)).status).toBe(200);
    expect(createRequestSupabaseClient).toHaveBeenCalledWith(req);
  });
});
