import { createTokenScopedClient } from "@/lib/api-auth";
import { verifyAccessToken } from "@/lib/auth/verify-token";
import {
  revokeAllUserSessions,
  revokeOtherUserSessions,
  revokeSession,
} from "@/lib/auth/revocation";
import { writeSecurityAuditEvent } from "@/lib/auth/security-audit";
import { hashSessionId } from "@/lib/auth/sign-in-completion";
import { getServiceClient } from "@/lib/supabase-service";
import { withTimeoutOrThrow } from "@/lib/with-timeout";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

export type SignOutScope = "local" | "others" | "global";

export const BULK_SIGN_OUT_FAILURE_MESSAGE =
  "We couldn't finish signing out those devices. Check your sessions before trying again.";

const RECOVERY_PROOF_MAX_AGE_SECONDS = 15 * 60;

const ORG_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function parseSignOutBody(body: unknown): {
  scope: SignOutScope;
  recoveryCompletion: boolean;
  passwordChange: boolean;
  hostRefusal: { orgSlug: string } | null;
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
    // A claim to be checked, never trusted: see recordHostOrganizationRefusal.
    hostRefusal:
      scope === "local" &&
      input.reason === "organization_access_denied" &&
      typeof input.orgSlug === "string" &&
      ORG_SLUG.test(input.orgSlug)
        ? { orgSlug: input.orgSlug }
        : null,
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
export async function revokeLocalSession(
  accessToken: string | null,
  hostRefusal: { orgSlug: string } | null = null,
): Promise<void> {
  if (!accessToken) return;
  const verified = await verifyAccessToken(accessToken);
  if (!verified?.sessionId) return;
  if (hostRefusal) {
    await recordHostOrganizationRefusal(verified.userId, verified.sessionId, hostRefusal.orgSlug);
  }
  try {
    await revokeSession(verified.sessionId);
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "sign-out-revocation" } });
  }
}

/**
 * Records the sign-in the web two-factor path refused because the person has
 * no access to the organization they signed in on (F-28), as the login route
 * records it on the password path. The browser only claims the refusal: the
 * row is written only when the organization exists, the verified caller has no
 * active membership in it, and this session has no such row yet. Any failed
 * read records nothing, since the sign-out must still complete.
 */
export async function recordHostOrganizationRefusal(
  userId: string,
  sessionId: string,
  orgSlug: string,
): Promise<boolean> {
  const sessionHash = hashSessionId(sessionId);
  try {
    const service = getServiceClient();
    const { data: org, error: orgError } = await withTimeoutOrThrow(
      Promise.resolve(service.from("organizations").select("id").eq("slug", orgSlug).maybeSingle()),
      1_000,
      "refusal organization read",
    );
    if (orgError || !org) return false;
    const [membership, recorded] = await withTimeoutOrThrow(
      Promise.all([
        service
          .from("organization_memberships")
          .select("user_id")
          .eq("org_id", org.id)
          .eq("user_id", userId)
          .is("archived_at", null)
          .maybeSingle(),
        service
          .from("audit_log")
          .select("id")
          .eq("action", "security.auth.login")
          .eq("actor_id", userId)
          .eq("details->>reason", "organization_access_denied")
          .eq("details->>sessionHash", sessionHash)
          .limit(1),
      ]),
      1_000,
      "refusal membership read",
    );
    if (membership.error || membership.data) return false;
    if (recorded.error || (recorded.data ?? []).length > 0) return false;
  } catch (error) {
    logger.error({ error }, "Host organization refusal check failed");
    return false;
  }
  await writeSecurityAuditEvent({
    event: "security.auth.login",
    outcome: "rejected",
    reason: "organization_access_denied",
    // Not a member, so the organization's own log must not carry the row.
    orgId: null,
    actorId: userId,
    metadata: { surface: "web", method: "totp", sessionHash },
  });
  return true;
}
