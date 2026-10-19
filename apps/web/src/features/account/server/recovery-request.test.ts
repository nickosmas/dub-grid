import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  writeSecurityAuditEvent: vi.fn(),
  afterTasks: [] as Array<() => unknown>,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    mocks.afterTasks.push(task);
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { kind: "source" },
  passwordResetLimiter: { kind: "target" },
  recoverySurgeLimiter: { kind: "surge" },
  hashEmail: (value: string) => `hash:${value.trim().toLowerCase()}`,
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
}));

vi.mock("@/lib/api-auth", () => ({
  createAnonClient: () => ({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  }),
}));

vi.mock("@/lib/auth/security-audit", () => ({
  writeSecurityAuditEvent: (...args: unknown[]) => mocks.writeSecurityAuditEvent(...args),
}));

import { handleRecoveryRequest } from "./recovery-request";

async function runAfterTasks() {
  for (const task of mocks.afterTasks.splice(0)) await task();
}

function request(email = "Nurse@Example.com") {
  return new Request("https://calmhaven.example.com/api/auth/recovery-request", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
    body: JSON.stringify({ email }),
  });
}

describe("handleRecoveryRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterTasks.length = 0;
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.writeSecurityAuditEvent.mockResolvedValue(undefined);
  });

  it("layers source, normalized target, and surge limits before provider work", async () => {
    const result = await handleRecoveryRequest(request());
    await runAfterTasks();

    expect(result.status).toBe(200);
    expect(mocks.checkRateLimit.mock.calls.map((call) => call[1])).toEqual([
      "recovery:source:203.0.113.8",
      "recovery:target:hash:nurse@example.com",
      "recovery:global",
    ]);
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("Nurse@Example.com", {
      redirectTo: "https://calmhaven.example.com/reset-password",
    });
  });

  it("fails closed before provider work when distributed limiting is unavailable", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({ limited: true, misconfigured: true });

    const result = await handleRecoveryRequest(request());

    expect(result.status).toBe(503);
    expect(mocks.afterTasks).toHaveLength(0);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("throttles before provider work with a recoverable generic response", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({ limited: true, reset: Date.now() + 5_000 });

    const result = await handleRecoveryRequest(request());

    expect(result.status).toBe(429);
    expect(result.headers.get("retry-after")).toBeTruthy();
    expect(mocks.afterTasks).toHaveLength(0);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("does not reveal provider account-existence failures", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { status: 400, message: "User not found" },
    });

    const result = await handleRecoveryRequest(request());

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true });
  });

  it("answers before the provider is asked, so its time cannot tell", async () => {
    const result = await handleRecoveryRequest(request());

    expect(result.status).toBe(200);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(mocks.afterTasks).toHaveLength(1);
  });

  it.each([
    [
      { status: 429, message: "For security purposes, you can only request this after 60 seconds" },
      "throttled",
      "rate_limited",
    ],
    [{ status: 500, message: "Error sending recovery email" }, "failed", "service_unavailable"],
    [null, "succeeded", "accepted"],
  ])(
    "gives every address the same answer and audits the provider's %j as %s",
    async (error, outcome, reason) => {
      mocks.resetPasswordForEmail.mockResolvedValue({ error });

      const result = await handleRecoveryRequest(request());
      await runAfterTasks();

      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ success: true });
      expect(mocks.writeSecurityAuditEvent).toHaveBeenCalledWith({
        event: "security.auth.recovery",
        outcome,
        reason,
        metadata: { targetHash: "hash:nurse@example.com" },
      });
    },
  );
});
