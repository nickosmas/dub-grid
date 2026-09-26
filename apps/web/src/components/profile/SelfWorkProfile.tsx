"use client";

import { useMemo } from "react";

import { CalendarSubscriptionCard } from "@/components/profile/CalendarSubscriptionCard";
import { RecurringScheduleCard } from "@/components/staff-detail/RecurringScheduleCard";
import { PersonRecordCard } from "@/components/staff-detail/PersonRecordCard";
import { OverviewTab } from "@/components/staff-detail/tabs/OverviewTab";
import { computeEmployeeWeeklyHours } from "@/lib/dashboard-stats";
import {
  getProfileOverviewCurrentWeekDateKeys,
  getProfileOverviewDateRange,
} from "@/features/account/shared/profile-schedule";
import type {
  AbsenceType,
  AssignmentDefinition,
  Employee,
  JobDefinition,
  FocusArea,
  NamedItem,
  RecurringShift,
  ShiftCategory,
  ShiftMap,
} from "@/types";

interface SelfWorkOverviewProps {
  employee: Employee;
  focusAreas: FocusArea[];
  focusAreaLabel?: string;
  assignments: AssignmentDefinition[];
  absenceTypes?: AbsenceType[];
  shiftCategories: ShiftCategory[];
  jobs?: JobDefinition[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  shifts: ShiftMap;
  recurringShifts: RecurringShift[];
  timeZone?: string | null;
}

export function SelfWorkOverview({
  employee,
  focusAreas,
  focusAreaLabel,
  assignments,
  absenceTypes,
  shiftCategories,
  jobs,
  certifications,
  orgRoles,
  shifts,
  recurringShifts,
  timeZone,
}: SelfWorkOverviewProps) {
  const assignmentById = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.id, assignment])),
    [assignments],
  );
  const categoryById = useMemo(
    () => new Map(shiftCategories.map((category) => [category.id, category])),
    [shiftCategories],
  );
  const overviewRange = useMemo(
    () => getProfileOverviewDateRange(new Date(), timeZone),
    [timeZone],
  );
  const thisWeekHours = useMemo(() => {
    return computeEmployeeWeeklyHours(
      employee.id,
      getProfileOverviewCurrentWeekDateKeys(overviewRange),
      shifts,
      assignmentById,
      40,
      categoryById,
    );
  }, [assignmentById, categoryById, employee.id, overviewRange, shifts]);

  return (
    <div className="flex flex-col gap-4">
      <OverviewTab
        employee={employee}
        shifts={shifts}
        assignmentById={assignmentById}
        categoryById={categoryById}
        focusAreas={focusAreas}
        focusAreaLabel={focusAreaLabel}
        certifications={certifications}
        orgRoles={orgRoles}
        thisWeekHours={thisWeekHours}
        timeZone={timeZone}
        scheduleOverview={
          <div className="flex flex-col gap-4">
            <CalendarSubscriptionCard />
            <RecurringScheduleCard
              recurringShifts={recurringShifts}
              assignments={assignments}
              absenceTypes={absenceTypes}
              shiftCategories={shiftCategories}
              jobs={jobs}
            />
          </div>
        }
      />
      <PersonRecordCard employee={employee} accountState={{ kind: "linked" }} />
    </div>
  );
}
