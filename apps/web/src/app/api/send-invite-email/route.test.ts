import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const checkRateLimit = vi.fn();
const maybeSingle = vi.fn();
const sendResendEmail = vi.fn();
const canManageEmployees = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: () => null,
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  inviteLimiter: {},
  emailTargetLimiter: {},
  hashEmail: (value: string) => value,
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        gt: () => query,
        is: () => query,
        maybeSingle,
      };
      return query;
    },
  }),
}));
vi.mock("@/app/api/employees/shared", () => ({
  canManageEmployees: (...args: unknown[]) => canManageEmployees(...args),
}));
vi.mock("@/lib/resend", () => ({
  sendResendEmail: (...args: unknown[]) => sendResendEmail(...args),
}));
vi.mock("@/lib/env.server", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "DubGrid <hello@dubgrid.app>" },
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { NEXT_PUBLIC_SITE_URL: "https://dubgrid.app" },
}));
vi.mock("@/lib/email", () => ({
  sanitizeHeaderValue: (value: string) => value,
  emailBaseUrl: () => "https://dubgrid.app",
}));
vi.mock("@react-email/components", () => ({ render: async () => "<html />" }));
vi.mock("@/emails/InviteEmail", () => ({ InviteEmail: () => null }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { POST } from "./route";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_ID = "33333333-3333-4333-8333-333333333333";

function makeRequest(body: unknown) {
  return new NextRequest("https://calmhaven.dubgrid.app/api/send-invite-email", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const BODY = {
  token: "live-token",
  email: "invitee@example.com",
  orgName: "Spoofed Name",
  inviterName: "Ada",
};

describe("POST /api/send-invite-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "user-1" },
      claims: { org_role: "super_admin", org_id: ORG_ID },
    });
    maybeSingle.mockResolvedValue({
      data: { org_id: ORG_ID, email: "invitee@example.com", organizations: { name: "Calm Haven" } },
      error: null,
    });
    sendResendEmail.mockResolvedValue(undefined);
    canManageEmployees.mockResolvedValue(true);
  });

  it("sends the invitation with the organization name from the row, not the body", async () => {
    const response = await POST(makeRequest(BODY));
    expect(response.status).toBe(200);
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "invitee@example.com",
        subject: "You're invited to join Calm Haven on DubGrid",
      }),
    );
  });

  it("refuses when the token is not a live invitation", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await POST(makeRequest(BODY));
    expect(response.status).toBe(404);
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("refuses when the address does not match the invitation", async () => {
    const response = await POST(makeRequest({ ...BODY, email: "someone-else@example.com" }));
    expect(response.status).toBe(404);
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("lets an admin who may manage employees send the invitation", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "admin-1" },
      claims: { org_role: "admin", org_id: ORG_ID },
    });

    const response = await POST(makeRequest(BODY));

    expect(response.status).toBe(200);
    // Resolved against the invitation's organization, not the caller's claim.
    expect(canManageEmployees).toHaveBeenCalledWith(expect.anything(), "admin-1", ORG_ID);
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
  });

  it("refuses an admin who may not manage employees", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "admin-2" },
      claims: { org_role: "admin", org_id: ORG_ID },
    });
    canManageEmployees.mockResolvedValue(false);

    const response = await POST(makeRequest(BODY));

    expect(response.status).toBe(403);
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("refuses a regular user before spending a lookup", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "user-2" },
      claims: { org_role: "user", org_id: ORG_ID },
    });

    const response = await POST(makeRequest(BODY));

    expect(response.status).toBe(403);
    expect(maybeSingle).not.toHaveBeenCalled();
    expect(canManageEmployees).not.toHaveBeenCalled();
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("refuses a super admin of a different organization, but allows a gridmaster", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "user-1" },
      claims: { org_role: "super_admin", org_id: OTHER_ORG_ID },
    });
    expect((await POST(makeRequest(BODY))).status).toBe(404);
    expect(sendResendEmail).not.toHaveBeenCalled();

    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "gm-1" },
      claims: { platform_role: "gridmaster" },
    });
    expect((await POST(makeRequest(BODY))).status).toBe(200);
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
  });
});
