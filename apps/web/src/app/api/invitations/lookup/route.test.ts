import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const serviceFrom = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom }),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

import { DEAD_INVITATION_MESSAGE } from "@/lib/auth/dead-invitation";
import { GET } from "./route";

// Chainable query: select → eq → gt → is → is → maybeSingle (terminal).
function makeQuery() {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    gt: () => q,
    is: () => q,
    maybeSingle: () => maybeSingle(),
  };
  return q;
}

function request(token = "22222222-2222-2222-2222-222222222222") {
  return new NextRequest(`http://localhost/api/invitations/lookup?token=${token}`);
}

describe("GET /api/invitations/lookup", () => {
  beforeEach(() => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    vi.clearAllMocks();
    serviceFrom.mockImplementation(() => makeQuery());
  });

  it("returns org metadata and the deadline for a live invitation", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        expires_at: "2026-09-28T22:04:00.000Z",
        organizations: { name: "Acme", slug: "acme" },
      },
      error: null,
    });
    const res = await GET(request());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      orgName: "Acme",
      orgSlug: "acme",
      expiresAt: "2026-09-28T22:04:00.000Z",
    });
  });

  // Every dead response is the same two fields: nothing, the deadline
  // included, tells an expired link from an accepted, revoked or unknown one.
  const DEAD_BODY = { error: DEAD_INVITATION_MESSAGE, code: "INVITATION_INVALID" };

  it("returns 404 for an expired / accepted / revoked / unknown token (no org leak)", async () => {
    // The query's expiry/status filters mean no row comes back for a dead token.
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await GET(request("33333333-3333-3333-3333-333333333333"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual(DEAD_BODY);
  });

  it("normalizes a missing token to the dead-invitation contract", async () => {
    const res = await GET(new NextRequest("http://localhost/api/invitations/lookup"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual(DEAD_BODY);
  });

  it("normalizes a malformed token to the dead-invitation contract", async () => {
    const res = await GET(request("not-a-token"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual(DEAD_BODY);
    expect(serviceFrom).not.toHaveBeenCalled();
  });
});

describe("GET /api/invitations/lookup - abuse boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    serviceFrom.mockImplementation(() => makeQuery());
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("limits by source, since the endpoint is unauthenticated", async () => {
    const response = await GET(request());

    // The declared boundary is per-source: without it a caller could sweep
    // token-shaped values for a live invitation.
    expect(checkRateLimit).toHaveBeenCalledWith({}, expect.stringMatching(/^invite-lookup:/));
    expect(response.status).not.toBe(429);
  });

  it("answers a throttled caller with 429 and a Retry-After in seconds", async () => {
    checkRateLimit.mockResolvedValue({
      limited: true,
      misconfigured: false,
      reset: Date.now() + 30_000,
    });

    const response = await GET(request());

    expect(response.status).toBe(429);
    const retryAfter = Number(response.headers.get("Retry-After"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(30);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("treats a limiter that cannot answer as unavailable, not throttled", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: true });

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBeNull();
    expect(serviceFrom).not.toHaveBeenCalled();
  });
});
