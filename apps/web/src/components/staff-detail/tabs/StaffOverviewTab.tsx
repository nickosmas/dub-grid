"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import { AlertTriangle, CalendarDays, CalendarRange, Clock, TrendingUp } from "lucide-react";
import { resolveShiftPillColors } from "@/lib/colors";
import { absenceStripeFill } from "@/lib/absence-stripes";
import { DAY_LABELS } from "@/lib/constants";
import { computePeriodHours, computeWorkMix } from "@/lib/staff-detail-stats";
import type {
  AbsenceType,
  AssignmentDefinition,
  Employee,
  JobDefinition,
  ShiftCategory,
  ShiftMap,
} from "@/types";
import { WorkMixCard } from "../WorkMixCard";
import { MetricCard } from "./OverviewTab";

interface StaffOverviewTabProps {
  employee: Employee;
  /** The period's shifts; undefined while they load. */
  periodShifts: ShiftMap | undefined;
  /** Shifts covering at least the current week. */
  currentWeekShifts: ShiftMap;
  currentWeekDates: string[];
  range: { startDate: string; endDate: string };
  /** "this pay period", "between Sep 1 and Oct 15". */
  periodPhrase: string;
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  absenceTypes: AbsenceType[];
}

const sentence = (phrase: string) => phrase.charAt(0).toUpperCase() + phrase.slice(1);

/** The staff page's Overview: the period's numbers, this week, and what they work. */
export function StaffOverviewTab({
  employee,
  periodShifts,
  currentWeekShifts,
  currentWeekDates,
  range,
  periodPhrase,
  assignments,
  shiftCategories,
  jobs,
  absenceTypes,
}: StaffOverviewTabProps) {
  const assignmentById = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments]);
  const shiftById = useMemo(
    () => new Map(shiftCategories.map((shift) => [shift.id, shift])),
    [shiftCategories],
  );
  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);

  const summary = useMemo(
    () =>
      periodShifts
        ? computePeriodHours(employee.id, periodShifts, assignmentById, range, shiftById)
        : null,
    [assignmentById, employee.id, periodShifts, range, shiftById],
  );
  const mix = useMemo(
    () =>
      periodShifts
        ? computeWorkMix(employee.id, periodShifts, assignmentById, shiftById, jobById, range)
        : [],
    [assignmentById, employee.id, jobById, periodShifts, range, shiftById],
  );

  const loading = "-";
  const caption = sentence(periodPhrase);
  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="overview-summary"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Hours"
          value={summary ? `${summary.hours}h` : loading}
          detail={caption}
          icon={Clock}
          tone="brand"
        />
        <MetricCard
          label="Average per week"
          value={summary ? `${summary.averagePerWeek}h` : loading}
          detail={
            summary
              ? `Over ${summary.weekCount} ${summary.weekCount === 1 ? "week" : "weeks"}`
              : caption
          }
          icon={TrendingUp}
        />
        <MetricCard
          label="Shifts"
          value={summary ? String(summary.shiftCount) : loading}
          detail={caption}
          icon={CalendarDays}
        />
        <MetricCard
          label="Overtime weeks"
          value={summary ? String(summary.overtimeWeeks) : loading}
          detail="Weeks over 40 hours"
          icon={AlertTriangle}
          tone={summary && summary.overtimeWeeks > 0 ? "warning" : "neutral"}
          danger={Boolean(summary && summary.overtimeWeeks > 0)}
        />
      </div>

      <ThisWeekCard
        employeeId={employee.id}
        shifts={currentWeekShifts}
        dates={currentWeekDates}
        assignmentById={assignmentById}
        shiftById={shiftById}
        jobById={jobById}
        absenceTypes={absenceTypes}
      />

      <WorkMixCard mix={mix} periodPhrase={periodPhrase} />
    </div>
  );
}

function ThisWeekCard({
  employeeId,
  shifts,
  dates,
  assignmentById,
  shiftById,
  jobById,
  absenceTypes,
}: {
  employeeId: string;
  shifts: ShiftMap;
  dates: string[];
  assignmentById: Map<number, AssignmentDefinition>;
  shiftById: Map<number, ShiftCategory>;
  jobById: Map<number, JobDefinition>;
  absenceTypes: AbsenceType[];
}) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const absenceById = useMemo(
    () => new Map(absenceTypes.map((absence) => [absence.id, absence])),
    [absenceTypes],
  );

  const pillsFor = (date: string) => {
    const entry = shifts[`${employeeId}_${date}`];
    if (!entry || entry.isDelete) return [];
    const pills = entry.assignmentIds
      .map((id) => assignmentById.get(id))
      .filter((item): item is AssignmentDefinition => Boolean(item))
      .map((assignment) => {
        const colors = resolveShiftPillColors(
          { color: assignment.color, text: assignment.text, border: assignment.border },
          isDarkTheme,
        );
        return {
          key: `shift-${assignment.id}`,
          name:
            (assignment.shiftId != null ? shiftById.get(assignment.shiftId)?.name : null) ??
            assignment.name,
          jobName: assignment.jobId != null ? (jobById.get(assignment.jobId)?.name ?? null) : null,
          background: colors.color,
          border: colors.border,
          textColor: colors.text,
        };
      });
    const absenceId = entry.absenceTypeId ?? entry.restOfDayAbsenceTypeId ?? null;
    const absence = absenceId != null ? absenceById.get(absenceId) : undefined;
    if (absence) {
      const fill = absenceStripeFill(absence.color, isDarkTheme);
      pills.push({
        key: `absence-${absence.id}`,
        name: absence.name || absence.label,
        jobName: null,
        background: fill.background,
        border: fill.border,
        textColor: fill.text,
      });
    }
    return pills;
  };

  return (
    <section className="dg-card">
      <div className="dg-card-header">
        <div className="dg-card-title flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-[var(--dg-color-text-muted)]" aria-hidden />
          This week
        </div>
      </div>
      <div className="dg-card-body">
        <div className="grid grid-cols-7 items-stretch gap-1 text-center">
          {dates.map((date, index) => {
            const pills = pillsFor(date);
            return (
              <div key={date} className="flex flex-col items-stretch gap-1.5">
                <span className="text-[length:var(--dg-type-badge-size)] font-medium uppercase tracking-normal text-[var(--dg-color-text-subtle)]">
                  {DAY_LABELS[index]}
                </span>
                {pills.length > 0 ? (
                  <div className="flex flex-1 flex-col gap-1">
                    {pills.map((pill) => (
                      <div
                        key={pill.key}
                        className="flex flex-1 flex-col justify-center rounded-[var(--dg-radius-sm)] border px-1.5 py-1.5 leading-tight [overflow-wrap:anywhere]"
                        style={{
                          background: pill.background,
                          borderColor: pill.border,
                          color: pill.textColor,
                        }}
                      >
                        <span className="text-[length:var(--dg-type-badge-size)] font-semibold">
                          {pill.name}
                        </span>
                        {pill.jobName ? (
                          <span className="text-[length:var(--dg-type-metadata-size)] font-medium opacity-80">
                            {pill.jobName}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="flex flex-1 items-center justify-center text-[length:var(--dg-type-badge-size)] font-medium text-[var(--dg-color-text-faint)]">
                    -
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
