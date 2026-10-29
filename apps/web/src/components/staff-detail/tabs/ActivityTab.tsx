"use client";

import type { Employee, EmployeeActivityEntry } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
import { PERSON_ACTIVITY_CATEGORIES } from "@/lib/audit/registry";
import { PersonActivityTimeline } from "@/components/activity/PersonActivityTimeline";

interface ActivityTabProps {
  employee: Employee;
  entries: EmployeeActivityEntry[];
  loading: boolean;
  error: string | null;
  timeZone?: string | null;
  /** The staff page's period, which the timeline follows. */
  range?: { startDate: string; endDate: string; phrase: string };
}

export function ActivityTab({
  employee,
  entries,
  loading,
  error,
  timeZone = null,
  range,
}: ActivityTabProps) {
  return (
    <PersonActivityTimeline
      entries={entries}
      loading={loading}
      error={error}
      timeZone={timeZone}
      range={range}
      categories={PERSON_ACTIVITY_CATEGORIES}
      emptyDescription={`Changes to ${getEmployeeDisplayName(employee)}'s profile, status, access, or invitations will show up here.`}
    />
  );
}
