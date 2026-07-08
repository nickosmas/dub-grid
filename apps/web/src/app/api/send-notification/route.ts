import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { dispatchNotificationEvent, type NotificationEvent } from "@/features/notifications/server";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

// ── Input schemas ────────────────────────────────────────────────────────

const shiftRequestSchema = z.object({
  action: z.enum(["shift_request_created", "shift_request_claimed", "shift_request_resolved"]),
  orgId: z.string().uuid(),
  requestId: z.string().uuid(),
  requestType: z.enum(["pickup", "swap", "calloff"]),
  /** For resolved: was it approved or rejected? */
  approved: z.boolean().optional(),
  /** For resolved: optional admin note */
  adminNote: z.string().max(500).optional(),
});

const schedulePublishedSchema = z.object({
  action: z.literal("schedule_published"),
  orgId: z.string().uuid(),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(),
});

const roleChangedSchema = z.object({
  action: z.literal("role_changed"),
  orgId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  fromRole: z.string().max(50),
  toRole: z.string().max(50),
});

const bodySchema = z.discriminatedUnion("action", [
  shiftRequestSchema,
  schedulePublishedSchema,
  roleChangedSchema,
]);

// ── Route handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── CSRF ────────────────────────────────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Auth ────────────────────────────────────────────────────────────
  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;
  const { user, claims } = auth;

  // ── Rate limit ──────────────────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (limited) {
    const retryAfter = reset ? Math.ceil((reset - Date.now()) / 1000) : 60;
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const data = parsed.data;

  // Sandbox redirect — must run BEFORE the org-isolation check below,
  // because claims.org_id is the sandbox in sandbox mode while data.orgId
  // is the unrefreshed-JWT-derived real org id from the client.
  const effective = await resolveEffectiveOrgId(req, user.id, data.orgId);
  if (effective !== data.orgId) {
    (data as { orgId: string }).orgId = effective;
  }

  // ── Org isolation: verify the caller's JWT org_id matches the body orgId ──
  const claimOrgId = typeof claims.org_id === "string" ? claims.org_id : null;
  if (claimOrgId && claimOrgId !== data.orgId) {
    return NextResponse.json(
      { error: "Org mismatch: cannot send notifications for another org" },
      { status: 403 },
    );
  }

  try {
    const result = await dispatchNotificationEvent(user.id, data as NotificationEvent);
    if (!result.success) {
      Sentry.captureException(new Error(result.error), {
        extra: { context: "send-notification", action: data.action },
      });
      return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    // dispatchNotificationEvent now catches internally; this is a true
    // unexpected throw (e.g. cycle of imports failing), not a notification
    // pipeline failure.
    Sentry.captureException(err, { extra: { context: "send-notification" } });
    logger.error({ err, action: data.action }, "Failed to send notification");
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
