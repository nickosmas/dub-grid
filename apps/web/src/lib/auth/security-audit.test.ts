import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  loggerError: vi.fn(),
  read: vi.fn(),
  filters: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe("audit_log");
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          mocks.filters.push([column, value]);
          return query;
        },
        in: (column: string, value: unknown) => {
          mocks.filters.push([column, value]);
          return query;
        },
        limit: () => mocks.read(),
      };
      return { insert: mocks.insert, select: query.select };
    },
  }),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: (...args: unknown[]) => mocks.loggerError(...args) },
}));

import { hasRecordedSignIn, writeSecurityAuditEvent } from "./security-audit";

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

describe("hasRecordedSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters.length = 0;
  });

  it("looks for this person's completed sign-in with this session's hash", async () => {
    mocks.read.mockResolvedValue({ data: [{ id: 1 }], error: null });

    await expect(hasRecordedSignIn({ actorId: "user-1", sessionHash: "abc" })).resolves.toBe(true);
    expect(mocks.filters).toEqual([
      ["action", ["security.auth.login", "security.auth.mfa"]],
      ["actor_id", "user-1"],
      ["details->>outcome", "succeeded"],
      ["details->>sessionHash", "abc"],
    ]);
  });

  it("answers no when nothing matches or the read fails", async () => {
    mocks.read.mockResolvedValueOnce({ data: [], error: null });
    await expect(hasRecordedSignIn({ actorId: "user-1", sessionHash: "abc" })).resolves.toBe(false);

    mocks.read.mockResolvedValueOnce({ data: null, error: new Error("down") });
    await expect(hasRecordedSignIn({ actorId: "user-1", sessionHash: "abc" })).resolves.toBe(false);
    expect(mocks.loggerError).toHaveBeenCalledOnce();
  });
});
