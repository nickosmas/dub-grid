import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import {
  fetchEmployeeUtilization,
  fetchWeeklyShiftHours,
} from "@/lib/analytics";
import * as Sentry from "@/lib/sentry";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  orgId: z.string().uuid(),
  weeks: z.coerce.number().int().min(1).max(104).default(13),
});

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({
    orgId: req.nextUrl.searchParams.get("orgId"),
    weeks: req.nextUrl.searchParams.get("weeks") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { orgId, weeks } = parsed.data;
  const auth = await requireOrgPermissions(
    req,
    orgId,
    (permissions) => permissions.canViewDashboardAnalytics,
  );
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const [weeklyShiftHours, employeeUtilization] = await Promise.all([
      fetchWeeklyShiftHours(orgId, weeks),
      fetchEmployeeUtilization(orgId, weeks),
    ]);

    return NextResponse.json({ weeklyShiftHours, employeeUtilization });
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "dashboard/analytics", orgId, weeks },
    });
    logger.error({ error, orgId, weeks }, "Dashboard analytics failed");
    return NextResponse.json(
      { error: "Failed to load dashboard analytics" },
      { status: 500 },
    );
  }
}
