"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import { CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { resolveShiftPillColors } from "@/lib/colors";
import { DAY_LABELS } from "@/lib/constants";
import { shouldShowJobOnGrid } from "@/lib/job-placement";
import {
  buildShiftJobPairKey,
  createAssignmentDefinitionByPairMap,
} from "@/lib/shift-job-segments";
import type {
  AbsenceType,
  AssignmentDefinition,
  JobDefinition,
  RecurringShift,
  ShiftCategory,
} from "@/types";

type DayPill = {
  key: string;
  name: string;
  jobName: string | null;
  background: string;
  border: string;
  textColor: string;
};

const NEUTRAL_PILL = {
  background: "var(--dg-color-bg-secondary)",
  border: "var(--dg-color-border)",
  textColor: "var(--dg-color-text-primary)",
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The pattern is a reference surface, not the grid: it always spells the
 * assignment out even when the org schedules in codes, because there is no
 * column width here forcing "D · S" on a reader who came to check what they
 * actually work.
 */
function buildDayPills(
  recurringShift: RecurringShift,
  lookups: {
    assignmentByPair: Map<string, AssignmentDefinition>;
    absenceTypeById: Map<number, AbsenceType>;
    shiftById: Map<number, ShiftCategory>;
    jobById: Map<number, JobDefinition>;
  },
  isDarkTheme: boolean,
): DayPill[] {
  const { assignmentByPair, absenceTypeById, shiftById, jobById } = lookups;
  if (recurringShift.absenceTypeId != null) {
    const absence = absenceTypeById.get(recurringShift.absenceTypeId) ?? null;
    const resolved = absence
      ? resolveShiftPillColors(
          { color: absence.color, text: absence.text, border: absence.border },
          isDarkTheme,
        )
      : null;
    return [
      {
        key: `${recurringShift.id}-absence`,
        name: absence?.name || absence?.label || recurringShift.shiftLabel,
        jobName: null,
        background: resolved?.color ?? NEUTRAL_PILL.background,
        border: resolved?.border ?? NEUTRAL_PILL.border,
        textColor: resolved?.text ?? NEUTRAL_PILL.textColor,
      },
    ];
  }

  const segments = recurringShift.presentation?.segments ?? [];
  if (segments.length === 0) {
    return [
      {
        key: `${recurringShift.id}-0`,
        name: recurringShift.presentation?.shiftName || recurringShift.shiftLabel,
        jobName: null,
        ...NEUTRAL_PILL,
      },
    ];
  }

  return segments.map((segment, index) => {
    const assignment =
      segment.jobId != null
        ? (assignmentByPair.get(buildShiftJobPairKey(segment.shiftId ?? null, segment.jobId)) ??
          null)
        : null;
    const resolved = assignment
      ? resolveShiftPillColors(
          { color: assignment.color, text: assignment.text, border: assignment.border },
          isDarkTheme,
        )
      : null;
    // Recurring rows come back without resolved segment names, and an
    // assignment's own name can be an admin-set combination that already bakes
    // the job in. Resolve the shift by id first so the two lines stay separate,
    // exactly as the dashboard's schedule row does.
    const shiftId = segment.shiftId ?? assignment?.shiftId ?? assignment?.categoryId ?? null;
    const name =
      segment.shiftName ||
      (shiftId != null ? shiftById.get(shiftId)?.name : null) ||
      assignment?.name ||
      segment.label ||
      recurringShift.shiftLabel;
    const jobId = segment.jobId ?? assignment?.jobId ?? null;
    const job = jobId != null ? (jobById.get(jobId) ?? null) : null;
    const jobName = job && shouldShowJobOnGrid(job) ? job.name : (segment.jobName?.trim() ?? null);

    return {
      key: `${recurringShift.id}-${index}`,
      name,
      // A shiftless job resolves the same text into both lines; one of them is
      // enough.
      jobName: jobName && normalizeName(jobName) !== normalizeName(name) ? jobName : null,
      background: resolved?.color ?? NEUTRAL_PILL.background,
      border: resolved?.border ?? NEUTRAL_PILL.border,
      textColor: resolved?.text ?? NEUTRAL_PILL.textColor,
    };
  });
}

export function RecurringScheduleCard({
  recurringShifts,
  assignments = [],
  absenceTypes = [],
  shiftCategories = [],
  jobs = [],
}: {
  recurringShifts: RecurringShift[];
  assignments?: AssignmentDefinition[];
  absenceTypes?: AbsenceType[];
  shiftCategories?: ShiftCategory[];
  jobs?: JobDefinition[];
}) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";

  const assignmentByPair = useMemo(
    () => createAssignmentDefinitionByPairMap(assignments),
    [assignments],
  );
  const absenceTypeById = useMemo(
    () => new Map(absenceTypes.map((absenceType) => [absenceType.id, absenceType])),
    [absenceTypes],
  );
  const shiftById = useMemo(
    () => new Map(shiftCategories.map((shiftCategory) => [shiftCategory.id, shiftCategory])),
    [shiftCategories],
  );
  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);

  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[var(--dg-color-text-muted)]" />
            Recurring schedule
            <Badge
              variant="secondary"
              className="ml-1 h-4 px-1.5 py-0 font-mono text-[length:var(--dg-type-badge-size)]"
            >
              {recurringShifts.length}
            </Badge>
          </div>
          <div className="dg-card-subtitle">Weekly pattern for repeating assignments.</div>
        </div>
      </div>
      <div className="dg-card-body">
        {recurringShifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CalendarClock className="mb-3 h-7 w-7 text-[var(--dg-color-text-faint)]" />
            <p className="text-[13px] text-[var(--dg-color-text-muted)]">
              No recurring shifts configured
            </p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-7 items-stretch gap-1 text-center">
              {DAY_LABELS.map((day, dayOfWeek) => {
                const recurringShift = recurringShifts.find(
                  (shift) => shift.dayOfWeek === dayOfWeek,
                );
                const pills = recurringShift
                  ? buildDayPills(
                      recurringShift,
                      { assignmentByPair, absenceTypeById, shiftById, jobById },
                      isDarkTheme,
                    )
                  : [];
                return (
                  <div key={day} className="flex flex-col items-stretch gap-1.5">
                    <span className="text-[length:var(--dg-type-badge-size)] font-medium uppercase tracking-normal text-[var(--dg-color-text-subtle)]">
                      {day}
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
            {recurringShifts.some((shift) => shift.effectiveUntil) && (
              <p className="mt-3 text-center text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-muted)]">
                {recurringShifts
                  .filter((shift) => shift.effectiveUntil)
                  .map((shift) => `${DAY_LABELS[shift.dayOfWeek]}: until ${shift.effectiveUntil}`)
                  .join(" · ")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
