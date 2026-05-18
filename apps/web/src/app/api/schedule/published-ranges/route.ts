import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { apiErrorResponse } from "@/lib/error-handling";

const querySchema = z.object({
  orgId: z.string().uuid(),
  rangeStart: z.string().date(),
  rangeEnd: z.string().date(),
});

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const auth = await requireOrgPermissions(
    req,
    parsed.data.orgId,
    (permissions) =>
      permissions.isGridmaster ||
      permissions.isSuperAdmin ||
      permissions.canViewSchedule,
  );
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { data, error } = await auth.serviceClient
      .from("publish_history")
      .select("start_date, end_date")
      .eq("org_id", auth.orgId)
      .lte("start_date", parsed.data.rangeEnd)
      .gte("end_date", parsed.data.rangeStart);
    if (error) {
      throw error;
    }

    return NextResponse.json({
      ranges: (data ?? []).map((row: Record<string, unknown>) => ({
        startDate: row.start_date as string,
        endDate: row.end_date as string,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load published ranges");
  }
}
