import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ratelimit } from "@upstash/ratelimit";

const loggerError = vi.fn();
const captureMessage = vi.fn();
const captureException = vi.fn();

vi.mock("@/lib/logger", () => ({
  default: { error: (...args: unknown[]) => loggerError(...args) },
}));
vi.mock("@/lib/sentry", () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/lib/env", () => ({ serverEnv: {} }));

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

async function loadCheckRateLimit() {
  const mod = await import("./rate-limit");
  return mod.checkRateLimit;
}

describe("checkRateLimit fail-closed alerting", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", ORIGINAL_NODE_ENV ?? "test");
  });

  it("does not alert in development when no limiter is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const checkRateLimit = await loadCheckRateLimit();

    const result = await checkRateLimit(null, "key");

    expect(result).toEqual({ limited: false });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("fails closed and alerts in production when no limiter is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const checkRateLimit = await loadCheckRateLimit();

    const result = await checkRateLimit(null, "key");

    expect(result).toEqual({ limited: true, misconfigured: true });
    expect(captureMessage).toHaveBeenCalledWith(
      "Rate limiter unavailable: no Redis configured in production",
      "error",
    );
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it("fails closed and alerts in production when the limiter throws, attaching the real error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const checkRateLimit = await loadCheckRateLimit();
    const upstashError = new Error("Upstash unreachable");
    const throwingLimiter = {
      limit: vi.fn().mockRejectedValue(upstashError),
    } as unknown as Ratelimit;

    const result = await checkRateLimit(throwingLimiter, "key");

    expect(result).toEqual({ limited: true, misconfigured: true });
    expect(captureException).toHaveBeenCalledWith(
      upstashError,
      expect.objectContaining({ extra: expect.objectContaining({ context: "rate-limit-check" }) }),
    );
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it("does not alert in production on a normal successful check", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const checkRateLimit = await loadCheckRateLimit();
    const okLimiter = {
      limit: vi.fn().mockResolvedValue({ success: true, reset: 123 }),
    } as unknown as Ratelimit;

    const result = await checkRateLimit(okLimiter, "key");

    expect(result).toEqual({ limited: false, reset: 123 });
    expect(captureMessage).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});
