import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { canSeeSchedulePublisher, requireOrgPermissions } from "@/app/api/shared/permissions";
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

interface PublishedPeriod {
  startDate: string;
  endDate: string;
  publishedAt: string;
}

interface RecentHistoryEntry {
  startDate: string;
  endDate: string;
  publishedAt: string;
  changes: ReturnType<typeof toPublishChanges>;
  noteChanges: ReturnType<typeof toNotePublishChanges>;
}

function coversDate(period: PublishedPeriod, date: string): boolean {
  return period.startDate <= date && period.endDate >= date;
}

/**
 * A `new` change is an addition only when an earlier publication already
 * covered its date; otherwise it is part of that period's first publication,
 * which the grid treats as the baseline rather than ringing every cell.
 *
 * The baseline has to come from the whole ledger, not from the rows this
 * request happened to return: the `since` form only returns publications
 * after the caller's last visit, so a week first published before that visit
 * had no older row in the result and every later addition to it read as
 * baseline, which the grid then refused to highlight. `priorPeriods` carries
 * the publications older than the result for the dates in question.
 */
function addNewAdditionFlags<TEntry extends RecentHistoryEntry>(
  entries: TEntry[],
  priorPeriods: PublishedPeriod[],
) {
  const isAddition = (entry: RecentHistoryEntry, kind: string, date: string) =>
    kind === "new" &&
    (entries.some((other) => other.publishedAt < entry.publishedAt && coversDate(other, date)) ||
      priorPeriods.some(
        (period) => period.publishedAt < entry.publishedAt && coversDate(period, date),
      ));

  return entries.map((entry) => ({
    ...entry,
    changes: entry.changes.map((change) => ({
      ...change,
      isNewAddition: isAddition(entry, change.kind, change.date),
    })),
    // Notes take the same baseline rule as cells: a period's first publication
    // is not a set of additions, so its notes must not be marked either while
    // every shift beside them stays clean.
    noteChanges: entry.noteChanges.map((change) => ({
      ...change,
      isNewAddition: isAddition(entry, change.kind, change.date),
    })),
  }));
}

/** Dates of `new` changes that no older row in the result already covers. */
function unresolvedNewChangeDates(entries: RecentHistoryEntry[]): string[] {
  const dates = new Set<string>();
  for (const entry of entries) {
    const candidates = [...entry.changes, ...entry.noteChanges];
    for (const change of candidates) {
      if (change.kind !== "new") continue;
      const covered = entries.some(
        (other) => other.publishedAt < entry.publishedAt && coversDate(other, change.date),
      );
      if (!covered) dates.add(change.date);
    }
  }
  return [...dates].sort();
}

async function fetchPriorPublishedPeriods(
  serviceClient: SupabaseClient,
  orgId: string,
  entries: RecentHistoryEntry[],
): Promise<PublishedPeriod[]> {
  const dates = unresolvedNewChangeDates(entries);
  if (dates.length === 0) return [];
  const newestPublishedAt = entries.reduce(
    (latest, entry) => (entry.publishedAt > latest ? entry.publishedAt : latest),
    entries[0]!.publishedAt,
  );
  const { data, error } = await serviceClient
    .from("publish_history")
    .select("start_date, end_date, published_at")
    .eq("org_id", orgId)
    .lte("start_date", dates[dates.length - 1]!)
    .gte("end_date", dates[0]!)
    .lt("published_at", newestPublishedAt)
    .order("published_at", { ascending: false })
    .limit(MAX_RECENT_HISTORY_ROWS);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    publishedAt: row.published_at as string,
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
      .eq("org_id", auth.orgId);
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

    const showPublisher = canSeeSchedulePublisher(auth.permissions);
    const entries = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      publishedBy: showPublisher ? (row.published_by as string) : null,
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      changeCount: row.change_count as number,
      changes: toPublishChanges(row.schedule_publish_changes as ScheduleChangeRow[]),
      // Kept beside the cell changes rather than mixed in: a note carries no
      // cell state, and nothing downstream should have to guess which of the
      // two a change row describes.
      noteChanges: toNotePublishChanges(row.schedule_publish_changes as ScheduleChangeRow[]),
      publishedAt: row.published_at as string,
    }));
    const priorPeriods = await fetchPriorPublishedPeriods(auth.serviceClient, auth.orgId, entries);

    return NextResponse.json({ entries: addNewAdditionFlags(entries, priorPeriods) });
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
