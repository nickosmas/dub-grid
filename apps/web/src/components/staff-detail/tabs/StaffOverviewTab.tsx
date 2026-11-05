"use client";

import { useMemo, type ReactNode } from "react";
import MyScheduleRow from "@/components/dashboard/MyScheduleRow";
import { computePeriodHours, computeWorkMix } from "@/lib/staff-detail-stats";
import type {
  AbsenceType,
  AssignmentDefinition,
  Employee,
  FocusArea,
  JobDefinition,
  ShiftCategory,
  ShiftMap,
} from "@/types";
import { WorkMixBreakdown } from "../WorkMixBreakdown";

interface StaffOverviewTabProps {
  employee: Employee;
  /** The period's shifts; undefined while they load. */
  periodShifts: ShiftMap | undefined;
  range: { startDate: string; endDate: string };
  /** "this pay period", "between Sep 1 and Oct 15". */
  periodPhrase: string;
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  absenceTypes: AbsenceType[];
  focusAreas: FocusArea[];
  /** Today and the six days after it, with their shifts; null for someone not on the schedule. */
  nextDays: { dates: Date[]; shifts: ShiftMap } | null;
  /** The strip's wording, when it isn't someone else's next seven days. */
  nextDaysCopy?: {
    title: string;
    periodLabel: string;
    emptyTitle: string;
    emptyDescription: string;
    /** Shows drafts and their marks, as the schedule does for editors. */
    editorView?: boolean;
  };
  /** "About", or "About you" on your own profile. */
  aboutTitle?: string;
  /** "What they work", or "What you work" on your own profile. */
  mixTitle?: string;
  /** Work, Access and the record line, where the page has nowhere else for them. */
  about?: ReactNode;
}

const sentence = (phrase: string) => phrase.charAt(0).toUpperCase() + phrase.slice(1);

/** The glance: the period's numbers and their next days. */
export function StaffOverviewTab({
  employee,
  periodShifts,
  range,
  periodPhrase,
  assignments,
  shiftCategories,
  jobs,
  absenceTypes,
  focusAreas,
  nextDays,
  about,
  nextDaysCopy,
  aboutTitle = "About",
  mixTitle,
}: StaffOverviewTabProps) {
  const assignmentById = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments]);
  const absenceTypeById = useMemo(
    () => new Map(absenceTypes.map((absence) => [absence.id, absence])),
    [absenceTypes],
  );
  const shiftById = useMemo(
    () => new Map(shiftCategories.map((shift) => [shift.id, shift])),
    [shiftCategories],
  );
  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const focusAreaById = useMemo(
    () => new Map(focusAreas.map((area) => [area.id, area])),
    [focusAreas],
  );

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
        ? computeWorkMix(
            employee.id,
            periodShifts,
            assignmentById,
            shiftById,
            jobById,
            range,
            focusAreaById,
          )
        : [],
    [assignmentById, employee.id, focusAreaById, jobById, periodShifts, range, shiftById],
  );

  const firstName = employee.firstName || "They";
  const stats = [
    { label: "Hours", value: summary ? `${summary.hours}h` : "-" },
    { label: "Shifts", value: summary ? String(summary.shiftCount) : "-" },
    { label: "Average per week", value: summary ? `${summary.averagePerWeek}h` : "-" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section
        data-testid="overview-summary"
        aria-label={`${sentence(periodPhrase)} in numbers`}
        className="dg-card"
      >
        <div className="grid grid-cols-3">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={`min-w-0 px-5 py-4 ${index > 0 ? "border-l border-[var(--dg-color-border-light)]" : ""}`}
            >
              <div className="text-[13px] font-medium text-[var(--dg-color-text-secondary)]">
                {stat.label}
              </div>
              <div className="dg-tabular-nums mt-1 text-[28px] font-bold leading-[1.1] tracking-tight text-[var(--dg-color-text-primary)]">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
        {mix.length > 0 ? (
          <div className="border-t border-[var(--dg-color-border-light)] px-5 py-4">
            <WorkMixBreakdown mix={mix} periodPhrase={periodPhrase} title={mixTitle} />
          </div>
        ) : null}
      </section>

      {nextDays ? (
        <MyScheduleRow
          currentEmpId={employee.id}
          currentPeriodShifts={nextDays.shifts}
          assignmentById={assignmentById}
          absenceTypeById={absenceTypeById}
          jobs={jobs}
          shiftCategories={shiftCategories}
          focusAreas={focusAreas}
          periodDates={nextDays.dates}
          periodLabel={nextDaysCopy?.periodLabel ?? "Today and the next six days"}
          isScheduleEditor={nextDaysCopy ? Boolean(nextDaysCopy.editorView) : true}
          copy={
            nextDaysCopy ?? {
              title: "Next 7 days",
              emptyTitle: `${firstName} isn't scheduled in the next 7 days`,
              emptyDescription: "Shifts show up here once they're on the schedule.",
            }
          }
        />
      ) : null}

      {about ? (
        <>
          <h2 className="dg-section-heading" style={{ marginTop: 24 }}>
            {aboutTitle}
          </h2>
          {about}
        </>
      ) : null}
    </div>
  );
}
