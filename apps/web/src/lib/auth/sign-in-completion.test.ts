import { beforeEach, describe, expect, it, vi } from "vitest";

const writeSecurityAuditEvent = vi.fn();
const recordSignInOnce = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/security-audit", () => ({
  writeSecurityAuditEvent: (...args: unknown[]) => writeSecurityAuditEvent(...args),
  recordSignInOnce: (...args: unknown[]) => recordSignInOnce(...args),
}));

import {
  freshSignInMethod,
  hasFreshSecondFactor,
  hashSessionId,
  recordCompletedSignIn,
  sessionHashOf,
} from "./sign-in-completion";

const now = () => Math.floor(Date.now() / 1000);

describe("hasFreshSecondFactor", () => {
  it("accepts an aal2 session whose code was verified in the last ten minutes", () => {
    expect(
      hasFreshSecondFactor({ aal: "aal2", amr: [{ method: "totp", timestamp: now() - 60 }] }),
    ).toBe(true);
  });

  it("refuses a password-only session, a stale code and a non-TOTP proof", () => {
    expect(
      hasFreshSecondFactor({ aal: "aal1", amr: [{ method: "password", timestamp: now() }] }),
    ).toBe(false);
    expect(
      hasFreshSecondFactor({ aal: "aal2", amr: [{ method: "totp", timestamp: now() - 3600 }] }),
    ).toBe(false);
    expect(hasFreshSecondFactor({ aal: "aal2", amr: [{ method: "otp", timestamp: now() }] })).toBe(
      false,
    );
    expect(hasFreshSecondFactor(null)).toBe(false);
  });
});

describe("freshSignInMethod", () => {
  const password = { aal: "aal1", amr: [{ method: "password", timestamp: now() - 30 }] };

  it("counts a fresh password only on an account with no second factor", () => {
    expect(freshSignInMethod(password, false)).toBe("password");
    expect(freshSignInMethod(password, true)).toBeNull();
  });

  it("prefers a fresh second factor and refuses stale proof", () => {
    expect(
      freshSignInMethod({ aal: "aal2", amr: [{ method: "totp", timestamp: now() }] }, true),
    ).toBe("totp");
    expect(
      freshSignInMethod(
        { aal: "aal1", amr: [{ method: "password", timestamp: now() - 3600 }] },
        false,
      ),
    ).toBeNull();
  });
});

describe("recordCompletedSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordSignInOnce.mockResolvedValue(true);
  });

  const input = {
    userId: "user-1",
    orgId: "org-1",
    surface: "web" as const,
    method: "totp" as const,
    sessionId: "session-1",
  };

  // A check and a write in the app let two concurrent calls both record (F-25).
  it("records once per session through the database's own check", async () => {
    await expect(recordCompletedSignIn(input)).resolves.toBe(true);
    expect(recordSignInOnce).toHaveBeenCalledWith({
      actorId: "user-1",
      orgId: "org-1",
      metadata: { surface: "web", method: "totp", sessionHash: hashSessionId("session-1") },
    });

    recordSignInOnce.mockResolvedValue(false);
    await expect(recordCompletedSignIn(input)).resolves.toBe(false);
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });

  it("still records when the database call fails", async () => {
    recordSignInOnce.mockResolvedValue(null);

    await expect(recordCompletedSignIn(input)).resolves.toBe(true);
    expect(writeSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "succeeded",
        metadata: { surface: "web", method: "totp", sessionHash: hashSessionId("session-1") },
      }),
    );
  });

  it("still records a session it cannot identify", async () => {
    await expect(recordCompletedSignIn({ ...input, sessionId: null })).resolves.toBe(true);
    expect(recordSignInOnce).not.toHaveBeenCalled();
    expect(writeSecurityAuditEvent).toHaveBeenCalledOnce();
  });
});

describe("sessionHashOf", () => {
  it("hashes the session a raw token names, and nothing else", () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    expect(sessionHashOf(`${encode({})}.${encode({ session_id: "session-1" })}.sig`)).toBe(
      hashSessionId("session-1"),
    );
    expect(sessionHashOf(`${encode({})}.${encode({ sub: "user-1" })}.sig`)).toBeNull();
    expect(sessionHashOf("opaque-token")).toBeNull();
  });
});
