"use client";

import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { buildShiftDisplayParts } from "@/lib/assignable-shifts";
import { Button } from "@/components/Button";
import {
  SeriesFrequency,
  ScheduleCellInput,
  AssignmentDefinition,
  AbsenceType,
  ShiftCategory,
  JobDefinition,
  ShiftJobSegment,
} from "@/types";
import { MAX_SERIES_OCCURRENCES } from "@/lib/constants";
import * as Sentry from "@/lib/sentry";
import { addDays, cn, iterateDateRange } from "@/lib/utils";
import ScrollableTabs from "@/components/ScrollableTabs";
import { fetchRepeatOverwriteCount } from "@/features/schedule/client";

const DAY_NAMES_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_NAMES_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
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

interface RepeatFormProps {
  empId: string;
  shiftLabel: string;
  selectionInput: ScheduleCellInput | null;
  selectionSegments?: ShiftJobSegment[];
  startDate: Date;
  assignments: AssignmentDefinition[];
  shiftCategories?: ShiftCategory[];
  jobs?: JobDefinition[];
  onConfirm: (
    frequency: SeriesFrequency,
    daysOfWeek: number[] | null,
    startDate: string,
    endDate: string | null,
    maxOccurrences: number | null,
    previewTotal: number,
  ) => void;
  /** When set, the form is creating a repeating off day instead of a shift. */
  absenceType?: AbsenceType;
}

export interface RepeatFormHandle {
  submit: () => void;
}

type EndType = "never" | "on_date" | "after_n";

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

function formatFieldDate(value: string): string {
  return FIELD_DATE_FORMATTER.format(parseLocalDate(value));
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

interface CalendarFieldProps {
  value: string;
  onChange: (value: string) => void;
  minDate: string;
  selectionLabel: string;
  showSelectionLabel?: boolean;
  error?: boolean;
  placeholder?: string;
  compact?: boolean;
}

function CalendarField({
  value,
  onChange,
  minDate,
  selectionLabel,
  showSelectionLabel = true,
  error = false,
  placeholder = "No date selected",
  compact = false,
}: CalendarFieldProps) {
  const selectedDate = value ? parseLocalDate(value) : null;
  const minSelectableDate = parseLocalDate(minDate);
  const [expanded, setExpanded] = useState(true);
  const [visibleMonth, setVisibleMonth] = useState<Date>(
    startOfMonth(selectedDate ?? minSelectableDate),
  );
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  function handleSelect(day: Date) {
    onChange(formatLocalDate(day));
    setExpanded(false);
  }

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;
      if (next) {
        setVisibleMonth(startOfMonth(selectedDate ?? minSelectableDate));
      }
      return next;
    });
  }

  return (
    <div
      className={cn(
        "rounded-[var(--dg-radius-lg)] border bg-[var(--color-surface)]",
        compact ? "p-2" : "p-2.5",
        error ? "border-[var(--color-danger)]" : "border-[var(--color-border)]",
      )}
    >
      <Button
        type="button"
        onClick={toggleExpanded}
        aria-label={selectionLabel}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          {showSelectionLabel && (
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)]">
              {selectionLabel}
            </span>
          )}
          <span
            className={cn(
              "block truncate font-medium",
              compact ? "text-[12px]" : "text-[13px]",
              value ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-faint)]",
            )}
          >
            {value ? formatFieldDate(value) : placeholder}
          </span>
        </span>
        <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
          <span className="text-[11px] font-medium text-[var(--color-text-faint)]">
            {expanded ? "Close" : "Edit"}
          </span>
          <ChevronDown
            className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")}
          />
        </span>
      </Button>

      <div
        aria-hidden={!expanded}
        className={cn(
          "grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out",
          expanded ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
          !expanded && "pointer-events-none",
        )}
      >
        <div className="overflow-hidden">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-[8.75rem] text-[12px] font-semibold text-[var(--color-text-primary)]">
              {MONTH_FORMATTER.format(visibleMonth)}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}
                className="flex size-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
                aria-label={`Show ${MONTH_FORMATTER.format(shiftMonth(visibleMonth, -1))}`}
                tabIndex={expanded ? 0 : -1}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}
                className="flex size-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
                aria-label={`Show ${MONTH_FORMATTER.format(shiftMonth(visibleMonth, 1))}`}
                tabIndex={expanded ? 0 : -1}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mb-1.5 grid grid-cols-7 gap-1">
            {CALENDAR_WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className={cn(
                  "flex items-center justify-center font-medium text-[var(--color-text-subtle)]",
                  compact ? "h-6 text-[10px]" : "h-7 text-[10px]",
                )}
              >
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1" aria-label={`${selectionLabel} calendar`}>
            {calendarDays.map((day) => {
              const dateKey = formatLocalDate(day);
              const isSelected = value === dateKey;
              const isToday = dateKey === formatLocalDate(new Date());
              const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
              const isBeforeMin = dateKey < minDate && dateKey !== value;
              const isDisabled = isBeforeMin;

              return (
                <Button
                  key={dateKey}
                  type="button"
                  onClick={() => handleSelect(day)}
                  disabled={isDisabled}
                  aria-label={`${isSelected ? "Selected " : "Choose "}${DAY_ARIA_FORMATTER.format(day)}`}
                  tabIndex={expanded ? 0 : -1}
                  className={cn(
                    "relative flex items-center justify-center rounded-lg transition-colors",
                    compact ? "h-7 text-[11px]" : "h-8 text-[12px]",
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
                  {isToday && (
                    <span
                      className={cn(
                        "absolute bottom-1 h-1 w-1 rounded-full",
                        isSelected ? "bg-[var(--color-text-inverse)]" : "bg-[var(--color-brand)]",
                      )}
                    />
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compute occurrence dates (mirrors generateSeriesDates in db.ts). DST-safe. */
function countOccurrences(
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const cap = maxOccurrences ?? MAX_SERIES_OCCURRENCES;

  const maxEnd = endDate
    ? new Date(endDate + "T00:00:00")
    : new Date(start.getFullYear(), start.getMonth() + 7, start.getDate());
  const startDayOfWeek = new Date(
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
  ).getUTCDay();

  for (const { dateKey, dayOfWeek, dayIndex } of iterateDateRange(start, maxEnd)) {
    if (dates.length >= cap) break;

    let include = false;
    const dayMatch =
      daysOfWeek === null || daysOfWeek.length === 0
        ? dayOfWeek === startDayOfWeek
        : daysOfWeek.includes(dayOfWeek);

    if (frequency === "daily") {
      include = true;
    } else if (frequency === "weekly") {
      include = dayMatch;
    } else if (frequency === "biweekly") {
      const weekNum = Math.floor(dayIndex / 7);
      include = weekNum % 2 === 0 && dayMatch;
    }

    if (include) dates.push(dateKey);
  }

  return dates;
}

const RepeatForm = forwardRef<RepeatFormHandle, RepeatFormProps>(function RepeatForm(
  {
    empId,
    shiftLabel,
    selectionInput,
    selectionSegments = [],
    startDate,
    assignments,
    shiftCategories = [],
    jobs = [],
    onConfirm,
    absenceType,
  }: RepeatFormProps,
  ref,
) {
  const isAbsence = absenceType != null || selectionInput?.kind === "absence";
  const [frequency, setFrequency] = useState<SeriesFrequency>("weekly");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([startDate.getDay()]);
  const todayStr = formatLocalDate(new Date());
  const [start, setStart] = useState<string>(formatLocalDate(startDate));
  const [endType, setEndType] = useState<EndType>("never");
  const [endDate, setEndDate] = useState<string>("");
  const [afterN, setAfterN] = useState<number>(10);
  const [overwrites, setOverwrites] = useState(0);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const primarySegment = selectionSegments[0] ?? null;
  const assignment = assignments.find((shift) => shift.id === (primarySegment?.assignmentId ?? -1));
  const shiftCategoryId =
    primarySegment?.shiftId ?? assignment?.shiftId ?? assignment?.categoryId ?? null;
  const shiftCategory =
    shiftCategoryId != null
      ? (shiftCategories.find((category) => category.id === shiftCategoryId) ?? null)
      : null;
  const shiftJob =
    (primarySegment?.jobId ?? assignment?.jobId ?? null) != null
      ? (jobs.find((job) => job.id === (primarySegment?.jobId ?? assignment?.jobId ?? -1)) ?? null)
      : null;
  const previewDisplayParts = useMemo(() => {
    if (absenceType) {
      return {
        primaryLabel: absenceType.name || absenceType.label,
        secondaryLabel: null,
      };
    }

    if (assignment) {
      return buildShiftDisplayParts({
        shift: shiftCategory,
        job: shiftJob,
        assignment,
        shiftDisplayMode: "name",
      });
    }

    return {
      primaryLabel: shiftLabel,
      secondaryLabel: null,
    };
  }, [absenceType, shiftCategory, assignment, shiftJob, shiftLabel]);
  const previewBackground = absenceType?.color ?? assignment?.color ?? "var(--color-bg-secondary)";
  const previewText = absenceType?.text ?? assignment?.text ?? "var(--color-text-secondary)";
  const previewBorder = absenceType?.border ?? assignment?.border ?? "var(--color-border)";

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  const resolvedDays = frequency === "daily" ? null : daysOfWeek.length > 0 ? daysOfWeek : null;
  const resolvedEnd = endType === "on_date" ? endDate || null : null;
  const resolvedMax = endType === "after_n" ? afterN : null;

  const originDateKey = formatLocalDate(startDate);
  const generatedDates = useMemo(() => {
    if (frequency !== "daily" && daysOfWeek.length === 0) return [];
    return countOccurrences(frequency, resolvedDays, start, resolvedEnd, resolvedMax);
  }, [frequency, daysOfWeek, resolvedDays, start, resolvedEnd, resolvedMax]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (generatedDates.length === 0) {
      setOverwrites(0);
      return;
    }

    let cancelled = false;
    const datesToCheck = new Set(generatedDates.filter((d) => d !== originDateKey));
    if (datesToCheck.size === 0) {
      setOverwrites(0);
      return;
    }

    const sortedDates = [...datesToCheck].sort();

    (async () => {
      const { overwriteCount } = await fetchRepeatOverwriteCount({
        empId,
        dates: sortedDates,
      });
      if (cancelled) return;
      setOverwrites(overwriteCount);
    })().catch((error: unknown) => {
      if (cancelled) return;
      Sentry.captureException(error);
    });

    return () => {
      cancelled = true;
    };
  }, [generatedDates, empId, originDateKey]);

  const preview = { total: generatedDates.length, overwrites };
  const showDayPicker = frequency === "weekly" || frequency === "biweekly";
  const missingDays = showDayPicker && daysOfWeek.length === 0;
  const missingEndDate = endType === "on_date" && endDate === "";
  const endDateInvalid = endType === "on_date" && endDate !== "" && endDate < start;

  const handleConfirm = useCallback(() => {
    setSubmitAttempted(true);
    if (missingDays || missingEndDate || endDateInvalid) return;
    onConfirm(frequency, resolvedDays, start, resolvedEnd, resolvedMax, preview.total);
  }, [
    endDateInvalid,
    frequency,
    missingDays,
    missingEndDate,
    onConfirm,
    preview.total,
    resolvedDays,
    resolvedEnd,
    resolvedMax,
    start,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      submit: handleConfirm,
    }),
    [handleConfirm],
  );

  const isCapped = preview.total >= MAX_SERIES_OCCURRENCES && endType !== "after_n";

  return (
    <div style={formLayoutStyle}>
      {/* Badge */}
      <div style={badgeRowStyle}>
        <span style={badgeLabelStyle}>{isAbsence ? "Repeating Off Day" : "Repeating Shift"}</span>
        {(isAbsence ? absenceType : assignment || shiftLabel) && (
          <span
            data-repeat-shift-preview="true"
            style={{
              background: previewBackground,
              color: previewText,
              border: `1px solid ${previewBorder}`,
              borderRadius: "var(--dg-radius-md)",
              padding: previewDisplayParts.secondaryLabel ? "6px 12px 7px" : "6px 12px",
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              gap: previewDisplayParts.secondaryLabel ? 2 : 0,
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 800,
              }}
            >
              {previewDisplayParts.primaryLabel}
            </span>
            {previewDisplayParts.secondaryLabel ? (
              <span
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  opacity: 0.78,
                }}
              >
                {previewDisplayParts.secondaryLabel}
              </span>
            ) : null}
          </span>
        )}
      </div>

      {/* Frequency */}
      <fieldset style={sectionFieldsetStyle}>
        <legend style={frequencyLabelStyle}>Frequency</legend>
        <ScrollableTabs className="dg-span-tabs dg-span-tabs--light" style={{ width: "100%" }}>
          {(["daily", "weekly", "biweekly"] as SeriesFrequency[]).map((f, i, all) => {
            const isActive = frequency === f;
            const prevActive = i > 0 && frequency === all[i - 1];
            const showDivider = i > 0 && !isActive && !prevActive;

            return (
              <Fragment key={f}>
                {i > 0 && (
                  <div
                    style={{
                      width: 1,
                      height: 16,
                      background: showDivider ? "var(--color-border)" : "transparent",
                      flexShrink: 0,
                      alignSelf: "center",
                    }}
                  />
                )}
                <Button
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={`dg-span-tab${isActive ? " active" : ""}`}
                  aria-pressed={isActive}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    textTransform: "capitalize",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f === "biweekly" ? "Biweekly" : f}
                </Button>
              </Fragment>
            );
          })}
        </ScrollableTabs>
      </fieldset>

      {/* Day picker (weekly / biweekly) */}
      {showDayPicker && (
        <div style={sectionBlockStyle}>
          <div style={sectionLabelStyle}>Days of Week</div>
          <div role="group" aria-label="Days of week" style={dayPickerRowStyle}>
            {DAY_NAMES_SHORT.map((name, i) => {
              const active = daysOfWeek.includes(i);
              return (
                <Button
                  key={i}
                  onClick={() => toggleDay(i)}
                  aria-label={DAY_NAMES_FULL[i]}
                  aria-pressed={active}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    border: `1.5px solid ${active ? "var(--color-brand)" : "var(--color-border)"}`,
                    background: active ? "var(--color-brand)" : "var(--color-surface)",
                    color: active ? "var(--color-text-inverse)" : "var(--color-text-muted)",
                    fontWeight: 700,
                    fontSize: "var(--dg-fs-body)",
                    cursor: "pointer",
                    flexShrink: 0,
                    fontFamily: "inherit",
                    transition: "background 150ms ease, border-color 150ms ease",
                  }}
                >
                  {name}
                </Button>
              );
            })}
          </div>
          {(daysOfWeek.length === 0 || (submitAttempted && missingDays)) && (
            <div
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--color-danger)",
                marginTop: 4,
              }}
            >
              Select at least one day.
            </div>
          )}
        </div>
      )}

      {/* Start date */}
      <div style={sectionBlockStyle}>
        <div style={sectionLabelStyle}>Start Date</div>
        <CalendarField
          value={start}
          minDate={todayStr}
          onChange={setStart}
          selectionLabel="Start date"
          showSelectionLabel={false}
        />
      </div>

      {/* End */}
      <fieldset style={sectionFieldsetStyle}>
        <legend style={sectionLabelStyle}>Ends</legend>
        <div style={endOptionsStyle}>
          {(["never", "on_date", "after_n"] as EndType[]).map((type) => (
            <label
              key={type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                minHeight: 36,
              }}
            >
              <input
                type="radio"
                name="repeat-end-type"
                checked={endType === type}
                onChange={() => setEndType(type)}
                aria-label={
                  type === "never"
                    ? "Never"
                    : type === "on_date"
                      ? "On date"
                      : "After N occurrences"
                }
                style={{ accentColor: "var(--color-brand)" }}
              />
              <span
                style={{
                  fontSize: "var(--dg-fs-label)",
                  color: "var(--color-text-secondary)",
                  fontWeight: 500,
                }}
              >
                {type === "never"
                  ? "Never"
                  : type === "on_date"
                    ? "On date"
                    : "After N occurrences"}
              </span>
              {type === "after_n" && endType === "after_n" && (
                <input
                  type="number"
                  min={1}
                  max={MAX_SERIES_OCCURRENCES}
                  value={afterN}
                  onChange={(e) =>
                    setAfterN(
                      Math.min(MAX_SERIES_OCCURRENCES, Math.max(1, parseInt(e.target.value) || 1)),
                    )
                  }
                  className="dg-input"
                  style={{ fontSize: "var(--dg-fs-caption)", padding: "4px 8px", width: 70 }}
                />
              )}
            </label>
          ))}
        </div>
        {endType === "on_date" && (
          <div style={{ marginTop: 10 }}>
            <CalendarField
              value={endDate}
              minDate={start}
              onChange={setEndDate}
              selectionLabel="End date"
              placeholder="No end date selected"
              compact
              error={endDateInvalid}
            />
          </div>
        )}
        {submitAttempted && missingEndDate && (
          <div
            style={{
              fontSize: "var(--dg-fs-footnote)",
              color: "var(--color-danger)",
              marginTop: 4,
            }}
          >
            Select an end date.
          </div>
        )}
        {endDateInvalid && (
          <div
            style={{
              fontSize: "var(--dg-fs-footnote)",
              color: "var(--color-danger)",
              marginTop: 4,
            }}
          >
            End date must be on or after start date.
          </div>
        )}
      </fieldset>

      {/* Preview summary */}
      {preview.total > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: "10px 12px",
            borderRadius: 8,
            background:
              preview.overwrites > 0 ? "var(--color-warning-bg)" : "var(--color-success-bg)",
            border: `1px solid ${preview.overwrites > 0 ? "var(--color-warning)" : "var(--color-info-border)"}`,
            fontSize: "var(--dg-fs-caption)",
            lineHeight: 1.5,
            color: "var(--color-text-secondary)",
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {preview.total} {isAbsence ? "off day" : "shift"}
            {preview.total === 1 ? "" : "s"} will be created
            {endType === "never" && (
              <span style={{ fontWeight: 400, color: "var(--color-text-subtle)" }}>
                {" "}
                (6-month max)
              </span>
            )}
          </div>
          {isCapped && (
            <div style={{ marginTop: 4, color: "var(--color-warning-text)", fontWeight: 500 }}>
              Series capped at {MAX_SERIES_OCCURRENCES} occurrences (~6 months). Use a shorter date
              range or &ldquo;After N occurrences&rdquo; for more control.
            </div>
          )}
          {preview.overwrites > 0 && (
            <div style={{ marginTop: 4, color: "var(--color-warning-text)", fontWeight: 500 }}>
              {preview.overwrites} existing {isAbsence ? "entry" : "shift"}
              {preview.overwrites === 1 ? "" : "s"} will be overwritten.
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const formLayoutStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 760,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  alignItems: "stretch",
};

const badgeRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const badgeLabelStyle: React.CSSProperties = {
  fontSize: "var(--dg-fs-body)",
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  lineHeight: 1.1,
};

const sectionFieldsetStyle: React.CSSProperties = {
  border: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const sectionBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const dayPickerRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const endOptionsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "var(--dg-fs-footnote)",
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  lineHeight: 1.1,
  margin: 0,
};

const frequencyLabelStyle: React.CSSProperties = {
  ...sectionLabelStyle,
  marginBottom: 6,
};

export default RepeatForm;
