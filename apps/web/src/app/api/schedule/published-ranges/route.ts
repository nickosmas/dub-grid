import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { canSeeSchedulePublisher, requireOrgPermissions } from "@/app/api/shared/permissions";
import { apiErrorResponse } from "@/lib/error-handling";

const querySchema = z.object({
  orgId: z.string().uuid(),
  rangeStart: z.string().date(),
  rangeEnd: z.string().date(),
});

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
  }

  const auth = await requireOrgPermissions(
    req,
    parsed.data.orgId,
    (permissions) =>
      permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewSchedule,
  );
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { data, error } = await auth.serviceClient
      .from("publish_history")
      .select("start_date, end_date, published_at, published_by")
      .eq("org_id", auth.orgId)
      .lte("start_date", parsed.data.rangeEnd)
      .gte("end_date", parsed.data.rangeStart);
    if (error) {
      throw error;
    }

    const showPublisher = canSeeSchedulePublisher(auth.permissions);
    return NextResponse.json({
      ranges: (data ?? []).map((row: Record<string, unknown>) => ({
        startDate: row.start_date as string,
        endDate: row.end_date as string,
        publishedAt: row.published_at as string,
        publishedBy: showPublisher ? (row.published_by as string) : null,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error, "We couldn't load published ranges. Refresh and try again.");
  }
}
