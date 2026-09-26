import "server-only";

import { createHash } from "node:crypto";
import { hasRecordedSignIn, writeSecurityAuditEvent } from "@/lib/auth/security-audit";

const FRESH_PROOF_MAX_AGE_SECONDS = 10 * 60;

function hasFreshProof(claims: unknown, method: "totp" | "password"): boolean {
  if (!claims || typeof claims !== "object") return false;
  const { amr } = claims as { amr?: unknown };
  if (!Array.isArray(amr)) return false;
  const now = Math.floor(Date.now() / 1000);
  return amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const proof = entry as { method?: unknown; timestamp?: unknown };
    return (
      proof.method === method &&
      typeof proof.timestamp === "number" &&
      proof.timestamp <= now + 60 &&
      now - proof.timestamp <= FRESH_PROOF_MAX_AGE_SECONDS
    );
  });
}

/**
 * Whether these claims carry a second factor verified in the last ten minutes,
 * which is what separates finishing a sign-in from replaying an old session.
 */
export function hasFreshSecondFactor(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  return (claims as { aal?: unknown }).aal === "aal2" && hasFreshProof(claims, "totp");
}

/**
 * How this session just finished signing in, if it did: a fresh second factor,
 * or a fresh password on an account with no second factor to ask for. A
 * password alone on an account that has one is only the first step.
 */
export function freshSignInMethod(
  claims: unknown,
  hasSecondFactor: boolean,
): "totp" | "password" | null {
  if (hasFreshSecondFactor(claims)) return "totp";
  if (hasSecondFactor) return null;
  return hasFreshProof(claims, "password") ? "password" : null;
}

export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

/** The session hash for a raw access token, or null when it names no session. */
export function sessionHashOf(accessToken: string): string | null {
  try {
    const [, payload] = accessToken.split(".");
    const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as {
      session_id?: unknown;
    };
    return typeof claims.session_id === "string" ? hashSessionId(claims.session_id) : null;
  } catch {
    return null;
  }
}

/**
 * Records a completed sign-in against the organization the finished session is
 * actually in, once per Auth session: a repeat call for the same session
 * records nothing. Returns whether it recorded.
 */
export async function recordCompletedSignIn(input: {
  userId: string;
  orgId: string | null;
  surface: "web" | "mobile";
  method: "totp" | "password";
  sessionId: string | null;
}): Promise<boolean> {
  const sessionHash = input.sessionId ? hashSessionId(input.sessionId) : undefined;
  if (sessionHash && (await hasRecordedSignIn({ actorId: input.userId, sessionHash }))) {
    return false;
  }
  await writeSecurityAuditEvent({
    event: "security.auth.login",
    outcome: "succeeded",
    reason: "accepted",
    actorId: input.userId,
    orgId: input.orgId,
    metadata: {
      surface: input.surface,
      method: input.method,
      ...(sessionHash ? { sessionHash } : {}),
    },
  });
  return true;
}
