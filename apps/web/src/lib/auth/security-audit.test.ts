import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), loggerError: vi.fn() }));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe("audit_log");
      return { insert: mocks.insert };
    },
  }),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: (...args: unknown[]) => mocks.loggerError(...args) },
}));

import { writeSecurityAuditEvent } from "./security-audit";

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
