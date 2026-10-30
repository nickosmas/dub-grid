"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysToIsoDate } from "@dubgrid/schedule-core";
import { Button } from "@/components/Button";
import { MaybeHint } from "@/components/ui/hint";
import { DAY_LABELS } from "@/lib/constants";
import { DRAFT_BORDER_COLORS, resolveShiftPillColors } from "@/lib/colors";
import { absenceStripeFill } from "@/lib/absence-stripes";
import type { ShiftRecordLookups } from "@/lib/shift-records";
import type { AssignmentDefinition, ShiftMap } from "@/types";

interface PersonMonthCalendarProps {
  employeeId: string;
  /** The period's shifts; undefined while they load. */
  shifts: ShiftMap | undefined;
  range: { startDate: string; endDate: string };
  today: string;
  lookups: ShiftRecordLookups;
  /**
   * Loads the whole month on screen, so days around the period show their
   * shifts too. Without it only the period's days are filled.
   */
  loadMonth?: {
    key: readonly unknown[];
    load: (startDate: string, endDate: string) => Promise<ShiftMap>;
  };
}

interface CalendarPill {
  key: string;
  name: string;
  detail: string | null;
  background: string;
  border: string;
  text: string;
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-10" for each month the range touches, in order. */
export function monthsInRange(range: { startDate: string; endDate: string }): string[] {
  const months: string[] = [];
  let [year, month] = range.startDate.split("-").map(Number);
  const [endYear, endMonth] = range.endDate.split("-").map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** The Sunday-to-Saturday weeks that cover a month, as ISO days. */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const start = addDaysToIsoDate(first, -new Date(`${first}T00:00:00Z`).getUTCDay());
  const weeks: string[][] = [];
  for (let day = start; day <= last; day = addDaysToIsoDate(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDaysToIsoDate(day, index)));
  }
  return weeks;
}

/** One person's period as a month calendar, in the schedule's own colors. */
export function PersonMonthCalendar({
  employeeId,
  shifts,
  range,
  today,
  lookups,
  loadMonth,
}: PersonMonthCalendarProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const periodMonths = useMemo(() => monthsInRange(range), [range]);
  const todayMonth = today.slice(0, 7);
  const [picked, setPicked] = useState<{ range: typeof range; month: string } | null>(null);
  // A new period starts on the month holding today, or the period's last month.
  const defaultMonth = periodMonths.includes(todayMonth) ? todayMonth : periodMonths.at(-1);
  const month = picked && picked.range === range ? picked.month : defaultMonth;
  const step = (delta: number) => {
    if (!month) return;
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
    setPicked({ range, month: next });
  };
  const canStepBack = Boolean(month && month > periodMonths[0]);
  const canStepForward = Boolean(month && month < (periodMonths.at(-1) ?? ""));
  const weeks = useMemo(() => (month ? monthWeeks(month) : []), [month]);
  const gridStart = weeks[0]?.[0] ?? range.startDate;
  const gridEnd = weeks.at(-1)?.[6] ?? range.endDate;
  const monthQuery = useQuery({
    queryKey: [...(loadMonth?.key ?? ["person-month"]), gridStart, gridEnd],
    queryFn: () => loadMonth!.load(gridStart, gridEnd),
    enabled: Boolean(loadMonth && month),
  });
  const data = loadMonth ? (monthQuery.data ?? shifts) : shifts;

  const pillsFor = (day: string): CalendarPill[] => {
    const entry = data?.[`${employeeId}_${day}`];
    if (!entry) return [];
    const draftBorder =
      entry.isDraft && entry.draftKind ? DRAFT_BORDER_COLORS[entry.draftKind] : null;
    const ids = entry.isDelete
      ? (entry.publishedAssignmentDefinitionIds ?? [])
      : entry.assignmentIds;
    const pills: CalendarPill[] = ids
      .map((id) => lookups.assignmentById.get(id))
      .filter((item): item is AssignmentDefinition => Boolean(item))
      .map((assignment) => {
        const colors = resolveShiftPillColors(
          { color: assignment.color, text: assignment.text, border: assignment.border },
          isDark,
        );
        const shift =
          assignment.shiftId != null ? lookups.shiftById.get(assignment.shiftId) : undefined;
        const name = shift?.name ?? assignment.name;
        const job =
          assignment.jobId != null ? lookups.jobById.get(assignment.jobId)?.name : undefined;
        return {
          key: `shift-${assignment.id}`,
          name,
          detail: job && job.trim().toLowerCase() !== name.trim().toLowerCase() ? job : null,
          background: colors.color,
          border: draftBorder ? `2px dashed ${draftBorder}` : `1px solid ${colors.border}`,
          text: colors.text,
        };
      });
    const absenceId = entry.isDelete
      ? null
      : (entry.absenceTypeId ?? entry.restOfDayAbsenceTypeId ?? null);
    const absence = absenceId != null ? lookups.absenceById.get(absenceId) : undefined;
    if (absence) {
      const fill = absenceStripeFill(absence.color, isDark);
      pills.push({
        key: `absence-${absence.id}`,
        name: absence.name || absence.label,
        detail: null,
        background: fill.background,
        border: draftBorder ? `2px dashed ${draftBorder}` : `1px solid ${fill.border}`,
        text: fill.text,
      });
    }
    return pills;
  };

  if (!month) return null;
  return (
    <section className="dg-card" aria-label="Calendar">
      <div className="dg-card-header">
        <div className="dg-card-title dg-tabular-nums">
          {MONTH.format(new Date(`${month}-01T00:00:00Z`))}
        </div>
        {periodMonths.length > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-icon dg-btn-sm"
              aria-label="Earlier month in these dates"
              disabled={!canStepBack}
              onClick={() => step(-1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-icon dg-btn-sm"
              aria-label="Later month in these dates"
              disabled={!canStepForward}
              onClick={() => step(1)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="dg-card-body dg-no-scrollbar overflow-x-auto">
        <div
          className="min-w-[700px]"
          role="grid"
          aria-label={MONTH.format(new Date(`${month}-01T00:00:00Z`))}
        >
          <div role="row" className="grid grid-cols-7 gap-1.5 pb-2">
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                role="columnheader"
                className="text-center text-[13px] font-semibold text-[var(--dg-color-text-secondary)]"
              >
                {label}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} role="row" className="grid grid-cols-7 gap-1.5 pb-1.5">
              {week.map((day) => {
                const inMonth = day.slice(0, 7) === month;
                const inRange = day >= range.startDate && day <= range.endDate;
                // The period's days are full strength; the rest of the month shows
                // what it can, dimmed, so the period stands out in its month.
                const pills = inMonth && (inRange || loadMonth) ? pillsFor(day) : [];
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    role="gridcell"
                    aria-label={day}
                    className={`flex min-h-[92px] flex-col gap-1 rounded-[var(--dg-radius-md)] border p-1.5 ${
                      inMonth
                        ? "border-[var(--dg-color-border-light)] bg-[var(--dg-color-surface)]"
                        : "border-transparent"
                    } ${inMonth && !inRange ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`dg-tabular-nums inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-[12px] font-semibold ${
                        isToday
                          ? "bg-[var(--dg-color-brand)] text-white"
                          : inMonth
                            ? "text-[var(--dg-color-text-primary)]"
                            : "text-[var(--dg-color-text-faint)]"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {pills.map((pill) => (
                      <MaybeHint
                        key={pill.key}
                        content={pill.detail ? `${pill.name}, ${pill.detail}` : pill.name}
                      >
                        <div
                          data-calendar-pill=""
                          // One size for every card, a name alone or a name and job,
                          // so a month reads as an even grid.
                          className="box-border flex h-10 flex-col justify-center rounded-[var(--dg-radius-sm)] px-1.5 leading-[1.25]"
                          style={{
                            background: pill.background,
                            border: pill.border,
                            color: pill.text,
                          }}
                        >
                          <div className="truncate text-[length:var(--dg-type-badge-size)] font-semibold">
                            {pill.name}
                          </div>
                          {pill.detail ? (
                            <div className="truncate text-[length:var(--dg-type-metadata-size)] font-medium opacity-80">
                              {pill.detail}
                            </div>
                          ) : null}
                        </div>
                      </MaybeHint>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
