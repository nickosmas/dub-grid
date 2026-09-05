import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { serverEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";

// Hourly sweeper. Two passes:
//   1. shift_requests where expires_at < now AND status IN ('open','pending_approval')
//      → set status='expired', dispatch shift_request_expired to the requester
//   2. invitations where expires_at < now AND accepted_at IS NULL AND revoked_at IS NULL
//      → dispatch invitation_expired to inviter + org super_admins
//
// Status transition is the deduplication mechanism for shift_requests (next run
// won't pick the row up again). Invitations have no expired status column, so
// the dispatcher's hasExistingNotification guard prevents double-fires.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.

const BATCH_LIMIT = 500;

export async function GET(req: NextRequest) {
  const secret = serverEnv?.CRON_SECRET;
  if (!secret) {
    logger.error("CRON_SECRET not configured — refusing to run expire-requests");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: API_ERRORS.UNAUTHORIZED }, { status: 401 });
  }
  if (!(await isFeatureEnabled("cron_expire_requests"))) {
    // 200, not 503 — this is an intentional gridmaster kill-switch flip, not a
    // misconfiguration, and a status-code-only monitor shouldn't treat it as one.
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const db = getServiceClient();
  const now = new Date().toISOString();

  // ── Pass 1: shift_requests ─────────────────────────────────────────────
  // Fetch first so we have request_id + type + org_id for dispatch; then UPDATE
  // status='expired' so the next run doesn't pick the same rows.
  const { data: staleRequests, error: srSelectError } = await db
    .from("shift_requests")
    .select("id, org_id, type")
    .lt("expires_at", now)
    .in("status", ["open", "pending_approval"])
    .limit(BATCH_LIMIT);
  if (srSelectError) {
    logger.error({ error: srSelectError }, "expire-requests: shift_requests select failed");
  }

  let shiftRequestsExpired = 0;
  for (const row of staleRequests ?? []) {
    const { error: updateError } = await db
      .from("shift_requests")
      .update({ status: "expired" })
      .eq("id", row.id)
      .in("status", ["open", "pending_approval"]); // re-check to avoid races
    if (updateError) {
      logger.warn(
        { error: updateError, requestId: row.id },
        "expire-requests: failed to mark shift_request expired",
      );
      continue;
    }
    const type = row.type as "pickup" | "swap" | "calloff" | string;
    if (type !== "pickup" && type !== "swap" && type !== "calloff") continue;
    await dispatchNotificationEvent("expire-requests-cron", {
      action: "shift_request_expired",
      orgId: row.org_id as string,
      requestId: row.id as string,
      requestType: type,
    });
    shiftRequestsExpired += 1;
  }

  // ── Pass 2: invitations ────────────────────────────────────────────────
  // No status column — pending = neither accepted nor revoked. Re-dispatch is
  // idempotent because the dispatcher dedupes on invitationId metadata.
  const { data: staleInvites, error: invSelectError } = await db
    .from("invitations")
    .select("id, org_id, email")
    .lt("expires_at", now)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .limit(BATCH_LIMIT);
  if (invSelectError) {
    logger.error({ error: invSelectError }, "expire-requests: invitations select failed");
  }

  let invitationsExpired = 0;
  for (const row of staleInvites ?? []) {
    await dispatchNotificationEvent("expire-requests-cron", {
      action: "invitation_expired",
      orgId: row.org_id as string,
      invitationId: row.id as string,
      inviteeEmail: row.email as string,
    });
    invitationsExpired += 1;
  }

  return NextResponse.json({
    ok: true,
    shiftRequestsExpired,
    invitationsExpired,
  });
}
