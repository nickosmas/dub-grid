import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { CalendarDays } from "lucide-react";
import type { DashboardContentProps } from "./DashboardContentProps";
import { EmptyState } from "@/components/EmptyState";
import { PublishDiffPill } from "@/components/schedule-grid/publishDiffPill";
import {
  resolveCellChangeBadges,
  type CellChangeBadge,
} from "@/components/schedule-grid/cellChangeBadges";
import { ScrollCueButton } from "@/components/ui/scroll-cue-button";
import { formatDateKey } from "@/lib/utils";
import { DRAFT_BORDER_COLORS, resolveShiftPillColors } from "@/lib/colors";
import { shouldShowJobOnGrid } from "@/lib/job-placement";
import { createAssignmentDefinitionIdByPairMap } from "@/lib/shift-job-segments";
import type {
  AbsenceType,
  AssignmentDefinition,
  JobDefinition,
  DraftKind,
  ScheduleCellStateEntry,
  ShiftCategory,
  PublishChange,
  ShiftJobSegment,
  ShiftMap,
} from "@/types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_BOX_WIDTH = 160;
const DAY_BOX_MIN_HEIGHT = 86;
const DAY_GAP = 10;
const SCROLL_CONTROL_SLOT_WIDTH = 32;
const SHIFT_PILL_MIN_HEIGHT = 62;
// Day name line, its margin, and the shift stack's own offset: how far the
// first card sits below the top of the strip.
const FIRST_CARD_OFFSET = 26;
// Room for the widest change pill ("Deleted") plus its inset.
const CHANGE_PILL_RESERVE = 56;
const DAY_BOX_PADDING_X = 20;
const SHIFT_PILL_PADDING_X = 18;
// Rough advance width of the semibold badge-size name text, used only to decide
// whether a name still clears the change pill on both sides.
const APPROX_NAME_CHAR_WIDTH = 6.6;
// An admin-entered shift or absence name has no server-side length limit, and a
// runaway one would push the whole day strip taller. Roughly four wrapped lines
// in a week-sized cell; the cell links through to the schedule for the full value.
const MAX_SHIFT_TEXT_LENGTH = 64;

type MyScheduleRowProps = Pick<
  DashboardContentProps,
  | "currentEmpId"
  | "currentPeriodShifts"
  | "assignmentById"
  | "absenceTypeById"
  | "periodDates"
  | "periodLabel"
> & {
  jobs?: DashboardContentProps["jobs"];
  publishedAssignmentIdByPair?: DashboardContentProps["publishedAssignmentIdByPair"];
  shiftCategories?: DashboardContentProps["shiftCategories"];
  isMobile?: DashboardContentProps["isMobile"];
  // True for a management-only viewer (management department access, no
  // scheduled focus area) — they're never actually scheduled, so this card
  // should stay hidden even though they have an employees row.
  isManagementOnly?: boolean;
  recentPublishedChanges?: Map<string, PublishChange>;
};

type MyScheduleShift = {
  label: string;
  jobName: string | null;
  timeRange: string | null;
  background: string;
  border: string;
  textColor: string;
  badge: CellChangeBadge | null;
  borderKind: DraftKind;
};

function capShiftText(value: string): string {
  return value.length > MAX_SHIFT_TEXT_LENGTH
    ? `${value.slice(0, MAX_SHIFT_TEXT_LENGTH - 1).trimEnd()}\u2026`
    : value;
}

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function resolveShiftJobName(
  segment: Partial<ShiftJobSegment>,
  assignment: AssignmentDefinition | null,
  jobById: Map<number, JobDefinition>,
): string | null {
  const jobId = segment.jobId ?? assignment?.jobId ?? null;
  if (jobId == null) return null;

  const job = jobById.get(jobId) ?? null;
  return job && shouldShowJobOnGrid(job) ? job.name : null;
}

// The assignment's own name/label can be an admin-set combined code (e.g.
// "Evening Shift Supervisor") that already bakes the job in — the job gets
// its own line below, so the top line should stay shift-only wherever a
// pure shift name can be resolved. `segment.shiftName` only exists for
// explicit segments; the common case is a synthetic segment built from
// `assignmentIds` alone, so fall back to looking up the assignment's own
// shift by id before ever falling back to the combined name.
function resolveShiftDisplayName(
  segment: Partial<ShiftJobSegment>,
  assignment: AssignmentDefinition | null,
  shiftById: Map<number, ShiftCategory>,
): string | null {
  if (segment.shiftName) return segment.shiftName;

  const shiftId = segment.shiftId ?? assignment?.shiftId ?? assignment?.categoryId ?? null;
  if (shiftId == null) return null;

  return shiftById.get(shiftId)?.name ?? null;
}

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
  jobById: Map<number, JobDefinition>;
  shiftById: Map<number, ShiftCategory>;
  isDarkTheme: boolean;
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

    const resolved = assignment
      ? resolveShiftPillColors(
          { color: assignment.color, text: assignment.text, border: assignment.border },
          input.isDarkTheme,
        )
      : null;
    const label =
      resolveShiftDisplayName(segment, assignment, input.shiftById) ||
      assignment?.name ||
      assignment?.label ||
      segment.label ||
      entry.label ||
      "Shift";
    const jobName = resolveShiftJobName(segment, assignment, input.jobById);
    shifts.push({
      label,
      // Shiftless jobs (no shift attached) can resolve the same name for
      // both the shift label above and the job name here — don't show a
      // job line that just repeats the shift line verbatim.
      jobName: jobName && normalizeLabel(jobName) !== normalizeLabel(label) ? jobName : null,
      timeRange:
        startTime && endTime ? `${formatTime12h(startTime)} - ${formatTime12h(endTime)}` : null,
      background: resolved?.color ?? "var(--dg-color-bg-secondary)",
      border: resolved?.border ?? "var(--dg-color-border)",
      textColor: resolved?.text ?? "var(--dg-color-text-primary)",
      badge: null,
      borderKind: null,
    });
  });

  return shifts;
}

function attachChangeBadges(
  shifts: MyScheduleShift[],
  input: {
    entry: ScheduleCellStateEntry | undefined;
    publishedChange: PublishChange | undefined;
    assignmentById: Map<number, AssignmentDefinition>;
    absenceTypeById: Map<number, AbsenceType>;
    publishedAssignmentIdByPair: Map<string, number>;
  },
): MyScheduleShift[] {
  const badges = resolveCellChangeBadges({
    entry: input.entry,
    publishChange: input.publishedChange,
    pillCount: shifts.length,
    publishedAssignmentIdByPair: input.publishedAssignmentIdByPair,
    resolveAssignmentLabel: (assignmentId) => {
      const assignment = input.assignmentById.get(assignmentId);
      return assignment ? assignment.name || assignment.label : "?";
    },
    resolveAbsenceLabel: (absenceTypeId) => {
      const absence = input.absenceTypeById.get(absenceTypeId);
      return absence ? absence.name || absence.label : "?";
    },
  });
  return shifts.map((shift, index) => ({
    ...shift,
    badge: badges.pillBadges[index] ?? null,
    borderKind: badges.pillBorderKinds[index] ?? null,
  }));
}

function buildMyScheduleDay(input: {
  currentEmpId: string;
  date: Date;
  entry: ShiftMap[string] | undefined;
  assignmentById: Map<number, AssignmentDefinition>;
  absenceTypeById: Map<number, AbsenceType>;
  jobById: Map<number, JobDefinition>;
  shiftById: Map<number, ShiftCategory>;
  isDarkTheme: boolean;
  recentPublishedChanges: Map<string, PublishChange>;
  publishedAssignmentIdByPair: Map<string, number>;
}): MyScheduleDay {
  const dateKey = formatDateKey(input.date);
  const { entry } = input;

  const publishedChange = input.recentPublishedChanges.get(`${input.currentEmpId}_${dateKey}`);
  if (!entry && !publishedChange) {
    return { key: dateKey, dateKey, date: input.date, shifts: [] };
  }

  // A deleted draft is still a meaningful scheduled shift in the grid. Show
  // its last published presentation here too, so its deleted indication has a
  // pill to attach to rather than disappearing as an empty dashboard day.
  const displayEntry: ScheduleCellStateEntry =
    entry && entry.isDelete
      ? {
          ...entry,
          assignmentIds: entry.publishedAssignmentDefinitionIds,
          absenceTypeId: entry.publishedAbsenceTypeId ?? null,
          customStartTime: entry.publishedCustomStartTime ?? null,
          customEndTime: entry.publishedCustomEndTime ?? null,
          label: entry.publishedLabel,
          segments: entry.publishedSegments ?? [],
        }
      : (entry ?? {
          label: "",
          assignmentIds: publishedChange?.from ?? [],
          isDraft: false,
          draftKind: null,
          segments: publishedChange?.fromSegments ?? [],
          absenceTypeId: publishedChange?.fromAbsenceTypeId ?? null,
          customStartTime: publishedChange?.fromCustomStart ?? null,
          customEndTime: publishedChange?.fromCustomEnd ?? null,
          publishedAssignmentDefinitionIds: [],
          publishedLabel: "",
        });

  const badgeInput = {
    entry,
    publishedChange,
    assignmentById: input.assignmentById,
    absenceTypeById: input.absenceTypeById,
    publishedAssignmentIdByPair: input.publishedAssignmentIdByPair,
  };

  if (displayEntry.absenceTypeId != null) {
    const absence = input.absenceTypeById.get(displayEntry.absenceTypeId) ?? null;
    const resolved = absence
      ? resolveShiftPillColors(
          { color: absence.color, text: absence.text, border: absence.border },
          input.isDarkTheme,
        )
      : null;
    return {
      key: dateKey,
      dateKey,
      date: input.date,
      shifts: attachChangeBadges(
        [
          {
            label: absence?.name ?? displayEntry.label ?? "Away",
            jobName: null,
            timeRange: null,
            background: resolved?.color ?? "var(--dg-color-bg-secondary)",
            border: resolved?.border ?? "var(--dg-color-border)",
            textColor: resolved?.text ?? "var(--dg-color-text-secondary)",
            badge: null,
            borderKind: null,
          },
        ],
        badgeInput,
      ),
    };
  }

  return {
    key: dateKey,
    dateKey,
    date: input.date,
    shifts: attachChangeBadges(
      buildWorkedShifts({
        entry: displayEntry,
        assignmentById: input.assignmentById,
        jobById: input.jobById,
        shiftById: input.shiftById,
        isDarkTheme: input.isDarkTheme,
      }),
      badgeInput,
    ),
  };
}

function buildMyScheduleDays(input: {
  currentEmpId: string;
  currentPeriodShifts: ShiftMap;
  assignmentById: Map<number, AssignmentDefinition>;
  absenceTypeById: Map<number, AbsenceType>;
  jobById: Map<number, JobDefinition>;
  shiftById: Map<number, ShiftCategory>;
  periodDates: Date[];
  isDarkTheme: boolean;
  recentPublishedChanges: Map<string, PublishChange>;
  publishedAssignmentIdByPair: Map<string, number>;
}): MyScheduleDay[] {
  return input.periodDates.map((date) =>
    buildMyScheduleDay({
      currentEmpId: input.currentEmpId,
      date,
      entry: input.currentPeriodShifts[`${input.currentEmpId}_${formatDateKey(date)}`],
      assignmentById: input.assignmentById,
      absenceTypeById: input.absenceTypeById,
      jobById: input.jobById,
      shiftById: input.shiftById,
      isDarkTheme: input.isDarkTheme,
      recentPublishedChanges: input.recentPublishedChanges,
      publishedAssignmentIdByPair: input.publishedAssignmentIdByPair,
    }),
  );
}

function useHorizontalScrollState(dependency: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  // A scrolling period (2 weeks) should still show week-sized cells, so the
  // visible cell width is derived from what one week would occupy here.
  const [cellWidth, setCellWidth] = useState(DAY_BOX_WIDTH);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    const viewportWidth = el.clientWidth;
    setCellWidth(
      viewportWidth > 0
        ? Math.max(DAY_BOX_WIDTH, Math.floor((viewportWidth - DAY_GAP * 6) / 7))
        : DAY_BOX_WIDTH,
    );
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState);
    resizeObserver?.observe(el);
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      resizeObserver?.disconnect();
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, dependency]);

  const scrollByPage = useCallback(
    (direction: 1 | -1) => {
      const el = scrollRef.current;
      if (!el) return;
      const cellStride = cellWidth + DAY_GAP;
      const visibleCellCount = Math.max(1, Math.floor((el.clientWidth + DAY_GAP) / cellStride));
      el.scrollBy({ left: direction * visibleCellCount * cellStride, behavior: "smooth" });
    },
    [cellWidth],
  );

  return { scrollRef, canScrollLeft, canScrollRight, scrollByPage, cellWidth };
}

function ScrollCue({
  direction,
  visible,
  onClick,
}: {
  direction: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <div
      data-testid={`schedule-scroll-slot-${direction}`}
      style={{
        position: "absolute",
        // Anchored to the first card rather than the strip, whose height varies
        // with the tallest day.
        top: FIRST_CARD_OFFSET + SHIFT_PILL_MIN_HEIGHT / 2,
        [direction]: 12,
        transform: "translateY(-50%)",
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: SCROLL_CONTROL_SLOT_WIDTH,
      }}
    >
      {visible ? (
        <ScrollCueButton
          direction={direction}
          onClick={onClick}
          label={direction === "left" ? "Scroll earlier days" : "Scroll later days"}
        />
      ) : null}
    </div>
  );
}

function resolveDraftLabel(shift: MyScheduleShift): string | null {
  return shift.badge?.label ?? null;
}

// Only the name line can run under the change pill, so it alone decides the
// layout. Centering it between two reserved gutters can starve it down to a
// one-character-per-line column, so the symmetric reserve only holds while the
// name still clears the pill on its own.
function isCrowdedByPill(shift: MyScheduleShift, cellWidth: number): boolean {
  if (!resolveDraftLabel(shift)) return false;
  const textWidth = cellWidth - DAY_BOX_PADDING_X - SHIFT_PILL_PADDING_X;
  return (
    capShiftText(shift.label).length * APPROX_NAME_CHAR_WIDTH > textWidth - CHANGE_PILL_RESERVE * 2
  );
}

function ShiftPill({ shift, alignLeft }: { shift: MyScheduleShift; alignLeft: boolean }) {
  const draftLabel = resolveDraftLabel(shift);
  const label = capShiftText(shift.label);
  const jobName = shift.jobName ? capShiftText(shift.jobName) : null;

  return (
    <div
      style={{
        minHeight: SHIFT_PILL_MIN_HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        textAlign: alignLeft ? "left" : undefined,
        padding: "8px",
        borderRadius: "var(--dg-radius-sm, 6px)",
        border: shift.borderKind
          ? `2px dashed ${DRAFT_BORDER_COLORS[shift.borderKind]}`
          : `1px solid ${shift.border}`,
        background: shift.background,
        color: shift.textColor,
        boxSizing: "border-box",
        overflowWrap: "anywhere",
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: "var(--dg-type-badge-size)",
          fontWeight: 600,
          lineHeight: 1.25,
          overflowWrap: "anywhere",
          paddingLeft: draftLabel && !alignLeft ? CHANGE_PILL_RESERVE : 0,
          paddingRight: draftLabel ? CHANGE_PILL_RESERVE : 0,
        }}
      >
        {label}
      </div>
      {shift.badge && draftLabel ? (
        <PublishDiffPill
          aria-label={`${draftLabel} shift`}
          title={shift.badge.detail}
          {...(shift.badge.source === "publish"
            ? { "data-publish-badge": shift.badge.kind }
            : { "data-draft-badge": shift.badge.kind })}
          kind={shift.badge.kind}
          style={{ position: "absolute", top: 6, right: 6, padding: "1px 4px" }}
        >
          {draftLabel}
        </PublishDiffPill>
      ) : null}
      <div
        aria-hidden={!jobName}
        style={{
          fontSize: "var(--dg-type-metadata-size)",
          fontWeight: 500,
          marginTop: 1,
          opacity: 0.8,
          lineHeight: 1.25,
          overflowWrap: "anywhere",
          visibility: jobName ? "visible" : "hidden",
        }}
      >
        {jobName ?? " "}
      </div>
      <div
        aria-hidden={!shift.timeRange}
        style={{
          fontSize: "var(--dg-type-metadata-size)",
          marginTop: 1,
          lineHeight: 1.25,
          overflowWrap: "anywhere",
          visibility: shift.timeRange ? "visible" : "hidden",
        }}
      >
        {shift.timeRange ?? " "}
      </div>
    </div>
  );
}

function EmptyDayPlaceholder() {
  return (
    <div
      style={{
        minHeight: SHIFT_PILL_MIN_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 6px",
        boxSizing: "border-box",
        fontSize: 14,
        fontWeight: 400,
        color: "var(--dg-color-text-subtle)",
      }}
    >
      {"—"}
    </div>
  );
}

function DayBox({
  day,
  fillAvailableWidth,
  cellWidth,
}: {
  day: MyScheduleDay;
  fillAvailableWidth: boolean;
  cellWidth: number;
}) {
  // A day's cards share one alignment: once any of them has to move left to
  // clear its change pill, the ones stacked with it follow.
  const alignLeft = day.shifts.some((shift) => isCrowdedByPill(shift, cellWidth));

  return (
    <Link
      href="/schedule"
      data-schedule-day={day.dateKey}
      style={{
        textDecoration: "none",
        color: "inherit",
        flexShrink: 0,
        flexGrow: fillAvailableWidth ? 1 : 0,
        flexBasis: fillAvailableWidth ? 0 : "auto",
        minWidth: 0,
        display: "flex",
        alignSelf: "stretch",
        scrollSnapAlign: "start",
        scrollSnapStop: "always",
      }}
    >
      <div
        style={{
          width: fillAvailableWidth ? "100%" : cellWidth,
          minHeight: DAY_BOX_MIN_HEIGHT,
          flex: 1,
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
            color: "var(--dg-color-text-primary)",
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
            day.shifts.map((shift, index) => (
              <ShiftPill key={index} shift={shift} alignLeft={alignLeft} />
            ))
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
  jobs = [],
  shiftCategories = [],
  isMobile = false,
  periodDates,
  periodLabel,
  isManagementOnly = false,
  recentPublishedChanges = new Map(),
  publishedAssignmentIdByPair,
}: MyScheduleRowProps) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const assignmentIdByPair = useMemo(
    () =>
      publishedAssignmentIdByPair ??
      createAssignmentDefinitionIdByPairMap([...assignmentById.values()], {
        includeArchived: true,
      }),
    [assignmentById, publishedAssignmentIdByPair],
  );
  const shiftById = useMemo(
    () => new Map(shiftCategories.map((shift) => [shift.id, shift])),
    [shiftCategories],
  );
  const days = useMemo(
    () =>
      currentEmpId
        ? buildMyScheduleDays({
            currentEmpId,
            currentPeriodShifts,
            assignmentById,
            absenceTypeById,
            jobById,
            shiftById,
            periodDates,
            isDarkTheme,
            recentPublishedChanges,
            publishedAssignmentIdByPair: assignmentIdByPair,
          })
        : [],
    [
      currentEmpId,
      currentPeriodShifts,
      assignmentById,
      absenceTypeById,
      jobById,
      shiftById,
      periodDates,
      isDarkTheme,
      recentPublishedChanges,
      assignmentIdByPair,
    ],
  );
  const hasAnySchedule = days.some((day) => day.shifts.length > 0);
  const fillsWithoutScrolling = days.length <= 7 && !isMobile;
  const { scrollRef, canScrollLeft, canScrollRight, scrollByPage, cellWidth } =
    useHorizontalScrollState(days.length);

  if (!currentEmpId || isManagementOnly) return null;

  return (
    <div className="dg-card" data-testid="my-schedule-row">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">Your schedule</div>
          <div className="dg-card-subtitle">{periodLabel}</div>
        </div>
      </div>
      <div className="dg-card-body" style={hasAnySchedule ? { padding: "16px 0" } : undefined}>
        {!hasAnySchedule ? (
          <EmptyState
            size="inline"
            icon={<CalendarDays size={20} />}
            title={`You're not scheduled ${periodLabel}`}
            description="When your shifts get published, they'll show up right here."
          />
        ) : (
          <div
            data-testid="schedule-scroll-shell"
            style={{
              position: "relative",
            }}
          >
            <ScrollCue direction="left" visible={canScrollLeft} onClick={() => scrollByPage(-1)} />
            <div
              ref={scrollRef}
              className="dg-no-scrollbar"
              data-testid="schedule-day-strip"
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: DAY_GAP,
                overflowX: fillsWithoutScrolling ? "hidden" : "auto",
                paddingBottom: 2,
                scrollSnapType: "x proximity",
              }}
            >
              {days.map((day) => (
                <DayBox
                  key={day.key}
                  day={day}
                  fillAvailableWidth={fillsWithoutScrolling}
                  cellWidth={isMobile ? DAY_BOX_WIDTH : cellWidth}
                />
              ))}
            </div>
            <ScrollCue direction="right" visible={canScrollRight} onClick={() => scrollByPage(1)} />
          </div>
        )}
      </div>
    </div>
  );
}
