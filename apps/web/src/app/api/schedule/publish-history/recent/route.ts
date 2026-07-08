import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";

const querySchema = z.object({
  orgId: z.string().uuid(),
  since: z.string().datetime({ offset: true }).optional(),
});

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
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
    const cutoff = parsed.data.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: orgRow } = await auth.serviceClient
      .from("organizations")
      .select("timezone")
      .eq("id", parsed.data.orgId)
      .single();
    const tz = (orgRow?.timezone as string | undefined) ?? "UTC";
    const todayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const { data, error } = await auth.serviceClient
      .from("publish_history")
      .select("id, org_id, published_by, start_date, end_date, change_count, changes, published_at")
      .eq("org_id", parsed.data.orgId)
      .gte("end_date", todayKey)
      .gte("published_at", cutoff)
      .order("published_at", { ascending: false });
    if (error) {
      throw error;
    }

    return NextResponse.json({
      entries: (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        publishedBy: row.published_by as string,
        startDate: row.start_date as string,
        endDate: row.end_date as string,
        changeCount: row.change_count as number,
        changes: row.changes,
        publishedAt: row.published_at as string,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load recent publish history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
