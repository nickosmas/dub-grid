import {
  buildScheduleNoteMarks,
  type ScheduleNoteMap,
} from "@/app/(app)/schedule/_lib/schedule-window";
import type { ScheduleNoteMark } from "@/components/schedule-grid/noteDots";
import { addDays } from "@/lib/dashboard-stats";
import { formatDateKey } from "@/lib/utils";
import type { IndicatorType, ScheduleNote } from "@/types";

/**
 * The dates the dashboard loads shifts for: the previous period's start to the
 * current period's end, widened on the user dashboard to cover today through
 * the hero's lookahead so the next shift is found outside the browsed period.
 * Its schedule notes load for the same window.
 */
export function dashboardScheduleWindow(input: {
  todayKey: string;
  isUserDashboardMode: boolean;
  prevPeriodStart: Date;
  periodEnd: Date;
  heroLookaheadDays: number;
}): { start: string; end: string } {
  const today = new Date(`${input.todayKey}T00:00:00`);
  const lookaheadEnd = addDays(today, input.heroLookaheadDays);
  return {
    start: formatDateKey(
      input.isUserDashboardMode && today < input.prevPeriodStart ? today : input.prevPeriodStart,
    ),
    end: formatDateKey(
      input.isUserDashboardMode && lookaheadEnd > input.periodEnd ? lookaheadEnd : input.periodEnd,
    ),
  };
}

/**
 * A person's schedule notes for one day, one list of marks per shift half.
 *
 * A single shift shows the whole day's notes. A double shift gives each note
 * to the first half working its focus area, and a note with no focus area (or
 * one the shift does not work) to the first half, so each note shows once, as
 * mobile's Home card and shift detail do. No halves (an absence, a removed
 * shift) show nothing.
 */
export function scheduleNoteMarksBySegment(input: {
  notes: readonly ScheduleNote[];
  empId: string | null;
  dateKey: string;
  segmentFocusAreaIds: readonly (number | null | undefined)[];
  isScheduleEditor: boolean;
}): ScheduleNoteMark[][] {
  const halves = input.segmentFocusAreaIds.length;
  if (!input.empId || halves === 0) return [];

  const notesByHalf: NonNullable<ScheduleNoteMap[string]>[] = Array.from(
    { length: halves },
    () => [],
  );
  const seen = new Set<string>();
  for (const note of input.notes) {
    if (note.empId !== input.empId || note.date !== input.dateKey) continue;
    const key = `${note.indicatorTypeId}_${note.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const worked =
      note.focusAreaId == null ? -1 : input.segmentFocusAreaIds.indexOf(note.focusAreaId);
    notesByHalf[worked === -1 ? 0 : worked].push({
      indicatorTypeId: note.indicatorTypeId,
      status: note.status,
      updatedBy: note.updatedBy,
    });
  }

  return notesByHalf.map((notes) =>
    buildScheduleNoteMarks({ notes, isScheduleEditor: input.isScheduleEditor }),
  );
}

const STATE_WORDS: Partial<Record<ScheduleNoteMark["state"], string>> = {
  draft_added: "added, not published",
  draft_removed: "removed, not published",
};

/**
 * Notes as words, for a label or tooltip: each name, then an editor's draft
 * state, separated by commas. An unknown type reads "Schedule note".
 */
export function scheduleNoteMarksLabel(
  marks: readonly ScheduleNoteMark[],
  indicatorTypes: readonly IndicatorType[],
): string {
  return marks
    .map((mark) => {
      const name =
        indicatorTypes.find((type) => type.id === mark.indicatorTypeId)?.name ??
        mark.name ??
        "Schedule note";
      const words = STATE_WORDS[mark.state];
      return words ? `${name} (${words})` : name;
    })
    .join(", ");
}
