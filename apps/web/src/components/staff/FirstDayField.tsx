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
  placeholder = "Not set",
  labelGap = 6,
}: {
  value: string;
  onChange: (value: string) => void;
  labelStyle: CSSProperties;
  disabled?: boolean;
  /** What the empty field says. */
  placeholder?: string;
  /** Space under the label, to match the fields beside it. */
  labelGap?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ ...labelStyle, marginBottom: labelGap }}>First day</span>
      <CalendarDatePicker
        value={value}
        onChange={onChange}
        label="First day"
        placeholder={placeholder}
        minDate={formatDateKey(new Date())}
        maxDate={formatDateKey(addDays(new Date(), PLANNED_START_MAX_DAYS))}
        disabled={disabled}
        allowClear
      />
      <span
        style={{
          fontSize: "var(--dg-fs-caption)",
          color: "var(--dg-color-text-muted)",
          marginTop: 6,
        }}
      >
        {FIRST_DAY_FIELD_HINT}
      </span>
    </div>
  );
}
