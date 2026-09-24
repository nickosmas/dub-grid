import "server-only";

import { writeSecurityAuditEvent } from "@/lib/auth/security-audit";

const SECOND_FACTOR_MAX_AGE_SECONDS = 10 * 60;

/**
 * Whether these claims carry a second factor verified in the last ten minutes,
 * which is what separates finishing a sign-in from replaying an old session.
 */
export function hasFreshSecondFactor(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const { aal, amr } = claims as { aal?: unknown; amr?: unknown };
  if (aal !== "aal2" || !Array.isArray(amr)) return false;
  const now = Math.floor(Date.now() / 1000);
  return amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const proof = entry as { method?: unknown; timestamp?: unknown };
    return (
      proof.method === "totp" &&
      typeof proof.timestamp === "number" &&
      proof.timestamp <= now + 60 &&
      now - proof.timestamp <= SECOND_FACTOR_MAX_AGE_SECONDS
    );
  });
}

/**
 * The password step of a two-factor sign-in is recorded as challenged. This is
 * the success record, written once the second factor is verified, against the
 * organization the finished session is actually in.
 */
export async function recordSecondFactorSignIn(input: {
  userId: string;
  orgId: string | null;
  surface: "web" | "mobile";
}): Promise<void> {
  await writeSecurityAuditEvent({
    event: "security.auth.login",
    outcome: "succeeded",
    reason: "accepted",
    actorId: input.userId,
    orgId: input.orgId,
    metadata: { surface: input.surface, method: "totp" },
  });
}
