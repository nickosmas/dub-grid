import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import {
  fetchPendingNotePublishChanges,
  fetchScheduleDraftBreakdown,
  publishScheduleDirect,
  recordNotePublishChanges,
} from "@/lib/server/schedule-draft-safety";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
});

/**
 * POST /api/shifts/publish
 * Server-side schedule publish with permission validation.
 */
export async function POST(req: NextRequest) {
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Auth check ────────────────────────────────────────────────────
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // ── Rate limit by user ID ─────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(reset)) } },
    );
  }

  // ── Input validation ──────────────────────────────────────────────
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

  const { orgId: requestedOrgId, startDate, endDate } = parsed.data;

  try {
    // ── Permission check ──────────────────────────────────────────────
    const orgAuth = await requireOrgPermissions(
      req,
      requestedOrgId,
      (permissions) =>
        permissions.isGridmaster || permissions.isSuperAdmin || permissions.canPublishSchedule,
      { actor: user },
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }
    const serviceClient = orgAuth.serviceClient;
    // Effective organization: a sandboxed caller publishes the sandbox.
    const orgId = orgAuth.orgId;

    // Snapshot the breakdown about to be published, for the audit log + client
    // response. Must read BEFORE publishScheduleDirect: that RPC consumes the
    // draft snapshots, so a post-publish read would show ~zero changes.
    const publishedSummary = await fetchScheduleDraftBreakdown({
      orgId,
      startDate,
      endDate,
      serviceClient,
    });

    // Same reason as the breakdown above: the RPC promotes draft notes and
    // deletes the removed ones, so the note history has to be read first.
    const pendingNoteChanges = await fetchPendingNotePublishChanges({
      orgId,
      startDate,
      endDate,
      serviceClient,
    });

    // ── Execute publish ─────────────────────────────────────────────
    const publishHistoryId = await publishScheduleDirect({
      orgId,
      startDate,
      endDate,
      actorId: user.id,
      client: serviceClient,
    });

    // Note history is written here rather than in publish_schedule: an RPC edit
    // never reaches a provisioned database without a full reset. A failure to
    // record it must not fail a publish that already committed.
    if (publishHistoryId) {
      try {
        await recordNotePublishChanges({
          orgId,
          publishHistoryId,
          changes: pendingNoteChanges,
          serviceClient,
        });
      } catch (noteHistoryError) {
        Sentry.captureException(noteHistoryError, {
          extra: { context: "shifts/publish/noteHistory", orgId },
        });
        logger.error({ error: noteHistoryError, orgId }, "Publishing note history failed");
      }
    }

    await serviceClient.from("audit_log").insert({
      org_id: orgId,
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: "schedule.published",
      resource_type: "schedule",
      resource_id: orgId,
      details: {
        startDate,
        endDate,
        summary: publishedSummary,
      },
    });

    return NextResponse.json({ success: true, summary: publishedSummary });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { context: "shifts/publish", orgId: requestedOrgId },
    });
    logger.error({ error: err, orgId: requestedOrgId }, "Schedule publish failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}
