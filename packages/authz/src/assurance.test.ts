import { describe, expect, it } from "vitest";

import {
  SENSITIVE_ACTION_FRESHNESS_SECONDS,
  SENSITIVE_ACTION_FUTURE_SKEW_SECONDS,
  STEP_UP_REQUIRED_CODE,
  STEP_UP_REQUIRED_MESSAGE,
  createSensitiveActionStepUpRequired,
  evaluateSensitiveActionAssurance,
  resolveVerifiedTotpFactorPresence,
  type AuthenticationAssuranceClaims,
  evaluateMfaClaimState,
} from "./assurance";

const NOW = 1_789_064_802;

function evaluate(claims: AuthenticationAssuranceClaims, hasVerifiedTotpFactor = false) {
  return evaluateSensitiveActionAssurance({
    claims,
    hasVerifiedTotpFactor,
    nowEpochSeconds: NOW,
  });
}

describe("evaluateSensitiveActionAssurance", () => {
  it.each([
    {
      name: "recent password proof for an account without TOTP",
      claims: { aal: "aal1", amr: [{ method: "password", timestamp: NOW - 60 }] },
      hasVerifiedTotpFactor: false,
      requiredMethod: "password",
    },
    {
      name: "recent TOTP proof at AAL2 for an account with TOTP",
      claims: {
        aal: "aal2",
        amr: [
          { method: "password", timestamp: NOW - 3_600 },
          { method: "totp", timestamp: NOW - 60 },
        ],
      },
      hasVerifiedTotpFactor: true,
      requiredMethod: "totp",
    },
    {
      name: "proof at the exact freshness boundary",
      claims: {
        aal: "aal1",
        amr: [{ method: "password", timestamp: NOW - SENSITIVE_ACTION_FRESHNESS_SECONDS }],
      },
      hasVerifiedTotpFactor: false,
      requiredMethod: "password",
    },
    {
      name: "proof at the allowed future-skew boundary",
      claims: {
        aal: "aal1",
        amr: [
          {
            method: "password",
            timestamp: NOW + SENSITIVE_ACTION_FUTURE_SKEW_SECONDS,
          },
        ],
      },
      hasVerifiedTotpFactor: false,
      requiredMethod: "password",
    },
  ])("accepts $name", ({ claims, hasVerifiedTotpFactor, requiredMethod }) => {
    const decision = evaluate(claims, hasVerifiedTotpFactor);

    expect(decision.allowed).toBe(true);
    expect(decision.requiredMethod).toBe(requiredMethod);
  });

  it.each([
    {
      name: "missing AAL",
      claims: { amr: [{ method: "password", timestamp: NOW }] },
      hasVerifiedTotpFactor: false,
      reason: "invalid-proof",
    },
    {
      name: "unknown AAL",
      claims: { aal: "aal3", amr: [{ method: "password", timestamp: NOW }] },
      hasVerifiedTotpFactor: false,
      reason: "invalid-proof",
    },
    {
      name: "missing AMR",
      claims: { aal: "aal1" },
      hasVerifiedTotpFactor: false,
      reason: "invalid-proof",
    },
    {
      name: "non-array AMR",
      claims: { aal: "aal1", amr: "password" },
      hasVerifiedTotpFactor: false,
      reason: "invalid-proof",
    },
    {
      name: "malformed AMR entry",
      claims: { aal: "aal1", amr: [{ method: "password", timestamp: "now" }] },
      hasVerifiedTotpFactor: false,
      reason: "invalid-proof",
    },
    {
      name: "AAL1 for a TOTP account",
      claims: { aal: "aal1", amr: [{ method: "totp", timestamp: NOW }] },
      hasVerifiedTotpFactor: true,
      reason: "insufficient-aal",
    },
    {
      name: "wrong authentication method",
      claims: { aal: "aal2", amr: [{ method: "password", timestamp: NOW }] },
      hasVerifiedTotpFactor: true,
      reason: "missing-proof",
    },
    {
      name: "proof older than the freshness window",
      claims: {
        aal: "aal1",
        amr: [
          {
            method: "password",
            timestamp: NOW - SENSITIVE_ACTION_FRESHNESS_SECONDS - 1,
          },
        ],
      },
      hasVerifiedTotpFactor: false,
      reason: "stale-proof",
    },
    {
      name: "proof beyond the future-skew window",
      claims: {
        aal: "aal1",
        amr: [
          {
            method: "password",
            timestamp: NOW + SENSITIVE_ACTION_FUTURE_SKEW_SECONDS + 1,
          },
        ],
      },
      hasVerifiedTotpFactor: false,
      reason: "future-proof",
    },
  ])("rejects $name", ({ claims, hasVerifiedTotpFactor, reason }) => {
    expect(evaluate(claims, hasVerifiedTotpFactor)).toEqual({
      allowed: false,
      requiredMethod: hasVerifiedTotpFactor ? "totp" : "password",
      reason,
    });
  });

  it("uses the newest matching proof when AMR records survive token refresh", () => {
    const originalClaims = {
      aal: "aal1",
      iat: NOW - 1_000,
      amr: [{ method: "password", timestamp: NOW - 301 }],
    };
    const refreshedClaims = { ...originalClaims, iat: NOW };

    expect(evaluate(originalClaims)).toMatchObject({
      allowed: false,
      reason: "stale-proof",
    });
    expect(evaluate(refreshedClaims)).toMatchObject({
      allowed: false,
      reason: "stale-proof",
    });
  });

  it("chooses the newest matching authentication-method timestamp", () => {
    const decision = evaluate({
      aal: "aal1",
      amr: [
        { method: "password", timestamp: NOW - 400 },
        { method: "password", timestamp: NOW - 20 },
      ],
    });

    expect(decision).toEqual({
      allowed: true,
      requiredMethod: "password",
      proof: { aal: "aal1", method: "password", authenticatedAt: NOW - 20 },
    });
  });
});

describe("sensitive-action server contract", () => {
  it.each([
    [undefined, false],
    [[], false],
    [[{ factor_type: "totp", status: "unverified" }], false],
    [[{ factor_type: "totp", status: "verified" }], true],
    [[{ factor_type: "phone", status: "verified" }], false],
  ])("resolves live factor state without trusting a profile flag", (factors, expected) => {
    expect(resolveVerifiedTotpFactorPresence(factors)).toBe(expected);
  });

  it.each([
    null,
    {},
    [{ factor_type: "totp" }],
    [{ status: "verified" }],
    [{ factor_type: "totp", status: "invalid" }],
    [{ factor_type: "", status: "verified" }],
  ])("fails closed when live factor state is unavailable or malformed", (factors) => {
    expect(resolveVerifiedTotpFactorPresence(factors)).toBeNull();
  });

  it("returns only the safe fields clients need to request step-up", () => {
    expect(createSensitiveActionStepUpRequired("totp")).toEqual({
      code: STEP_UP_REQUIRED_CODE,
      method: "totp",
      error: STEP_UP_REQUIRED_MESSAGE,
    });
  });
});

describe("evaluateMfaClaimState", () => {
  it("passes an account the hook reported as having no factor", () => {
    expect(evaluateMfaClaimState({ mfa_enrolled: false, aal: "aal1" })).toBe("satisfied");
  });

  it("passes anyone who already answered a challenge, claim or no claim", () => {
    expect(evaluateMfaClaimState({ mfa_enrolled: true, aal: "aal2" })).toBe("satisfied");
    expect(evaluateMfaClaimState({ aal: "aal2" })).toBe("satisfied");
  });

  it("asks an enrolled account below aal2 to answer one", () => {
    expect(evaluateMfaClaimState({ mfa_enrolled: true, aal: "aal1" })).toBe("challenge-required");
    expect(evaluateMfaClaimState({ mfa_enrolled: true })).toBe("challenge-required");
  });

  it("fails closed when the claim is absent, so a hook that stopped minting it is not a bypass", () => {
    // Finding F-01. This returned "not enrolled" until migration 041.
    expect(evaluateMfaClaimState({ aal: "aal1" })).toBe("claim-unusable");
    expect(evaluateMfaClaimState({})).toBe("claim-unusable");
  });

  it("fails closed on a value of the wrong type rather than reading it as a boolean", () => {
    expect(evaluateMfaClaimState({ mfa_enrolled: "true", aal: "aal1" })).toBe("claim-unusable");
    expect(evaluateMfaClaimState({ mfa_enrolled: "false", aal: "aal1" })).toBe("claim-unusable");
    expect(evaluateMfaClaimState({ mfa_enrolled: 1, aal: "aal1" })).toBe("claim-unusable");
    expect(evaluateMfaClaimState({ mfa_enrolled: null, aal: "aal1" })).toBe("claim-unusable");
  });

  it("separates the two refusals, because a challenge cannot supply a missing claim", () => {
    expect(evaluateMfaClaimState({ mfa_enrolled: true, aal: "aal1" })).not.toBe(
      evaluateMfaClaimState({ aal: "aal1" }),
    );
  });
});
