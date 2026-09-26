import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// One stored flag shared by both routes, as the profiles row is.
const state = vi.hoisted(() => ({
  storedMfaEnabled: true,
  liveFactors: [] as object[],
  alert: vi.fn(),
}));

const factorId = "00000000-0000-4000-8000-000000000001";
const user = { id: "user-1", email: "person@example.com", factors: [] as object[] };
const identity = () => ({
  user,
  claims: { org_id: "org-1" },
  accessToken: "session-token",
  session: { access_token: "session-token" },
});

vi.mock("@/lib/api-auth", () => ({
  requireLiveAuthenticatedSession: async () => identity(),
  requireSensitiveActionAuth: async () => identity(),
  requireAuthenticatedUserWithClaims: async () => identity(),
  createTokenScopedClient: () => ({
    auth: { mfa: { unenroll: async () => ({ error: null }) } },
  }),
  createAnonClient: () => ({}),
  createRequestSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", factors: state.liveFactors } } }),
    },
  }),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  loginLimiter: {},
  checkRateLimit: async () => ({ limited: false }),
}));
vi.mock("@/lib/auth/security-audit", () => ({ writeSecurityAuditEvent: vi.fn() }));
vi.mock("@/lib/auth/verify-token", () => ({ verifyAccessToken: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/features/account/server/security-alerts", () => ({
  scheduleSecurityAlert: (...args: unknown[]) => state.alert(...args),
}));
vi.mock("@/features/account/server/profile", () => ({
  recordSelfMfaOff: async () => {
    const was = state.storedMfaEnabled;
    state.storedMfaEnabled = false;
    return was;
  },
}));
vi.mock("@/features/account/server", () => ({
  updateSelfMfaStatus: async (_userId: string, enabled: boolean) => {
    state.storedMfaEnabled = enabled;
    return { mfaEnabled: enabled };
  },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { mfa_enabled: state.storedMfaEnabled }, error: null }),
        }),
      }),
    }),
  }),
}));

import { POST as lifecycle } from "@/app/api/account/mfa-lifecycle/route";
import { POST as reconcile } from "@/app/api/account/mfa-status/route";

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Each half was tested alone; this is the sequence the web client runs
// (41c1/F-22): remove the last factor, then reconcile the stored flag.
describe("removing the last factor, then reconciling", () => {
  beforeEach(() => {
    state.storedMfaEnabled = true;
    state.liveFactors = [];
    state.alert.mockClear();
    user.factors = [{ id: factorId, factor_type: "totp", status: "verified" }];
  });

  it("alerts exactly once", async () => {
    expect(
      (await lifecycle(post("/api/account/mfa-lifecycle", { action: "remove", factorId }))).status,
    ).toBe(200);
    // The removal itself alerts, so the reconcile finds nothing left to say.
    expect(state.alert).toHaveBeenCalledOnce();
    expect((await reconcile(post("/api/account/mfa-status", {}))).status).toBe(200);

    expect(state.alert).toHaveBeenCalledOnce();
    expect(state.alert).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ action: "security_mfa_changed", enabled: false }),
    );
    expect(state.storedMfaEnabled).toBe(false);
  });
});
