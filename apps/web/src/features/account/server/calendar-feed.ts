import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDaysToIsoDate,
  getIsoDateInTimeZone,
  getScheduleWeekStartDate,
} from "@dubgrid/schedule-core";

import type { CalendarFeedEmployee } from "@/features/account/server/calendar-subscription";
import { generateICS } from "@/lib/ical";
import {
  fetchPublishedShiftRows,
  publishedCellText,
  resolvePublishedScheduleEntry,
  type PublishedShiftRow,
} from "@/lib/published-shifts";

function getCalendarRange(
  weeks: number,
  timeZone: string,
  now: Date,
): { startDate: string; endDateExclusive: string } {
  const startDate = getScheduleWeekStartDate(getIsoDateInTimeZone(now, timeZone));
  return {
    startDate,
    endDateExclusive: addDaysToIsoDate(startDate, weeks * 7),
  };
}

export async function renderPublishedEmployeeCalendar(
  client: SupabaseClient,
  employee: CalendarFeedEmployee,
  weeks: number,
  now = new Date(),
): Promise<string> {
  const range = getCalendarRange(weeks, employee.timeZone, now);
  const [shifts, absenceTypesResult, shiftCategoriesResult, focusAreasResult] = await Promise.all([
    fetchPublishedShiftRows(client, {
      orgId: employee.orgId,
      employeeId: employee.id,
      ...range,
    }),
    client
      .from("absence_types")
      .select("id, label")
      .eq("org_id", employee.orgId)
      .is("archived_at", null),
    client.from("shift_categories").select("id, focus_area_id").eq("org_id", employee.orgId),
    client.from("focus_areas").select("id, name").eq("org_id", employee.orgId),
  ]);
  if (absenceTypesResult.error) throw absenceTypesResult.error;
  if (shiftCategoriesResult.error) throw shiftCategoriesResult.error;
  if (focusAreasResult.error) throw focusAreasResult.error;

  const focusAreaNameById = new Map(
    (focusAreasResult.data ?? []).map((row: Record<string, unknown>) => [
      row.id as number,
      row.name as string,
    ]),
  );
  const shiftFocusAreaById = new Map(
    (shiftCategoriesResult.data ?? []).map((row: Record<string, unknown>) => [
      row.id as number,
      row.focus_area_id as number | null,
    ]),
  );
  // A calendar shows one shift at a time, so it always says where: two focus
  // areas can share a shift's name.
  const focusAreasOf = (segments: ReadonlyArray<{ shiftId: number | null }> | undefined) =>
    [
      ...new Set(
        (segments ?? [])
          .map((segment) =>
            segment.shiftId != null ? shiftFocusAreaById.get(segment.shiftId) : null,
          )
          .filter((id): id is number => id != null),
      ),
    ]
      .map((id) => focusAreaNameById.get(id))
      .filter((name): name is string => Boolean(name))
      .join(", ");

  const absenceTypeById = new Map(
    (absenceTypesResult.data ?? []).map((row: Record<string, unknown>) => [
      row.id as number,
      row.label as string,
    ]),
  );
  const events = (shifts as PublishedShiftRow[])
    .map((row) => resolvePublishedScheduleEntry(row, new Map(), absenceTypeById))
    .flatMap((entry) => {
      if (!entry) return [];

      if (entry.kind === "absence") {
        return [
          {
            uid: `absence-${entry.empId}-${entry.date}-${entry.absenceTypeId}@dubgrid.com`,
            summary: `${entry.label} (DubGrid)`,
            dtstart: { date: entry.date },
            dtend: { date: addDaysToIsoDate(entry.date, 1) },
            description: `${employee.firstName} ${employee.lastName}: ${entry.label}`,
          },
        ];
      }

      if (!entry.startTime || !entry.endTime) return [];
      // The absence for the rest of the day rides on the shift's own event;
      // an all-day event would claim the hours worked.
      const areas = focusAreasOf(entry.segments);
      const text = [publishedCellText(entry, absenceTypeById), areas].filter(Boolean).join(" · ");
      const endDate =
        entry.endTime <= entry.startTime ? addDaysToIsoDate(entry.date, 1) : entry.date;
      return [
        {
          uid: `shift-${entry.empId}-${entry.date}-${entry.segments?.map((segment) => `${segment.shiftId ?? "shiftless"}-${segment.jobId}`).join("-") ?? "worked"}@dubgrid.com`,
          summary: `${text} (DubGrid)`,
          dtstart: { date: entry.date, time: entry.startTime },
          dtend: { date: endDate, time: entry.endTime },
          timeZone: employee.timeZone,
          description: `${employee.firstName} ${employee.lastName}: ${text}`,
          ...(areas ? { location: areas } : {}),
        },
      ];
    });

  return generateICS(
    events,
    `DubGrid: ${employee.firstName} ${employee.lastName}`,
    employee.timeZone,
  );
}
