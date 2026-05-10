import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { checkRateLimit, scheduleReviewLimiter } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { fetchScheduleDraftBreakdown } from "@/lib/server/schedule-draft-safety";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  orgId: z.string().uuid(),
  scope: z.enum(["all", "mine"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(
    scheduleReviewLimiter,
    user.id,
  );
  if (misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many schedule review requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
    );
  }

  const parsed = querySchema.safeParse({
    orgId: req.nextUrl.searchParams.get("orgId"),
    scope: req.nextUrl.searchParams.get("scope") ?? undefined,
    startDate: req.nextUrl.searchParams.get("startDate") ?? undefined,
    endDate: req.nextUrl.searchParams.get("endDate") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { orgId, scope = "all", startDate, endDate } = parsed.data;
  if ((startDate && !endDate) || (!startDate && endDate)) {
    return NextResponse.json({ error: "startDate and endDate must be provided together" }, { status: 400 });
  }

  try {
    const orgAuth = await requireOrgPermissions(
      req,
      orgId,
      (permissions) =>
        permissions.isGridmaster ||
        permissions.isSuperAdmin ||
        permissions.canEditShifts ||
        permissions.canPublishSchedule,
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }

    const summary = await fetchScheduleDraftBreakdown({
      orgId,
      startDate,
      endDate,
      updatedBy: scope === "mine" ? user.id : undefined,
      serviceClient: orgAuth.serviceClient,
    });

    return NextResponse.json({ summary });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "shifts/draft-summary", orgId } });
    logger.error({ error: err, orgId }, "Schedule draft summary failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
