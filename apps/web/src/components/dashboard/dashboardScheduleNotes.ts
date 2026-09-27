import {
  buildScheduleNoteMarks,
  type ScheduleNoteMap,
} from "@/app/(app)/schedule/_lib/schedule-window";
import type { ScheduleNoteMark } from "@/components/schedule-grid/noteDots";
import { addDays } from "@/lib/dashboard-stats";
import { formatDateKey } from "@/lib/utils";
import type { IndicatorType, ScheduleNote, ScheduleNoteShift } from "@/types";

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

/** One shift of a person's day, as the dashboard matches notes to it. */
export interface DashboardNoteShift {
  focusAreaId: number | null | undefined;
  shift: ScheduleNoteShift | null;
}

/**
 * A person's schedule notes for one day, one list of marks per shift half.
 *
 * A single shift shows the whole day's notes. On a double shift a note goes to
 * the half it belongs to; a note no shift claims goes to the first half
 * working its focus area, and one with no focus area (or one the shift does
 * not work) to the first half, as mobile's Home card and shift detail do. No
 * halves (an absence, a removed shift) show nothing.
 */
export function scheduleNoteMarksBySegment(input: {
  notes: readonly ScheduleNote[];
  empId: string | null;
  dateKey: string;
  segments: readonly DashboardNoteShift[];
  isScheduleEditor: boolean;
}): ScheduleNoteMark[][] {
  const halves = input.segments.length;
  if (!input.empId || halves === 0) return [];

  const notesByHalf: NonNullable<ScheduleNoteMap[string]>[] = Array.from(
    { length: halves },
    () => [],
  );
  const seen = new Set<string>();
  for (const note of input.notes) {
    if (note.empId !== input.empId || note.date !== input.dateKey) continue;
    const own =
      note.jobId == null
        ? -1
        : input.segments.findIndex(
            ({ shift }) => shift?.jobId === note.jobId && shift.shiftId === (note.shiftId ?? null),
          );
    const worked =
      own !== -1 || note.focusAreaId == null
        ? own
        : input.segments.findIndex((segment) => segment.focusAreaId === note.focusAreaId);
    const half = worked === -1 ? 0 : worked;
    const key = `${half}_${note.indicatorTypeId}_${note.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notesByHalf[half].push({
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
        indicatorTypes.find((type) => type.id === mark.indicatorTypeId)?.name ?? "Schedule note";
      const words = STATE_WORDS[mark.state];
      return words ? `${name} (${words})` : name;
    })
    .join(", ");
}
