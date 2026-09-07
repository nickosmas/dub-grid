import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import {
  toNotePublishChanges,
  toPublishChanges,
  type ScheduleChangeRow,
} from "@/lib/db/publish-history";
import logger from "@/lib/logger";

const querySchema = z
  .object({
    orgId: z.string().uuid(),
    since: z.string().datetime({ offset: true }).optional(),
    includeCurrent: z.enum(["true", "false"]).optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
  })
  .refine((query) => Boolean(query.startDate) === Boolean(query.endDate));

const MAX_RECENT_HISTORY_ROWS = 200;

function addNewAdditionFlags<
  TEntry extends {
    startDate: string;
    endDate: string;
    changes: ReturnType<typeof toPublishChanges>;
    noteChanges: ReturnType<typeof toNotePublishChanges>;
  },
>(entries: TEntry[]) {
  const isAddition = (entryIndex: number, kind: string, date: string) =>
    kind === "new" &&
    entries
      .slice(entryIndex + 1)
      .some((olderEntry) => olderEntry.startDate <= date && olderEntry.endDate >= date);

  return entries.map((entry, entryIndex) => ({
    ...entry,
    changes: entry.changes.map((change) => ({
      ...change,
      isNewAddition: isAddition(entryIndex, change.kind, change.date),
    })),
    // Notes take the same baseline rule as cells: a period's first publication
    // is not a set of additions, so its notes must not be marked either while
    // every shift beside them stays clean.
    noteChanges: entry.noteChanges.map((change) => ({
      ...change,
      isNewAddition: isAddition(entryIndex, change.kind, change.date),
    })),
  }));
}

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

  if (!parsed.data.since && parsed.data.includeCurrent !== "true") {
    // No prior "last viewed" timestamp means there's no baseline to diff
    // against (e.g. a brand-new user's first visit) — nothing has "changed
    // since" a visit that never happened.
    return NextResponse.json({ entries: [] });
  }

  try {
    let query = auth.serviceClient
      .from("publish_history")
      .select(
        "id, org_id, published_by, start_date, end_date, change_count, published_at, schedule_publish_changes(emp_id, date, kind, from_state, to_state, from_absence_type_id, to_absence_type_id, updated_by, from_custom_start, from_custom_end, to_custom_start, to_custom_end)",
      )
      .eq("org_id", parsed.data.orgId);
    if (parsed.data.startDate && parsed.data.endDate) {
      query = query.lte("start_date", parsed.data.endDate).gte("end_date", parsed.data.startDate);
    } else if (parsed.data.since) {
      query = query.gte("published_at", parsed.data.since);
    }
    const { data, error } = await query
      .order("published_at", { ascending: false })
      .limit(MAX_RECENT_HISTORY_ROWS);
    if (error) {
      throw error;
    }

    return NextResponse.json({
      entries: addNewAdditionFlags(
        (data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          publishedBy: row.published_by as string,
          startDate: row.start_date as string,
          endDate: row.end_date as string,
          changeCount: row.change_count as number,
          changes: toPublishChanges(row.schedule_publish_changes as ScheduleChangeRow[]),
          // Kept beside the cell changes rather than mixed in: a note carries no
          // cell state, and nothing downstream should have to guess which of the
          // two a change row describes.
          noteChanges: toNotePublishChanges(row.schedule_publish_changes as ScheduleChangeRow[]),
          publishedAt: row.published_at as string,
        })),
      ),
    });
  } catch (error) {
    logger.error(
      { err: error, route: "schedule/publish-history/recent" },
      "Publish history load failed",
    );
    return NextResponse.json(
      { error: "We couldn't load the recent publish history. Refresh and try again." },
      { status: 500 },
    );
  }
}
