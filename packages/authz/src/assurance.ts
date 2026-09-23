export const SENSITIVE_ACTION_FRESHNESS_SECONDS = 5 * 60;
export const SENSITIVE_ACTION_FUTURE_SKEW_SECONDS = 30;
export const STEP_UP_REQUIRED_CODE = "STEP_UP_REQUIRED";
export const STEP_UP_REQUIRED_MESSAGE = "Confirm your identity, then try again.";

export type AuthenticatorAssuranceLevel = "aal1" | "aal2";
export type SensitiveActionAuthenticationMethod = "password" | "totp";

export interface AuthenticationMethodReference {
  method: string;
  timestamp: number;
}

export interface AuthenticationAssuranceClaims {
  aal?: unknown;
  amr?: unknown;
}

export interface SensitiveActionStepUpRequired {
  code: typeof STEP_UP_REQUIRED_CODE;
  method: SensitiveActionAuthenticationMethod;
  error: typeof STEP_UP_REQUIRED_MESSAGE;
}

export type SensitiveActionAssuranceFailure =
  "invalid-proof" | "insufficient-aal" | "missing-proof" | "future-proof" | "stale-proof";

export type SensitiveActionAssuranceDecision =
  | {
      allowed: true;
      requiredMethod: SensitiveActionAuthenticationMethod;
      proof: {
        aal: AuthenticatorAssuranceLevel;
        method: SensitiveActionAuthenticationMethod;
        authenticatedAt: number;
      };
    }
  | {
      allowed: false;
      requiredMethod: SensitiveActionAuthenticationMethod;
      reason: SensitiveActionAssuranceFailure;
    };

export interface EvaluateSensitiveActionAssuranceInput {
  claims: AuthenticationAssuranceClaims;
  hasVerifiedTotpFactor: boolean;
  nowEpochSeconds?: number;
  freshnessSeconds?: number;
  futureSkewSeconds?: number;
}

/**
 * What a token's MFA claims say about this session.
 *
 * - `satisfied`: the access token hook reported no verified factor, or the
 *   caller already answered a challenge (aal2). Nothing to do.
 * - `challenge-required`: enrolled and below aal2. The caller can fix this
 *   themselves by completing the challenge, so sending them to the login
 *   screen terminates.
 * - `claim-unusable`: the claim is absent or malformed, so enrolment is
 *   unknown. Finding F-01: this used to be read as "not enrolled", which made
 *   a hook that stopped minting the claim disable enforcement in silence.
 *   It now fails closed. It is kept distinct from `challenge-required`
 *   because a challenge cannot supply a missing claim, so a caller must not
 *   be bounced to the login screen over it.
 */
export type MfaClaimState = "satisfied" | "challenge-required" | "claim-unusable";

export function evaluateMfaClaimState(claims: {
  aal?: unknown;
  mfa_enrolled?: unknown;
}): MfaClaimState {
  if (claims.mfa_enrolled === false) return "satisfied";
  if (claims.aal === "aal2") return "satisfied";
  if (claims.mfa_enrolled === true) return "challenge-required";
  return "claim-unusable";
}

export function createSensitiveActionStepUpRequired(
  method: SensitiveActionAuthenticationMethod,
): SensitiveActionStepUpRequired {
  return {
    code: STEP_UP_REQUIRED_CODE,
    method,
    error: STEP_UP_REQUIRED_MESSAGE,
  };
}

export function resolveVerifiedTotpFactorPresence(factors: unknown): boolean | null {
  // Supabase omits the factors field when empty. Callers must first validate
  // a successful live Auth user lookup, never pass cached session user data.
  if (factors === undefined) return false;
  if (!Array.isArray(factors)) return null;

  let hasVerifiedTotpFactor = false;
  for (const factor of factors) {
    if (
      typeof factor !== "object" ||
      factor === null ||
      typeof (factor as { factor_type?: unknown }).factor_type !== "string" ||
      !(factor as { factor_type: string }).factor_type ||
      !["verified", "unverified"].includes((factor as { status: string }).status)
    ) {
      return null;
    }

    if (
      (factor as { factor_type: string }).factor_type === "totp" &&
      (factor as { status: string }).status === "verified"
    ) {
      hasVerifiedTotpFactor = true;
    }
  }

  return hasVerifiedTotpFactor;
}

function isAuthenticatorAssuranceLevel(value: unknown): value is AuthenticatorAssuranceLevel {
  return value === "aal1" || value === "aal2";
}

function parseAuthenticationMethods(value: unknown): AuthenticationMethodReference[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const methods: AuthenticationMethodReference[] = [];
  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { method?: unknown }).method !== "string" ||
      (entry as { method: string }).method.length === 0 ||
      typeof (entry as { timestamp?: unknown }).timestamp !== "number" ||
      !Number.isSafeInteger((entry as { timestamp: number }).timestamp) ||
      (entry as { timestamp: number }).timestamp < 0
    ) {
      return null;
    }

    methods.push({
      method: (entry as { method: string }).method,
      timestamp: (entry as { timestamp: number }).timestamp,
    });
  }

  return methods;
}

export function evaluateSensitiveActionAssurance(
  input: EvaluateSensitiveActionAssuranceInput,
): SensitiveActionAssuranceDecision {
  const requiredMethod: SensitiveActionAuthenticationMethod = input.hasVerifiedTotpFactor
    ? "totp"
    : "password";
  const methods = parseAuthenticationMethods(input.claims.amr);

  if (!isAuthenticatorAssuranceLevel(input.claims.aal) || !methods) {
    return { allowed: false, requiredMethod, reason: "invalid-proof" };
  }

  if (input.hasVerifiedTotpFactor && input.claims.aal !== "aal2") {
    return { allowed: false, requiredMethod, reason: "insufficient-aal" };
  }

  const matchingTimestamps = methods
    .filter((entry) => entry.method === requiredMethod)
    .map((entry) => entry.timestamp);
  if (matchingTimestamps.length === 0) {
    return { allowed: false, requiredMethod, reason: "missing-proof" };
  }

  const authenticatedAt = Math.max(...matchingTimestamps);
  const nowEpochSeconds = input.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  const freshnessSeconds = input.freshnessSeconds ?? SENSITIVE_ACTION_FRESHNESS_SECONDS;
  const futureSkewSeconds = input.futureSkewSeconds ?? SENSITIVE_ACTION_FUTURE_SKEW_SECONDS;

  if (authenticatedAt > nowEpochSeconds + futureSkewSeconds) {
    return { allowed: false, requiredMethod, reason: "future-proof" };
  }

  if (nowEpochSeconds - authenticatedAt > freshnessSeconds) {
    return { allowed: false, requiredMethod, reason: "stale-proof" };
  }

  return {
    allowed: true,
    requiredMethod,
    proof: {
      aal: input.claims.aal,
      method: requiredMethod,
      authenticatedAt,
    },
  };
}
