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

const bodySchema = z.object({
  orgId: z.string().uuid(),
  scope: z.enum(["mine", "all"]),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

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

  const { orgId, scope } = parsed.data;

  try {
    const orgAuth = await requireOrgPermissions(req, orgId, (permissions) =>
      scope === "all"
        ? permissions.isGridmaster || permissions.isSuperAdmin
        : permissions.isGridmaster ||
          permissions.isSuperAdmin ||
          permissions.canEditShifts ||
          permissions.canPublishSchedule,
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }
    const serviceClient = orgAuth.serviceClient;

    // Snapshot the breakdown that's about to be discarded, for the audit log.
    const discardedSummary = await fetchScheduleDraftBreakdown({
      orgId,
      updatedBy: scope === "mine" ? user.id : undefined,
      serviceClient,
    });

    await discardScheduleDraftsDirect({
      orgId,
      userId: scope === "mine" ? user.id : undefined,
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
        summary: discardedSummary,
      },
    });

    return NextResponse.json({ success: true, summary: discardedSummary });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "shifts/discard", orgId } });
    logger.error({ error: err, orgId }, "Schedule discard failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
