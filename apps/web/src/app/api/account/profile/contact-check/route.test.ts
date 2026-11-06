import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const checkOwnContact = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));
vi.mock("@/features/employees/server/contact-conflicts", () => ({
  checkOwnContact: (...args: unknown[]) => checkOwnContact(...args),
  EmployeeContactLookupError: class extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/account/profile/contact-check", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/profile/contact-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({ user: { id: "me" } });
    checkRateLimit.mockResolvedValue({ limited: false, reset: 0, misconfigured: false });
    resolveEffectiveOrgId.mockResolvedValue(ORG_ID);
    checkOwnContact.mockResolvedValue({ emailTaken: true, phoneTaken: false });
  });

  it("answers yes or no for the signed-in person", async () => {
    const res = await POST(makeReq({ orgId: ORG_ID, email: "new@example.com", phone: null }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emailTaken: true, phoneTaken: false });
    expect(checkOwnContact).toHaveBeenCalledWith(expect.anything(), {
      userId: "me",
      orgId: ORG_ID,
      email: "new@example.com",
      phone: null,
    });
  });

  it("works without an organization", async () => {
    const res = await POST(makeReq({ email: "new@example.com" }));

    expect(res.status).toBe(200);
    expect(resolveEffectiveOrgId).not.toHaveBeenCalled();
    expect(checkOwnContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: null }),
    );
  });

  it("refuses a request that isn't signed in", async () => {
    requireAuthenticatedUser.mockResolvedValue({
      response: new Response(null, { status: 401 }),
    });

    const res = await POST(makeReq({ email: "new@example.com" }));

    expect(res.status).toBe(401);
    expect(checkOwnContact).not.toHaveBeenCalled();
  });

  it("slows down repeated checks", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, reset: Date.now() + 1000 });

    const res = await POST(makeReq({ email: "new@example.com" }));

    expect(res.status).toBe(429);
    expect(checkOwnContact).not.toHaveBeenCalled();
  });

  it("refuses a malformed email", async () => {
    const res = await POST(makeReq({ email: "not-an-email" }));

    expect(res.status).toBe(400);
    expect(checkOwnContact).not.toHaveBeenCalled();
  });
});
