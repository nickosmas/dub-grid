import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import {
  discardScheduleDraftsDirect,
  fetchScheduleDraftBreakdown,
} from "@/lib/server/schedule-draft-safety";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const bodySchema = z.object({
  orgId: z.string().uuid(),
  scope: z.enum(["mine", "all"]),
  // Bounds the discard to one window, mirroring /api/shifts/publish. The two
  // sit side by side in the same banner under the same count, so they have to
  // act on the same set of drafts. Optional for callers with no window.
  startDate: z.string().regex(ISO_DATE).optional(),
  endDate: z.string().regex(ISO_DATE).optional(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
    );
  }

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

  const { orgId, scope, startDate, endDate } = parsed.data;

  try {
    const orgAuth = await requireOrgPermissions(
      req,
      orgId,
      (permissions) =>
        scope === "all"
          ? permissions.isGridmaster || permissions.isSuperAdmin
          : permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canEditShifts ||
            permissions.canPublishSchedule,
      { actor: user },
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }
    const serviceClient = orgAuth.serviceClient;

    // Snapshot the breakdown that's about to be discarded, for the audit log.
    const discardedSummary = await fetchScheduleDraftBreakdown({
      orgId,
      updatedBy: scope === "mine" ? user.id : undefined,
      startDate,
      endDate,
      serviceClient,
    });

    await discardScheduleDraftsDirect({
      orgId,
      userId: scope === "mine" ? user.id : undefined,
      startDate,
      endDate,
      serviceClient,
    });

    await serviceClient.from("audit_log").insert({
      org_id: orgId,
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: "schedule.drafts_discarded",
      resource_type: "schedule",
      resource_id: orgId,
      details: {
        scope,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        summary: discardedSummary,
      },
    });

    return NextResponse.json({ success: true, summary: discardedSummary });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "shifts/discard", orgId } });
    logger.error({ error: err, orgId }, "Schedule discard failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}
