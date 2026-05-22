import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const validateCsrfOrigin = vi.fn();
const maybeSingle = vi.fn();
const update = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) =>
    requireAuthenticatedUserWithClaims(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      update: (...args: unknown[]) => {
        update(...args);
        return { eq: () => ({ is: () => ({ error: null }) }) };
      },
    }),
  }),
}));

import { GET, POST } from "@/app/api/trial-welcome/route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(method = "GET") {
  return new NextRequest("http://localhost/api/trial-welcome", { method });
}

function superAdminClaims(extra: Record<string, unknown> = {}) {
  return {
    session: { access_token: "token" },
    user: { id: "user-1" },
    claims: { org_id: ORG_ID, org_role: "super_admin", ...extra },
  };
}

describe("GET /api/trial-welcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserWithClaims.mockResolvedValue(superAdminClaims());
  });

  it("shows the welcome when the trial started and was not dismissed", async () => {
    maybeSingle.mockResolvedValue({
      data: { trial_ends_at: "2026-06-05T00:00:00Z", trial_welcome_seen_at: null },
      error: null,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      shouldShowWelcome: true,
      trialEndsAt: "2026-06-05T00:00:00Z",
    });
  });

  it("hides the welcome once it has been dismissed", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        trial_ends_at: "2026-06-05T00:00:00Z",
        trial_welcome_seen_at: "2026-05-22T00:00:00Z",
      },
      error: null,
    });

    const res = await GET(makeRequest());
    await expect(res.json()).resolves.toEqual({
      shouldShowWelcome: false,
      trialEndsAt: "2026-06-05T00:00:00Z",
    });
  });

  it("hides the welcome while the trial is still pending (no end date)", async () => {
    maybeSingle.mockResolvedValue({
      data: { trial_ends_at: null, trial_welcome_seen_at: null },
      error: null,
    });

    const res = await GET(makeRequest());
    await expect(res.json()).resolves.toEqual({
      shouldShowWelcome: false,
      trialEndsAt: null,
    });
  });

  it("returns no welcome for non-super-admins without hitting the DB", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce(
      superAdminClaims({ org_role: "admin" }),
    );

    const res = await GET(makeRequest());
    await expect(res.json()).resolves.toEqual({
      shouldShowWelcome: false,
      trialEndsAt: null,
    });
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("returns no welcome in a sandbox without hitting the DB", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce(
      superAdminClaims({ in_sandbox: true }),
    );

    const res = await GET(makeRequest());
    await expect(res.json()).resolves.toEqual({
      shouldShowWelcome: false,
      trialEndsAt: null,
    });
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});

describe("POST /api/trial-welcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUserWithClaims.mockResolvedValue(superAdminClaims());
  });

  it("stamps trial_welcome_seen_at for a super_admin", async () => {
    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("blocks the CSRF check before doing anything", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Bad origin" }, { status: 403 }),
    );

    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(403);
    expect(requireAuthenticatedUserWithClaims).not.toHaveBeenCalled();
  });

  it("forbids non-super-admins", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce(
      superAdminClaims({ org_role: "admin" }),
    );

    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("is a no-op in a sandbox", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce(
      superAdminClaims({ in_sandbox: true }),
    );

    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(update).not.toHaveBeenCalled();
  });
});
