import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";

const querySchema = z.object({
  orgId: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
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
    const { data, error } = await auth.serviceClient.rpc("get_publish_history", {
      p_org_id: parsed.data.orgId,
      p_limit: parsed.data.limit ?? 20,
      p_offset: parsed.data.offset ?? 0,
    });
    if (error) {
      throw error;
    }

    return NextResponse.json({
      entries: (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        publishedBy: row.published_by as string,
        publishedByName: row.published_by_name as string,
        startDate: row.start_date as string,
        endDate: row.end_date as string,
        changeCount: row.change_count as number,
        changes: row.changes,
        publishedAt: row.published_at as string,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load publish history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
