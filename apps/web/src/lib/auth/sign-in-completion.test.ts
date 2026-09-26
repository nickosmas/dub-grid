import { beforeEach, describe, expect, it, vi } from "vitest";

const writeSecurityAuditEvent = vi.fn();
const hasRecordedSignIn = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/security-audit", () => ({
  writeSecurityAuditEvent: (...args: unknown[]) => writeSecurityAuditEvent(...args),
  hasRecordedSignIn: (...args: unknown[]) => hasRecordedSignIn(...args),
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
    hasRecordedSignIn.mockResolvedValue(false);
  });

  const input = {
    userId: "user-1",
    orgId: "org-1",
    surface: "web" as const,
    method: "totp" as const,
    sessionId: "session-1",
  };

  it("records once per session", async () => {
    await expect(recordCompletedSignIn(input)).resolves.toBe(true);
    expect(writeSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "succeeded",
        metadata: { surface: "web", method: "totp", sessionHash: hashSessionId("session-1") },
      }),
    );

    hasRecordedSignIn.mockResolvedValue(true);
    await expect(recordCompletedSignIn(input)).resolves.toBe(false);
    expect(writeSecurityAuditEvent).toHaveBeenCalledOnce();
  });

  it("still records a session it cannot identify", async () => {
    await expect(recordCompletedSignIn({ ...input, sessionId: null })).resolves.toBe(true);
    expect(hasRecordedSignIn).not.toHaveBeenCalled();
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
