import "server-only";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { TimeoutError, withTimeoutOrThrow } from "@/lib/with-timeout";

export type SecurityEventName =
  "security.auth.login" | "security.auth.recovery" | "security.auth.mfa" | "security.auth.session";

export type SecurityEventOutcome = "succeeded" | "challenged" | "rejected" | "throttled" | "failed";
export type SecurityEventReason =
  | "accepted"
  | "second_factor_required"
  | "invalid_credentials"
  | "policy_denied"
  | "rate_limited"
  | "service_unavailable"
  | "recovery_completed"
  | "factor_enrollment_started"
  | "factor_removed"
  | "reauthenticated"
  | "session_revoked"
  | "password_changed"
  | "organization_unavailable"
  | "organization_access_denied"
  | "gridmaster_portal_required"
  | "email_unconfirmed"
  | "account_disabled";

export type SecurityEventMetadata = {
  targetHash?: string;
  sourceHash?: string;
  surface?: "web" | "mobile";
  scope?: "local" | "others" | "global" | "device";
  method?: "password" | "totp" | "otp";
  /** SHA-256 of the Auth session id, so a completed sign-in is recorded once. */
  sessionHash?: string;
  /** The client stopped waiting before the sign-in finished, so it got no tokens. */
  clientGone?: boolean;
  /** Whether the session created for that abandoned sign-in was ended (F-78). */
  sessionDiscarded?: boolean;
};

export type SecurityAuditEvent = {
  event: SecurityEventName;
  outcome: SecurityEventOutcome;
  reason: SecurityEventReason;
  actorId?: string | null;
  orgId?: string | null;
  metadata?: SecurityEventMetadata;
};

/** Writes bounded, secret-free security evidence without affecting the Auth result. */
export async function writeSecurityAuditEvent(input: SecurityAuditEvent): Promise<void> {
  try {
    const write = Promise.resolve(
      getServiceClient()
        .from("audit_log")
        .insert({
          org_id: input.orgId ?? null,
          actor_id: input.actorId ?? null,
          actor_email: null,
          action: input.event,
          resource_type: "user",
          resource_id: null,
          details: {
            outcome: input.outcome,
            reason: input.reason,
            ...(input.metadata ?? {}),
          },
        }),
    );
    const { error } = await withTimeoutOrThrow(write, 1_000, "security audit write");
    if (error) throw error;
  } catch (error) {
    logger.error({ error, event: input.event }, "Security audit write failed");
  }
}

/**
 * Records a completed sign-in unless this Auth session already has one on
 * record (a completed sign-in, or the replacement session a reauthentication
 * issued), checked and written in one locked step in the database (073,
 * F-25). Null when the call fails, so the caller can still record it:
 * recording a sign-in twice beats losing it. A call that only runs past the
 * deadline is not cancelled and still records, so it answers no rather than
 * handing the caller a second write (F-127).
 */
export async function recordSignInOnce(input: {
  actorId: string;
  orgId: string | null;
  metadata: SecurityEventMetadata & { sessionHash: string };
}): Promise<boolean | null> {
  try {
    const call = Promise.resolve(
      getServiceClient().rpc("record_sign_in_once", {
        p_actor_id: input.actorId,
        p_org_id: input.orgId,
        p_details: input.metadata,
      }),
    );
    const { data, error } = await withTimeoutOrThrow(call, 1_000, "security audit sign-in record");
    if (error) throw error;
    return data === true;
  } catch (error) {
    logger.error({ error }, "Security audit sign-in record failed");
    return error instanceof TimeoutError ? false : null;
  }
}
