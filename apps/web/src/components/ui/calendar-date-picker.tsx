"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { addDays, cn } from "@/lib/utils";

const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const FIELD_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const DAY_ARIA_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildCalendarDays(month: Date): Date[] {
  const firstOfMonth = startOfMonth(month);
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export interface CalendarDatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  minDate?: string | null;
  disabled?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
}

export default function CalendarDatePicker({
  id,
  value,
  onChange,
  label,
  placeholder = "No date selected",
  minDate = null,
  disabled = false,
  allowClear = false,
  style,
}: CalendarDatePickerProps) {
  const selectedDate = useMemo(() => (value ? parseLocalDate(value) : null), [value]);
  const minSelectableDate = useMemo(() => (minDate ? parseLocalDate(minDate) : null), [minDate]);
  const todayKey = formatLocalDate(new Date());

  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() =>
    startOfMonth(selectedDate ?? minSelectableDate ?? new Date()),
  );

  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setVisibleMonth(startOfMonth(selectedDate ?? minSelectableDate ?? new Date()));
  }, [minSelectableDate, open, selectedDate]);

  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  const triggerLabel = selectedDate ? FIELD_DATE_FORMATTER.format(selectedDate) : placeholder;

  return (
    <>
      <div ref={triggerRef} style={{ display: "inline-block", width: "100%", ...style }}>
        <button
          id={id}
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (disabled) return;
            setOpen((current) => !current);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            minHeight: "var(--dg-toolbar-h)",
            background: disabled ? "var(--color-bg)" : "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--dg-btn-radius)",
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 500,
            color: selectedDate ? "var(--color-text-secondary)" : "var(--color-text-subtle)",
            cursor: disabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            textAlign: "left",
            transition: "box-shadow 150ms ease",
            boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.15)" : undefined,
            borderColor: open ? "var(--color-border-focus)" : "var(--color-border)",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <CalendarDays
            size={15}
            style={{
              color: selectedDate ? "var(--color-text-muted)" : "var(--color-text-faint)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {triggerLabel}
          </span>
          <ChevronDown
            size={14}
            style={{
              color: "var(--color-text-faint)",
              flexShrink: 0,
              transition: "transform 150ms ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
      </div>

      {open && !disabled ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverContent
            anchor={triggerRef}
            side="bottom"
            align="start"
            sideOffset={6}
            positionMethod="fixed"
            collisionPadding={12}
            collisionAvoidance={{
              side: "flip",
              align: "shift",
              fallbackAxisSide: "none",
            }}
            initialFocus={false}
            className="dg-menu"
            style={{
              padding: 12,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              width: "min(max(var(--anchor-width), 320px), calc(100vw - 24px))",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                {MONTH_FORMATTER.format(visibleMonth)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}
                  className="dg-menu-item"
                  aria-label={`Show ${MONTH_FORMATTER.format(shiftMonth(visibleMonth, -1))}`}
                  style={{
                    width: 32,
                    height: 32,
                    padding: 0,
                    justifyContent: "center",
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}
                  className="dg-menu-item"
                  aria-label={`Show ${MONTH_FORMATTER.format(shiftMonth(visibleMonth, 1))}`}
                  style={{
                    width: 32,
                    height: 32,
                    padding: 0,
                    justifyContent: "center",
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {CALENDAR_WEEKDAYS.map((weekday) => (
                <div
                  key={weekday}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 28,
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--color-text-subtle)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1" aria-label={`${label} calendar`}>
              {calendarDays.map((day) => {
                const dateKey = formatLocalDate(day);
                const isSelected = value === dateKey;
                const isToday = dateKey === todayKey;
                const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
                const isDisabled = !!minDate && dateKey < minDate && !isSelected;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => {
                      onChange(dateKey);
                      setOpen(false);
                    }}
                    disabled={isDisabled}
                    aria-label={`${isSelected ? "Selected " : "Choose "}${DAY_ARIA_FORMATTER.format(day)}`}
                    className={cn(
                      "relative flex h-9 items-center justify-center rounded-lg text-[12px] transition-colors",
                      isSelected
                        ? "bg-[var(--color-brand)] font-semibold text-[var(--color-text-inverse)]"
                        : isDisabled
                          ? "cursor-not-allowed text-[var(--color-text-faint)] opacity-35"
                          : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]",
                      !isSelected &&
                        !isDisabled &&
                        !isCurrentMonth &&
                        "text-[var(--color-text-faint)]",
                    )}
                  >
                    <span>{day.getDate()}</span>
                    {isToday ? (
                      <span
                        className={cn(
                          "absolute bottom-1 h-1 w-1 rounded-full",
                          isSelected ? "bg-[var(--color-text-inverse)]" : "bg-[var(--color-brand)]",
                        )}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                paddingTop: 10,
                borderTop: "1px solid var(--color-border-light)",
              }}
            >
              <button
                type="button"
                className="dg-btn dg-btn-secondary"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                disabled={!allowClear || !value}
                style={{ fontSize: "var(--dg-fs-caption)", padding: "6px 10px" }}
              >
                Clear
              </button>
              <button
                type="button"
                className="dg-btn dg-btn-secondary"
                onClick={() => setOpen(false)}
                style={{ fontSize: "var(--dg-fs-caption)", padding: "6px 10px" }}
              >
                Close
              </button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  );
}
