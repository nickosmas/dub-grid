"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import DateRangePicker from "@/components/ui/date-range-picker";
import { isValidCustomRange, MAX_CUSTOM_RANGE_DAYS, type PeriodRange } from "@/lib/period-presets";
import { formatPersonPeriodLabel, isCurrentMonth, type PersonPeriod } from "@/lib/person-period";

interface PersonPeriodControlProps {
  period: PersonPeriod;
  today: string;
  onStep: (step: -1 | 1) => void;
  onToday: () => void;
  onCustomRangeChange: (range: PeriodRange) => void;
}

const EMPTY_RANGE = { from: "", to: "" };

/** The month the staff page's tabs follow, beside the tabs, with Dates for any other span. */
export function PersonPeriodControl({
  period,
  today,
  onStep,
  onToday,
  onCustomRangeChange,
}: PersonPeriodControlProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
      {/* Before the arrows, so appearing never moves them under the pointer. */}
      {!isCurrentMonth(period, today) && (
        <Button type="button" className="dg-btn dg-btn-secondary dg-btn-sm" onClick={onToday}>
          Today
        </Button>
      )}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          className="dg-btn dg-btn-secondary dg-btn-icon"
          aria-label="Previous month"
          onClick={() => onStep(-1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <span
          className="dg-tabular-nums min-w-[136px] px-1 text-center text-[14px] font-semibold text-[var(--dg-color-text-primary)]"
          aria-live="polite"
        >
          {formatPersonPeriodLabel(period)}
        </span>
        <Button
          type="button"
          className="dg-btn dg-btn-secondary dg-btn-icon"
          aria-label="Next month"
          onClick={() => onStep(1)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      {/* The trigger always reads "Dates": the arrows' label already names the picked span. */}
      <DateRangePicker
        label="Pick dates"
        placeholder="Dates"
        value={EMPTY_RANGE}
        onChange={(next) => {
          const range = { startDate: next.from, endDate: next.to };
          if (!next.from || !next.to) return;
          if (!isValidCustomRange(range)) {
            toast.error(`Pick up to ${MAX_CUSTOM_RANGE_DAYS} days.`);
            return;
          }
          onCustomRangeChange(range);
        }}
      />
    </div>
  );
}
