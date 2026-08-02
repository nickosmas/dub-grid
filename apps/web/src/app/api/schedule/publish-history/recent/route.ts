import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { toPublishChanges, type ScheduleChangeRow } from "@/lib/db/publish-history";

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

  if (!parsed.data.since) {
    // No prior "last viewed" timestamp means there's no baseline to diff
    // against (e.g. a brand-new user's first visit) — nothing has "changed
    // since" a visit that never happened.
    return NextResponse.json({ entries: [] });
  }

  try {
    const cutoff = parsed.data.since;

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
      .select(
        "id, org_id, published_by, start_date, end_date, change_count, published_at, schedule_publish_changes(emp_id, date, kind, from_state, to_state, from_absence_type_id, to_absence_type_id, updated_by, from_custom_start, from_custom_end, to_custom_start, to_custom_end)",
      )
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
        changes: toPublishChanges(row.schedule_publish_changes as ScheduleChangeRow[]),
        publishedAt: row.published_at as string,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load recent publish history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
