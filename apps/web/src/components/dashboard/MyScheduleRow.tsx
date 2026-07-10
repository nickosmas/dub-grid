import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { DashboardContentProps } from "./DashboardContentProps";
import { EmptyState } from "@/components/EmptyState";
import { formatDateKey } from "@/lib/utils";
import type {
  AbsenceType,
  AssignmentDefinition,
  ScheduleCellStateEntry,
  ShiftJobSegment,
  ShiftMap,
} from "@/types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_BOX_WIDTH = 132;
const DAY_BOX_MIN_HEIGHT = 78;
// Explicit (not content-derived) height, shared by ShiftPill and
// EmptyDayPlaceholder. With box-sizing: border-box, an explicit height makes
// border/padding/font-metric differences between the two irrelevant to their
// total size — they're guaranteed pixel-equal by construction, not by
// carefully mirroring internals.
const SHIFT_PILL_HEIGHT = 42;

type MyScheduleRowProps = Pick<
  DashboardContentProps,
  | "currentEmpId"
  | "currentPeriodShifts"
  | "assignmentById"
  | "absenceTypeById"
  | "periodDates"
  | "periodLabel"
> & {
  // True for a management-only viewer (management department access, no
  // scheduled focus area) — they're never actually scheduled, so this card
  // should stay hidden even though they have an employees row.
  isManagementOnly?: boolean;
};

type MyScheduleShift = {
  label: string;
  timeRange: string | null;
  background: string;
  border: string;
  textColor: string;
};

type MyScheduleDay = {
  key: string;
  dateKey: string;
  date: Date;
  shifts: MyScheduleShift[];
};

function formatTime12h(time: string): string {
  const [hoursValue, minutesValue] = time.split(":").map(Number);
  const period = hoursValue >= 12 ? "PM" : "AM";
  const hours = hoursValue === 0 ? 12 : hoursValue > 12 ? hoursValue - 12 : hoursValue;
  const minutes = Number.isFinite(minutesValue) ? minutesValue : 0;
  return `${hours}:${String(minutes).padStart(2, "0")} ${period}`;
}

// Custom start/end times for multi-segment (double/split) shifts are stored
// "|"-delimited, one value per segment — matches the schedule grid's convention.
function getDelimitedValue(
  value: string | null | undefined,
  index: number,
  count: number,
): string | null {
  if (!value) return null;
  const parts = value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts[index] ?? null;
  return count <= 1 ? (parts[0] ?? null) : null;
}

function buildWorkedShifts(input: {
  entry: ScheduleCellStateEntry;
  assignmentById: Map<number, AssignmentDefinition>;
}): MyScheduleShift[] {
  const { entry } = input;

  // Explicit segments (sorted by position) take priority over assignmentIds,
  // matching the resolution order used by the schedule grid and UserDashboard —
  // assignmentIds isn't guaranteed to line up with job-segmented shifts.
  const explicitSegments = [...(entry.segments ?? [])].sort(
    (left, right) => (left.position ?? 0) - (right.position ?? 0),
  );
  const segments: Array<Partial<ShiftJobSegment>> =
    explicitSegments.length > 0
      ? explicitSegments
      : entry.assignmentIds.map((assignmentId, index) => ({ assignmentId, position: index }));
  const segmentCount = segments.length;

  const shifts: MyScheduleShift[] = [];
  segments.forEach((segment, index) => {
    const assignmentId = segment.assignmentId ?? entry.assignmentIds[index] ?? null;
    const assignment =
      assignmentId != null ? (input.assignmentById.get(assignmentId) ?? null) : null;

    if (!assignment && !segment.label && !entry.label) return;

    const customStartTime = getDelimitedValue(entry.customStartTime, index, segmentCount);
    const customEndTime = getDelimitedValue(entry.customEndTime, index, segmentCount);
    const startTime = customStartTime ?? segment.startTime ?? assignment?.defaultStartTime ?? null;
    const endTime = customEndTime ?? segment.endTime ?? assignment?.defaultEndTime ?? null;

    shifts.push({
      label: assignment?.name || assignment?.label || segment.label || entry.label || "Shift",
      timeRange:
        startTime && endTime ? `${formatTime12h(startTime)} - ${formatTime12h(endTime)}` : null,
      background: assignment?.color ?? "var(--color-bg-secondary)",
      border: assignment?.border ?? "var(--color-border)",
      textColor: assignment?.text ?? "var(--color-text-primary)",
    });
  });

  return shifts;
}

function buildMyScheduleDay(input: {
  date: Date;
  entry: ShiftMap[string] | undefined;
  assignmentById: Map<number, AssignmentDefinition>;
  absenceTypeById: Map<number, AbsenceType>;
}): MyScheduleDay {
  const dateKey = formatDateKey(input.date);
  const { entry } = input;

  if (!entry || entry.isDelete) {
    return { key: dateKey, dateKey, date: input.date, shifts: [] };
  }

  if (entry.absenceTypeId != null) {
    const absence = input.absenceTypeById.get(entry.absenceTypeId) ?? null;
    return {
      key: dateKey,
      dateKey,
      date: input.date,
      shifts: [
        {
          label: absence?.name ?? entry.label ?? "Away",
          timeRange: null,
          background: absence?.color ?? "var(--color-bg-secondary)",
          border: absence?.border ?? "var(--color-border)",
          textColor: absence?.text ?? "var(--color-text-secondary)",
        },
      ],
    };
  }

  return {
    key: dateKey,
    dateKey,
    date: input.date,
    shifts: buildWorkedShifts({ entry, assignmentById: input.assignmentById }),
  };
}

function buildMyScheduleDays(input: {
  currentEmpId: string;
  currentPeriodShifts: ShiftMap;
  assignmentById: Map<number, AssignmentDefinition>;
  absenceTypeById: Map<number, AbsenceType>;
  periodDates: Date[];
}): MyScheduleDay[] {
  return input.periodDates.map((date) =>
    buildMyScheduleDay({
      date,
      entry: input.currentPeriodShifts[`${input.currentEmpId}_${formatDateKey(date)}`],
      assignmentById: input.assignmentById,
      absenceTypeById: input.absenceTypeById,
    }),
  );
}

function useHorizontalScrollState(dependency: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateScrollState, dependency]);

  const scrollByPage = useCallback((direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  }, []);

  return { scrollRef, canScrollLeft, canScrollRight, scrollByPage };
}

function ScrollChevron({
  direction,
  onClick,
}: {
  direction: "left" | "right";
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "left" ? "Scroll earlier days" : "Scroll later days"}
      style={{
        position: "absolute",
        top: "50%",
        [direction]: -4,
        transform: "translateY(-50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: "50%",
        border: "1px solid var(--color-border)",
        background: "var(--color-bg)",
        color: "var(--color-text-secondary)",
        boxShadow: "var(--dg-shadow-sm, 0 1px 3px rgba(0,0,0,0.1))",
        cursor: "pointer",
        zIndex: 1,
      }}
    >
      <Icon size={16} />
    </button>
  );
}

function ShiftPill({ shift }: { shift: MyScheduleShift }) {
  return (
    <div
      style={{
        height: SHIFT_PILL_HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 6px",
        borderRadius: "var(--dg-radius-sm, 6px)",
        border: `1px solid ${shift.border}`,
        background: shift.background,
        color: shift.textColor,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {shift.label}
      </div>
      {/* Always rendered (even without a time range) so every pill has the same
          two-line height — hiding the line visually, not removing it, keeps its
          reserved space, unlike an absence pill that would otherwise be shorter. */}
      <div
        aria-hidden={!shift.timeRange}
        style={{
          fontSize: 9,
          marginTop: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          visibility: shift.timeRange ? "visible" : "hidden",
        }}
      >
        {shift.timeRange ?? " "}
      </div>
    </div>
  );
}

// Same explicit height as ShiftPill (see SHIFT_PILL_HEIGHT), so the dash is
// guaranteed to center against the exact box a real pill would occupy —
// border-box sizing means padding/border differences can't throw this off.
function EmptyDayPlaceholder() {
  return (
    <div
      style={{
        height: SHIFT_PILL_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 6px",
        boxSizing: "border-box",
        fontSize: 14,
        fontWeight: 400,
        color: "var(--color-text-subtle)",
      }}
    >
      {"—"}
    </div>
  );
}

function DayBox({ day }: { day: MyScheduleDay }) {
  return (
    <Link
      href="/schedule"
      style={{
        textDecoration: "none",
        color: "inherit",
        flexShrink: 0,
        display: "flex",
        alignSelf: "stretch",
      }}
    >
      <div
        style={{
          width: DAY_BOX_WIDTH,
          minHeight: DAY_BOX_MIN_HEIGHT,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          textAlign: "center",
          padding: "0 10px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            marginBottom: 6,
            flexShrink: 0,
          }}
        >
          {DAY_NAMES[day.date.getDay()]} {day.date.getDate()}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginTop: 4,
            justifyContent: "flex-start",
            flex: 1,
          }}
        >
          {day.shifts.length === 0 ? (
            <EmptyDayPlaceholder />
          ) : (
            day.shifts.map((shift, index) => <ShiftPill key={index} shift={shift} />)
          )}
        </div>
      </div>
    </Link>
  );
}

export default function MyScheduleRow({
  currentEmpId,
  currentPeriodShifts,
  assignmentById,
  absenceTypeById,
  periodDates,
  periodLabel,
  isManagementOnly = false,
}: MyScheduleRowProps) {
  const days = useMemo(
    () =>
      currentEmpId
        ? buildMyScheduleDays({
            currentEmpId,
            currentPeriodShifts,
            assignmentById,
            absenceTypeById,
            periodDates,
          })
        : [],
    [currentEmpId, currentPeriodShifts, assignmentById, absenceTypeById, periodDates],
  );
  const hasAnySchedule = days.some((day) => day.shifts.length > 0);
  const { scrollRef, canScrollLeft, canScrollRight, scrollByPage } = useHorizontalScrollState(
    days.length,
  );

  if (!currentEmpId || isManagementOnly) return null;

  return (
    <div className="dg-card" data-testid="my-schedule-row">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">Your schedule</div>
          <div className="dg-card-subtitle">{periodLabel}</div>
        </div>
      </div>
      <div className="dg-card-body">
        {!hasAnySchedule ? (
          <EmptyState
            size="inline"
            icon={<CalendarDays size={20} />}
            title={`You're not scheduled ${periodLabel}`}
            description="When your shifts get published, they'll show up right here."
          />
        ) : (
          <div style={{ position: "relative" }}>
            {canScrollLeft && <ScrollChevron direction="left" onClick={() => scrollByPage(-1)} />}
            <div
              ref={scrollRef}
              className="dg-no-scrollbar"
              style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}
            >
              {days.map((day) => (
                <DayBox key={day.key} day={day} />
              ))}
            </div>
            {canScrollRight && <ScrollChevron direction="right" onClick={() => scrollByPage(1)} />}
          </div>
        )}
      </div>
    </div>
  );
}
