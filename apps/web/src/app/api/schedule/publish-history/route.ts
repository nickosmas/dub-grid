import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { apiErrorResponse } from "@/lib/error-handling";
import { toPublishChanges, type ScheduleChangeRow } from "@/lib/db/publish-history";

const querySchema = z.object({
  orgId: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const dynamic = "force-dynamic";

function formatProfileName(profile: {
  first_name: string | null;
  last_name: string | null;
}): string {
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
}

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
    const limit = parsed.data.limit ?? 20;
    const offset = parsed.data.offset ?? 0;
    const { data, error } = await auth.serviceClient
      .from("publish_history")
      .select(
        "id, published_by, start_date, end_date, change_count, published_at, schedule_publish_changes(emp_id, date, kind, from_state, to_state, from_absence_type_id, to_absence_type_id, updated_by, from_custom_start, from_custom_end, to_custom_start, to_custom_end)",
      )
      .eq("org_id", auth.orgId)
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      throw error;
    }

    const rows = (data ?? []) as {
      id: string;
      published_by: string;
      start_date: string;
      end_date: string;
      change_count: number;
      schedule_publish_changes: ScheduleChangeRow[];
      published_at: string;
    }[];
    const publisherIds = [...new Set(rows.map((row) => row.published_by))];
    const publisherNames = new Map<string, string>();

    if (publisherIds.length > 0) {
      const { data: profiles, error: profilesError } = await auth.serviceClient
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", publisherIds);
      if (profilesError) {
        throw profilesError;
      }

      for (const profile of (profiles ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
      }[]) {
        const name = formatProfileName(profile);
        if (name) {
          publisherNames.set(profile.id, name);
        }
      }
    }

    return NextResponse.json({
      entries: rows.map((row) => ({
        id: row.id,
        publishedBy: row.published_by,
        publishedByName: publisherNames.get(row.published_by) ?? "Unknown",
        startDate: row.start_date,
        endDate: row.end_date,
        changeCount: row.change_count,
        changes: toPublishChanges(row.schedule_publish_changes),
        publishedAt: row.published_at,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load publish history");
  }
}
