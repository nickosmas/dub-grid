"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { Calendar, Copy } from "lucide-react";
import { OverviewTab } from "@/components/staff-detail/tabs/OverviewTab";
import { Button } from "@/components/Button";
import { ScheduleTab } from "@/components/staff-detail/tabs/ScheduleTab";
import { computeEmployeeWeeklyHours, getWeekDates, getWeekStart } from "@/lib/dashboard-stats";
import { formatDateKey } from "@/lib/utils";
import type {
  AbsenceType,
  Employee,
  FocusArea,
  NamedItem,
  RecurringShift,
  ShiftCategory,
  AssignmentDefinition,
  ShiftMap,
  ShiftRequest,
} from "@/types";

interface SharedSelfWorkProps {
  employee: Employee;
  focusAreas: FocusArea[];
  focusAreaLabel?: string;
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  absenceTypes: AbsenceType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  shifts: ShiftMap;
  recurringShifts: RecurringShift[];
  shiftRequests: ShiftRequest[];
  auditNames: Map<string, string>;
}

function useSelfWorkMaps({
  focusAreas,
  assignments,
  shiftCategories,
  absenceTypes,
}: Pick<SharedSelfWorkProps, "focusAreas" | "assignments" | "shiftCategories" | "absenceTypes">) {
  const assignmentById = useMemo(() => {
    const map = new Map<number, AssignmentDefinition>();
    for (const assignment of assignments) {
      map.set(assignment.id, assignment);
    }
    return map;
  }, [assignments]);

  const categoryById = useMemo(() => {
    const map = new Map<number, ShiftCategory>();
    for (const category of shiftCategories) map.set(category.id, category);
    return map;
  }, [shiftCategories]);

  const focusAreaById = useMemo(() => {
    const map = new Map<number, FocusArea>();
    for (const focusArea of focusAreas) map.set(focusArea.id, focusArea);
    return map;
  }, [focusAreas]);

  const absenceTypeById = useMemo(() => {
    const map = new Map<number, AbsenceType>();
    for (const absenceType of absenceTypes) map.set(absenceType.id, absenceType);
    return map;
  }, [absenceTypes]);

  return {
    assignmentById,
    categoryById,
    focusAreaById,
    absenceTypeById,
  };
}

export function SelfWorkOverview({
  employee,
  shifts,
  certifications,
  orgRoles,
  ...rest
}: SharedSelfWorkProps) {
  const { assignmentById, categoryById } = useSelfWorkMaps(rest);

  const thisWeekHours = useMemo(() => {
    const weekStart = getWeekStart(new Date());
    const weekDateKeys = getWeekDates(weekStart).map(formatDateKey);
    return computeEmployeeWeeklyHours(
      employee.id,
      weekDateKeys,
      shifts,
      assignmentById,
      40,
      categoryById,
    );
  }, [assignmentById, categoryById, employee.id, shifts]);

  return (
    <OverviewTab
      employee={employee}
      shifts={shifts}
      assignmentById={assignmentById}
      categoryById={categoryById}
      focusAreas={rest.focusAreas}
      focusAreaLabel={rest.focusAreaLabel}
      certifications={certifications}
      orgRoles={orgRoles}
      pendingInvite={null}
      thisWeekHours={thisWeekHours}
    />
  );
}

export function SelfWorkSchedule({
  employee,
  focusAreas,
  shifts,
  recurringShifts,
  shiftRequests,
  auditNames,
  ...rest
}: SharedSelfWorkProps) {
  const { assignmentById, categoryById, focusAreaById, absenceTypeById } = useSelfWorkMaps({
    focusAreas,
    assignments: rest.assignments,
    shiftCategories: rest.shiftCategories,
    absenceTypes: rest.absenceTypes,
  });

  return (
    <div className="space-y-4">
      <div className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title">Calendar Subscription</div>
            <div className="dg-card-subtitle">
              Subscribe to your shift schedule in your preferred calendar app.
            </div>
          </div>
        </div>
        <div className="dg-card-body flex flex-col gap-3">
          <p className="m-0 text-[14px] text-[var(--dg-color-text-muted)]">
            Use this private feed in Google Calendar, Apple Calendar, or Outlook.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border)] bg-[var(--dg-color-bg)] px-3 py-2">
              <Calendar className="size-4 shrink-0 text-[var(--dg-color-text-muted)]" />
              <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-[var(--dg-color-text-secondary)]">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/api/calendar`
                  : "/api/calendar"}
              </code>
            </div>
            <Button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/api/calendar`;
                return navigator.clipboard.writeText(url).then(
                  () => toast.success("Calendar URL copied to clipboard"),
                  () => toast.error("We couldn't copy that link. Copy it manually instead."),
                );
              }}
              className="dg-btn dg-btn-secondary"
            >
              <Copy className="mr-1 size-4" />
              Copy URL
            </Button>
          </div>
          <p className="m-0 text-[12px] text-[var(--dg-color-text-subtle)]">
            You must be logged in for the feed to work. The URL returns your shifts for the next 4
            weeks.
          </p>
        </div>
      </div>

      <ScheduleTab
        employee={employee}
        shifts={shifts}
        assignmentById={assignmentById}
        focusAreas={focusAreas}
        categoryById={categoryById}
        focusAreaById={focusAreaById}
        absenceTypeById={absenceTypeById}
        auditNames={auditNames}
        shiftRequests={shiftRequests}
        recurringShifts={recurringShifts}
        canViewRecurringShifts
      />
    </div>
  );
}
