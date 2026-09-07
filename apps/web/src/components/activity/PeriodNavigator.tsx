"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/Button";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import { SpanTabs } from "@/components/ui/span-tabs";
import CalendarDatePicker from "@/components/ui/calendar-date-picker";
import { formatActivityTodayLabel, type ActivityPeriodUnit } from "@/lib/activity-period";

const UNIT_TABS: { value: ActivityPeriodUnit; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

interface PeriodNavigatorProps {
  unit: ActivityPeriodUnit;
  label: string;
  anchorDate: string;
  isCurrent: boolean;
  nextDisabled: boolean;
  onUnitChange: (unit: ActivityPeriodUnit) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onJumpToDate: (date: string) => void;
  /** Shown when the times cannot be resolved to an organization's zone. */
  timeZoneNote?: string | null;
}

export function PeriodNavigator({
  unit,
  label,
  anchorDate,
  isCurrent,
  nextDisabled,
  onUnitChange,
  onPrev,
  onNext,
  onToday,
  onJumpToDate,
  timeZoneNote = null,
}: PeriodNavigatorProps) {
  return (
    <div className="dg-toolbar-type dg-activity-navigator">
      <div className="dg-activity-stepper">
        <Hint content={hint("Go to previous period")} side="bottom">
          <Button
            type="button"
            onClick={onPrev}
            className="dg-btn dg-btn-secondary dg-btn-icon"
            aria-label="Go to previous period"
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
          </Button>
        </Hint>

        {/* The period label is the calendar trigger, so the toolbar carries one
            date control instead of a label beside a second date field. */}
        <div className="dg-activity-period-label">
          <CalendarDatePicker
            value={anchorDate}
            onChange={onJumpToDate}
            label="Change period, or jump to a date"
            triggerLabel={label}
            triggerVariant="inline"
          />
        </div>

        <Hint content={hint("Go to next period")} side="bottom">
          <Button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="dg-btn dg-btn-secondary dg-btn-icon"
            aria-label="Go to next period"
          >
            <ChevronRight size={16} strokeWidth={2.5} />
          </Button>
        </Hint>
      </div>

      <SpanTabs
        items={UNIT_TABS}
        value={unit}
        onChange={onUnitChange}
        aria-label="Activity period length"
      />

      <Button
        type="button"
        onClick={onToday}
        disabled={isCurrent}
        className="dg-btn dg-btn-secondary dg-activity-today"
      >
        {formatActivityTodayLabel(unit)}
      </Button>

      {timeZoneNote ? <span className="dg-activity-zone-note">{timeZoneNote}</span> : null}
    </div>
  );
}
