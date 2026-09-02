"use client";

import { CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DAY_LABELS } from "@/lib/constants";
import type { RecurringShift } from "@/types";

export function RecurringScheduleCard({ recurringShifts }: { recurringShifts: RecurringShift[] }) {
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
            <div className="grid grid-cols-7 gap-1 text-center">
              {DAY_LABELS.map((day, dayOfWeek) => {
                const recurringShift = recurringShifts.find(
                  (shift) => shift.dayOfWeek === dayOfWeek,
                );
                return (
                  <div
                    key={day}
                    className={`flex flex-col items-center justify-center rounded-lg border py-2.5 ${
                      recurringShift
                        ? "border-[var(--dg-color-border-light)] bg-[var(--dg-color-bg)]"
                        : "border-transparent bg-transparent"
                    }`}
                  >
                    <span className="text-[length:var(--dg-type-badge-size)] font-medium uppercase tracking-normal text-[var(--dg-color-text-subtle)]">
                      {day}
                    </span>
                    <span
                      className={`mt-1 max-w-full truncate px-0.5 text-[length:var(--dg-type-badge-size)] font-medium ${
                        recurringShift
                          ? "text-[var(--dg-color-text-primary)]"
                          : "text-[var(--dg-color-text-faint)]"
                      }`}
                    >
                      {recurringShift ? recurringShift.shiftLabel : "-"}
                    </span>
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
