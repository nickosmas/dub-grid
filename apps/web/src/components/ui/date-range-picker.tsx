"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/Button";
import { MOBILE, useMediaQuery } from "@/hooks/useMediaQuery";

// No weekday: the trigger shares a toolbar column with other controls, and
// the day picker names the weekday itself.
const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DAY_WITH_YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export interface DateRangeValue {
  /** `YYYY-MM-DD`, or empty for an open end. */
  from: string;
  to: string;
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDate(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toDraft(value: DateRangeValue): DateRange | undefined {
  const from = parseLocalDate(value.from);
  const to = parseLocalDate(value.to);
  if (!from && !to) return undefined;
  // An open-ended range stays open in the draft, so Apply waits for the
  // second tap rather than offering to close it on the one day it has.
  return { from: from ?? to, to };
}

function fromDraft(draft: DateRange | undefined): DateRangeValue {
  return {
    from: draft?.from ? formatLocalDate(draft.from) : "",
    to: draft?.to ? formatLocalDate(draft.to) : "",
  };
}

export function formatDateRangeLabel(value: DateRangeValue, placeholder: string): string {
  const from = parseLocalDate(value.from);
  const to = parseLocalDate(value.to);
  if (from && to) {
    // Both ends read the same way; the year is said once, at the end.
    return `${DAY_FORMATTER.format(from)} – ${DAY_WITH_YEAR_FORMATTER.format(to)}`;
  }
  if (from) return `From ${DAY_WITH_YEAR_FORMATTER.format(from)}`;
  if (to) return `Until ${DAY_WITH_YEAR_FORMATTER.format(to)}`;
  return placeholder;
}

/**
 * A date range behind a field-style trigger. Days are chosen on a draft that
 * only reaches `onChange` through Apply, so a list filtered by the range does
 * not refetch on the first tap with a half-made range and again on the
 * second; closing any other way throws the draft away. Clear commits at once.
 */
export default function DateRangePicker({
  id,
  label,
  value,
  onChange,
  placeholder = "Any dates",
  allowClear = false,
  disabled = false,
  style,
}: {
  id?: string;
  label: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() => toDraft(value));
  // Whether the draft's start was tapped in this opening: the first tap of
  // every opening starts a fresh range, whatever the field held.
  const [started, setStarted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(value));
      setStarted(false);
    }
  }, [open, value]);

  const hasSelection = Boolean(value.from || value.to);
  const draftValue = fromDraft(draft);
  const draftComplete = Boolean(draftValue.from && draftValue.to);
  const draftChanged = draftValue.from !== value.from || draftValue.to !== value.to;

  function apply() {
    if (!draftComplete) return;
    onChange(draftValue);
    setOpen(false);
  }

  return (
    <>
      {/* Content-sized by default, so a wrapping toolbar row gives the field
          exactly the room its dates need; `minWidth: 0` on both boxes lets a
          caller's fixed width shrink it with an ellipsis instead of letting
          the control run under its neighbour. */}
      <div
        ref={triggerRef}
        style={{ display: "inline-block", minWidth: 0, maxWidth: "100%", ...style }}
      >
        <Button
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
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            minWidth: 0,
            minHeight: "var(--dg-toolbar-h)",
            background: disabled ? "var(--dg-color-bg)" : "var(--dg-color-surface)",
            border: "1px solid var(--dg-color-border)",
            borderRadius: "var(--dg-btn-radius)",
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 500,
            color: hasSelection ? "var(--dg-color-text-secondary)" : "var(--dg-color-text-subtle)",
            cursor: disabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            textAlign: "left",
            transition: "box-shadow 150ms ease",
            boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.15)" : undefined,
            borderColor: open ? "var(--dg-color-border-focus)" : "var(--dg-color-border)",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <CalendarDays
            size={15}
            style={{
              color: hasSelection ? "var(--dg-color-text-muted)" : "var(--dg-color-text-faint)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {formatDateRangeLabel(value, placeholder)}
          </span>
          <ChevronDown
            size={14}
            style={{
              color: "var(--dg-color-text-faint)",
              flexShrink: 0,
              transition: "transform 150ms ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </Button>
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
            collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
            initialFocus={false}
            className="dg-menu"
            style={{
              padding: 12,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              width: "max-content",
              maxWidth: "calc(100vw - 24px)",
            }}
          >
            <Calendar
              mode="range"
              defaultMonth={draft?.from}
              numberOfMonths={isMobile ? 1 : 2}
              selected={draft}
              onSelect={(next, day) => {
                // Two taps make a range: the first date, then the last. Over
                // the range the field already holds, the day picker would
                // nudge its nearer end instead, so the first tap of an
                // opening always starts over, and a third tap starts again.
                if (!started || (draft?.from && draft?.to)) {
                  setDraft({ from: day, to: undefined });
                  setStarted(true);
                  return;
                }
                setDraft(next);
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                paddingTop: 10,
                borderTop: "1px solid var(--dg-color-border-light)",
              }}
            >
              <Button
                type="button"
                className="dg-btn dg-btn-secondary"
                onClick={() => {
                  onChange({ from: "", to: "" });
                  setOpen(false);
                }}
                disabled={!allowClear || !hasSelection}
                style={{ fontSize: "var(--dg-fs-caption)", padding: "6px 10px" }}
              >
                Clear
              </Button>
              <Button
                type="button"
                className="dg-btn dg-btn-primary"
                onClick={apply}
                disabled={!draftComplete || !draftChanged}
                style={{ fontSize: "var(--dg-fs-caption)", padding: "6px 10px" }}
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  );
}
