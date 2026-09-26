import "server-only";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { withTimeoutOrThrow } from "@/lib/with-timeout";

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
 * Whether this Auth session already has its sign-in on record: a completed
 * sign-in, or the replacement session a reauthentication issued. A failed
 * read answers no: recording a sign-in twice beats losing it.
 */
export async function hasRecordedSignIn(input: {
  actorId: string;
  sessionHash: string;
}): Promise<boolean> {
  try {
    const read = Promise.resolve(
      getServiceClient()
        .from("audit_log")
        .select("id")
        .in("action", ["security.auth.login", "security.auth.mfa"])
        .eq("actor_id", input.actorId)
        .eq("details->>outcome", "succeeded")
        .eq("details->>sessionHash", input.sessionHash)
        .limit(1),
    );
    const { data, error } = await withTimeoutOrThrow(read, 1_000, "security audit read");
    if (error) throw error;
    return (data ?? []).length > 0;
  } catch (error) {
    logger.error({ error }, "Security audit read failed");
    return false;
  }
}
