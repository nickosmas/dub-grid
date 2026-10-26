import { createHash, createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const extractBearerToken = vi.fn();
const verifyAccessToken = vi.fn();
const getSession = vi.fn();
const insert = vi.fn();
const checkRateLimit = vi.fn();
const env = vi.hoisted((): { CONSENT_IP_HASH_SECRET?: string } => ({}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (request: NextRequest) => validateCsrfOrigin(request),
}));
vi.mock("@/lib/auth/verify-token", () => ({
  extractBearerToken: (request: NextRequest) => extractBearerToken(request),
  verifyAccessToken: (token: string) => verifyAccessToken(token),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getSession } }),
}));
vi.mock("@/lib/supabase-keys", () => ({
  requireSupabaseUrl: () => "http://localhost:54321",
  requireSupabasePublishableKey: () => "publishable-key",
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: () => ({ insert }) }),
}));
vi.mock("@/lib/env.server", () => ({ serverEnv: env }));
vi.mock("@/lib/rate-limit", () => ({
  consentLimiter: "consent-limiter",
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { POST } from "./route";

function makeRequest() {
  return new NextRequest("http://localhost/api/consent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    body: JSON.stringify({ consent: { essential: true, analytics: true }, version: "1.2" }),
  });
}

function recordedRow() {
  expect(insert).toHaveBeenCalledTimes(1);
  return insert.mock.calls[0][0];
}

function recordedUserId() {
  return recordedRow().user_id;
}

describe("POST /api/consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    extractBearerToken.mockReturnValue(null);
    getSession.mockResolvedValue({ data: { session: null } });
    insert.mockResolvedValue({ error: null });
    checkRateLimit.mockResolvedValue({ limited: false });
    env.CONSENT_IP_HASH_SECRET = "test-secret";
  });

  it("records the user named by a valid Bearer token", async () => {
    extractBearerToken.mockReturnValue("mobile-token");
    verifyAccessToken.mockResolvedValue({ userId: "mobile-user" });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(verifyAccessToken).toHaveBeenCalledWith("mobile-token");
    expect(recordedUserId()).toBe("mobile-user");
    expect(getSession).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ success: true, userId: "mobile-user" });
  });

  it("records an invalid Bearer token as anonymous without reading the cookie session", async () => {
    extractBearerToken.mockReturnValue("bad-token");
    verifyAccessToken.mockResolvedValue(null);
    getSession.mockResolvedValue({ data: { session: { access_token: "cookie-token" } } });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(recordedUserId()).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("falls back to the cookie session when no Bearer token is sent", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "cookie-token" } } });
    verifyAccessToken.mockResolvedValue({ userId: "web-user" });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(verifyAccessToken).toHaveBeenCalledWith("cookie-token");
    expect(recordedUserId()).toBe("web-user");
  });

  it("records a signed-out visitor as anonymous", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(recordedUserId()).toBeNull();
    expect(await response.json()).toEqual({ success: true, userId: null });
  });

  it("stores the IP as a keyed hash, never the plain SHA-256", async () => {
    await POST(makeRequest());

    const { ip_hash } = recordedRow();
    expect(ip_hash).toBe(createHmac("sha256", "test-secret").update("203.0.113.7").digest("hex"));
    expect(ip_hash).not.toBe(createHash("sha256").update("203.0.113.7").digest("hex"));
  });

  it("stores no hash when the key is not configured", async () => {
    delete env.CONSENT_IP_HASH_SECRET;

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(recordedRow().ip_hash).toBe("unavailable");
  });

  it("rate-limits by IP before recording anything", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, reset: Date.now() + 30_000 });

    const response = await POST(makeRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(checkRateLimit).toHaveBeenCalledWith("consent-limiter", "consent:ip:203.0.113.7");
    expect(insert).not.toHaveBeenCalled();
  });

  it("answers 503 when the limiter is misconfigured", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, misconfigured: true });

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(insert).not.toHaveBeenCalled();
  });
});
