import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/security-audit", () => ({ writeSecurityAuditEvent: vi.fn() }));

import { hasFreshSecondFactor } from "./sign-in-completion";

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
