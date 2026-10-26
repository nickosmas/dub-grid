// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  dbResult: { error: null as unknown },
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({ select: () => ({ limit: async () => mocks.dbResult }) }),
  }),
}));
vi.mock("@/lib/env.server", () => ({
  serverEnv: {
    UPSTASH_REDIS_REST_URL: "https://redis.test",
    UPSTASH_REDIS_REST_TOKEN: "token",
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  getRateLimitConfigStatus: () => ({ configured: true, productionReady: true, message: null }),
}));
vi.mock("@/lib/fetch-with-timeout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fetch-with-timeout")>()),
  fetchWithTimeout: (...args: unknown[]) => mocks.fetchWithTimeout(...args),
}));

import { RequestTimeoutError } from "@/lib/fetch-with-timeout";
import { GET } from "./route";

const MONITOR_TIMEOUT_MS = 10_000;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbResult = { error: null };
  mocks.fetchWithTimeout.mockResolvedValue(new Response("PONG"));
});

describe("GET /api/health", () => {
  it("is healthy when the database and Redis answer", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.redis.status).toBe("ok");
  });

  it("pings Redis with a deadline inside the uptime monitor's timeout", async () => {
    await GET();

    const [url, , timeoutMs] = mocks.fetchWithTimeout.mock.calls[0];
    expect(url).toBe("https://redis.test/ping");
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThan(MONITOR_TIMEOUT_MS);
  });

  it("answers 503 when the Redis ping times out", async () => {
    mocks.fetchWithTimeout.mockRejectedValue(new RequestTimeoutError(3_000));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.redis).toMatchObject({ status: "error", error: "timed out" });
  });

  it("reports any other Redis failure as a failed connection", async () => {
    mocks.fetchWithTimeout.mockRejectedValue(new TypeError("fetch failed"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.redis).toMatchObject({ status: "error", error: "connection failed" });
  });
});
