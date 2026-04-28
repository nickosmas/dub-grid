import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase-service";
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
    const serviceClient = getServiceClient();
    const [{ data: membership }, { data: profile }] = await Promise.all([
      serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .maybeSingle(),
      serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", user.id)
        .single(),
    ]);

    const isGridmaster = profile?.platform_role === "gridmaster";
    const isSuperAdmin = membership?.org_role === "super_admin";
    const isAdmin = membership?.org_role === "admin";
    const adminPerms = membership?.admin_permissions as Record<string, boolean> | null;

    const hasPermission =
      isGridmaster
      || isSuperAdmin
      || (isAdmin && (adminPerms?.canEditShifts === true || adminPerms?.canPublishSchedule === true));

    if (!hasPermission) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const summary = await fetchScheduleDraftBreakdown({
      orgId,
      startDate,
      endDate,
      updatedBy: scope === "mine" ? user.id : undefined,
      serviceClient,
    });

    return NextResponse.json({ summary });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "shifts/draft-summary", orgId } });
    logger.error({ error: err, orgId }, "Schedule draft summary failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
