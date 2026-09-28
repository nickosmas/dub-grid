import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  loggerError: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe("audit_log");
      return { insert: mocks.insert };
    },
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  }),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: (...args: unknown[]) => mocks.loggerError(...args) },
}));

import { recordSignInOnce, writeSecurityAuditEvent } from "./security-audit";

describe("writeSecurityAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("writes only the closed event contract without raw identity", async () => {
    await writeSecurityAuditEvent({
      event: "security.auth.login",
      outcome: "rejected",
      reason: "invalid_credentials",
      metadata: { targetHash: "sha256", surface: "web" },
    });

    expect(mocks.insert).toHaveBeenCalledWith({
      org_id: null,
      actor_id: null,
      actor_email: null,
      action: "security.auth.login",
      resource_type: "user",
      resource_id: null,
      details: {
        outcome: "rejected",
        reason: "invalid_credentials",
        targetHash: "sha256",
        surface: "web",
      },
    });
  });

  it("does not let audit storage failure replace the Auth outcome", async () => {
    mocks.insert.mockResolvedValue({ error: new Error("database unavailable") });

    await expect(
      writeSecurityAuditEvent({
        event: "security.auth.recovery",
        outcome: "failed",
        reason: "service_unavailable",
      }),
    ).resolves.toBeUndefined();
    expect(mocks.loggerError).toHaveBeenCalledOnce();
  });
});

describe("recordSignInOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = {
    actorId: "user-1",
    orgId: "org-1",
    metadata: { surface: "web" as const, method: "totp" as const, sessionHash: "abc" },
  };

  it("checks and records in one database call", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(recordSignInOnce(input)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("record_sign_in_once", {
      p_actor_id: "user-1",
      p_org_id: "org-1",
      p_details: { surface: "web", method: "totp", sessionHash: "abc" },
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("answers no when the session already has its sign-in", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(recordSignInOnce(input)).resolves.toBe(false);
  });

  it("answers no when the call only runs past its deadline, which still records (F-127)", async () => {
    vi.useFakeTimers();
    try {
      mocks.rpc.mockReturnValue(new Promise(() => undefined));
      const pending = recordSignInOnce(input);
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(pending).resolves.toBe(false);
      expect(mocks.insert).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers null when the call fails, so the caller can still record", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(recordSignInOnce(input)).resolves.toBeNull();
    expect(mocks.loggerError).toHaveBeenCalledOnce();
  });
});
