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
 * True when this session belongs to an account with a verified TOTP factor
 * but has not answered a challenge, which every access path must refuse.
 *
 * `mfa_enrolled` is set by the access token hook from `auth.mfa_factors` on
 * every mint and refresh (migration 037), so enrolling or unenrolling heals
 * on the next token. A token minted before that migration carries no claim
 * and is treated as not enrolled, which is what keeps the rollout from
 * logging everyone out; the sensitive-action gate still checks live factor
 * state for the actions that matter most.
 */
export function requiresMfaChallenge(claims: { aal?: unknown; mfa_enrolled?: unknown }): boolean {
  return claims.mfa_enrolled === true && claims.aal !== "aal2";
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
