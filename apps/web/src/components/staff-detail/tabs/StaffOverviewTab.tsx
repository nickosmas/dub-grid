"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import MyScheduleRow from "@/components/dashboard/MyScheduleRow";
import type { PersonRequestRow } from "@/lib/person-requests";
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
import { WorkMixCard } from "../WorkMixCard";

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
  };
  /** "About", or "About you" on your own profile. */
  aboutTitle?: string;
  /** "What they work", or "What you work" on your own profile. */
  mixTitle?: string;
  /** Requests about them still awaiting approval; undefined when this viewer can't review them. */
  waitingRequests?: PersonRequestRow[];
  /** Work, Access and the record line. */
  about: ReactNode;
}

const sentence = (phrase: string) => phrase.charAt(0).toUpperCase() + phrase.slice(1);

/** The glance: the period's numbers, their next days, what's waiting, and who they are. */
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
  waitingRequests,
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

  const firstName = employee.firstName || "They";
  const stats = [
    { label: "Hours", value: summary ? `${summary.hours}h` : "-" },
    { label: "Shifts", value: summary ? String(summary.shiftCount) : "-" },
    { label: "Average per week", value: summary ? `${summary.averagePerWeek}h` : "-" },
  ];
  const waiting = waitingRequests ?? [];

  return (
    <div className="flex flex-col gap-4">
      <section
        data-testid="overview-summary"
        aria-label={`${sentence(periodPhrase)} in numbers`}
        className="dg-card grid grid-cols-3"
      >
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
          isScheduleEditor={!nextDaysCopy}
          copy={
            nextDaysCopy ?? {
              title: "Next 7 days",
              emptyTitle: `${firstName} isn't scheduled in the next 7 days`,
              emptyDescription: "Shifts show up here once they're on the schedule.",
            }
          }
        />
      ) : null}

      {waiting.length > 0 || mix.length > 0 ? (
        <div
          className={`grid items-start gap-4 ${waiting.length > 0 && mix.length > 0 ? "lg:grid-cols-2" : ""}`}
        >
          {waiting.length > 0 ? (
            <section className="dg-card" aria-label="Needs attention">
              <div className="dg-card-header">
                <div className="dg-card-title flex items-center gap-2">
                  Needs attention
                  <span className="dg-tabular-nums inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--dg-color-brand)] px-1.5 text-[12px] font-semibold text-white">
                    {waiting.length}
                  </span>
                </div>
              </div>
              <div className="dg-card-body flex flex-col">
                {waiting.slice(0, 4).map((row, index) => (
                  <div
                    key={row.key}
                    className={`flex items-center gap-3 py-2.5 ${index > 0 ? "border-t border-[var(--dg-color-border-light)]" : "pt-0"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                        {row.type}
                      </div>
                      <div className="dg-tabular-nums text-[13px] text-[var(--dg-color-text-subtle)]">
                        {[row.details, row.secondary].filter(Boolean).join(", ")}
                      </div>
                    </div>
                    <Link href={row.reviewHref} className="dg-btn dg-btn-secondary dg-btn-sm">
                      Review
                    </Link>
                  </div>
                ))}
                {waiting.length > 4 ? (
                  <span className="pt-2 text-[13px] text-[var(--dg-color-text-subtle)]">
                    and {waiting.length - 4} more in Activity
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}
          {mix.length > 0 ? (
            <WorkMixCard mix={mix} periodPhrase={periodPhrase} title={mixTitle} />
          ) : null}
        </div>
      ) : null}

      <h2 className="m-0 mt-6 text-[17px] font-semibold tracking-tight text-[var(--dg-color-text-primary)]">
        {aboutTitle}
      </h2>
      {about}
    </div>
  );
}
