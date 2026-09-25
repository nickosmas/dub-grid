import { createTokenScopedClient } from "@/lib/api-auth";
import { verifyAccessToken } from "@/lib/auth/verify-token";
import {
  revokeAllUserSessions,
  revokeOtherUserSessions,
  revokeSession,
} from "@/lib/auth/revocation";
import { writeSecurityAuditEvent } from "@/lib/auth/security-audit";
import * as Sentry from "@/lib/sentry";

export type SignOutScope = "local" | "others" | "global";

export const BULK_SIGN_OUT_FAILURE_MESSAGE =
  "We couldn't finish signing out those devices. Check your sessions before trying again.";

const RECOVERY_PROOF_MAX_AGE_SECONDS = 15 * 60;

export function parseSignOutBody(body: unknown): {
  scope: SignOutScope;
  recoveryCompletion: boolean;
  passwordChange: boolean;
} {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const scope: SignOutScope =
    input.scope === "global" || input.scope === "others" ? input.scope : "local";
  return {
    scope,
    recoveryCompletion: scope === "global" && input.reason === "password_recovery",
    // The client says why; it only relabels a sign-out the caller may already
    // make, so the audit trail can tell a password change apart (41b2).
    passwordChange: scope === "global" && input.reason === "password_change",
  };
}

export function hasFreshRecoveryProof(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const methods = (claims as { amr?: unknown }).amr;
  if (!Array.isArray(methods)) return false;
  const now = Math.floor(Date.now() / 1000);
  return methods.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const proof = entry as { method?: unknown; timestamp?: unknown };
    return (
      proof.method === "otp" &&
      typeof proof.timestamp === "number" &&
      Number.isSafeInteger(proof.timestamp) &&
      proof.timestamp <= now + 60 &&
      now - proof.timestamp <= RECOVERY_PROOF_MAX_AGE_SECONDS
    );
  });
}

/**
 * Signs out other devices, or every device, for the caller whose assurance the
 * route has already checked. Throws on any partial failure, which callers
 * report without replaying.
 */
export async function revokeBulkSessions(input: {
  accessToken: string;
  userId: string;
  sessionId: string;
  scope: "others" | "global";
  recoveryCompletion: boolean;
  passwordChange?: boolean;
  orgId: string | null;
}): Promise<void> {
  // The SDK admin transport accepts the caller's JWT here, not a service
  // credential. Use precisely the token whose assurance was just checked.
  const { error } = await createTokenScopedClient(input.accessToken).auth.admin.signOut(
    input.accessToken,
    input.scope,
  );
  if (error) throw new Error("Provider sign-out failed");
  if (input.scope === "global") await revokeAllUserSessions(input.userId);
  else await revokeOtherUserSessions(input.userId, input.sessionId);
  await writeSecurityAuditEvent({
    event: input.recoveryCompletion ? "security.auth.recovery" : "security.auth.session",
    outcome: "succeeded",
    reason: input.recoveryCompletion
      ? "recovery_completed"
      : input.passwordChange
        ? "password_changed"
        : "session_revoked",
    actorId: input.userId,
    orgId: input.orgId,
    metadata: {
      scope: input.scope,
      ...(input.recoveryCompletion ? { method: "otp" as const } : {}),
    },
  });
}

/**
 * Best-effort revocation of one token's session. Never fails: a caller whose
 * session is already gone has nothing left to revoke and must still be able to
 * finish signing out.
 */
export async function revokeLocalSession(accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  const verified = await verifyAccessToken(accessToken);
  if (!verified?.sessionId) return;
  try {
    await revokeSession(verified.sessionId);
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "sign-out-revocation" } });
  }
}
