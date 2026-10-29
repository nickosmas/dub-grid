"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import CustomSelect from "@/components/CustomSelect";
import DateRangePicker from "@/components/ui/date-range-picker";
import {
  buildPeriodOptions,
  isValidCustomRange,
  MAX_CUSTOM_RANGE_DAYS,
} from "@/lib/period-presets";
import {
  PERSON_PERIOD_PRESETS,
  type PersonPeriod,
  type PersonPeriodPreset,
} from "@/lib/person-period";
import type { PeriodRange } from "@/lib/period-presets";

interface PersonPeriodControlProps {
  period: PersonPeriod;
  payPeriodStartDate: string | null | undefined;
  onPresetChange: (preset: PersonPeriodPreset) => void;
  onCustomRangeChange: (range: PeriodRange) => void;
}

/** The period the staff page's tabs follow, beside the tabs. */
export function PersonPeriodControl({
  period,
  payPeriodStartDate,
  onPresetChange,
  onCustomRangeChange,
}: PersonPeriodControlProps) {
  const isCustom = period.preset === "custom";
  const options = useMemo(
    () => buildPeriodOptions(PERSON_PERIOD_PRESETS, period.range, payPeriodStartDate, isCustom),
    [isCustom, payPeriodStartDate, period.range],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CustomSelect
        value={period.preset}
        options={options}
        ariaLabel="Period"
        style={{ minWidth: 240 }}
        onChange={(preset) => {
          onPresetChange(preset);
          if (preset === "pay-period" && !payPeriodStartDate) {
            toast.info(
              "Set a pay period start date in Settings > Schedule Rules to use this range.",
            );
          }
        }}
      />
      {isCustom && (
        <DateRangePicker
          label="Dates"
          value={{ from: period.range.startDate, to: period.range.endDate }}
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
      )}
    </div>
  );
}
