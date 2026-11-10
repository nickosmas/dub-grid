"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import CustomSelect from "@/components/CustomSelect";
import DateRangePicker from "@/components/ui/date-range-picker";
import { isValidCustomRange, MAX_CUSTOM_RANGE_DAYS, type PeriodRange } from "@/lib/period-presets";
import {
  formatPersonPeriodLabel,
  isCurrentPeriod,
  PERSON_PERIOD_SPAN_LABELS,
  PERSON_PERIOD_SPAN_NOUNS,
  personPeriodSpans,
  type PersonPeriod,
  type PersonPeriodSpan,
} from "@/lib/person-period";

interface PersonPeriodControlProps {
  span: PersonPeriodSpan;
  period: PersonPeriod;
  today: string;
  payPeriodStartDate?: string | null;
  onSpanChange: (span: PersonPeriodSpan) => void;
  onStep: (step: -1 | 1) => void;
  onToday: () => void;
  onCustomRangeChange: (range: PeriodRange) => void;
}

const EMPTY_RANGE = { from: "", to: "" };

/**
 * The period a person's tabs follow, beside the tabs: what the arrows step by,
 * the arrows themselves, and Dates for any other span.
 */
export function PersonPeriodControl({
  span,
  period,
  today,
  payPeriodStartDate,
  onSpanChange,
  onStep,
  onToday,
  onCustomRangeChange,
}: PersonPeriodControlProps) {
  const noun = PERSON_PERIOD_SPAN_NOUNS[span];
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
      <CustomSelect<PersonPeriodSpan>
        ariaLabel="Step by"
        value={span}
        options={personPeriodSpans(payPeriodStartDate).map((value) => ({
          value,
          label: PERSON_PERIOD_SPAN_LABELS[value],
        }))}
        onChange={onSpanChange}
      />
      {/* Before the arrows, so appearing never moves them under the pointer. */}
      {!isCurrentPeriod(period, today, payPeriodStartDate) && (
        <Button type="button" className="dg-btn dg-btn-secondary dg-btn-sm" onClick={onToday}>
          Today
        </Button>
      )}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          className="dg-btn dg-btn-secondary dg-btn-icon"
          aria-label={`Previous ${noun}`}
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
          aria-label={`Next ${noun}`}
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
