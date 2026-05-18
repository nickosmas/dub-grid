import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import {
  fetchScheduleDraftBreakdown,
  publishScheduleDirect,
} from "@/lib/server/schedule-draft-safety";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

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
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
    );
  }

  // ── Input validation ──────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { orgId, startDate, endDate } = parsed.data;

  try {
    // ── Permission check ──────────────────────────────────────────────
    const orgAuth = await requireOrgPermissions(
      req,
      orgId,
      (permissions) =>
        permissions.isGridmaster ||
        permissions.isSuperAdmin ||
        permissions.canPublishSchedule,
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }
    const serviceClient = orgAuth.serviceClient;

    // Snapshot the breakdown about to be published, for the audit log + client
    // response. Must read BEFORE publishScheduleDirect: that RPC consumes the
    // draft snapshots, so a post-publish read would show ~zero changes.
    const publishedSummary = await fetchScheduleDraftBreakdown({
      orgId,
      startDate,
      endDate,
      serviceClient,
    });

    // ── Execute publish ─────────────────────────────────────────────
    await publishScheduleDirect({
      orgId,
      startDate,
      endDate,
      actorId: user.id,
      client: serviceClient,
    });

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
    Sentry.captureException(err, { extra: { context: "shifts/publish", orgId } });
    logger.error({ error: err, orgId }, "Schedule publish failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
