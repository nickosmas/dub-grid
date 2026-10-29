"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { fetchJobPreferences, fetchShiftPreferences } from "@/features/schedule/client";
import { describePreference, shiftLabel } from "@/components/staff/PreferencesModal";
import { queryKeys } from "@/lib/query-keys";
import type { ComponentProps } from "react";
import type { FocusArea } from "@/types";
import { InfoField } from "../PersonInfoCards";
import { RecurringScheduleCard } from "../RecurringScheduleCard";

interface RecurringTabProps extends Required<ComponentProps<typeof RecurringScheduleCard>> {
  orgId: string;
  employeeId: string;
  focusAreas: FocusArea[];
}

export function RecurringTab({
  orgId,
  employeeId,
  focusAreas,
  ...scheduleCard
}: RecurringTabProps) {
  const { shiftCategories, jobs } = scheduleCard;
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

  const shift = shiftPreferenceQuery.data?.find((item) => item.employeeId === employeeId);
  const job = jobPreferenceQuery.data?.find((item) => item.employeeId === employeeId);
  const failed = shiftPreferenceQuery.isError || jobPreferenceQuery.isError;
  const loading = shiftPreferenceQuery.isPending || jobPreferenceQuery.isPending;

  return (
    <div className="flex flex-col gap-4">
      <RecurringScheduleCard {...scheduleCard} />

      <section className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title flex items-center gap-2">
              <Heart className="h-4 w-4 text-[var(--dg-color-text-muted)]" aria-hidden />
              Shift preferences
            </div>
            <div className="dg-card-subtitle">What Auto-build gives them first, or only.</div>
          </div>
          <Link
            href="/people?section=recurring-schedule"
            className="text-[13px] font-semibold text-[var(--dg-color-link)] no-underline hover:underline"
          >
            Edit on Recurring Shifts
          </Link>
        </div>
        <dl className="dg-card-body flex flex-col gap-3">
          {failed ? (
            <p className="text-[13px] text-[var(--dg-color-text-muted)]">
              We couldn&apos;t load their preferences right now.
            </p>
          ) : loading ? (
            <p className="text-[13px] text-[var(--dg-color-text-muted)]">Loading preferences</p>
          ) : (
            <>
              <InfoField label="Jobs">
                {describePreference(job && { mode: job.mode, ids: job.jobIds }, jobName) ?? (
                  <span className="text-[var(--dg-color-text-faint)]">Any job</span>
                )}
              </InfoField>
              <InfoField label="Shifts">
                {describePreference(
                  shift && { mode: shift.mode, ids: shift.shiftIds },
                  shiftName,
                ) ?? <span className="text-[var(--dg-color-text-faint)]">Any shift</span>}
              </InfoField>
            </>
          )}
        </dl>
      </section>
    </div>
  );
}
