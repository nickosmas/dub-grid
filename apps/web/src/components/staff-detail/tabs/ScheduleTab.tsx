"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/ui/status-pill";
import { SpanTabs } from "@/components/ui/span-tabs";
import { describePreference, shiftLabel } from "@/components/staff/PreferencesModal";
import { fetchJobPreferences, fetchShiftPreferences } from "@/features/schedule/client";
import { DAY_LABELS } from "@/lib/constants";
import { downloadCsvFile } from "@/lib/export-csv";
import { queryKeys } from "@/lib/query-keys";
import { buildScheduleWeeks } from "@/lib/schedule-rows";
import { buildShiftRecords, shiftRecordsToCsv, type ShiftRecordLookups } from "@/lib/shift-records";
import { buildTimeOff, type TimeOffPerson } from "@/lib/time-off";
import { createAssignmentDefinitionByPairMap } from "@/lib/shift-job-segments";
import type {
  AbsenceType,
  AssignmentDefinition,
  Employee,
  FocusArea,
  JobDefinition,
  RecurringShift,
  ShiftCategory,
  ShiftMap,
} from "@/types";
import { buildDayPills, type DayPill } from "../RecurringScheduleCard";

type Filter = "all" | "shift" | "timeoff";

interface ScheduleTabProps {
  employee: Employee & TimeOffPerson;
  /** The period's shifts; undefined while they load. */
  shifts: ShiftMap | undefined;
  loading: boolean;
  range: { startDate: string; endDate: string };
  today: string;
  periodPhrase: string;
  lookups: ShiftRecordLookups;
  corrections?: ReadonlyMap<string, string | null>;
  noteCounts?: ReadonlyMap<string, number>;
  absenceTypes: AbsenceType[];
  dayOffAbsenceTypeId: number | null | undefined;
  /** Null when this viewer can't see recurring schedules. */
  usualWeek: {
    orgId: string;
    recurringShifts: RecurringShift[];
    assignments: AssignmentDefinition[];
    shiftCategories: ShiftCategory[];
    jobs: JobDefinition[];
    focusAreas: FocusArea[];
    absenceTypes: AbsenceType[];
  } | null;
}

/** Their usual week, then every shift and time off in the period. */
export function ScheduleTab({
  employee,
  shifts,
  loading,
  range,
  today,
  periodPhrase,
  lookups,
  corrections,
  noteCounts,
  absenceTypes,
  dayOffAbsenceTypeId,
  usualWeek,
}: ScheduleTabProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [includeDayOff, setIncludeDayOff] = useState(false);
  const absenceById = lookups.absenceById;
  const records = useMemo(
    () =>
      shifts
        ? buildShiftRecords(employee.id, shifts, range, lookups, { corrections, noteCounts })
        : [],
    [corrections, employee.id, lookups, noteCounts, range, shifts],
  );
  const timeOff = useMemo(
    () =>
      shifts
        ? buildTimeOff(employee, shifts, range, today, absenceById, {
            dayOffAbsenceTypeId,
            includeDayOff,
          })
        : [],
    [absenceById, dayOffAbsenceTypeId, employee, includeDayOff, range, shifts, today],
  );
  const weeks = useMemo(
    () =>
      buildScheduleWeeks(
        filter === "timeoff" ? [] : records,
        filter === "shift" ? [] : timeOff,
        today,
      ),
    [filter, records, timeOff, today],
  );
  const dayOffName =
    dayOffAbsenceTypeId != null
      ? absenceTypes.find((absence) => absence.id === dayOffAbsenceTypeId)?.name
      : undefined;
  const totalHours = Math.round(records.reduce((sum, record) => sum + record.hours, 0) * 10) / 10;

  const exportCsv = () =>
    downloadCsvFile(
      shiftRecordsToCsv(records),
      `${employee.firstName}-${employee.lastName}-shifts-${range.startDate}-to-${range.endDate}.csv`
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, "-"),
    );

  return (
    <div className="flex flex-col gap-4">
      {usualWeek ? <UsualWeekCard employeeId={employee.id} {...usualWeek} /> : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="m-0 text-[17px] font-semibold tracking-tight text-[var(--dg-color-text-primary)]">
            Shifts and time off
          </h2>
          {loading ? null : (
            <span className="dg-tabular-nums text-[13px] text-[var(--dg-color-text-subtle)]">
              {records.length} {records.length === 1 ? "shift" : "shifts"}, {totalHours} hours,{" "}
              {timeOff.length} time off {periodPhrase}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SpanTabs<Filter>
            aria-label="Show"
            items={[
              { value: "all", label: "All" },
              { value: "shift", label: "Shifts" },
              { value: "timeoff", label: "Time off" },
            ]}
            value={filter}
            onChange={setFilter}
          />
          {dayOffName && filter !== "shift" ? (
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-sm"
              aria-pressed={includeDayOff}
              onClick={() => setIncludeDayOff((value) => !value)}
            >
              {includeDayOff ? `Hide ${dayOffName}` : `Show ${dayOffName}`}
            </Button>
          ) : null}
          <Button
            type="button"
            className="dg-btn dg-btn-secondary dg-btn-sm"
            onClick={exportCsv}
            disabled={records.length === 0}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <section className="dg-card overflow-hidden" aria-label="Shifts and time off">
        {loading ? (
          <p className="m-0 px-5 py-8 text-center text-[13px] text-[var(--dg-color-text-muted)]">
            Loading their schedule
          </p>
        ) : weeks.length === 0 ? (
          <p className="m-0 px-5 py-8 text-center text-[13px] text-[var(--dg-color-text-muted)]">
            Nothing {periodPhrase}.
          </p>
        ) : (
          weeks.map((week, weekIndex) => (
            <div key={week.weekStart}>
              <div
                className={`bg-[var(--dg-color-bg-secondary)] px-5 pb-2 pt-3 text-[13px] font-semibold text-[var(--dg-color-text-secondary)] ${weekIndex > 0 ? "border-t border-[var(--dg-color-border)]" : ""}`}
              >
                {week.label}
                <span className="dg-tabular-nums font-normal text-[var(--dg-color-text-subtle)]">
                  {" "}
                  · {week.span}
                </span>
              </div>
              {week.rows.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-1 items-center gap-x-4 gap-y-0.5 border-t border-[var(--dg-color-border-light)] px-5 py-3 sm:grid-cols-[130px_minmax(0,1fr)_auto]"
                >
                  <span className="dg-tabular-nums text-[14px] text-[var(--dg-color-text-secondary)]">
                    {row.dateLabel}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                    <span className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                      {row.title}
                    </span>
                    {row.detail ? (
                      <span className="dg-tabular-nums text-[13px] text-[var(--dg-color-text-subtle)]">
                        {row.detail}
                      </span>
                    ) : null}
                  </span>
                  <span>
                    {row.pill ? (
                      <StatusPill tone={row.pill.tone}>{row.pill.label}</StatusPill>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function UsualWeekCard({
  orgId,
  employeeId,
  recurringShifts,
  assignments,
  shiftCategories,
  jobs,
  focusAreas,
  absenceTypes,
}: NonNullable<ScheduleTabProps["usualWeek"]> & { employeeId: string }) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const lookups = useMemo(
    () => ({
      assignmentByPair: createAssignmentDefinitionByPairMap(assignments),
      absenceTypeById: new Map(absenceTypes.map((absence) => [absence.id, absence])),
      shiftById: new Map(shiftCategories.map((shift) => [shift.id, shift])),
      jobById: new Map(jobs.map((job) => [job.id, job])),
    }),
    [absenceTypes, assignments, jobs, shiftCategories],
  );
  const shiftPreferenceQuery = useQuery({
    queryKey: [...queryKeys.recurringShifts.preferences(orgId), employeeId],
    queryFn: () => fetchShiftPreferences(orgId, employeeId),
  });
  const jobPreferenceQuery = useQuery({
    queryKey: [...queryKeys.recurringShifts.jobPreferences(orgId), employeeId],
    queryFn: () => fetchJobPreferences(orgId, employeeId),
  });
  const shiftName = useMemo(() => {
    const byId = new Map(shiftCategories.map((shift) => [shift.id, shift]));
    const focusAreaName = (id: number) => focusAreas.find((area) => area.id === id)?.name;
    return (id: number) => {
      const shift = byId.get(id);
      return shift ? shiftLabel(shift, shiftCategories, focusAreaName) : undefined;
    };
  }, [focusAreas, shiftCategories]);
  const jobName = (id: number) => jobs.find((job) => job.id === id)?.name;
  const shiftPreference = shiftPreferenceQuery.data?.find((item) => item.employeeId === employeeId);
  const jobPreference = jobPreferenceQuery.data?.find((item) => item.employeeId === employeeId);
  const preferences = [
    describePreference(
      shiftPreference && { mode: shiftPreference.mode, ids: shiftPreference.shiftIds },
      shiftName,
    ),
    describePreference(
      jobPreference && { mode: jobPreference.mode, ids: jobPreference.jobIds },
      jobName,
    ),
  ].filter(Boolean);
  const until = recurringShifts
    .filter((shift) => shift.effectiveUntil)
    .map((shift) => `${DAY_LABELS[shift.dayOfWeek]} until ${shift.effectiveUntil}`);

  return (
    <section className="dg-card" aria-label="Usual week">
      <div className="dg-card-header">
        <div className="dg-card-title">Usual week</div>
        <Link
          href="/people?section=recurring-schedule"
          className="text-[13px] font-semibold text-[var(--dg-color-link)] no-underline hover:underline"
        >
          Edit on Recurring Shifts
        </Link>
      </div>
      <div className="dg-card-body">
        {recurringShifts.length === 0 ? (
          <p className="m-0 text-[14px] text-[var(--dg-color-text-muted)]">
            No recurring shifts yet.
          </p>
        ) : (
          <div className="dg-no-scrollbar overflow-x-auto">
            <div className="grid min-w-[700px] grid-cols-7 gap-2.5">
              {DAY_LABELS.map((day, dayOfWeek) => {
                const recurringShift = recurringShifts.find(
                  (shift) => shift.dayOfWeek === dayOfWeek,
                );
                const pills = recurringShift
                  ? buildDayPills(recurringShift, lookups, isDarkTheme)
                  : [];
                return (
                  <div key={day} className="flex min-w-0 flex-col text-center">
                    <div className="mb-2.5 text-[13px] font-bold text-[var(--dg-color-text-primary)]">
                      {day}
                    </div>
                    {pills.length > 0 ? (
                      <div className="flex flex-1 flex-col gap-1">
                        {pills.map((pill) => (
                          <WeekPill key={pill.key} pill={pill} />
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[62px] items-center justify-center text-[14px] text-[var(--dg-color-text-subtle)]">
                        -
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {preferences.length > 0 || until.length > 0 ? (
          <p className="m-0 mt-3 text-[13px] text-[var(--dg-color-text-secondary)]">
            {[...preferences, ...until].join(". ")}.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** The dashboard's Your schedule card, for a day of the usual week. */
function WeekPill({ pill }: { pill: DayPill }) {
  return (
    <div
      className="flex min-h-[62px] flex-1 flex-col justify-center rounded-[var(--dg-radius-sm)] border p-2 [overflow-wrap:anywhere]"
      style={{ background: pill.background, borderColor: pill.border, color: pill.textColor }}
    >
      <span className="text-[length:var(--dg-type-badge-size)] font-semibold leading-[1.25]">
        {pill.name}
      </span>
      {pill.jobName ? (
        <span className="mt-px text-[length:var(--dg-type-metadata-size)] font-medium leading-[1.25] opacity-80">
          {pill.jobName}
        </span>
      ) : null}
      {pill.time ? (
        <span className="dg-tabular-nums mt-px whitespace-nowrap text-[length:var(--dg-type-metadata-size)] leading-[1.25]">
          {pill.time}
        </span>
      ) : null}
    </div>
  );
}
