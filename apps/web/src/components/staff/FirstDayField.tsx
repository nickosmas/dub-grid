"use client";

import type { CSSProperties } from "react";
import { FIRST_DAY_FIELD_HINT, PLANNED_START_MAX_DAYS } from "@dubgrid/domain";
import CalendarDatePicker from "@/components/ui/calendar-date-picker";
import { addDays, formatDateKey } from "@/lib/utils";

/** A person's first day (51g4): from today up to a year ahead; empty for none. */
export function FirstDayField({
  value,
  onChange,
  labelStyle,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  labelStyle: CSSProperties;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={labelStyle}>First day</span>
      <CalendarDatePicker
        value={value}
        onChange={onChange}
        label="First day"
        placeholder="Not set"
        minDate={formatDateKey(new Date())}
        maxDate={formatDateKey(addDays(new Date(), PLANNED_START_MAX_DAYS))}
        disabled={disabled}
        allowClear
      />
      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
        {FIRST_DAY_FIELD_HINT}
      </span>
    </div>
  );
}
