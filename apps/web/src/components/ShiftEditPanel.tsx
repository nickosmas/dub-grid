"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { formatDate, getCertName, formatRelativeTime, calcTimeDuration } from "@/lib/utils";
import { Button } from "@/components/Button";
import { addDays as addDaysUtil, formatDateKey } from "@/lib/utils";
import { timesOverlap } from "@/lib/schedule-logic";
import { toDarkPillColors, darkenColor } from "@/lib/colors";
import { absenceStripeFill } from "@/lib/absence-stripes";
import { indefiniteArticle } from "@dubgrid/domain";
import type { TimeRange } from "@/lib/schedule-logic";
import {
  EditModalState,
  AssignmentDefinition,
  ShiftCategory,
  JobDefinition,
  AbsenceType,
  IndicatorType,
  SeriesScope,
  SeriesFrequency,
  ShiftSeriesPattern,
  ShiftSeriesReschedule,
  FocusArea,
  NamedItem,
  DraftKind,
  ShiftDisplayMode,
  Employee,
  ScheduleCellInput,
  ScheduleCellSegmentInput,
  ScheduleNoteShift,
  ShiftJobSegment,
} from "@/types";
import CustomSelect from "./CustomSelect";
import { formatShiftWindow, type WorkingShift } from "@/lib/shift-picker-groups";
import ShiftPicker from "./ShiftPicker";
import {
  fmt12h,
  subtractOneHour,
  addOneHour,
  orderSegmentsByStartTime,
  normalizeTime,
  withoutLastShiftTimes,
} from "./shiftEditTime";
import { PillTimeEditor, WorkedUntilField } from "./PillTimeEditor";
import {
  absenceBaseFromCell,
  absenceSideOf,
  clockSpanMinutes,
  effectiveRange,
  planAbsenceCell,
  type AbsenceBase,
  type AbsenceSide,
  type ClockRange,
} from "./absence-span";
import { AbsenceDayBar } from "./AbsenceDayBar";
import { SpanTabs } from "@/components/ui/span-tabs";
import { buildAssignableShiftDisplayMap, buildShiftDisplayParts } from "@/lib/assignable-shifts";
import ConfirmDialog from "./ConfirmDialog";
import RepeatForm, { type RepeatFormHandle } from "./RepeatForm";
import { ButtonLoading } from "./ButtonSpinner";
import { useMediaQuery, MOBILE } from "@/hooks";
import { useSlideoverClose } from "@/hooks/useSlideoverClose";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { Hint, MaybeHint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import { Switch } from "@/components/ui/switch";
import { Check, ChevronLeft, ChevronRight, Clock, Trash2, User } from "lucide-react";
import { ScheduleNoteIcon } from "@/components/schedule-grid/noteIcon";
import { ShiftChangeCard } from "@/components/shift-change/ShiftChangeCard";
import {
  ShiftPanelView,
  type PanelViewDetail,
  type PanelViewStatus,
} from "@/components/shift-panel/ShiftPanelView";
import { SeriesSummaryCard } from "@/components/shift-panel/SeriesSummaryCard";
import { SeriesScopeChoices } from "@/components/shift-panel/SeriesScopeChoices";
import { describeSeriesPattern, formatSeriesSpan, seriesScopeOptions } from "@/lib/series-summary";
import { buildShiftChangeResolvers, describeCellStateChange } from "@/lib/shift-change-web";
import {
  cellStateToChangeDay,
  describeShiftChangeItem,
  formatShiftChangeHours,
  shiftChangeItemMinutes,
} from "@dubgrid/schedule-core";
import { noteShiftOf } from "@/app/(app)/schedule/_lib/editor-session";
import {
  buildShiftDiffDescriptors,
  expandDelimitedTimeRanges,
  type ShiftDiffBadgeDescriptor,
  type ShiftDiffBorderKind,
} from "@/lib/shift-diff-badges";

interface ShiftEditPanelProps {
  modal: EditModalState;
  currentShift: string | null;
  currentAssignmentIds?: number[];
  currentSegments?: ShiftJobSegment[];
  assignments: AssignmentDefinition[];
  /** Shift categories — used to compute time bounds for custom time validation. */
  shiftCategories?: ShiftCategory[];
  /** Jobs available for combined shift picker resolution. */
  jobs?: JobDefinition[];
  indicatorTypes?: IndicatorType[];
  onSelect: (input: ScheduleCellInput | null, seriesScope?: SeriesScope) => void;
  onClose: () => void;
  allowShiftEdits?: boolean;
  canEditScheduleIndicators?: boolean;
  /** The note types on one shift; with a null shift, those no shift claims. */
  getActiveIndicatorIds?: (focusAreaId: number, shift: ScheduleNoteShift | null) => number[];
  onNoteToggle?: (
    indicatorTypeId: number,
    active: boolean,
    focusAreaId: number,
    shift: ScheduleNoteShift | null,
  ) => void;
  /** Series ID if the current shift belongs to a repeating series */
  seriesId?: string | null;
  fromRecurring?: boolean;
  /** Called when the user confirms creating a repeating shift */
  onRepeatConfirm?: (
    frequency: SeriesFrequency,
    daysOfWeek: number[] | null,
    startDate: string,
    endDate: string | null,
    maxOccurrences: number | null,
    previewTotal: number,
    keepExisting: boolean,
  ) => void;
  /** Loads the series' dates and pattern so they can be edited. */
  onLoadSeriesPattern?: (seriesId: string) => Promise<ShiftSeriesPattern>;
  /** Saves new dates and a new pattern for the series. */
  onRescheduleSeries?: (
    seriesId: string,
    pattern: ShiftSeriesReschedule,
    isAbsence: boolean,
  ) => void;
  /** True while a repeating series is being created or changed. */
  isCreatingRepeatSeries?: boolean;
  /** Employee ID — needed for repeat form overwrite checks */
  empId?: string;
  /** Current custom start time override for this shift (e.g. "07:30") */
  customStartTime?: string | null;
  /** Current custom end time override for this shift (e.g. "15:30") */
  customEndTime?: string | null;
  /** Called when user changes the custom time override */
  onCustomTimeChange?: (start: string | null, end: string | null) => void;
  /** Published shift code IDs — used to identify newly added shifts in split-shift view */
  publishedAssignmentIds?: number[];
  /** Published absence type ID — used to compare current content against live schedule state. */
  publishedAbsenceTypeId?: number | null;
  /** Published rest-of-day absence on a worked cell (item 45). */
  publishedRestOfDayAbsenceTypeId?: number | null;
  /** The shifts as published, to say how the draft differs. */
  publishedSegments?: ShiftJobSegment[];
  /** Published custom start time override — used for published-vs-current diff badges. */
  publishedCustomStartTime?: string | null;
  /** Published custom end time override — used for published-vs-current diff badges. */
  publishedCustomEndTime?: string | null;
  /** Draft classification for this cell — used to show NEW badge on single-shift pills */
  draftKind?: DraftKind;
  /** Commits the current local draft to the server. */
  onConfirmDraft?: (seriesScope?: SeriesScope) => void;
  /** True when the underlying cell changed externally while the panel was open. */
  isStale?: boolean;
  /** All focus areas — used to resolve focusAreaId to names */
  focusAreas?: FocusArea[];
  /** All certifications — used to resolve certificationId to names */
  certifications?: NamedItem[];
  /** Organization roles — used to restrict job eligibility to schedule roles. */
  orgRoles?: NamedItem[];
  /** Audit metadata — only populated for admin+ users. */
  auditInfo?: {
    createdByName: string | null;
    updatedByName: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
  /** True if this shift belongs to the currently logged-in employee. */
  isOwnShift?: boolean;
  /** True if there's already an active request for this shift. */
  hasActiveRequest?: boolean;
  /** Callback to submit an offer-for-pickup request for this shift. */
  onMakeAvailable?: (options?: {
    targetEmpId?: string;
    targetShiftDate?: string;
    absenceTypeId?: number;
    requesterSegmentIndex?: number;
  }) => void | Promise<unknown>;
  /** Callback to submit a calloff request with the selected absence type. */
  onCallOff?: (
    absenceType: AbsenceType,
    options?: { requesterSegmentIndex?: number },
  ) => void | Promise<unknown>;
  /** Eligible employees available for swap selection. */
  employees?: Employee[];
  /** Returns the display label for an employee's shift on a given date. */
  shiftForKey?: (empId: string, date: Date) => string | null;
  /** Returns a spelled-out shift label for request surfaces. */
  shiftNameForKey?: (empId: string, date: Date) => string | null;
  /** True when the target shift can be requested in a swap flow. */
  isRequestableShift?: (empId: string, date: Date) => boolean;
  /** Dates currently loaded in the broader schedule fetch window, used to bound swap week navigation. */
  availableSwapDates?: string[];
  /** True when the target shift is already in progress or in the past. */
  isShiftStarted?: (empId: string, date: Date) => boolean;
  /** True when a specific chronological segment is already in progress or in the past. */
  isShiftSegmentStarted?: (empId: string, date: Date, segmentIndex: number) => boolean;
  /** Returns time ranges used to detect swap conflicts. */
  getShiftTimeRanges?: (empId: string, date: Date) => TimeRange[];
  /** Returns focus area IDs required by the published shift on a given date. */
  getShiftFocusAreaIds?: (empId: string, date: Date) => number[];
  /** Returns published worked segments for request segment selection. */
  getShiftSegments?: (empId: string, date: Date) => ShiftJobSegment[];
  /** Returns the published absence type ID for an employee on a given date. */
  getAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  /** Submits a swap request for the selected target shift. */
  onSubmitSwap?: (
    targetEmpId: string,
    targetShiftDate: string,
    options?: {
      requesterSegmentIndex?: number;
      targetSegmentIndex?: number;
    },
  ) => void | Promise<unknown>;
  /** The absence types the picker offers. */
  absenceTypes?: AbsenceType[];
  /** Currently active absence type ID on this cell. */
  currentAbsenceTypeId?: number | null;
  /** The absence a worked cell carries for the rest of the day (item 45). */
  currentRestOfDayAbsenceTypeId?: number | null;
  /** The time that absence covers (item 50b); null when it was saved untimed. */
  currentRestOfDayAbsenceStartTime?: string | null;
  currentRestOfDayAbsenceEndTime?: string | null;
  /** Cross-date overlap warnings to display (non-blocking). */
  overlapWarnings?: string[];
  /** When true, overlap warnings block saving (admin can override). */
  enforceConflicts?: boolean;
  /** Whether the org allows shift-only ("default shift") assignments in the picker. */
  defaultShiftEnabled?: boolean;
  /** Controls shift display: 'code' shows short labels, 'name' shows full names. */
  shiftDisplayMode?: ShiftDisplayMode;
  /** The days in a row this whole-day absence runs across in the grid (item 52). */
  absenceRun?: { dateKeys: string[] } | null;
  /** Removes every day of `absenceRun` as one draft change. */
  onRemoveAbsenceRun?: () => void;
}

function formatTimeRangeLabel(range: TimeRange): string {
  return `${fmt12h(range.start)} - ${fmt12h(range.end)}`;
}

function addDaysIso(iso: string, days: number): string {
  return formatDateKey(addDaysUtil(new Date(`${iso}T00:00:00`), days));
}

function formatDisplayDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatWeekRangeLabel(startIso: string): string {
  const formatRangeDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  return `${formatRangeDate(startIso)} - ${formatRangeDate(addDaysIso(startIso, 6))}`;
}

function todayIso(): string {
  return formatDateKey(new Date());
}

function getWeekDates(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysIso(startIso, index));
}

function differenceInDaysIso(leftIso: string, rightIso: string): number {
  const left = new Date(`${leftIso}T00:00:00`).getTime();
  const right = new Date(`${rightIso}T00:00:00`).getTime();
  return Math.round((left - right) / 86_400_000);
}

function getCalendarWeekStart(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  return addDaysIso(dateIso, -date.getUTCDay());
}

function formatRunRange(dateKeys: string[]): string {
  return `${formatDisplayDate(dateKeys[0])} - ${formatDisplayDate(dateKeys[dateKeys.length - 1])}`;
}

/** "Part of 4 days, Mon, Nov 9 - Thu, Nov 12". */
function absenceRunSummary(dateKeys: string[]): string {
  return `Part of ${dateKeys.length} days, ${formatRunRange(dateKeys)}`;
}

function getAbsenceTypeDisplayName(absenceType: AbsenceType | null): string {
  const name = absenceType?.name?.trim() ?? "";
  if (name.length > 0) {
    return name;
  }

  return absenceType?.label ?? "Absence";
}

// ── Pipe-delimited per-sub-shift time helpers ─────────────────────────────
function parseMultiTimes(time: string | null | undefined, count: number): (string | null)[] {
  if (!time) return Array(count).fill(null);
  const parts = time.split("|");
  return Array.from({ length: count }, (_, i) => parts[i] || null);
}

function getPanelDiffBadgeBackground(kind: ShiftDiffBadgeDescriptor["kind"]): string {
  switch (kind) {
    case "new":
      return "var(--dg-color-success-text)";
    default:
      return "var(--dg-color-warning)";
  }
}

// The colored header sits inset in its card. Concentric corners need the outer
// radius to equal the header's plus the gap between them (padding and border).
const SHIFT_EDIT_CARD_INSET = 5;
const SHIFT_EDIT_CARD_BORDER = 1.5;
const shiftEditCardHeaderRadius = "var(--dg-radius-md)";
const shiftEditCardOuterRadius = `calc(${shiftEditCardHeaderRadius} + ${SHIFT_EDIT_CARD_INSET + SHIFT_EDIT_CARD_BORDER}px)`;
const shiftEditCardInnerRadius = "calc(var(--dg-radius-md) - 2px)";

function getPanelDiffBorder(args: { diffKind: ShiftDiffBorderKind; fallback: string }): string {
  const { diffKind, fallback } = args;
  if (diffKind === "new") {
    return `2px dashed var(--dg-color-success-text)`;
  }
  if (diffKind === "modified") {
    return `2px dashed var(--dg-color-warning)`;
  }
  return fallback;
}

function joinMultiTimes(times: (string | null)[]): string | null {
  if (times.every((t) => !t)) return null;
  return times.map((t) => t ?? "").join("|");
}

function getFirstTimeSegment(time: string | null | undefined): string | null {
  if (!time) return null;
  const segment = time.split("|")[0]?.trim();
  return segment ? segment : null;
}

// ── Per-pill custom time editor (custom dropdown views, immediate save) ───
/** "the Day shift" in a sentence, or "the Day Shift" when the name already says shift. */
function theShift(name: string): string {
  return `the ${name}${/\bshift$/i.test(name) ? "" : " shift"}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function ShiftEditPanel({
  modal,
  currentShift,
  currentAssignmentIds = [],
  currentSegments = [],
  assignments,
  shiftCategories = [],
  jobs = [],
  indicatorTypes = [],
  onSelect,
  onClose,
  allowShiftEdits = true,
  canEditScheduleIndicators = false,
  getActiveIndicatorIds,
  onNoteToggle,
  seriesId,
  fromRecurring = false,
  onRepeatConfirm,
  onLoadSeriesPattern,
  onRescheduleSeries,
  isCreatingRepeatSeries = false,
  empId,
  customStartTime,
  customEndTime,
  onCustomTimeChange,
  publishedAssignmentIds = [],
  publishedAbsenceTypeId = null,
  publishedRestOfDayAbsenceTypeId = null,
  publishedSegments,
  publishedCustomStartTime = null,
  publishedCustomEndTime = null,
  draftKind = null,
  onConfirmDraft,
  isStale = false,
  focusAreas = [],
  certifications = [],
  orgRoles = [],
  auditInfo,
  isOwnShift = false,
  hasActiveRequest = false,
  onMakeAvailable,
  onCallOff,
  employees = [],
  shiftForKey,
  shiftNameForKey,
  isRequestableShift,
  availableSwapDates,
  isShiftStarted,
  isShiftSegmentStarted,
  getShiftTimeRanges,
  getShiftFocusAreaIds,
  getShiftSegments,
  getAbsenceTypeIdForKey,
  onSubmitSwap,
  absenceTypes = [],
  currentAbsenceTypeId,
  currentRestOfDayAbsenceTypeId = null,
  currentRestOfDayAbsenceStartTime = null,
  currentRestOfDayAbsenceEndTime = null,
  overlapWarnings = [],
  enforceConflicts = false,
  shiftDisplayMode = "code",
  defaultShiftEnabled = true,
  absenceRun = null,
  onRemoveAbsenceRun,
}: ShiftEditPanelProps) {
  const isNameMode = shiftDisplayMode === "name";
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const assignableShiftDisplayMap = useMemo(
    () =>
      buildAssignableShiftDisplayMap({
        assignments: assignments,
        shiftCategories,
        jobs,
        focusAreas: focusAreas ?? [],
        shiftDisplayMode: "name",
      }),
    [focusAreas, jobs, shiftCategories, assignments],
  );
  const isMobile = useMediaQuery(MOBILE);
  const { closing, close } = useSlideoverClose(onClose);
  const [seriesScope, setSeriesScope] = useState<SeriesScope>("this");
  const [pendingDelete, setPendingDelete] = useState<
    { type: "all" } | { type: "pill"; index: number } | { type: "restOfDay" } | null
  >(null);

  const hasActiveShift = !!(currentShift && currentShift !== "OFF");
  const isAbsence = currentAbsenceTypeId != null;
  const hasRestOfDayAbsence = currentRestOfDayAbsenceTypeId != null;
  // A repeating absence keeps its own choice of days to remove.
  const runDateKeys =
    isAbsence && !seriesId && absenceRun && absenceRun.dateKeys.length >= 2
      ? absenceRun.dateKeys
      : null;
  const [runRemoveScope, setRunRemoveScope] = useState<"this" | "all">("this");
  const [showPicker, setShowPicker] = useState(!hasActiveShift);
  // The picker is open to choose the absence for the rest of the day, not a shift.
  const [pickingRestOfDayAbsence, setPickingRestOfDayAbsence] = useState(false);
  const [showRepeatForm, setShowRepeatForm] = useState(false);
  const [seriesPattern, setSeriesPattern] = useState<ShiftSeriesPattern | null>(null);
  const [seriesPatternLoad, setSeriesPatternLoad] = useState<"idle" | "loading" | "failed">("idle");
  const [seriesFormOpen, setSeriesFormOpen] = useState(false);
  const [seriesSummary, setSeriesSummary] = useState<{
    status: "loading" | "failed" | "ready";
    pattern: ShiftSeriesPattern | null;
  } | null>(null);
  // A repeating item opens on what it holds and its series; Edit moves to the
  // day editor. Every other item opens straight in the editor.
  const [viewing, setViewing] = useState(
    () =>
      allowShiftEdits &&
      !modal.requestMode &&
      !!seriesId &&
      !!currentShift &&
      currentShift !== "OFF",
  );
  // Remove changes the draft, then saves it once the panel sees the change.
  const [pendingCommitScope, setPendingCommitScope] = useState<SeriesScope | null>(null);
  const [editScopeOpen, setEditScopeOpen] = useState(false);
  const [activeRequestMode, setActiveRequestMode] = useState<EditModalState["requestMode"] | null>(
    modal.requestMode ?? null,
  );
  const [showCoverageCalloffOptions, setShowCoverageCalloffOptions] = useState(false);
  const [showPickupTargetOptions, setShowPickupTargetOptions] = useState(false);
  const [selectedRequesterSegmentIndex, setSelectedRequesterSegmentIndex] = useState(0);
  const [swapViewDate, setSwapViewDate] = useState(formatDateKey(modal.date));
  const [hasExplicitSwapDateSelection, setHasExplicitSwapDateSelection] = useState(false);
  const [swapWeekStartDate, setSwapWeekStartDate] = useState(
    getCalendarWeekStart(formatDateKey(modal.date)),
  );
  const [selectedSwapTarget, setSelectedSwapTarget] = useState<{
    empId: string;
    name: string;
    shiftLabel: string;
    timeLabel: string | null;
    focusAreaLabel: string | null;
    targetSegmentIndex?: number;
  } | null>(null);
  const [pendingRequestConfirmation, setPendingRequestConfirmation] = useState<
    | { kind: "pickup"; requesterSegmentIndex?: number }
    | {
        kind: "targeted_pickup";
        targetEmpId: string;
        targetName: string;
        absenceType: AbsenceType;
        requesterSegmentIndex?: number;
      }
    | { kind: "calloff"; absenceType: AbsenceType; requesterSegmentIndex?: number }
    | {
        kind: "swap";
        targetEmpId: string;
        targetShiftDate: string;
        targetName: string;
        targetShiftLabel: string;
        requesterSegmentIndex?: number;
        targetSegmentIndex?: number;
      }
    | null
  >(null);
  const [isSubmittingRequestConfirmation, setIsSubmittingRequestConfirmation] = useState(false);
  const repeatFormRef = useRef<RepeatFormHandle | null>(null);
  const activeAbsenceTypes = absenceTypes.filter((at) => !at.archivedAt);
  const requestShiftDate = formatDateKey(modal.date);
  const requestOnlyMode = modal.requestMode ?? null;
  const canRenderCoverage = Boolean(onMakeAvailable || onCallOff);
  const canRenderSwap = Boolean(
    onSubmitSwap && shiftForKey && isRequestableShift && getShiftTimeRanges,
  );
  const requesterShiftLabel =
    currentShift && currentShift !== "OFF"
      ? currentShift
      : (shiftForKey?.(modal.empId, modal.date) ?? "");
  const getSwapShiftLabel = useCallback(
    (employeeId: string, date: Date) =>
      shiftNameForKey?.(employeeId, date) ?? shiftForKey?.(employeeId, date) ?? "",
    [shiftForKey, shiftNameForKey],
  );
  const focusAreaNameById = useMemo(
    () => new Map((focusAreas ?? []).map((focusArea) => [focusArea.id, focusArea.name])),
    [focusAreas],
  );

  // Capture initial state at mount so Cancel can revert
  const [initialShift] = useState(() => currentShift);
  const [initialAssignmentIds] = useState(() => [...currentAssignmentIds]);
  const [initialSegments] = useState(() => currentSegments.map((segment) => ({ ...segment })));
  const [initialAbsenceTypeId] = useState(() => currentAbsenceTypeId ?? null);
  const [initialRestOfDayAbsenceTypeId] = useState(() => currentRestOfDayAbsenceTypeId ?? null);
  const openedEmpty =
    initialSegments.length === 0 &&
    initialAbsenceTypeId == null &&
    initialRestOfDayAbsenceTypeId == null;
  const [initialRestOfDayAbsenceTimes] = useState(
    () => `${currentRestOfDayAbsenceStartTime ?? ""}-${currentRestOfDayAbsenceEndTime ?? ""}`,
  );
  const [initialCustomStartTime] = useState(() => customStartTime ?? null);
  const [initialCustomEndTime] = useState(() => customEndTime ?? null);
  // Notes are tracked per focus area and shift. A shift added while editing
  // starts from the notes no shift claims, which it shows as well.
  const [noteFocusAreaIds] = useState<number[]>(() => {
    const focusAreaIds = new Set<number>(modal.empFocusAreaIds);
    for (const st of assignments) {
      if (st.focusAreaId != null) focusAreaIds.add(st.focusAreaId);
    }
    return [...focusAreaIds];
  });
  const [initialNotesBySlot] = useState<Map<string, number[]>>(() => {
    const record = new Map<string, number[]>();
    if (!getActiveIndicatorIds) return record;
    for (const slot of noteSlots(currentSegments)) {
      record.set(slot.key, [...getActiveIndicatorIds(slot.focusAreaId, slot.shift)]);
    }
    return record;
  });

  const singleNoteShift = currentSegments.length === 1 ? noteShiftOf(currentSegments[0]) : null;

  function noteSlots(segments: readonly ShiftJobSegment[]) {
    const shifts = new Map<string, ScheduleNoteShift>();
    for (const segment of [...initialSegments, ...segments]) {
      const shift = noteShiftOf(segment);
      if (shift) shifts.set(`${shift.shiftId ?? "-"}:${shift.jobId}`, shift);
    }
    return noteFocusAreaIds.flatMap((focusAreaId) =>
      [...shifts].map(([shiftKey, shift]) => ({
        key: `${focusAreaId}|${shiftKey}`,
        focusAreaId,
        shift,
      })),
    );
  }

  function noteSlotChanges() {
    if (!getActiveIndicatorIds) return [];
    return noteSlots(currentSegments).map((slot) => {
      const initial = initialNotesBySlot.get(slot.key) ?? [];
      const current = getActiveIndicatorIds(slot.focusAreaId, slot.shift);
      return {
        ...slot,
        added: current.filter((id) => !initial.includes(id)),
        removed: initial.filter((id) => !current.includes(id)),
      };
    });
  }
  const hasPublishedBaseline = publishedAssignmentIds.length > 0 || publishedAbsenceTypeId != null;
  const panelDiff = useMemo(
    () =>
      buildShiftDiffDescriptors({
        before: {
          assignmentIds: hasPublishedBaseline ? publishedAssignmentIds : initialAssignmentIds,
          absenceTypeId: hasPublishedBaseline ? publishedAbsenceTypeId : initialAbsenceTypeId,
          restOfDayAbsenceTypeId: hasPublishedBaseline
            ? publishedRestOfDayAbsenceTypeId
            : initialRestOfDayAbsenceTypeId,
          timeRanges: hasPublishedBaseline
            ? expandDelimitedTimeRanges(
                publishedCustomStartTime,
                publishedCustomEndTime,
                publishedAssignmentIds.length,
              )
            : expandDelimitedTimeRanges(
                initialCustomStartTime,
                initialCustomEndTime,
                initialAssignmentIds.length,
              ),
        },
        after: {
          assignmentIds: currentAssignmentIds,
          absenceTypeId: currentAbsenceTypeId ?? null,
          restOfDayAbsenceTypeId: currentRestOfDayAbsenceTypeId,
          timeRanges: expandDelimitedTimeRanges(
            customStartTime,
            customEndTime,
            currentAssignmentIds.length,
          ),
        },
        beforeShiftLabels: (hasPublishedBaseline
          ? publishedAssignmentIds
          : initialAssignmentIds
        ).map((assignmentId) => assignableShiftDisplayMap.get(assignmentId) ?? "?"),
        afterShiftLabels: currentAssignmentIds.map(
          (assignmentId) => assignableShiftDisplayMap.get(assignmentId) ?? "?",
        ),
        resolveAssignmentDefinitionLabel: (assignmentId) => {
          return assignableShiftDisplayMap.get(assignmentId) ?? "?";
        },
        resolveAbsenceLabel: (absenceTypeId) => {
          const absenceType = absenceTypes.find((item) => item.id === absenceTypeId);
          if (!absenceType) return "?";
          return absenceType.name || absenceType.label;
        },
      }),
    [
      hasPublishedBaseline,
      publishedAssignmentIds,
      publishedAbsenceTypeId,
      publishedRestOfDayAbsenceTypeId,
      publishedCustomStartTime,
      publishedCustomEndTime,
      initialAssignmentIds,
      initialAbsenceTypeId,
      initialRestOfDayAbsenceTypeId,
      initialCustomStartTime,
      initialCustomEndTime,
      currentAssignmentIds,
      currentAbsenceTypeId,
      currentRestOfDayAbsenceTypeId,
      customStartTime,
      customEndTime,
      assignableShiftDisplayMap,
      absenceTypes,
    ],
  );

  const shiftChangeResolvers = useMemo(
    () =>
      buildShiftChangeResolvers({
        assignments,
        shiftCategories,
        jobs,
        absenceTypes,
        focusAreas: focusAreas ?? [],
      }),
    [assignments, shiftCategories, jobs, absenceTypes, focusAreas],
  );

  function segmentsMatchInitial(): boolean {
    if (currentSegments.length !== initialSegments.length) return false;
    return currentSegments.every((segment, index) => {
      const initial = initialSegments[index];
      return (
        initial != null &&
        segment.shiftId === initial.shiftId &&
        segment.jobId === initial.jobId &&
        (segment.position ?? index) === (initial.position ?? index) &&
        (segment.isMentored ?? false) === (initial.isMentored ?? false)
      );
    });
  }

  // Compares what the cell holds, never its label: a loaded cell and the same
  // cell rebuilt by an edit can label one shift differently ("D · M" and "DM").
  const hasRestOfDayEdit =
    currentRestOfDayAbsenceTypeId !== initialRestOfDayAbsenceTypeId ||
    `${currentRestOfDayAbsenceStartTime ?? ""}-${currentRestOfDayAbsenceEndTime ?? ""}` !==
      initialRestOfDayAbsenceTimes;
  const hasShiftEdit =
    (currentAbsenceTypeId ?? null) !== initialAbsenceTypeId ||
    hasRestOfDayEdit ||
    !segmentsMatchInitial();
  const hasTimeEdit =
    (customStartTime ?? null) !== initialCustomStartTime ||
    (customEndTime ?? null) !== initialCustomEndTime;
  const hasNoteEdit = noteSlotChanges().some(
    (slot) => slot.added.length > 0 || slot.removed.length > 0,
  );
  const hasEdits = hasShiftEdit || hasNoteEdit || hasTimeEdit;
  const canEditSeriesPattern = Boolean(
    allowShiftEdits && seriesId && empId && onLoadSeriesPattern && onRescheduleSeries,
  );
  const showSeriesPatternForm = canEditSeriesPattern && seriesFormOpen && seriesPattern != null;
  const showCreateRepeatForm = Boolean(showRepeatForm && onRepeatConfirm && empId);
  const repeatFormOpen = showCreateRepeatForm || showSeriesPatternForm;

  const openSeriesPattern = async () => {
    if (!seriesId || !onLoadSeriesPattern) return;
    setSeriesPatternLoad("loading");
    try {
      setSeriesPattern(await onLoadSeriesPattern(seriesId));
      setSeriesFormOpen(true);
      setSeriesPatternLoad("idle");
    } catch {
      setSeriesPatternLoad("failed");
    }
  };

  // Loaded once per panel; returning to the view keeps what was loaded.
  const canLoadSeriesSummary = Boolean(
    viewing && seriesId && onLoadSeriesPattern && seriesSummary?.status !== "ready",
  );
  useEffect(() => {
    if (!canLoadSeriesSummary || !seriesId || !onLoadSeriesPattern) return;
    let cancelled = false;
    setSeriesSummary({ status: "loading", pattern: null });
    onLoadSeriesPattern(seriesId)
      .then((pattern) => {
        if (!cancelled) setSeriesSummary({ status: "ready", pattern });
      })
      .catch(() => {
        if (!cancelled) setSeriesSummary({ status: "failed", pattern: null });
      });
    return () => {
      cancelled = true;
    };
  }, [canLoadSeriesSummary, seriesId, onLoadSeriesPattern]);

  useEffect(() => {
    if (pendingCommitScope == null || !hasEdits) return;
    setPendingCommitScope(null);
    onConfirmDraft?.(seriesId ? pendingCommitScope : undefined);
  }, [pendingCommitScope, hasEdits, onConfirmDraft, seriesId]);

  function describeNoteChange(): string | null {
    if (!hasNoteEdit) return null;
    const nameOf = (id: number) => indicatorTypes.find((ind) => ind.id === id)?.name ?? "?";
    // A note no shift claims shows on every shift, so one change can appear
    // in several slots; each is named once.
    const tokens = new Set<string>();
    for (const slot of noteSlotChanges()) {
      for (const id of slot.added) tokens.add(`+${nameOf(id)}`);
      for (const id of slot.removed) tokens.add(`\u2212${nameOf(id)}`);
    }
    return tokens.size > 0 ? `Notes: ${[...tokens].join(", ")}` : null;
  }

  const absenceName = (id: number | null) => {
    if (id == null) return null;
    const absence = absenceTypes.find((candidate) => candidate.id === id);
    return absence ? absence.name || absence.label : "an absence";
  };
  // Compared with the cell as the panel opened, paired by what each shift is.
  const unsavedChange =
    hasShiftEdit || hasTimeEdit || hasRestOfDayEdit
      ? describeCellStateChange(
          buildPanelInput({
            segments: initialSegments,
            absenceTypeId: initialAbsenceTypeId,
            customStartTime: initialCustomStartTime,
            customEndTime: initialCustomEndTime,
            restOfDayAbsenceTypeId: initialRestOfDayAbsenceTypeId,
          }),
          buildPanelInput({
            segments: currentSegments,
            absenceTypeId: currentAbsenceTypeId ?? null,
            customStartTime: customStartTime ?? null,
            customEndTime: customEndTime ?? null,
            restOfDayAbsenceTypeId: currentRestOfDayAbsenceTypeId,
          }),
          formatDateKey(modal.date),
          shiftChangeResolvers,
        )
      : null;
  // Before and After only when a shift that was there is changed; an addition
  // or removal already reads plainly in the panel above.
  const showsUnsavedChange =
    !!unsavedChange &&
    unsavedChange.kind !== "none" &&
    unsavedChange.after.items.some((item) => item.status === "changed");
  const noteSummary = hasNoteEdit ? describeNoteChange() : null;
  const confirmBlocked = isStale || (enforceConflicts && overlapWarnings.length > 0);

  function buildPanelInput(args: {
    segments: Array<Pick<ShiftJobSegment, "shiftId" | "jobId" | "position" | "isMentored">>;
    absenceTypeId: number | null;
    customStartTime: string | null;
    customEndTime: string | null;
    /** The rest-of-day absence to keep beside the shifts; the cell's current one by default. */
    restOfDayAbsenceTypeId?: number | null;
    /** The time it covers (item 50c); the cell's current times by default. */
    absenceTimes?: ClockRange | null;
  }): ScheduleCellInput | null {
    if (args.absenceTypeId != null) {
      return {
        kind: "absence",
        segments: [],
        absenceTypeId: args.absenceTypeId,
        customStartTime: null,
        customEndTime: null,
        seriesId: seriesId ?? null,
        fromRecurring,
      };
    }

    if (args.segments.length === 0) {
      return null;
    }

    const restOfDayAbsenceTypeId =
      args.restOfDayAbsenceTypeId !== undefined
        ? args.restOfDayAbsenceTypeId
        : currentRestOfDayAbsenceTypeId;
    const storedTimes =
      currentRestOfDayAbsenceStartTime && currentRestOfDayAbsenceEndTime
        ? { start: currentRestOfDayAbsenceStartTime, end: currentRestOfDayAbsenceEndTime }
        : null;
    const absenceTimes =
      restOfDayAbsenceTypeId == null
        ? null
        : args.absenceTimes !== undefined
          ? args.absenceTimes
          : storedTimes;
    return {
      kind: "worked",
      segments: args.segments.map((segment, index) => ({
        shiftId: segment.shiftId,
        jobId: segment.jobId,
        position: segment.position ?? index,
        isMentored: segment.isMentored ?? false,
      })),
      absenceTypeId: restOfDayAbsenceTypeId,
      ...(restOfDayAbsenceTypeId != null
        ? {
            absenceStartTime: absenceTimes?.start ?? null,
            absenceEndTime: absenceTimes?.end ?? null,
          }
        : {}),
      customStartTime:
        args.segments.length === 1
          ? getFirstTimeSegment(args.customStartTime)
          : args.customStartTime,
      customEndTime:
        args.segments.length === 1 ? getFirstTimeSegment(args.customEndTime) : args.customEndTime,
      seriesId: seriesId ?? null,
      fromRecurring,
    };
  }

  const isMentoredAssignment =
    currentSegments.length > 0 && currentSegments.every((segment) => segment.isMentored === true);

  function handleMentoredToggleAtIndex(segmentIndex: number, nextMentored: boolean) {
    onSelect(
      buildPanelInput({
        segments: currentSegments.map((segment, index) => ({
          shiftId: segment.shiftId,
          jobId: segment.jobId,
          position: segment.position ?? index,
          isMentored: index === segmentIndex ? nextMentored : (segment.isMentored ?? false),
        })),
        absenceTypeId: null,
        customStartTime: customStartTime ?? null,
        customEndTime: customEndTime ?? null,
      }),
      seriesId ? seriesScope : undefined,
    );
  }

  function handleMentoredToggle() {
    handleMentoredToggleAtIndex(0, !isMentoredAssignment);
  }

  function handleUndo() {
    if (hasShiftEdit) {
      onSelect(
        buildPanelInput({
          segments: initialSegments,
          absenceTypeId: initialAbsenceTypeId,
          customStartTime: initialCustomStartTime,
          customEndTime: initialCustomEndTime,
          restOfDayAbsenceTypeId: initialRestOfDayAbsenceTypeId,
        }),
      );
    }
    // Revert custom times if changed
    if (hasTimeEdit && onCustomTimeChange) {
      onCustomTimeChange(initialCustomStartTime, initialCustomEndTime);
    }
    // Revert notes on each focus area and shift. The toggles are idempotent,
    // so a note no shift claims, which several slots show, is restored once.
    for (const slot of noteSlotChanges()) {
      for (const type of slot.removed) onNoteToggle?.(type, true, slot.focusAreaId, slot.shift);
      for (const type of slot.added) onNoteToggle?.(type, false, slot.focusAreaId, slot.shift);
    }
    // Do NOT close — panel stays open after undo
  }

  // Resolve effective default times: shift code custom times → category times
  function resolveDefaultTimes(assignment: AssignmentDefinition | undefined): {
    start: string | null;
    end: string | null;
  } {
    if (assignment?.defaultStartTime && assignment?.defaultEndTime) {
      return { start: assignment.defaultStartTime, end: assignment.defaultEndTime };
    }
    if (assignment?.categoryId && shiftCategories.length > 0) {
      const cat = shiftCategories.find((c) => c.id === assignment.categoryId);
      if (cat?.startTime && cat?.endTime) {
        return { start: cat.startTime, end: cat.endTime };
      }
    }
    return { start: null, end: null };
  }

  // Compute custom-time bounds from the shift code's category (±1hr buffer)
  function getTimeBounds(assignment: AssignmentDefinition | undefined): {
    minTime: string | null;
    maxTime: string | null;
  } {
    let windowStart: string | null = null;
    let windowEnd: string | null = null;

    if (assignment?.categoryId && shiftCategories.length > 0) {
      const cat = shiftCategories.find((c) => c.id === assignment.categoryId);
      windowStart = cat?.startTime ?? null;
      windowEnd = cat?.endTime ?? null;
    }
    // Fallback to code defaults if category has no times
    if (!windowStart) windowStart = assignment?.defaultStartTime ?? null;
    if (!windowEnd) windowEnd = assignment?.defaultEndTime ?? null;

    return {
      minTime: windowStart ? subtractOneHour(windowStart) : null,
      maxTime: windowEnd ? addOneHour(windowEnd) : null,
    };
  }

  // Any other shift, general or regular, earlier or later, can be the second
  // half of a double shift. Overlaps are left to the same-day overlap warning,
  // which blocks saving only when the organization enforces conflicts.
  const isAddingSecondShift =
    showPicker && !pickingRestOfDayAbsence && currentAssignmentIds.length === 1;
  const firstShiftId = isAddingSecondShift ? currentAssignmentIds[0] : null;

  const pickerAssignmentDefinitions = pickingRestOfDayAbsence
    ? []
    : isAddingSecondShift
      ? assignments.filter((sc) => sc.id !== firstShiftId)
      : assignments;

  const firstAssignment =
    firstShiftId != null
      ? assignments.find((assignment) => assignment.id === firstShiftId)
      : undefined;
  const firstDefaultTimes = resolveDefaultTimes(firstAssignment);
  const pickerWorkingShift: WorkingShift | null =
    isAddingSecondShift && firstAssignment
      ? {
          name:
            shiftCategories.find(
              (shift) => shift.id === (firstAssignment.shiftId ?? firstAssignment.categoryId),
            )?.name ??
            firstAssignment.name ??
            firstAssignment.label,
          shiftId: firstAssignment.shiftId ?? firstAssignment.categoryId ?? null,
          start: customStartTime ?? firstDefaultTimes.start,
          end: customEndTime ?? firstDefaultTimes.end,
        }
      : null;

  // A cell carries at most one absence, so a second shift's picker offers none.
  const pickerAbsenceTypes = isAddingSecondShift ? [] : absenceTypes;

  // A double shift reads in time order whichever half was picked first.
  function selectPickerSegments(segments: ScheduleCellSegmentInput[]) {
    const ordered =
      isAddingSecondShift && segments.length === 2
        ? orderSegmentsByStartTime(
            segments,
            customStartTime ?? null,
            customEndTime ?? null,
            (segment) =>
              resolveDefaultTimes(
                assignments.find(
                  (candidate) =>
                    (candidate.shiftId ?? candidate.categoryId ?? null) ===
                      (segment.shiftId ?? null) && candidate.jobId === segment.jobId,
                ),
              ).start ?? shiftCategories.find((shift) => shift.id === segment.shiftId)?.startTime,
          )
        : {
            segments,
            customStartTime: customStartTime ?? null,
            customEndTime: customEndTime ?? null,
          };
    onSelect(
      buildPanelInput({
        segments: ordered.segments.map((segment, position) => ({ ...segment, position })),
        absenceTypeId: null,
        customStartTime: ordered.customStartTime,
        customEndTime: ordered.customEndTime,
      }),
      seriesId ? seriesScope : undefined,
    );
    if (segments.length > 0) setShowPicker(false);
  }

  // When shift is cleared externally, return to picker
  useEffect(() => {
    if (typeof currentShift !== "string" || !currentShift || currentShift === "OFF") {
      setShowPicker(true);
    }
  }, [currentShift]);

  // activeTab is internal-only (no visible tab bar); used for single-shift indicator context.
  const primaryFocusAreaId = modal.empFocusAreaIds[0] ?? 0;
  const [activeTab] = useState<number>(primaryFocusAreaId);

  const currentLabels =
    typeof currentShift === "string" && currentShift
      ? currentShift.split("/").filter((l) => l !== "OFF")
      : [];

  // Item 50c: the absence beside the shifts records that someone left early or
  // arrived late. The session keeps the shifts as they were before the absence
  // cut them, so a shift taken off comes back when the time moves.
  const storedAbsenceTimes: ClockRange | null =
    currentRestOfDayAbsenceStartTime && currentRestOfDayAbsenceEndTime
      ? { start: currentRestOfDayAbsenceStartTime, end: currentRestOfDayAbsenceEndTime }
      : null;

  function segmentsKey(segments: readonly Pick<ShiftJobSegment, "shiftId" | "jobId">[]): string {
    return segments.map((segment) => `${segment.shiftId ?? "-"}:${segment.jobId}`).join(",");
  }

  function assignmentAt(index: number): AssignmentDefinition | undefined {
    const id = currentAssignmentIds[index];
    return id != null
      ? assignments.find((candidate) => candidate.id === id)
      : assignments.find((candidate) => candidate.label === currentLabels[index]);
  }

  /** The cell's shifts with their scheduled and custom times, or null when one has no times. */
  function currentAbsenceBaseShifts() {
    const count = currentSegments.length;
    const starts = parseMultiTimes(customStartTime, count);
    const ends = parseMultiTimes(customEndTime, count);
    const shifts = currentSegments.map((_, index) => {
      const { start, end } = resolveDefaultTimes(assignmentAt(index));
      return start && end
        ? {
            scheduled: { start: normalizeTime(start), end: normalizeTime(end) },
            customStart: starts[index] ? normalizeTime(starts[index]) : null,
            customEnd: ends[index] ? normalizeTime(ends[index]) : null,
          }
        : null;
    });
    return count > 0 && shifts.every((shift) => shift != null) ? shifts : null;
  }

  interface AbsenceSession {
    side: AbsenceSide;
    at: string | null;
    base: AbsenceBase;
    segments: ShiftJobSegment[];
    names: string[];
    /** The shifts this session last wrote; any other change starts a new session. */
    plannedKey: string;
  }

  function absenceSessionFromCell(
    side?: AbsenceSide,
    absence: ClockRange | null = storedAbsenceTimes,
  ): AbsenceSession | null {
    const shifts = currentAbsenceBaseShifts();
    if (!shifts) return null;
    const chosenSide =
      side ??
      absenceSideOf(absence, {
        start: effectiveRange(shifts[0]).start,
        end: effectiveRange(shifts[shifts.length - 1]).end,
      });
    const { base, at } = absenceBaseFromCell({ shifts, side: chosenSide, absence });
    return {
      side: chosenSide,
      at,
      base,
      segments: currentSegments.map((segment) => ({ ...segment })),
      names: currentSegments.map(
        (segment, index) =>
          assignmentAt(index)?.name || segment.shiftName || currentLabels[index] || "",
      ),
      plannedKey: segmentsKey(currentSegments),
    };
  }

  const [absenceSessionState, setAbsenceSession] = useState<AbsenceSession | null>(() =>
    currentRestOfDayAbsenceTypeId != null ? absenceSessionFromCell() : null,
  );
  const absenceSession =
    currentRestOfDayAbsenceTypeId == null
      ? null
      : absenceSessionState && absenceSessionState.plannedKey === segmentsKey(currentSegments)
        ? absenceSessionState
        : absenceSessionFromCell(absenceSessionState?.side);
  const absenceCell = absenceSession
    ? planAbsenceCell(absenceSession.base, absenceSession.side, absenceSession.at)
    : null;

  /** Writes the session's plan to the draft: the shifts kept, the cut, and the absence's times. */
  function applyAbsence(
    session: AbsenceSession,
    next: { side: AbsenceSide; at: string | null; base?: AbsenceBase; absenceTypeId?: number },
  ) {
    const base = next.base ?? session.base;
    const cell = planAbsenceCell(base, next.side, next.at);
    const kept = cell.kept ?? base.shifts.map((shift, index) => ({ index, ...shift }));
    const segments = kept.map(({ index }, position) => ({ ...session.segments[index], position }));
    setAbsenceSession({
      ...session,
      side: next.side,
      at: next.at,
      base,
      plannedKey: segmentsKey(segments),
    });
    onSelect(
      buildPanelInput({
        segments,
        absenceTypeId: null,
        customStartTime: joinMultiTimes(kept.map((shift) => shift.customStart)),
        customEndTime: joinMultiTimes(kept.map((shift) => shift.customEnd)),
        restOfDayAbsenceTypeId: next.absenceTypeId ?? currentRestOfDayAbsenceTypeId,
        absenceTimes: cell.plan.absence,
      }),
      seriesId ? seriesScope : undefined,
    );
  }

  /** Adds an absence beside the shifts, left early at the last shift's recorded end if any. */
  function startAbsence(absenceTypeId: number) {
    const session = absenceSessionFromCell("left-early", null);
    if (!session) {
      onSelect(
        buildPanelInput({
          segments: currentSegments,
          absenceTypeId: null,
          customStartTime: customStartTime ?? null,
          customEndTime: customEndTime ?? null,
          restOfDayAbsenceTypeId: absenceTypeId,
          absenceTimes: null,
        }),
        seriesId ? seriesScope : undefined,
      );
      return;
    }
    // A shift worked to its scheduled end leaves the absence nothing to cover,
    // so the time starts unset unless an earlier one is recorded (item 50a).
    const last = session.base.shifts[session.base.shifts.length - 1];
    const at = session.at && session.at !== last.scheduled.end ? session.at : null;
    applyAbsence(session, { side: "left-early", at, absenceTypeId });
  }

  /** A shift's own time editor, beside an absence: the cut edge moves the absence's time. */
  function editShiftTimesBesideAbsence(
    keptPosition: number,
    start: string | null,
    end: string | null,
  ) {
    if (!absenceSession || !absenceCell) return false;
    const index = absenceCell.kept ? absenceCell.kept[keptPosition]?.index : keptPosition;
    if (index == null) return false;
    const shifts = absenceSession.base.shifts.map((shift) => ({ ...shift }));
    const shift = shifts[index];
    let at = absenceSession.at;
    if (absenceCell.kept && index === absenceCell.plan.cutIndex) {
      if (absenceSession.side === "left-early") {
        at = end ?? shift.scheduled.end;
        shifts[index] = { ...shift, customStart: start, customEnd: null };
      } else {
        at = start ?? shift.scheduled.start;
        shifts[index] = { ...shift, customStart: null, customEnd: end };
      }
    } else {
      shifts[index] = { ...shift, customStart: start, customEnd: end };
    }
    applyAbsence(absenceSession, {
      side: absenceSession.side,
      at,
      base: { ...absenceSession.base, shifts },
    });
    return true;
  }

  function getSegmentSortTime(segment: ShiftJobSegment): string {
    return segment.startTime ?? "99:99:99";
  }

  function getRequestSegmentOptions(segments: ShiftJobSegment[]) {
    return segments
      .map((segment, originalIndex) => ({ segment, originalIndex }))
      .sort((left, right) => {
        const timeComparison = getSegmentSortTime(left.segment).localeCompare(
          getSegmentSortTime(right.segment),
        );
        return timeComparison === 0 ? left.originalIndex - right.originalIndex : timeComparison;
      })
      .map(({ segment }, index) => ({ segment, segmentIndex: index }));
  }

  function getSpelledOutSegmentLabel(segment: ShiftJobSegment, fallbackLabel: string): string {
    const explicitShiftName = segment.shiftName?.trim();
    if (explicitShiftName) {
      return explicitShiftName;
    }

    const assignment =
      (segment.assignmentId != null
        ? assignments.find((candidate) => candidate.id === segment.assignmentId)
        : null) ??
      assignments.find(
        (candidate) =>
          (candidate.shiftId ?? candidate.categoryId ?? null) === (segment.shiftId ?? null) &&
          candidate.jobId === segment.jobId,
      ) ??
      null;
    const shiftId = segment.shiftId ?? assignment?.shiftId ?? assignment?.categoryId ?? null;
    const shift =
      shiftId != null
        ? (shiftCategories.find((candidate) => candidate.id === shiftId) ?? null)
        : null;

    if (shift?.name?.trim()) {
      return shift.name;
    }

    const job =
      segment.jobId != null
        ? (jobs.find((candidate) => candidate.id === segment.jobId) ?? null)
        : null;

    return (
      segment.jobName?.trim() ||
      job?.name?.trim() ||
      assignment?.name?.trim() ||
      segment.label?.trim() ||
      fallbackLabel
    );
  }

  function getRequestSegmentLabel(
    segments: ShiftJobSegment[],
    segmentIndex: number,
    fallbackLabel: string,
  ): string {
    const option =
      getRequestSegmentOptions(segments)[segmentIndex] ??
      getRequestSegmentOptions(segments)[0] ??
      null;
    if (!option) return fallbackLabel;
    const label = getSpelledOutSegmentLabel(option.segment, fallbackLabel);
    const timeLabel =
      option.segment.startTime && option.segment.endTime
        ? `${fmt12h(option.segment.startTime)} - ${fmt12h(option.segment.endTime)}`
        : null;
    return timeLabel ? `${label} (${timeLabel})` : label;
  }

  const requesterSegmentOptions = getRequestSegmentOptions(currentSegments);
  const isRequesterSegmentStarted = useCallback(
    (segmentIndex: number): boolean =>
      Boolean(isShiftSegmentStarted?.(modal.empId, modal.date, segmentIndex)),
    [isShiftSegmentStarted, modal.date, modal.empId],
  );
  const firstRequestableRequesterSegmentIndex =
    requesterSegmentOptions.find((option) => !isRequesterSegmentStarted(option.segmentIndex))
      ?.segmentIndex ?? 0;
  const requesterSegmentIndexForRequest =
    requesterSegmentOptions.length > 1 ? selectedRequesterSegmentIndex : undefined;

  function resolveShiftPreview(
    codeId?: number | null,
    fallbackLabel?: string | null,
    displayMode: ShiftDisplayMode = shiftDisplayMode,
  ) {
    const assignment =
      (codeId != null ? assignments.find((candidate) => candidate.id === codeId) : undefined) ??
      assignments.find(
        (candidate) => candidate.label === fallbackLabel || candidate.name === fallbackLabel,
      ) ??
      null;

    if (!assignment) {
      return {
        assignment: null,
        displayParts: {
          primaryLabel: fallbackLabel ?? "",
          secondaryLabel: null,
        },
      };
    }

    const shiftCategoryId = assignment.shiftId ?? assignment.categoryId ?? null;
    const shiftCategory =
      shiftCategoryId != null
        ? (shiftCategories.find((category) => category.id === shiftCategoryId) ?? null)
        : null;
    const job =
      assignment.jobId != null
        ? (jobs.find((candidate) => candidate.id === assignment.jobId) ?? null)
        : null;

    return {
      assignment,
      displayParts: buildShiftDisplayParts({
        shift: shiftCategory,
        job,
        assignment,
        shiftDisplayMode: displayMode,
      }),
    };
  }

  function formatPreviewLabel(input: {
    primaryLabel: string;
    secondaryLabel: string | null;
  }): string {
    return input.secondaryLabel
      ? `${input.primaryLabel} · ${input.secondaryLabel}`
      : input.primaryLabel;
  }

  const requesterSwapShiftLabel = useMemo(() => {
    const currentShiftDetailLabels = currentLabels
      .map((label, index) =>
        formatPreviewLabel(
          resolveShiftPreview(currentAssignmentIds[index], label, "name").displayParts,
        ),
      )
      .filter((label) => label.trim().length > 0);

    if (currentShiftDetailLabels.length > 0) {
      return currentShiftDetailLabels.join(" / ");
    }

    return getSwapShiftLabel(modal.empId, modal.date) || requesterShiftLabel;
  }, [
    currentAssignmentIds,
    currentLabels,
    getSwapShiftLabel,
    modal.date,
    modal.empId,
    requesterShiftLabel,
  ]);
  const selectedRequesterLabel =
    requesterSegmentOptions.length > 1
      ? getRequestSegmentLabel(
          currentSegments,
          selectedRequesterSegmentIndex,
          requesterSwapShiftLabel || requesterShiftLabel || "assigned",
        )
      : requesterSwapShiftLabel || requesterShiftLabel || "assigned";

  function getAssignmentDefinitionStyle(label: string, codeId?: number) {
    if (codeId != null) {
      const byId = assignments.find((st) => st.id === codeId);
      if (byId) return byId;
    }
    return (
      assignments.find((st) => st.label === label) ?? {
        color: "var(--dg-color-bg)",
        border: "var(--dg-color-border)",
        text: "var(--dg-color-text-muted)",
      }
    );
  }

  const sectionLabel: React.CSSProperties = {
    marginBottom: 8,
    fontSize: "var(--dg-type-content-group-heading-size)",
    fontWeight: "var(--dg-type-content-group-heading-weight)",
    color: "var(--dg-type-content-group-heading-color)",
    letterSpacing: "var(--dg-type-content-group-heading-letter-spacing)",
    lineHeight: "var(--dg-type-content-group-heading-line-height)",
  };

  const hasSwapTimeConflict = useCallback(
    (targetEmpId: string, targetDate: string): boolean => {
      if (!getShiftTimeRanges) return false;

      const viewDateObj = new Date(`${targetDate}T00:00:00`);
      const requestDateObj = new Date(`${requestShiftDate}T00:00:00`);

      if (targetDate === requestShiftDate) {
        const requesterTimes = getShiftTimeRanges(modal.empId, requestDateObj);
        const targetTimes = getShiftTimeRanges(targetEmpId, viewDateObj);
        return timesOverlap(requesterTimes, targetTimes);
      }

      // Mirrors `swap_request_conflict` (migration 026): time off on the day a
      // shift would move to blocks the swap, as does overlapping work.
      if (
        getAbsenceTypeIdForKey?.(modal.empId, viewDateObj) != null ||
        getAbsenceTypeIdForKey?.(targetEmpId, requestDateObj) != null
      ) {
        return true;
      }

      const requesterExisting = getShiftTimeRanges(modal.empId, viewDateObj);
      if (requesterExisting.length > 0) {
        const incoming = getShiftTimeRanges(targetEmpId, viewDateObj);
        if (timesOverlap(requesterExisting, incoming)) {
          return true;
        }
      }

      const targetExisting = getShiftTimeRanges(targetEmpId, requestDateObj);
      if (targetExisting.length > 0) {
        const incoming = getShiftTimeRanges(modal.empId, requestDateObj);
        if (timesOverlap(targetExisting, incoming)) {
          return true;
        }
      }

      return false;
    },
    [getAbsenceTypeIdForKey, getShiftTimeRanges, modal.empId, requestShiftDate],
  );

  const canWorkRequiredFocusAreas = useCallback(
    (employeeFocusAreaIds: number[], requiredFocusAreaIds: number[]) => {
      if (requiredFocusAreaIds.length === 0) {
        return true;
      }

      return requiredFocusAreaIds.every((focusAreaId) =>
        employeeFocusAreaIds.includes(focusAreaId),
      );
    },
    [],
  );

  const getSwapTimeLabel = useCallback(
    (employeeId: string, date: Date) => {
      const ranges = getShiftTimeRanges?.(employeeId, date) ?? [];
      if (ranges.length === 0) {
        return null;
      }

      return ranges.map((range) => formatTimeRangeLabel(range)).join(" / ");
    },
    [getShiftTimeRanges],
  );

  const getSwapFocusAreaLabel = useCallback(
    (employeeId: string, date: Date) => {
      const focusAreaIds = getShiftFocusAreaIds?.(employeeId, date) ?? [];
      const names = focusAreaIds
        .map((focusAreaId) => focusAreaNameById.get(focusAreaId) ?? null)
        .filter((name): name is string => Boolean(name));

      if (names.length === 0) {
        return null;
      }

      return names.join(" / ");
    },
    [focusAreaNameById, getShiftFocusAreaIds],
  );
  const requesterSwapTimeLabel = getSwapTimeLabel(modal.empId, modal.date);
  const requesterSwapFocusAreaLabel = getSwapFocusAreaLabel(modal.empId, modal.date);

  const getFallbackRequiredFocusAreaIds = useCallback(
    (assignmentIds: number[]) => {
      const focusAreaIds = new Set<number>();

      for (const assignmentId of assignmentIds) {
        const assignment = assignments.find((item) => item.id === assignmentId);
        if (assignment?.focusAreaId != null) {
          focusAreaIds.add(assignment.focusAreaId);
        }
      }

      return [...focusAreaIds];
    },
    [assignments],
  );

  const getEligibleSwapEmployeesForDate = useCallback(
    (date: string) => {
      if (!canRenderSwap || !isRequestableShift) {
        return [];
      }

      if (date < todayIso()) {
        return [];
      }

      const viewDateObj = new Date(`${date}T00:00:00`);
      const requestDateObj = new Date(`${requestShiftDate}T00:00:00`);
      const requesterShiftFocusAreaIds =
        getShiftFocusAreaIds?.(modal.empId, requestDateObj) ??
        getFallbackRequiredFocusAreaIds(currentAssignmentIds);

      return employees.filter((employee) => {
        const targetShiftFocusAreaIds = getShiftFocusAreaIds?.(employee.id, viewDateObj) ?? [];

        return (
          employee.id !== modal.empId &&
          !employee.archivedAt &&
          employee.status === "active" &&
          isRequestableShift(employee.id, viewDateObj) &&
          !isShiftStarted?.(employee.id, viewDateObj) &&
          canWorkRequiredFocusAreas(modal.empFocusAreaIds, targetShiftFocusAreaIds) &&
          canWorkRequiredFocusAreas(employee.focusAreaIds, requesterShiftFocusAreaIds) &&
          !hasSwapTimeConflict(employee.id, date)
        );
      });
    },
    [
      canRenderSwap,
      canWorkRequiredFocusAreas,
      currentAssignmentIds,
      employees,
      getFallbackRequiredFocusAreaIds,
      getShiftFocusAreaIds,
      hasSwapTimeConflict,
      isRequestableShift,
      isShiftStarted,
      modal.empFocusAreaIds,
      modal.empId,
      requestShiftDate,
    ],
  );

  const swapNavigationDates = useMemo(() => {
    const loadedDates = [...new Set(availableSwapDates ?? [])]
      .filter((date) => date >= todayIso())
      .sort();

    return loadedDates.length > 0
      ? loadedDates
      : getWeekDates(getCalendarWeekStart(requestShiftDate));
  }, [availableSwapDates, requestShiftDate]);
  const eligibleSwapWeekStarts = useMemo(() => {
    const seen = new Set<string>();
    const weekStarts: string[] = [];

    for (const date of swapNavigationDates) {
      if (getEligibleSwapEmployeesForDate(date).length === 0) {
        continue;
      }

      const weekStart = getCalendarWeekStart(date);
      if (!seen.has(weekStart)) {
        seen.add(weekStart);
        weekStarts.push(weekStart);
      }
    }

    return weekStarts.sort();
  }, [getEligibleSwapEmployeesForDate, requestShiftDate, swapNavigationDates]);
  const previousEligibleSwapWeekStart =
    [...eligibleSwapWeekStarts].reverse().find((weekStart) => weekStart < swapWeekStartDate) ??
    null;
  const nextEligibleSwapWeekStart =
    eligibleSwapWeekStarts.find((weekStart) => weekStart > swapWeekStartDate) ?? null;
  const swapWeekDates = useMemo(() => getWeekDates(swapWeekStartDate), [swapWeekStartDate]);
  const swapWeekCounts = useMemo(
    () =>
      new Map(swapWeekDates.map((date) => [date, getEligibleSwapEmployeesForDate(date).length])),
    [getEligibleSwapEmployeesForDate, swapWeekDates],
  );
  const firstEligibleSwapDate = useMemo(
    () =>
      swapWeekDates.find((date) => (swapWeekCounts.get(date) ?? 0) > 0) ??
      swapWeekDates[0] ??
      requestShiftDate,
    [requestShiftDate, swapWeekCounts, swapWeekDates],
  );
  const swapViewDateIsInWeek = swapWeekDates.includes(swapViewDate);
  const activeSwapViewDate =
    hasExplicitSwapDateSelection && swapViewDateIsInWeek ? swapViewDate : firstEligibleSwapDate;
  const eligibleSwapEmployees = useMemo(
    () => getEligibleSwapEmployeesForDate(activeSwapViewDate),
    [activeSwapViewDate, getEligibleSwapEmployeesForDate],
  );

  const getTargetedPickupTargetsForDate = useCallback(
    (date: string) => {
      if (!getAbsenceTypeIdForKey) {
        return [];
      }

      const requestDateObj = new Date(`${date}T00:00:00`);
      const requesterShiftFocusAreaIds =
        getShiftFocusAreaIds?.(modal.empId, requestDateObj) ??
        getFallbackRequiredFocusAreaIds(currentAssignmentIds);

      return employees
        .flatMap((employee) => {
          const absenceTypeId = getAbsenceTypeIdForKey(employee.id, requestDateObj);
          if (
            employee.id === modal.empId ||
            employee.archivedAt ||
            employee.status !== "active" ||
            absenceTypeId == null ||
            !canWorkRequiredFocusAreas(employee.focusAreaIds, requesterShiftFocusAreaIds)
          ) {
            return [];
          }

          const absenceType =
            absenceTypes.find((candidate) => candidate.id === absenceTypeId) ?? null;

          return [
            {
              employee,
              absenceType,
              absenceTypeId,
              absenceTypeLabel: getAbsenceTypeDisplayName(absenceType),
            },
          ];
        })
        .sort((left, right) => {
          const seniorityComparison =
            (left.employee.seniority ?? Number.MAX_SAFE_INTEGER) -
            (right.employee.seniority ?? Number.MAX_SAFE_INTEGER);

          if (seniorityComparison !== 0) {
            return seniorityComparison;
          }

          return `${left.employee.firstName} ${left.employee.lastName}`.localeCompare(
            `${right.employee.firstName} ${right.employee.lastName}`,
          );
        });
    },
    [
      absenceTypes,
      canWorkRequiredFocusAreas,
      currentAssignmentIds,
      employees,
      getAbsenceTypeIdForKey,
      getFallbackRequiredFocusAreaIds,
      getShiftFocusAreaIds,
      modal.empId,
    ],
  );
  const targetedPickupTargets = useMemo(
    () => getTargetedPickupTargetsForDate(requestShiftDate),
    [getTargetedPickupTargetsForDate, requestShiftDate],
  );

  function resetSwapSelection(nextDate: string = requestShiftDate) {
    setSwapViewDate(nextDate);
    setHasExplicitSwapDateSelection(false);
    setSwapWeekStartDate(getCalendarWeekStart(nextDate));
    setSelectedSwapTarget(null);
  }

  function openRequestMode(nextMode: "coverage" | "swap") {
    setPendingRequestConfirmation(null);
    setActiveRequestMode(nextMode);
    setSelectedRequesterSegmentIndex(firstRequestableRequesterSegmentIndex);
    if (nextMode !== "coverage") {
      setShowCoverageCalloffOptions(false);
      setShowPickupTargetOptions(false);
    }
    if (nextMode !== "swap") {
      resetSwapSelection();
    }
  }

  function closeRequestSection() {
    setPendingRequestConfirmation(null);
    setShowCoverageCalloffOptions(false);
    setShowPickupTargetOptions(false);
    resetSwapSelection();
    if (requestOnlyMode) {
      close();
      return;
    }
    setActiveRequestMode(null);
  }

  function handleSwapWeek(delta: 1 | -1) {
    const nextWeekStart = delta < 0 ? previousEligibleSwapWeekStart : nextEligibleSwapWeekStart;

    if (!nextWeekStart) {
      return;
    }

    const firstEligibleDate =
      getWeekDates(nextWeekStart).find(
        (date) => getEligibleSwapEmployeesForDate(date).length > 0,
      ) ?? nextWeekStart;

    setSwapWeekStartDate(nextWeekStart);
    setSwapViewDate(firstEligibleDate);
    setHasExplicitSwapDateSelection(false);
    setSelectedSwapTarget(null);
  }

  function handleSwapDateSelect(date: string) {
    setSwapViewDate(date);
    setHasExplicitSwapDateSelection(true);
    setSelectedSwapTarget(null);
  }

  function handleSelectSwapEmployee(employee: Employee, targetSegmentIndex?: number) {
    if (!shiftForKey) return;

    const dateObj = new Date(`${activeSwapViewDate}T00:00:00`);
    const targetSegments = getShiftSegments?.(employee.id, dateObj) ?? [];
    const targetLabel =
      targetSegmentIndex != null
        ? getRequestSegmentLabel(
            targetSegments,
            targetSegmentIndex,
            getSwapShiftLabel(employee.id, dateObj),
          )
        : getSwapShiftLabel(employee.id, dateObj);
    setSelectedSwapTarget({
      empId: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      shiftLabel: targetLabel,
      timeLabel: getSwapTimeLabel(employee.id, dateObj),
      focusAreaLabel: getSwapFocusAreaLabel(employee.id, dateObj),
      targetSegmentIndex,
    });
  }

  function handleSubmitSwap() {
    if (!selectedSwapTarget || !onSubmitSwap) return;
    setPendingRequestConfirmation({
      kind: "swap",
      targetEmpId: selectedSwapTarget.empId,
      targetShiftDate: activeSwapViewDate,
      targetName: selectedSwapTarget.name,
      targetShiftLabel: selectedSwapTarget.shiftLabel,
      requesterSegmentIndex: requesterSegmentIndexForRequest,
      targetSegmentIndex: selectedSwapTarget.targetSegmentIndex,
    });
  }

  function didRequestActionComplete(result: unknown) {
    return result !== false && result !== null;
  }

  async function confirmPendingRequest() {
    if (!pendingRequestConfirmation || isSubmittingRequestConfirmation) return;

    const requestToConfirm = pendingRequestConfirmation;
    setIsSubmittingRequestConfirmation(true);

    try {
      if (requestToConfirm.kind === "pickup") {
        let result: unknown;
        if (requestToConfirm.requesterSegmentIndex != null) {
          result = await onMakeAvailable?.({
            requesterSegmentIndex: requestToConfirm.requesterSegmentIndex,
          });
        } else {
          result = await onMakeAvailable?.();
        }
        if (didRequestActionComplete(result)) {
          setPendingRequestConfirmation(null);
        }
        return;
      }

      if (requestToConfirm.kind === "targeted_pickup") {
        const result = await onMakeAvailable?.({
          targetEmpId: requestToConfirm.targetEmpId,
          targetShiftDate: requestShiftDate,
          absenceTypeId: requestToConfirm.absenceType.id,
          ...(requestToConfirm.requesterSegmentIndex != null
            ? { requesterSegmentIndex: requestToConfirm.requesterSegmentIndex }
            : {}),
        });
        if (didRequestActionComplete(result)) {
          setPendingRequestConfirmation(null);
        }
        return;
      }

      if (requestToConfirm.kind === "calloff") {
        let result: unknown;
        if (requestToConfirm.requesterSegmentIndex != null) {
          result = await onCallOff?.(requestToConfirm.absenceType, {
            requesterSegmentIndex: requestToConfirm.requesterSegmentIndex,
          });
        } else {
          result = await onCallOff?.(requestToConfirm.absenceType);
        }
        if (didRequestActionComplete(result)) {
          setPendingRequestConfirmation(null);
        }
        return;
      }

      const swapOptions =
        requestToConfirm.requesterSegmentIndex != null ||
        requestToConfirm.targetSegmentIndex != null
          ? {
              requesterSegmentIndex: requestToConfirm.requesterSegmentIndex,
              targetSegmentIndex: requestToConfirm.targetSegmentIndex,
            }
          : undefined;
      if (swapOptions) {
        const result = await onSubmitSwap?.(
          requestToConfirm.targetEmpId,
          requestToConfirm.targetShiftDate,
          swapOptions,
        );
        if (didRequestActionComplete(result)) {
          setPendingRequestConfirmation(null);
        }
      } else {
        const result = await onSubmitSwap?.(
          requestToConfirm.targetEmpId,
          requestToConfirm.targetShiftDate,
        );
        if (didRequestActionComplete(result)) {
          setPendingRequestConfirmation(null);
        }
      }
    } finally {
      setIsSubmittingRequestConfirmation(false);
    }
  }

  function renderPendingRequestConfirmation() {
    if (!pendingRequestConfirmation) return null;

    return (
      <ConfirmDialog
        title={
          pendingRequestConfirmation.kind === "pickup"
            ? `Offer your ${selectedRequesterLabel} shift on ${formatDate(modal.date)} for pickup?`
            : pendingRequestConfirmation.kind === "targeted_pickup"
              ? `Request pickup of your ${selectedRequesterLabel} shift on ${formatDate(modal.date)}?`
              : pendingRequestConfirmation.kind === "calloff"
                ? `Submit a call off for your ${selectedRequesterLabel} shift on ${formatDate(modal.date)}?`
                : `Request a swap of your ${selectedRequesterLabel} shift on ${formatDate(modal.date)}?`
        }
        message={
          pendingRequestConfirmation.kind === "pickup"
            ? undefined
            : pendingRequestConfirmation.kind === "targeted_pickup"
              ? `The person you chose is asked to pick it up. Your absence for that shift is ${getAbsenceTypeDisplayName(pendingRequestConfirmation.absenceType)}.`
              : pendingRequestConfirmation.kind === "calloff"
                ? `It's requested as ${indefiniteArticle(getAbsenceTypeDisplayName(pendingRequestConfirmation.absenceType))} ${getAbsenceTypeDisplayName(pendingRequestConfirmation.absenceType)} absence.`
                : `In return you'd get the other person's ${pendingRequestConfirmation.targetShiftLabel || "selected"} shift on ${formatDate(new Date(`${pendingRequestConfirmation.targetShiftDate}T00:00:00`))}.`
        }
        confirmLabel={
          pendingRequestConfirmation.kind === "pickup"
            ? "Offer for pickup"
            : pendingRequestConfirmation.kind === "targeted_pickup"
              ? "Request pickup"
              : pendingRequestConfirmation.kind === "calloff"
                ? "Submit call off"
                : "Submit swap"
        }
        variant={pendingRequestConfirmation.kind === "calloff" ? "danger" : "info"}
        isLoading={isSubmittingRequestConfirmation}
        onConfirm={() => confirmPendingRequest()}
        onCancel={() => {
          if (!isSubmittingRequestConfirmation) {
            setPendingRequestConfirmation(null);
          }
        }}
      />
    );
  }

  function renderCoverageChooser({ standalone = false }: { standalone?: boolean }) {
    const choiceButtonBaseStyle: React.CSSProperties = {
      width: "100%",
      borderRadius: "var(--dg-radius-xl)",
      padding: "15px 16px",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: 8,
      fontFamily: "inherit",
      textAlign: "left",
      whiteSpace: "normal",
      cursor: "pointer",
      background: "var(--dg-color-surface)",
      border: "1px solid var(--dg-color-border)",
      position: "relative",
    };

    const choiceTitleStyle: React.CSSProperties = {
      fontSize: "var(--dg-fs-label)",
      fontWeight: 700,
      lineHeight: 1.2,
      color: "var(--dg-color-text-primary)",
    };

    const choiceBodyStyle: React.CSSProperties = {
      fontSize: "var(--dg-fs-body-sm)",
      color: "var(--dg-color-text-secondary)",
      lineHeight: 1.5,
    };

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minHeight: 0,
          ...(standalone ? { flex: 1 } : null),
        }}
      >
        {!standalone && <div style={sectionLabel}>Drop shift</div>}
        <div
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--dg-color-text-secondary)",
            lineHeight: 1.5,
          }}
        >
          Choose how you want to drop this shift.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Button
            type="button"
            data-tour="edit-panel-coverage-pickup-btn"
            onClick={() => {
              setShowCoverageCalloffOptions(false);
              setShowPickupTargetOptions(true);
            }}
            disabled={!onMakeAvailable}
            style={{
              ...choiceButtonBaseStyle,
              borderColor: showPickupTargetOptions
                ? "var(--dg-color-brand)"
                : "var(--dg-color-border)",
              background: showPickupTargetOptions
                ? "var(--dg-color-bg-secondary)"
                : "var(--dg-color-surface)",
              opacity: onMakeAvailable ? 1 : 0.6,
              cursor: onMakeAvailable ? "pointer" : "not-allowed",
            }}
          >
            {showPickupTargetOptions ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: "var(--dg-color-brand)",
                  color: "var(--dg-color-text-inverse)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                }}
              >
                <Check size={13} strokeWidth={3} />
              </span>
            ) : null}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 260,
                overflowY: "auto",
                paddingRight: 28,
              }}
            >
              <div style={choiceTitleStyle}>Offer for pickup</div>
              <div style={choiceBodyStyle}>
                Post the shift for teammates to claim. It stays yours unless someone claims it and
                approval completes.
              </div>
            </div>
          </Button>

          <Button
            type="button"
            data-tour="edit-panel-coverage-calloff-btn"
            onClick={() => {
              if (activeAbsenceTypes.length === 0) return;
              setShowPickupTargetOptions(false);
              setShowCoverageCalloffOptions(true);
            }}
            disabled={!onCallOff || activeAbsenceTypes.length === 0}
            style={{
              ...choiceButtonBaseStyle,
              borderColor: "var(--dg-color-danger-border)",
              background: showCoverageCalloffOptions
                ? "var(--dg-color-danger-bg)"
                : "var(--dg-color-surface)",
              cursor: onCallOff && activeAbsenceTypes.length > 0 ? "pointer" : "not-allowed",
              opacity: onCallOff && activeAbsenceTypes.length > 0 ? 1 : 0.6,
            }}
          >
            {showCoverageCalloffOptions ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: "var(--dg-color-danger-text)",
                  color: "var(--dg-color-text-inverse)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                }}
              >
                <Check size={13} strokeWidth={3} />
              </span>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  ...choiceTitleStyle,
                  color: "var(--dg-color-danger-text)",
                  paddingRight: 28,
                }}
              >
                Call off
              </div>
              <div style={choiceBodyStyle}>
                Use this when you cannot work the shift yourself. Approval records the absence and
                opens coverage automatically.
              </div>
            </div>
          </Button>
        </div>

        {activeAbsenceTypes.length === 0 && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "var(--dg-radius-xl)",
              border: "1px solid var(--dg-color-warning-border)",
              background: "var(--dg-color-warning-bg)",
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--dg-color-warning-text)",
              lineHeight: 1.5,
            }}
          >
            Call off is unavailable until at least one active absence type is set up.
          </div>
        )}

        {showPickupTargetOptions && onMakeAvailable && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              ...(standalone ? { flex: 1, minHeight: 0 } : null),
            }}
          >
            <Button
              type="button"
              className="dg-btn dg-btn-primary"
              onClick={() =>
                setPendingRequestConfirmation({
                  kind: "pickup",
                  requesterSegmentIndex: requesterSegmentIndexForRequest,
                })
              }
            >
              Offer to everyone
            </Button>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                ...(standalone ? { flex: 1, minHeight: 0 } : null),
              }}
            >
              <div
                style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                Request specific person
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={choiceBodyStyle}>
                  Only teammates with an absence on this date are shown.
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  border: "1px solid var(--dg-color-border)",
                  borderRadius: "var(--dg-radius-xl)",
                  overflow: "hidden",
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                }}
              >
                {targetedPickupTargets.length === 0 ? (
                  <div
                    style={{
                      padding: "18px 14px",
                      textAlign: "center",
                      color: "var(--dg-color-text-muted)",
                      fontSize: "var(--dg-fs-body-sm)",
                    }}
                  >
                    No absent teammates are available on this date.
                  </div>
                ) : (
                  targetedPickupTargets.map((target, index) => {
                    const { employee } = target;

                    return (
                      <Button
                        key={employee.id}
                        type="button"
                        onClick={() => {
                          setPendingRequestConfirmation({
                            kind: "targeted_pickup",
                            targetEmpId: employee.id,
                            targetName: `${employee.firstName} ${employee.lastName}`,
                            requesterSegmentIndex: requesterSegmentIndexForRequest,
                            absenceType:
                              target.absenceType ??
                              ({
                                id: target.absenceTypeId,
                                label: target.absenceTypeLabel,
                                name: target.absenceTypeLabel,
                                orgId: "",
                                color: "",
                                border: "",
                                text: "",
                                sortOrder: 0,
                              } as AbsenceType),
                          });
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          width: "100%",
                          padding: "12px 14px",
                          border: "none",
                          borderBottom:
                            index < targetedPickupTargets.length - 1
                              ? "1px solid var(--dg-color-border)"
                              : "none",
                          background: "var(--dg-color-surface)",
                          color: "var(--dg-color-text-primary)",
                          fontFamily: "inherit",
                          fontSize: "var(--dg-fs-body-sm)",
                          cursor: "pointer",
                          opacity: 1,
                          textAlign: "left",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {employee.firstName} {employee.lastName}
                        </span>
                        <span
                          style={{
                            color: "var(--dg-color-text-secondary)",
                            fontSize: "var(--dg-fs-caption)",
                            fontWeight: 600,
                            textAlign: "right",
                          }}
                        >
                          {target.absenceTypeLabel}
                        </span>
                      </Button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {showCoverageCalloffOptions && onCallOff && activeAbsenceTypes.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "14px 16px",
              borderRadius: "var(--dg-radius-xl)",
              border: "1px solid var(--dg-color-danger-border)",
              background: "var(--dg-color-surface)",
            }}
          >
            <div
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                color: "var(--dg-color-danger-text)",
              }}
            >
              Select absence reason
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {activeAbsenceTypes.map((at) => (
                <Button
                  key={at.id}
                  type="button"
                  onClick={() =>
                    setPendingRequestConfirmation({
                      kind: "calloff",
                      absenceType: at,
                      requesterSegmentIndex: requesterSegmentIndexForRequest,
                    })
                  }
                  style={{
                    width: "100%",
                    fontSize: "var(--dg-fs-body-sm)",
                    padding: "12px 14px",
                    borderRadius: "var(--dg-radius-xl)",
                    border: "1px solid var(--dg-color-border)",
                    background: "var(--dg-color-surface)",
                    color: "var(--dg-color-text-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    fontWeight: 600,
                    textAlign: "left",
                    fontFamily: "inherit",
                    cursor: "pointer",
                    whiteSpace: "normal",
                  }}
                >
                  <span>{at.name}</span>
                  <span
                    style={{
                      color: "var(--dg-color-text-secondary)",
                      fontSize: "var(--dg-fs-caption)",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {at.label}
                  </span>
                </Button>
              ))}
            </div>
            <Button
              type="button"
              onClick={() => setShowCoverageCalloffOptions(false)}
              className="dg-btn dg-btn-ghost"
              style={{
                width: "100%",
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-subtle)",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              Back
            </Button>
          </div>
        )}

        {!standalone ? (
          <div
            style={{
              position: "sticky",
              bottom: 0,
              marginTop: "auto",
              paddingTop: 12,
              paddingBottom: 2,
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0), var(--dg-color-surface) 28px)",
              zIndex: 1,
            }}
          >
            <Button
              type="button"
              onClick={closeRequestSection}
              className="dg-btn dg-btn-secondary"
              style={{
                width: "100%",
                fontSize: "var(--dg-fs-caption)",
              }}
            >
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderSwapChooser({ standalone = false }: { standalone?: boolean }) {
    const canGoPrev = previousEligibleSwapWeekStart != null;
    const canGoNext = nextEligibleSwapWeekStart != null;
    const swapWeekRangeLabel = formatWeekRangeLabel(swapWeekStartDate);

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {!standalone && <div style={sectionLabel}>Swap</div>}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "var(--dg-radius-xl)",
            border: "1px solid var(--dg-color-border)",
            background: "var(--dg-color-bg-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: "var(--dg-type-field-title-size)",
              fontWeight: "var(--dg-type-field-title-weight)",
              color: "var(--dg-type-field-title-color)",
              letterSpacing: "var(--dg-type-field-title-letter-spacing)",
              lineHeight: "var(--dg-type-field-title-line-height)",
            }}
          >
            Your shift
          </div>
          <MaybeHint content={selectedRequesterLabel} side="bottom">
            <div
              style={{
                fontWeight: 700,
                color: "var(--dg-color-text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {selectedRequesterLabel || "Current shift"}
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--dg-color-text-secondary)",
                  marginLeft: 8,
                }}
              >
                {requestShiftDate}
              </span>
            </div>
          </MaybeHint>
          {requesterSwapTimeLabel || requesterSwapFocusAreaLabel ? (
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-secondary)",
                marginTop: 4,
              }}
            >
              {[requesterSwapTimeLabel, requesterSwapFocusAreaLabel].filter(Boolean).join(" · ")}
            </div>
          ) : null}
        </div>

        {selectedSwapTarget ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "14px 16px",
              borderRadius: "var(--dg-radius-xl)",
              border: "1px solid var(--dg-color-border)",
              background: "var(--dg-color-surface)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "var(--dg-type-field-title-size)",
                  fontWeight: "var(--dg-type-field-title-weight)",
                  color: "var(--dg-type-field-title-color)",
                  letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                  lineHeight: "var(--dg-type-field-title-line-height)",
                  marginBottom: 4,
                }}
              >
                You give
              </div>
              <MaybeHint content={selectedRequesterLabel} side="bottom">
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--dg-color-text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedRequesterLabel || "Current shift"}
                  <span
                    style={{
                      fontWeight: 500,
                      color: "var(--dg-color-text-secondary)",
                      marginLeft: 8,
                    }}
                  >
                    on {requestShiftDate}
                  </span>
                </div>
              </MaybeHint>
              {requesterSwapTimeLabel || requesterSwapFocusAreaLabel ? (
                <div
                  style={{
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-text-secondary)",
                    marginTop: 4,
                  }}
                >
                  {[requesterSwapTimeLabel, requesterSwapFocusAreaLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : null}
            </div>

            <div style={{ borderTop: "1px solid var(--dg-color-border)", paddingTop: 12 }}>
              <div
                style={{
                  fontSize: "var(--dg-type-field-title-size)",
                  fontWeight: "var(--dg-type-field-title-weight)",
                  color: "var(--dg-type-field-title-color)",
                  letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                  lineHeight: "var(--dg-type-field-title-line-height)",
                  marginBottom: 4,
                }}
              >
                You get
              </div>
              <MaybeHint content={selectedSwapTarget.shiftLabel} side="bottom">
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--dg-color-text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedSwapTarget.shiftLabel || "Selected shift"}
                  <span
                    style={{
                      fontWeight: 500,
                      color: "var(--dg-color-text-secondary)",
                      marginLeft: 8,
                    }}
                  >
                    on {activeSwapViewDate}
                  </span>
                </div>
              </MaybeHint>
              <div
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  color: "var(--dg-color-text-muted)",
                  marginTop: 4,
                }}
              >
                from {selectedSwapTarget.name}
              </div>
              {selectedSwapTarget.timeLabel || selectedSwapTarget.focusAreaLabel ? (
                <div
                  style={{
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-text-secondary)",
                    marginTop: 4,
                  }}
                >
                  {[selectedSwapTarget.timeLabel, selectedSwapTarget.focusAreaLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button
                type="button"
                className="dg-btn dg-btn-ghost"
                onClick={() => setSelectedSwapTarget(null)}
              >
                Back
              </Button>
              <Button type="button" className="dg-btn dg-btn-primary" onClick={handleSubmitSwap}>
                Submit Swap Request
              </Button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                Eligible teammates
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "var(--dg-toolbar-h) minmax(130px, 1fr) var(--dg-toolbar-h)",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 240,
                }}
              >
                <Button
                  type="button"
                  className="dg-btn dg-btn-secondary"
                  onClick={() => handleSwapWeek(-1)}
                  disabled={!canGoPrev}
                  aria-label="Go to previous week"
                  style={{
                    minWidth: "var(--dg-toolbar-h)",
                    width: "var(--dg-toolbar-h)",
                    height: "var(--dg-toolbar-h)",
                    padding: 0,
                    borderRadius: "var(--dg-btn-radius)",
                    flexShrink: 0,
                  }}
                >
                  <ChevronLeft aria-hidden="true" focusable="false" size={24} strokeWidth={2.5} />
                </Button>
                <div
                  aria-label={`Current swap week ${swapWeekRangeLabel}`}
                  style={{
                    textAlign: "center",
                    color: "var(--dg-color-text-primary)",
                    fontSize: "var(--dg-fs-body-sm)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {swapWeekRangeLabel}
                </div>
                <Button
                  type="button"
                  className="dg-btn dg-btn-secondary"
                  onClick={() => handleSwapWeek(1)}
                  disabled={!canGoNext}
                  aria-label="Go to next week"
                  style={{
                    minWidth: "var(--dg-toolbar-h)",
                    width: "var(--dg-toolbar-h)",
                    height: "var(--dg-toolbar-h)",
                    padding: 0,
                    borderRadius: "var(--dg-btn-radius)",
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight aria-hidden="true" focusable="false" size={24} strokeWidth={2.5} />
                </Button>
              </div>
            </div>

            <div
              aria-label="Eligible swap dates"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: 6,
              }}
            >
              {swapWeekDates.map((date) => {
                const active = date === activeSwapViewDate;
                const disabled = date < todayIso();
                const count = swapWeekCounts.get(date) ?? 0;

                return (
                  <Button
                    key={date}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSwapDateSelect(date)}
                    aria-pressed={active}
                    aria-label={`Show eligible teammates for ${formatDisplayDate(date)}`}
                    style={{
                      minHeight: 68,
                      borderRadius: "var(--dg-radius-lg)",
                      border: `1px solid ${active ? "var(--dg-color-brand)" : "var(--dg-color-border)"}`,
                      background: active
                        ? "var(--dg-color-bg-secondary)"
                        : "var(--dg-color-surface)",
                      color: active ? "var(--dg-color-brand)" : "var(--dg-color-text-primary)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 3,
                      fontFamily: "inherit",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.45 : 1,
                      padding: "8px 4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--dg-fs-badge)",
                        fontWeight: 700,
                        color: active ? "var(--dg-color-brand)" : "var(--dg-color-text-subtle)",
                        textTransform: "uppercase",
                      }}
                    >
                      {formatDisplayDate(date).split(",")[0]}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--dg-fs-label)",
                        fontWeight: 600,
                      }}
                    >
                      {new Date(`${date}T00:00:00`).getDate()}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                        fontSize: "var(--dg-fs-badge)",
                        fontWeight: 700,
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      <User aria-hidden="true" focusable="false" size={11} strokeWidth={2.4} />
                      {count}
                    </span>
                  </Button>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid var(--dg-color-border)",
                borderRadius: "var(--dg-radius-xl)",
                overflow: "hidden",
                background: "var(--dg-color-surface)",
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              {eligibleSwapEmployees.length === 0 ? (
                <div
                  style={{
                    padding: "22px 16px",
                    textAlign: "center",
                    color: "var(--dg-color-text-muted)",
                    fontSize: "var(--dg-fs-body-sm)",
                    lineHeight: 1.5,
                  }}
                >
                  No eligible employees on this date.
                  <div
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      marginTop: 4,
                      color: "var(--dg-color-text-label)",
                    }}
                  >
                    Try another day.
                  </div>
                </div>
              ) : (
                eligibleSwapEmployees.map((employee, index) => {
                  const dateObj = new Date(`${activeSwapViewDate}T00:00:00`);
                  const targetSegments = getShiftSegments?.(employee.id, dateObj) ?? [];
                  const targetSegmentOptions = getRequestSegmentOptions(targetSegments);
                  const isSplitTarget = targetSegmentOptions.length > 1;
                  const renderTargetOptions = isSplitTarget
                    ? targetSegmentOptions.filter(
                        (option) =>
                          !isShiftSegmentStarted?.(employee.id, dateObj, option.segmentIndex),
                      )
                    : targetSegmentOptions[0]
                      ? isShiftSegmentStarted?.(
                          employee.id,
                          dateObj,
                          targetSegmentOptions[0].segmentIndex,
                        )
                        ? []
                        : [targetSegmentOptions[0]]
                      : [{ segment: null, segmentIndex: undefined }];
                  const targetLabel = getSwapShiftLabel(employee.id, dateObj);
                  const timeLabel = getSwapTimeLabel(employee.id, dateObj);
                  const focusAreaLabel = getSwapFocusAreaLabel(employee.id, dateObj);
                  return renderTargetOptions.map((targetOption) => {
                    const optionLabel =
                      targetOption.segmentIndex != null && isSplitTarget
                        ? getRequestSegmentLabel(
                            targetSegments,
                            targetOption.segmentIndex,
                            targetLabel || "Selected shift",
                          )
                        : targetLabel;

                    return (
                      <Button
                        key={`${employee.id}-${targetOption.segmentIndex ?? "shift"}`}
                        type="button"
                        onClick={() =>
                          handleSelectSwapEmployee(employee, targetOption.segmentIndex)
                        }
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "stretch",
                          gap: 4,
                          width: "100%",
                          padding: "12px 14px",
                          border: "none",
                          borderBottom:
                            index < eligibleSwapEmployees.length - 1
                              ? "1px solid var(--dg-color-border)"
                              : "none",
                          background: "var(--dg-color-surface)",
                          color: "var(--dg-color-text-primary)",
                          fontFamily: "inherit",
                          fontSize: "var(--dg-fs-body-sm)",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {employee.firstName} {employee.lastName}
                        </span>
                        <span
                          style={{
                            color: "var(--dg-color-text-secondary)",
                            fontSize: "var(--dg-fs-caption)",
                            fontWeight: 600,
                          }}
                        >
                          {targetOption.segmentIndex != null && isSplitTarget
                            ? `Shift ${targetOption.segmentIndex + 1}: ${optionLabel}`
                            : optionLabel}
                        </span>
                        {timeLabel || focusAreaLabel ? (
                          <span
                            style={{
                              color: "var(--dg-color-text-muted)",
                              fontSize: "var(--dg-fs-caption)",
                            }}
                          >
                            {[timeLabel, focusAreaLabel].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </Button>
                    );
                  });
                })
              )}
            </div>
          </div>
        )}

        {!standalone ? (
          <Button
            type="button"
            onClick={closeRequestSection}
            className="dg-btn dg-btn-secondary"
            style={{
              width: "100%",
              fontSize: "var(--dg-fs-caption)",
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    );
  }

  function renderRequestControls({ standalone = false }: { standalone?: boolean }) {
    const modeButtonStyle = (
      isActive: boolean,
      tone: "neutral" | "danger" = "neutral",
    ): React.CSSProperties => ({
      flex: 1,
      padding: "10px 12px",
      borderRadius: "var(--dg-radius-lg)",
      border: `1px solid ${
        tone === "danger" && isActive ? "var(--dg-color-danger-border)" : "var(--dg-color-border)"
      }`,
      background:
        tone === "danger" && isActive
          ? "var(--dg-color-danger-bg)"
          : isActive
            ? "var(--dg-color-bg-secondary)"
            : "var(--dg-color-surface)",
      color:
        tone === "danger" && isActive
          ? "var(--dg-color-danger-text)"
          : isActive
            ? "var(--dg-color-text-primary)"
            : "var(--dg-color-text-secondary)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      fontSize: "var(--dg-fs-caption)",
      fontWeight: 700,
      fontFamily: "inherit",
      cursor: "pointer",
    });

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minHeight: 0,
          ...(standalone ? { minHeight: "100%" } : null),
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {canRenderCoverage && (
            <Button
              type="button"
              data-tour="edit-panel-coverage-btn"
              onClick={() => openRequestMode("coverage")}
              style={modeButtonStyle(activeRequestMode === "coverage")}
            >
              Drop shift
            </Button>
          )}
          {canRenderSwap && (
            <Button
              type="button"
              data-tour="edit-panel-swap-btn"
              onClick={() => openRequestMode("swap")}
              style={modeButtonStyle(activeRequestMode === "swap")}
            >
              Swap
            </Button>
          )}
        </div>
        {activeRequestMode && requesterSegmentOptions.length > 1 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "12px 14px",
              borderRadius: "var(--dg-radius-xl)",
              border: "1px solid var(--dg-color-brand)",
              background: "var(--dg-color-bg-secondary)",
            }}
          >
            <div
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 700,
                color: "var(--dg-color-text-primary)",
              }}
            >
              Choose shift
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {requesterSegmentOptions.map((option) => {
                const isStarted = isRequesterSegmentStarted(option.segmentIndex);

                return (
                  <Button
                    key={option.segmentIndex}
                    type="button"
                    disabled={isStarted}
                    onClick={() => setSelectedRequesterSegmentIndex(option.segmentIndex)}
                    aria-pressed={selectedRequesterSegmentIndex === option.segmentIndex}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "var(--dg-radius-lg)",
                      border: `1px solid ${
                        selectedRequesterSegmentIndex === option.segmentIndex
                          ? "var(--dg-color-brand)"
                          : "var(--dg-color-border)"
                      }`,
                      background:
                        selectedRequesterSegmentIndex === option.segmentIndex
                          ? "var(--dg-color-surface)"
                          : "transparent",
                      color: "var(--dg-color-text-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      fontFamily: "inherit",
                      fontSize: "var(--dg-fs-body-sm)",
                      fontWeight: 700,
                      textAlign: "left",
                      cursor: isStarted ? "not-allowed" : "pointer",
                      opacity: isStarted ? 0.55 : 1,
                    }}
                  >
                    <span>
                      Shift {option.segmentIndex + 1}:{" "}
                      {getRequestSegmentLabel(
                        currentSegments,
                        option.segmentIndex,
                        requesterShiftLabel || "assigned",
                      )}
                      {isStarted ? " · In progress" : ""}
                    </span>
                    {selectedRequesterSegmentIndex === option.segmentIndex ? (
                      <span
                        style={{
                          flex: "0 0 auto",
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "var(--dg-color-brand)",
                          color: "var(--dg-color-surface)",
                        }}
                      >
                        <Check aria-hidden="true" size={15} strokeWidth={3} />
                      </span>
                    ) : null}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}
        {activeRequestMode === "coverage" && canRenderCoverage
          ? renderCoverageChooser({ standalone })
          : null}
        {activeRequestMode === "swap" && canRenderSwap ? renderSwapChooser({ standalone }) : null}
      </div>
    );
  }

  function renderNoteDots(activeIds: number[], side: "left" | "right" = "right") {
    if (activeIds.length === 0) return null;
    const activeDots = indicatorTypes.filter((ind) => activeIds.includes(ind.id));
    if (activeDots.length === 0) return null;
    return (
      <div
        style={{
          position: "absolute",
          top: 8,
          ...(side === "left" ? { left: 10 } : { right: 10 }),
          display: "flex",
          gap: 3,
        }}
      >
        {activeDots.map((ind) => (
          <MaybeHint key={ind.name} content={ind.name} side="top">
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isDarkTheme ? toDarkPillColors(ind.color).bg : ind.color,
                border: "1px solid rgba(255,255,255,0.8)",
                flexShrink: 0,
              }}
            />
          </MaybeHint>
        ))}
      </div>
    );
  }

  function renderShiftDiffBadge(badge: ShiftDiffBadgeDescriptor | null, index?: number) {
    if (!badge || (badge.kind === "new" && badge.text === "New")) return null;
    return (
      <span
        data-shift-diff-badge={badge.kind}
        data-shift-diff-index={index != null ? String(index) : undefined}
        style={{
          position: "absolute",
          top: -10,
          left: 12,
          fontSize: "var(--dg-fs-badge)",
          fontWeight: 600,
          letterSpacing: "0.05em",
          background: getPanelDiffBadgeBackground(badge.kind),
          color: "var(--dg-color-text-inverse)",
          borderRadius: 3,
          padding: "3px 8px",
          lineHeight: 1,
          pointerEvents: "none",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          zIndex: 2,
        }}
      >
        {badge.text}
      </span>
    );
  }

  function renderCurrentShiftPill() {
    if (!hasActiveShift || currentLabels.length === 0) return null;
    const noteTypes = getActiveIndicatorIds
      ? getActiveIndicatorIds(activeTab, singleNoteShift)
      : [];
    const cellDiffBadge = panelDiff.cellBadge;
    const cellBorderKind: ShiftDiffBorderKind =
      cellDiffBadge?.kind === "new" ? "new" : cellDiffBadge ? "modified" : null;

    // Absence type pill — use absence type colors directly
    if (isAbsence) {
      const at = absenceTypes.find((a) => a.id === currentAbsenceTypeId);
      if (!at) return null;
      const absenceLabel = at.name || at.label;
      const atResolved = absenceStripeFill(at.color, isDarkTheme);
      return (
        <div
          style={{
            background: atResolved.background,
            border: getPanelDiffBorder({
              diffKind: cellBorderKind,
              fallback: `1.5px solid ${atResolved.border}`,
            }),
            borderRadius: "var(--dg-radius-md)",
            minHeight: 56,
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            marginBottom: 16,
            gap: 2,
          }}
        >
          {renderShiftDiffBadge(cellDiffBadge)}
          <MaybeHint content={absenceLabel} side="top">
            <span
              style={{
                fontWeight: 600,
                fontSize: isNameMode ? "var(--dg-fs-body)" : "var(--dg-fs-card-title)",
                color: atResolved.text,
                lineHeight: isNameMode ? 1.3 : 1.2,
                maxWidth: "90%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textAlign: "center",
                ...(isNameMode
                  ? {
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                      wordBreak: "break-word" as const,
                    }
                  : { whiteSpace: "nowrap" }),
              }}
            >
              {absenceLabel}
            </span>
          </MaybeHint>
          {runDateKeys && (
            <span
              data-absence-run-summary=""
              className="dg-tabular-nums"
              style={{
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 500,
                color: atResolved.text,
                textAlign: "center",
              }}
            >
              {absenceRunSummary(runDateKeys)}
            </span>
          )}
        </div>
      );
    }

    if (currentLabels.length === 1) {
      const preview = resolveShiftPreview(currentAssignmentIds[0], currentLabels[0], "name");
      const s0 =
        preview.assignment ??
        getAssignmentDefinitionStyle(currentLabels[0], currentAssignmentIds[0]);
      const darkS = isDarkTheme ? toDarkPillColors(s0.color) : null;
      const s = { color: darkS?.bg ?? s0.color, text: darkS?.text ?? s0.text };
      const previewLabel = formatPreviewLabel(preview.displayParts);
      const focusAreaLabel =
        preview.assignment?.focusAreaId != null
          ? (focusAreaNameById.get(preview.assignment.focusAreaId) ?? null)
          : null;
      return (
        <div
          style={{
            background: s.color,
            border: getPanelDiffBorder({
              diffKind: cellBorderKind,
              fallback: `1.5px solid ${darkenColor(s.color, 0.25)}`,
            }),
            borderRadius: "var(--dg-radius-md)",
            minHeight: 56,
            padding: isNameMode ? "12px 16px" : "10px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            marginBottom: 16,
            gap: 4,
          }}
        >
          {renderShiftDiffBadge(cellDiffBadge)}
          <MaybeHint content={previewLabel} side="top">
            <span
              style={{
                fontWeight: 600,
                fontSize: isNameMode ? "var(--dg-fs-body)" : "var(--dg-fs-card-title)",
                color: s.text,
                lineHeight: isNameMode ? 1.3 : 1.2,
                maxWidth: "90%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textAlign: "center",
                ...(isNameMode
                  ? {
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                      wordBreak: "break-word" as const,
                    }
                  : { whiteSpace: "nowrap" }),
              }}
            >
              {preview.displayParts.primaryLabel}
            </span>
          </MaybeHint>
          {preview.displayParts.secondaryLabel ? (
            <MaybeHint content={previewLabel} side="top">
              <span
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  color: s.text,
                  opacity: 0.7,
                  lineHeight: 1.3,
                  maxWidth: "90%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {preview.displayParts.secondaryLabel}
              </span>
            </MaybeHint>
          ) : null}
          {focusAreaLabel ? (
            <span
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: s.text,
                opacity: 0.78,
                lineHeight: 1.3,
                maxWidth: "90%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {focusAreaLabel}
            </span>
          ) : null}
          {renderNoteDots(noteTypes)}
        </div>
      );
    }

    // Multi-shift: individual stacked cards, each with its own details & indicators
    return (
      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {currentLabels.map((label, i) => {
          const preview = resolveShiftPreview(currentAssignmentIds[i], label, "name");
          const s0 =
            preview.assignment ?? getAssignmentDefinitionStyle(label, currentAssignmentIds[i]);
          const darkS = isDarkTheme ? toDarkPillColors(s0.color) : null;
          const s = { color: darkS?.bg ?? s0.color, text: darkS?.text ?? s0.text };
          const previewLabel = formatPreviewLabel(preview.displayParts);
          const assignment =
            preview.assignment ??
            (currentAssignmentIds[i] != null
              ? assignments.find((st) => st.id === currentAssignmentIds[i])
              : assignments.find((st) => st.label === label));
          const shiftFaId = assignment?.focusAreaId;
          const focusAreaLabel =
            shiftFaId != null ? (focusAreaNameById.get(shiftFaId) ?? null) : null;
          const shiftWingId = shiftFaId ?? activeTab;
          const cardNoteShift = noteShiftOf(currentSegments[i]);
          const pillNoteTypes = getActiveIndicatorIds
            ? getActiveIndicatorIds(shiftWingId, cardNoteShift)
            : [];
          const pillDiff = panelDiff.pillDiffs[i] ?? {
            borderKind: null,
            badge: null,
          };
          const { start: defaultStart, end: defaultEnd } = resolveDefaultTimes(assignment);
          return (
            <div
              key={label + i}
              data-shift-edit-card={i}
              data-shift-edit-card-diff={pillDiff.borderKind ?? undefined}
              style={{
                border: getPanelDiffBorder({
                  diffKind: pillDiff.borderKind,
                  fallback: `1.5px solid ${darkenColor(s.color, 0.25)}`,
                }),
                borderRadius: shiftEditCardOuterRadius,
                overflow: "visible",
                position: "relative",
                padding: SHIFT_EDIT_CARD_INSET,
                background: "var(--dg-color-surface)",
              }}
            >
              {renderShiftDiffBadge(pillDiff.badge, i)}
              {/* Pill header */}
              <div
                data-shift-edit-card-header={i}
                style={{
                  background: s.color,
                  border: `1px solid ${darkenColor(s.color, 0.2)}`,
                  minHeight: 44,
                  padding: isNameMode ? "10px 12px" : "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: shiftEditCardHeaderRadius,
                  position: "relative",
                  gap: 2,
                }}
              >
                <div
                  style={{ textAlign: "center", maxWidth: "calc(100% - 48px)", overflow: "hidden" }}
                >
                  <MaybeHint content={previewLabel} side="top">
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: isNameMode ? "var(--dg-fs-body-sm)" : "var(--dg-fs-heading)",
                        color: s.text,
                        lineHeight: isNameMode ? 1.3 : 1.2,
                        display: isNameMode ? "-webkit-box" : "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        ...(isNameMode
                          ? {
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical" as const,
                              wordBreak: "break-word" as const,
                            }
                          : { whiteSpace: "nowrap" }),
                      }}
                    >
                      {preview.displayParts.primaryLabel}
                    </span>
                  </MaybeHint>
                  {preview.displayParts.secondaryLabel ? (
                    <MaybeHint content={previewLabel} side="top">
                      <div
                        style={{
                          fontSize: "var(--dg-fs-badge)",
                          color: s.text,
                          opacity: 0.65,
                          lineHeight: 1.3,
                          marginTop: 4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {preview.displayParts.secondaryLabel}
                      </div>
                    </MaybeHint>
                  ) : null}
                  {focusAreaLabel ? (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-badge)",
                        color: s.text,
                        opacity: 0.78,
                        lineHeight: 1.3,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {focusAreaLabel}
                    </div>
                  ) : null}
                </div>
                {renderNoteDots(pillNoteTypes)}
              </div>
              {/* Card body: default time, per-pill custom time editor, + indicators */}
              <div
                data-shift-edit-card-body={i}
                style={{
                  padding: "10px 6px 4px",
                  background: "var(--dg-color-surface)",
                  borderRadius: `0 0 ${shiftEditCardInnerRadius} ${shiftEditCardInnerRadius}`,
                }}
              >
                {allowShiftEdits && currentSegments[i] ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        fontWeight: 700,
                        color: "var(--dg-color-text-secondary)",
                      }}
                    >
                      Mentored
                    </span>
                    <Switch
                      checked={currentSegments[i]?.isMentored === true}
                      onChange={(next) => handleMentoredToggleAtIndex(i, next)}
                      ariaLabel={`Mentored assignment for ${previewLabel}`}
                    />
                  </div>
                ) : null}
                {/* Per-pill custom time editor */}
                {allowShiftEdits &&
                  onCustomTimeChange &&
                  (() => {
                    const pillStarts = parseMultiTimes(customStartTime, currentLabels.length);
                    const pillEnds = parseMultiTimes(customEndTime, currentLabels.length);
                    return (
                      <PillTimeEditor
                        customStart={pillStarts[i]}
                        customEnd={pillEnds[i]}
                        defaultStart={defaultStart}
                        defaultEnd={defaultEnd}
                        minTime={getTimeBounds(assignment).minTime}
                        maxTime={getTimeBounds(assignment).maxTime}
                        onSave={(start, end) => {
                          if (editShiftTimesBesideAbsence(i, start, end)) return;
                          const newStarts = [...pillStarts];
                          const newEnds = [...pillEnds];
                          newStarts[i] = start;
                          newEnds[i] = end;
                          onCustomTimeChange(joinMultiTimes(newStarts), joinMultiTimes(newEnds));
                        }}
                        onRemove={() => {
                          if (editShiftTimesBesideAbsence(i, null, null)) return;
                          const newStarts = [...pillStarts];
                          const newEnds = [...pillEnds];
                          newStarts[i] = null;
                          newEnds[i] = null;
                          onCustomTimeChange(joinMultiTimes(newStarts), joinMultiTimes(newEnds));
                        }}
                      />
                    );
                  })()}
                {/* Inline indicators for this shift's focus area */}
                {renderInlineIndicators(shiftWingId, cardNoteShift)}
                {allowShiftEdits && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: "1px solid var(--dg-color-border-light)",
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    {renderCardRemoveButton(`Remove ${previewLabel}`, () =>
                      setPendingDelete({ type: "pill", index: i }),
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /**
   * The active indicators by name, for someone who can open the shift but not
   * edit its indicators: the pill's dots alone did not say what they meant.
   */
  function renderReadOnlyIndicators(
    focusAreaId: number,
    shift: ScheduleNoteShift | null,
    compact = false,
  ) {
    const activeIds = getActiveIndicatorIds ? getActiveIndicatorIds(focusAreaId, shift) : [];
    const active = indicatorTypes.filter((ind) => activeIds.includes(ind.id));
    if (active.length === 0) return null;
    return (
      <div data-read-only-indicators={focusAreaId} style={compact ? { marginTop: 8 } : undefined}>
        <div style={sectionLabel}>Schedule notes</div>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {active.map(({ id, name }) => (
            <li key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ScheduleNoteIcon color="var(--dg-color-text-muted)" />
              <span
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 600,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                {name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /** One row per note: its dot, its name, and a switch to turn it on or off. */
  function renderNoteToggles(focusAreaId: number, shift: ScheduleNoteShift | null) {
    const activeIds = getActiveIndicatorIds ? getActiveIndicatorIds(focusAreaId, shift) : [];
    return (
      <div>
        <div style={sectionLabel}>Schedule notes</div>
        <div
          role="group"
          aria-label="Schedule notes"
          style={{
            border: "1px solid var(--dg-color-border)",
            borderRadius: "var(--dg-radius-md)",
            background: "var(--dg-color-surface)",
            overflow: "hidden",
          }}
        >
          {indicatorTypes.map(({ id, name, color }, index) => (
            <label
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 44,
                padding: "6px 12px",
                borderTop: index > 0 ? "1px solid var(--dg-color-border)" : undefined,
                cursor: "pointer",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
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
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 600,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                {name}
              </span>
              <Switch
                checked={activeIds.includes(id)}
                onChange={(next) => onNoteToggle?.(id, next, focusAreaId, shift)}
                ariaLabel={`${name} schedule note`}
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  function renderInlineIndicators(focusAreaId: number, shift: ScheduleNoteShift | null) {
    if (!canEditScheduleIndicators) return renderReadOnlyIndicators(focusAreaId, shift, true);
    if (indicatorTypes.length === 0) return null;
    return <div style={{ marginTop: 8 }}>{renderNoteToggles(focusAreaId, shift)}</div>;
  }

  /** Says how the shifts go back when the absence is removed. */
  function restoredShiftPoints(): string[] {
    if (!absenceSession || !absenceCell?.kept) return [];
    const { base, names } = absenceSession;
    const points: string[] = [];
    const cut = absenceCell.plan.cutIndex;
    if (cut != null) {
      const range = effectiveRange(base.shifts[cut]);
      points.push(
        `${capitalize(theShift(names[cut]))} goes back to ${fmt12h(range.start)} - ${fmt12h(range.end)} (${formatShiftChangeHours(clockSpanMinutes(range))}).`,
      );
    }
    for (const index of absenceCell.plan.removedIndexes) {
      points.push(`Removing it brings back ${theShift(names[index])}.`);
    }
    return points;
  }

  /** Save waits for a time that leaves the absence some scheduled time to cover (items 50a, 50c). */
  function absenceBlocksSave(): boolean {
    return (
      hasActiveShift && hasRestOfDayAbsence && allowShiftEdits && absenceCell?.plan.problem != null
    );
  }

  function removeAbsence() {
    if (absenceSession) {
      const { base, segments } = absenceSession;
      setAbsenceSession(null);
      onSelect(
        buildPanelInput({
          segments: segments.map((segment, position) => ({ ...segment, position })),
          absenceTypeId: null,
          customStartTime: joinMultiTimes(base.shifts.map((shift) => shift.customStart)),
          customEndTime: joinMultiTimes(base.shifts.map((shift) => shift.customEnd)),
          restOfDayAbsenceTypeId: null,
        }),
        seriesId ? seriesScope : undefined,
      );
      return;
    }
    const restored = withoutLastShiftTimes(
      customStartTime ?? null,
      customEndTime ?? null,
      currentSegments.length,
    );
    onSelect(
      buildPanelInput({
        segments: currentSegments,
        absenceTypeId: null,
        customStartTime: restored.customStartTime,
        customEndTime: restored.customEndTime,
        restOfDayAbsenceTypeId: null,
      }),
      seriesId ? seriesScope : undefined,
    );
  }

  /** What the absence covers, or why its time can't stand. */
  function absenceMessage(): { text: string; error: boolean; wholeDay?: boolean } | null {
    if (!absenceSession || !absenceCell) return null;
    const { side, base, names, at } = absenceSession;
    const { plan } = absenceCell;
    const person = modal.empName.split(" ")[0] || modal.empName;
    const absence = absenceName(currentRestOfDayAbsenceTypeId) ?? "the absence";
    const one = base.shifts.length === 1;
    const first = base.shifts[0];
    const last = base.shifts[base.shifts.length - 1];
    const firstName = theShift(names[0]);
    const lastName = theShift(names[names.length - 1]);
    const leaving = side === "left-early";
    switch (plan.problem) {
      case "unset":
        return {
          text: leaving
            ? `When did ${person} leave${one ? ` ${firstName}` : ""}?`
            : `When does ${person} arrive${one ? ` for ${firstName}` : ""}?`,
          error: false,
        };
      case "no-time-covered":
        return {
          text: leaving
            ? `${capitalize(lastName)} ends at ${fmt12h(effectiveRange(last).end)}, so ${absence} would cover no time. Set when ${person} left, or remove ${absence}.`
            : `${capitalize(firstName)} starts at ${fmt12h(effectiveRange(first).start)}, so ${absence} would cover no time. Set when ${person} arrives, or remove ${absence}.`,
          error: true,
        };
      case "never-started":
        return {
          text: leaving
            ? `${person} left when ${firstName} started, so none of it was worked.`
            : `${person} arrives when ${lastName} ends, so none of it is worked.`,
          error: true,
          wholeDay: true,
        };
      case "outside-shift":
        return {
          text: one
            ? `Pick a time after ${firstName} starts at ${fmt12h(effectiveRange(first).start)} and before it ends at ${fmt12h(effectiveRange(first).end)}.`
            : `Pick a time between ${fmt12h(effectiveRange(first).start)}, when ${firstName} starts, and ${fmt12h(effectiveRange(last).end)}, when ${lastName} ends.`,
          error: true,
        };
      default:
        break;
    }
    if (!plan.absence || !at) return null;
    const parts: string[] = [];
    if (leaving) {
      if (plan.cutIndex != null) parts.push(`the rest of ${theShift(names[plan.cutIndex])}`);
      for (const index of plan.removedIndexes) parts.push(`all of ${theShift(names[index])}`);
      if (base.extendTo && plan.removedIndexes.length === 0) parts.push("the time after it");
    } else {
      if (base.extendTo && plan.removedIndexes.length === 0) parts.push("the time before it");
      for (const index of plan.removedIndexes) parts.push(`all of ${theShift(names[index])}`);
      if (plan.cutIndex != null) parts.push(`the start of ${theShift(names[plan.cutIndex])}`);
    }
    const joined =
      parts.length > 1
        ? `: ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
        : parts.length === 1
          ? `, ${parts[0]}`
          : "";
    return {
      text: `Covers ${fmt12h(plan.absence.start)} - ${fmt12h(plan.absence.end)}${joined}. No hours.`,
      error: false,
    };
  }

  /** Names each shift the absence takes off, and why. */
  function removedShiftNotices(): string[] {
    if (!absenceSession || !absenceCell?.kept) return [];
    const person = modal.empName.split(" ")[0] || modal.empName;
    const absence = absenceName(currentRestOfDayAbsenceTypeId) ?? "the absence";
    return absenceCell.plan.removedIndexes.map((index) => {
      const shift = capitalize(theShift(absenceSession.names[index]));
      return absenceSession.side === "left-early"
        ? `${shift} starts after ${person} left, so it comes off and ${absence} covers it.`
        : `${shift} ends before ${person} arrives, so it comes off and ${absence} covers it.`;
    });
  }

  /** The worked time and the absence in time order, for the day bar. */
  function absenceDayBarParts() {
    if (!absenceSession || !absenceCell?.kept || !absenceCell.plan.absence) return null;
    const work = absenceCell.kept.map((shift) => ({
      kind: "work" as const,
      ...effectiveRange({ ...absenceSession.base.shifts[shift.index], ...shift }),
    }));
    const absence = { kind: "absence" as const, ...absenceCell.plan.absence };
    return absenceSession.side === "left-early" ? [...work, absence] : [absence, ...work];
  }

  function renderRestOfDayAbsenceCard() {
    if (!hasActiveShift || currentRestOfDayAbsenceTypeId == null) return null;
    const absence = absenceTypes.find(
      (candidate) => candidate.id === currentRestOfDayAbsenceTypeId,
    );
    if (!absence) return null;
    const absenceLabel = absence.name || absence.label;
    const colors = absenceStripeFill(absence.color, isDarkTheme);
    const diff = panelDiff.restOfDayDiff ?? null;
    const message = absenceMessage();
    const leaving = absenceSession?.side !== "arrived-late";
    const editable = allowShiftEdits && absenceSession != null;
    const barParts = message?.error || !absenceSession ? null : absenceDayBarParts();
    return (
      <div
        data-rest-of-day-absence-card
        data-absence-side={absenceSession?.side}
        data-shift-edit-card-diff={diff?.borderKind ?? undefined}
        style={{
          border: getPanelDiffBorder({
            diffKind: diff?.borderKind ?? null,
            fallback: `1.5px solid ${colors.border}`,
          }),
          borderRadius: shiftEditCardOuterRadius,
          position: "relative",
          marginTop: leaving && currentLabels.length > 1 ? 10 : 0,
          marginBottom: 16,
          padding: SHIFT_EDIT_CARD_INSET,
          background: "var(--dg-color-surface)",
        }}
      >
        {renderShiftDiffBadge(diff?.badge ?? null)}
        <div
          style={{
            background: colors.background,
            minHeight: 44,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: shiftEditCardHeaderRadius,
            position: "relative",
          }}
        >
          <MaybeHint content={absenceLabel} side="top">
            <span
              style={{
                fontWeight: 600,
                fontSize: "var(--dg-fs-heading)",
                color: colors.text,
                maxWidth: "calc(100% - 48px)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {absenceLabel}
            </span>
          </MaybeHint>
        </div>
        <div
          style={{
            padding: "10px 6px 4px",
            background: "var(--dg-color-surface)",
            borderRadius: `0 0 ${shiftEditCardInnerRadius} ${shiftEditCardInnerRadius}`,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {editable && absenceSession && (
            <SpanTabs<AbsenceSide>
              aria-label={`When ${absenceLabel} was`}
              className="w-full [&>button]:flex-1"
              items={[
                { value: "left-early", label: "Left early" },
                { value: "arrived-late", label: "Arrived late" },
              ]}
              value={absenceSession.side}
              onChange={(side) => applyAbsence(absenceSession, { side, at: absenceSession.at })}
            />
          )}
          {editable && absenceSession && (
            <WorkedUntilField
              label={leaving ? "Left at" : "Arrives at"}
              end={absenceSession.at}
              message={message}
              onChange={(at) => applyAbsence(absenceSession, { side: absenceSession.side, at })}
            />
          )}
          {!editable && message && !message.error && (
            <span
              className="dg-tabular-nums"
              style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-subtle)" }}
            >
              {message.text}
            </span>
          )}
          {editable && message?.wholeDay && (
            <Button
              type="button"
              className="dg-btn dg-btn-secondary"
              onClick={() =>
                onSelect(
                  buildPanelInput({
                    segments: [],
                    absenceTypeId: currentRestOfDayAbsenceTypeId,
                    customStartTime: null,
                    customEndTime: null,
                  }),
                  seriesId ? seriesScope : undefined,
                )
              }
            >
              Make it {absenceLabel} for the whole day
            </Button>
          )}
          {removedShiftNotices().map((notice) => (
            <span
              key={notice}
              data-absence-removed-shift
              style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-muted)" }}
            >
              {notice}
            </span>
          ))}
          {barParts && (
            <AbsenceDayBar parts={barParts} absenceName={absenceLabel} absenceColors={colors} />
          )}
          {!absenceSession && (
            <span
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-subtle)",
                fontWeight: 500,
              }}
            >
              Rest of the day
            </span>
          )}
          {allowShiftEdits && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {renderCardRemoveButton(`Remove ${absenceLabel}`, () =>
                setPendingDelete({ type: "restOfDay" }),
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Nobody works on after leaving early (item 50, owner 2026-10-24).
  const canAddShift =
    allowShiftEdits &&
    !isAbsence &&
    currentLabels.length < 2 &&
    !(hasRestOfDayAbsence && absenceSession?.side !== "arrived-late");
  const canAddRestOfDayAbsence =
    allowShiftEdits &&
    hasActiveShift &&
    !isAbsence &&
    !hasRestOfDayAbsence &&
    absenceTypes.length > 0 &&
    (!seriesId || seriesScope === "this");

  function removeWholeCell() {
    onSelect(null, seriesId ? seriesScope : undefined);
    if (onCustomTimeChange) onCustomTimeChange(null, null);
    // A cell that opened empty is back as it was: there is nothing to
    // save, and an armed save would fire on the next pick instead.
    if (!openedEmpty) setPendingCommitScope(seriesScope);
  }

  // Names what the whole-cell remove takes away: "all shifts" read as if it
  // kept the absence beside them.
  function removeAllCopy(): { label: string } {
    if (isAbsence) return { label: "Remove absence" };
    const many = currentLabels.length > 1;
    if (hasRestOfDayAbsence) {
      return { label: many ? "Remove shifts and absence" : "Remove shift and absence" };
    }
    return { label: many ? "Remove both shifts" : "Remove shift" };
  }
  const quotedShiftLabels = currentLabels.map((label) => `"${label}"`).join(" and ");
  const removedAbsenceRestores =
    !isAbsence && pendingDelete?.type === "restOfDay" ? restoredShiftPoints() : [];

  function renderCardRemoveButton(ariaLabel: string, onClick: () => void) {
    return (
      <Button
        onClick={onClick}
        aria-label={ariaLabel}
        className="dg-btn dg-btn-ghost"
        style={{
          height: "auto",
          minHeight: 0,
          padding: "4px 8px",
          marginRight: -8,
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 600,
          color: "var(--dg-color-danger)",
          display: "flex",
          alignItems: "center",
          gap: 5,
          whiteSpace: "nowrap",
        }}
      >
        <Trash2 size={12} strokeWidth={2.5} aria-hidden />
        Remove
      </Button>
    );
  }

  function renderAddButton(label: string, onClick: () => void, spanBoth: boolean) {
    return (
      <Button
        onClick={onClick}
        className="dg-btn dg-btn-ghost"
        style={{
          gridColumn: spanBoth ? "1 / -1" : undefined,
          minWidth: 0,
          fontSize: "var(--dg-fs-caption)",
          padding: "9px 12px",
          border: "1px dashed var(--dg-color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          whiteSpace: "nowrap",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </Button>
    );
  }

  function renderNotesSection() {
    if (!canEditScheduleIndicators) return renderReadOnlyIndicators(activeTab, singleNoteShift);
    if (indicatorTypes.length === 0) return null;
    return renderNoteToggles(activeTab, singleNoteShift);
  }

  // Detail mode: show when we have an active shift and aren't in picker mode
  // (or when shift edits are not allowed)
  const inDetailMode = !allowShiftEdits || (!showPicker && hasActiveShift);
  const dateKey = formatDateKey(modal.date);

  function buildViewDetails(): PanelViewDetail[] {
    if (isAbsence) return [{ label: "Time", value: "Whole day · no hours" }];

    const count = currentSegments.length;
    const starts = parseMultiTimes(customStartTime, count);
    const ends = parseMultiTimes(customEndTime, count);
    let lastEnd: string | null = null;

    const details: PanelViewDetail[] = currentSegments.flatMap((segment, index) => {
      const assignment =
        assignments.find((candidate) => candidate.id === currentAssignmentIds[index]) ?? undefined;
      const resolved = shiftChangeResolvers.segment(segment.shiftId ?? null, segment.jobId);
      const defaults = resolveDefaultTimes(assignment);
      const isCustom = starts[index] != null || ends[index] != null;
      const start = starts[index] ?? defaults.start ?? resolved?.defaultStart ?? null;
      const end = ends[index] ?? defaults.end ?? resolved?.defaultEnd ?? null;
      if (end) lastEnd = end;
      const window = formatShiftWindow(start, end, dateKey);
      const minutes =
        start && end
          ? shiftChangeItemMinutes({
              kind: "shift",
              key: String(index),
              shiftName: null,
              jobName: "",
              focusAreaName: null,
              start,
              end,
              breakMinutes: resolved?.breakMinutes ?? null,
            })
          : null;
      const time = window
        ? [
            window,
            minutes != null ? formatShiftChangeHours(minutes) : null,
            isCustom ? "custom time" : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;
      const noteFocusAreaId = assignment?.focusAreaId ?? activeTab;
      const noteNames = (getActiveIndicatorIds?.(noteFocusAreaId, noteShiftOf(segment)) ?? [])
        .map((id) => indicatorTypes.find((type) => type.id === id)?.name)
        .filter((name): name is string => Boolean(name));
      const prefix = count > 1 ? `Shift ${index + 1} ` : "";
      return [
        ...(time ? [{ label: count > 1 ? `Shift ${index + 1}` : "Time", value: time }] : []),
        { label: `${prefix}mentored`.replace(/^m/, "M"), value: segment.isMentored ? "Yes" : "No" },
        ...(noteNames.length > 0
          ? [{ label: `${prefix}notes`.replace(/^n/, "N"), value: noteNames.join(", ") }]
          : []),
      ];
    });

    if (hasRestOfDayAbsence) {
      const name = absenceName(currentRestOfDayAbsenceTypeId);
      const from = lastEnd ? `, from ${fmt12h(lastEnd)}` : "";
      details.push({ label: "Absence", value: `${name} for the rest of the day${from}` });
    }
    return details;
  }

  function buildViewStatus(): PanelViewStatus {
    if (draftKind === "new") return { kind: "unpublished", personName: modal.empName };
    if (draftKind !== "modified") return null;
    const change = describeCellStateChange(
      buildPanelInput({
        segments: publishedSegments ?? [],
        absenceTypeId: publishedAbsenceTypeId ?? null,
        customStartTime: publishedCustomStartTime ?? null,
        customEndTime: publishedCustomEndTime ?? null,
        restOfDayAbsenceTypeId: publishedRestOfDayAbsenceTypeId ?? null,
      }),
      buildPanelInput({
        segments: currentSegments,
        absenceTypeId: currentAbsenceTypeId ?? null,
        customStartTime: customStartTime ?? null,
        customEndTime: customEndTime ?? null,
        restOfDayAbsenceTypeId: currentRestOfDayAbsenceTypeId,
      }),
      dateKey,
      shiftChangeResolvers,
    );
    return change.kind === "none" ? null : { kind: "changed", change };
  }

  function describeSeriesItem(pattern: ShiftSeriesPattern | null): string | null {
    if (!pattern) return null;
    const items = cellStateToChangeDay(pattern.state, shiftChangeResolvers).items;
    const text = items
      .map((item) => describeShiftChangeItem(item, { date: dateKey }).plain)
      .join("; ");
    return text || null;
  }

  function describeLastChange(): string | null {
    if (!auditInfo) return null;
    if (auditInfo.updatedByName && auditInfo.updatedAt) {
      return `Last changed by ${auditInfo.updatedByName} · ${formatRelativeTime(auditInfo.updatedAt)}`;
    }
    if (auditInfo.createdByName && auditInfo.createdAt) {
      return `Added by ${auditInfo.createdByName} · ${formatRelativeTime(auditInfo.createdAt)}`;
    }
    return null;
  }

  const holdsSeveralItems = currentSegments.length > 1 || hasRestOfDayAbsence;
  const initialHadContent = !!initialShift && initialShift !== "OFF";
  const canReturnToView = allowShiftEdits && !!seriesId && initialHadContent;
  const scopeOptions = seriesScopeOptions(seriesSummary?.pattern?.occurrenceDates ?? null, dateKey);
  const chosenScopeOption = scopeOptions.find((option) => option.scope === seriesScope);
  const repeatingNoun = isAbsence ? "repeating absence" : "repeating shift";
  // A range edit reaches only the shift itself; times and notes stay per day.
  const editingRange =
    !!seriesId && !(viewing && hasActiveShift && allowShiftEdits) && seriesScope !== "this";
  const repeatBlockedReason =
    currentLabels.length > 1
      ? "A day with two shifts can't repeat. Remove one to make it repeating."
      : hasRestOfDayAbsence
        ? "A shift with an absence for the rest of the day can't repeat. Remove the absence to make it repeating."
        : null;
  const inViewMode = viewing && hasActiveShift && allowShiftEdits;

  function returnToView() {
    handleUndo();
    setShowPicker(false);
    setViewing(true);
  }

  function renderSeriesEditScope() {
    if (!chosenScopeOption) return null;
    const pattern = seriesSummary?.pattern ?? null;
    const label =
      chosenScopeOption.label.charAt(0).toLowerCase() + chosenScopeOption.label.slice(1);
    return (
      <div
        style={{
          marginBottom: 16,
          padding: "12px 14px",
          borderRadius: "var(--dg-radius-lg)",
          background: "var(--dg-color-primary-bg)",
          border: "1px solid var(--dg-color-border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 600,
              color: "var(--dg-color-text-primary)",
            }}
          >
            Editing {label}
          </div>
          {chosenScopeOption.detail ? (
            <div
              className="dg-tabular-nums"
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-muted)",
                marginTop: 2,
              }}
            >
              {chosenScopeOption.detail}
            </div>
          ) : null}
        </div>
        {editingRange ? (
          <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-muted)" }}>
            Times and notes change one day at a time. To change them, edit this day only.
          </div>
        ) : null}
        {seriesScope === "all" && canEditSeriesPattern ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              paddingTop: 8,
              borderTop: "1px solid var(--dg-color-border)",
            }}
          >
            {pattern ? (
              <div
                className="dg-tabular-nums"
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  color: "var(--dg-color-text-secondary)",
                }}
              >
                {describeSeriesPattern(pattern)}
                {formatSeriesSpan(pattern.occurrenceDates)
                  ? ` · ${formatSeriesSpan(pattern.occurrenceDates)}`
                  : ""}
              </div>
            ) : null}
            <Button
              onClick={() => openSeriesPattern()}
              disabled={hasEdits || seriesPatternLoad === "loading"}
              className="dg-btn dg-btn-secondary"
              style={{ fontSize: "var(--dg-fs-caption)", padding: "8px 12px" }}
            >
              <ButtonLoading loading={seriesPatternLoad === "loading"} spinnerSize={12}>
                Edit dates and pattern
              </ButtonLoading>
            </Button>
            {hasEdits || seriesPatternLoad === "failed" ? (
              <div
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  color:
                    seriesPatternLoad === "failed"
                      ? "var(--dg-color-danger)"
                      : "var(--dg-color-text-muted)",
                }}
              >
                {seriesPatternLoad === "failed"
                  ? "We couldn't load this repeating series. Try again."
                  : "Save or cancel the change above first."}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const showStandaloneRequestFlow =
    !requestOnlyMode && activeRequestMode != null && (canRenderCoverage || canRenderSwap);

  // ── Request-only mode: show the shared request controls without edit UI ──
  if (requestOnlyMode && (canRenderCoverage || canRenderSwap)) {
    return createPortal(
      <>
        <div className={`dg-panel-overlay${closing ? " closing" : ""}`} onClick={close} />
        <div
          className={`dg-panel${closing ? " closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Shift requests"
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid var(--dg-color-border)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "var(--dg-fs-title)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                Shift requests
              </div>
              <div
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  color: "var(--dg-color-text-secondary)",
                  marginTop: 2,
                }}
              >
                {modal.empName} &middot;{" "}
                {modal.date.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
            <CloseButton size="md" onClick={close} aria-label="Close" />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "20px",
              }}
            >
              {renderRequestControls({ standalone: true })}
            </div>
            <div
              style={{
                flexShrink: 0,
                padding: "12px 20px 20px",
                borderTop: "1px solid var(--dg-color-border)",
                background: "var(--dg-color-surface)",
              }}
            >
              <Button
                type="button"
                onClick={closeRequestSection}
                className="dg-btn dg-btn-secondary"
                style={{
                  width: "100%",
                  fontSize: "var(--dg-fs-caption)",
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
          <ScrollOverflowCue />
        </div>
        {renderPendingRequestConfirmation()}
      </>,
      document.body,
    );
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div className={`dg-panel-overlay${closing ? " closing" : ""}`} onClick={close} />

      {/* Slide-over panel */}
      <div
        className={`dg-panel${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={allowShiftEdits ? "Edit shift" : "Shift details"}
      >
        {/* Panel Header */}
        <div
          style={{
            padding: isMobile ? "12px 16px" : "16px 20px",
            borderBottom: "1px solid var(--dg-color-border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            background: "var(--dg-color-surface)",
          }}
        >
          {(isMobile || (!inViewMode && canReturnToView)) && (
            <Button
              onClick={!inViewMode && canReturnToView ? returnToView : close}
              aria-label="Back"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                background: "transparent",
                border: "none",
                borderRadius: "var(--dg-radius-md)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={20} color="var(--dg-color-text-primary)" />
            </Button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                fontWeight: 700,
                color: "var(--dg-color-text-secondary)",
              }}
            >
              {modal.empName}
            </div>
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-subtle)",
                marginTop: 2,
              }}
            >
              {formatDate(modal.date)}
              {modal.empCertificationId != null && (
                <>
                  {" · "}
                  <span
                    style={{
                      color: "var(--dg-color-text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {getCertName(modal.empCertificationId, certifications)}
                  </span>
                </>
              )}
            </div>
          </div>
          {!isMobile && <CloseButton size="md" onClick={close} aria-label="Close" />}
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: isMobile ? "16px" : "20px 24px",
          }}
        >
          {showStandaloneRequestFlow ? (
            renderRequestControls({ standalone: true })
          ) : repeatFormOpen && empId ? (
            // ── Repeat form mode ─────────────────────────────────────────────
            <RepeatForm
              key={showSeriesPatternForm ? "edit-series" : "create-series"}
              ref={repeatFormRef}
              empId={empId}
              shiftLabel={currentLabels[0] ?? ""}
              selectionInput={buildPanelInput({
                segments: currentSegments,
                absenceTypeId: currentAbsenceTypeId ?? null,
                customStartTime: customStartTime ?? null,
                customEndTime: customEndTime ?? null,
              })}
              selectionSegments={currentSegments}
              startDate={modal.date}
              assignments={assignments}
              shiftCategories={shiftCategories}
              jobs={jobs}
              onConfirm={onRepeatConfirm}
              absenceType={
                isAbsence ? absenceTypes?.find((at) => at.id === currentAbsenceTypeId) : undefined
              }
              editing={
                showSeriesPatternForm && seriesPattern && seriesId && onRescheduleSeries
                  ? {
                      pattern: seriesPattern,
                      onSave: (pattern) => onRescheduleSeries(seriesId, pattern, isAbsence),
                    }
                  : undefined
              }
            />
          ) : inViewMode ? (
            <ShiftPanelView
              header={renderCurrentShiftPill()}
              details={buildViewDetails()}
              status={buildViewStatus()}
              series={
                seriesId ? (
                  <SeriesSummaryCard
                    date={dateKey}
                    pattern={seriesSummary?.pattern ?? null}
                    status={
                      onLoadSeriesPattern ? (seriesSummary?.status ?? "loading") : "unavailable"
                    }
                    seriesItemText={describeSeriesItem(seriesSummary?.pattern ?? null)}
                  />
                ) : null
              }
              lastChange={describeLastChange()}
            />
          ) : inDetailMode ? (
            // ── Detail mode ──────────────────────────────────────────────────
            <>
              {seriesId && allowShiftEdits && chosenScopeOption && renderSeriesEditScope()}
              {/* An arrived-late absence comes before the shifts (item 50c) */}
              {absenceSession?.side === "arrived-late" && renderRestOfDayAbsenceCard()}
              {/* Current shift displayed prominently */}
              {renderCurrentShiftPill()}

              {allowShiftEdits &&
                hasActiveShift &&
                !currentAbsenceTypeId &&
                currentSegments.length === 1 && (
                  <div
                    style={{
                      marginBottom: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      border: "1px solid var(--dg-color-border)",
                      borderRadius: "var(--dg-radius-md)",
                      background: "var(--dg-color-surface)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 700,
                          color: "var(--dg-color-text-primary)",
                        }}
                      >
                        Mentored
                      </div>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                          marginTop: 2,
                        }}
                      >
                        Applies the organization&apos;s mentored coverage rule.
                      </div>
                    </div>
                    <Switch
                      checked={isMentoredAssignment}
                      onChange={() => handleMentoredToggle()}
                      ariaLabel="Mentored assignment"
                    />
                  </div>
                )}

              {/* Custom time override — single-shift only (multi-shift has per-pill editors); hidden for absence types */}
              {hasActiveShift &&
                !currentAbsenceTypeId &&
                allowShiftEdits &&
                onCustomTimeChange &&
                !editingRange &&
                currentLabels.length <= 1 &&
                (() => {
                  const matchedCode =
                    currentAssignmentIds[0] != null
                      ? assignments.find((st) => st.id === currentAssignmentIds[0])
                      : assignments.find((st) => st.label === currentLabels[0]);
                  const defaults = resolveDefaultTimes(matchedCode);
                  const singleCustomStart = getFirstTimeSegment(customStartTime);
                  const singleCustomEnd = getFirstTimeSegment(customEndTime);
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <PillTimeEditor
                        customStart={singleCustomStart}
                        customEnd={singleCustomEnd}
                        defaultStart={defaults.start}
                        defaultEnd={defaults.end}
                        minTime={getTimeBounds(matchedCode).minTime}
                        maxTime={getTimeBounds(matchedCode).maxTime}
                        onSave={(start, end) => {
                          if (!editShiftTimesBesideAbsence(0, start, end)) {
                            onCustomTimeChange(start, end);
                          }
                        }}
                        onRemove={() => {
                          if (!editShiftTimesBesideAbsence(0, null, null)) {
                            onCustomTimeChange(null, null);
                          }
                        }}
                      />
                    </div>
                  );
                })()}

              {/* A left-early absence comes after the shifts */}
              {absenceSession?.side !== "arrived-late" && renderRestOfDayAbsenceCard()}

              {!hasActiveShift && !allowShiftEdits && (
                <div
                  style={{
                    border: "1px solid var(--dg-color-border)",
                    borderRadius: "var(--dg-radius-md)",
                    padding: "12px",
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--dg-color-text-muted)",
                    marginBottom: 16,
                  }}
                >
                  Shift editing is disabled for your role.
                </div>
              )}

              {/* Make repeating; a double shift or a shift with an absence says why it can't */}
              {allowShiftEdits && hasActiveShift && !seriesId && onRepeatConfirm && (
                <div style={{ marginBottom: 16 }}>
                  <div style={sectionLabel}>Repeating</div>
                  <Hint
                    content={hint(
                      repeatBlockedReason ?? "Create a recurring pattern (daily, weekly, biweekly)",
                    )}
                    side="top"
                  >
                    <Button
                      data-tour="edit-panel-repeat-btn"
                      disabled={repeatBlockedReason != null}
                      onClick={() => {
                        setShowRepeatForm(true);
                      }}
                      className="dg-btn dg-btn-secondary"
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        fontSize: "var(--dg-fs-caption)",
                        padding: "9px 12px",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="17 1 21 5 17 9" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                      {isAbsence ? "Make this repeating" : "Make this a repeating shift"}
                    </Button>
                  </Hint>
                  {repeatBlockedReason && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: "var(--dg-fs-footnote)",
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      {repeatBlockedReason}
                    </div>
                  )}
                </div>
              )}

              {/* Notes / Indicators — single shift only; multi-shift shows inline per pill; hidden for
                  absences and for an empty cell, since an indicator describes a shift */}
              {hasActiveShift &&
                currentLabels.length <= 1 &&
                !isAbsence &&
                !editingRange &&
                renderNotesSection()}

              {/* Audit metadata footer — admin+ only */}
              {auditInfo && (auditInfo.createdByName || auditInfo.updatedByName) && (
                <div
                  style={{
                    marginTop: 20,
                    paddingTop: 12,
                    borderTop: "1px solid var(--dg-color-border)",
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--dg-color-text-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {auditInfo.createdByName && auditInfo.createdAt && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>Created by</span>
                      <span>{auditInfo.createdByName}</span>
                      <span style={{ color: "var(--dg-color-text-muted)" }}>
                        {formatRelativeTime(auditInfo.createdAt)}
                      </span>
                    </div>
                  )}
                  {auditInfo.updatedByName && auditInfo.updatedAt && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>Updated by</span>
                      <span>{auditInfo.updatedByName}</span>
                      <span style={{ color: "var(--dg-color-text-muted)" }}>
                        {formatRelativeTime(auditInfo.updatedAt)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Remove shift; a repeating item is removed from its view, which asks which days */}
              {allowShiftEdits && hasActiveShift && !seriesId && (
                <div style={{ marginTop: 16 }}>
                  <Button
                    onClick={() => {
                      setRunRemoveScope("this");
                      setPendingDelete({ type: "all" });
                    }}
                    className="dg-btn dg-btn-danger"
                    style={{
                      width: "100%",
                      fontSize: "var(--dg-fs-caption)",
                      padding: "9px 12px",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                    {removeAllCopy().label}
                  </Button>
                </div>
              )}

              {/* Add another shift (hidden at two shifts or on a whole-day absence) and Add an
                  absence (hidden once there is one, and on a series edited beyond this date,
                  which the server refuses) */}
              {(canAddShift || canAddRestOfDayAbsence) && !editingRange && (
                <div
                  style={{
                    marginTop: 8,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  {canAddShift &&
                    renderAddButton(
                      "Add another shift",
                      () => setShowPicker(true),
                      !canAddRestOfDayAbsence,
                    )}
                  {canAddRestOfDayAbsence &&
                    renderAddButton(
                      "Add an absence",
                      () => {
                        setPickingRestOfDayAbsence(true);
                        setShowPicker(true);
                      },
                      !canAddShift,
                    )}
                </div>
              )}

              {/* ── Shift Request Actions (employee self-service) ─────────── */}
              {isOwnShift && hasActiveShift && !hasActiveRequest && !hasEdits && (
                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 16,
                    borderTop: "1px solid var(--dg-color-border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: "var(--dg-type-field-title-size)",
                      fontWeight: "var(--dg-type-field-title-weight)",
                      letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                      lineHeight: "var(--dg-type-field-title-line-height)",
                      color: "var(--dg-type-field-title-color)",
                      marginBottom: 2,
                    }}
                  >
                    Shift requests
                  </div>
                  {renderRequestControls({ standalone: false })}
                </div>
              )}
              {isOwnShift && hasActiveRequest && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "10px 12px",
                    background: "var(--dg-color-warning-bg)",
                    borderRadius: "var(--dg-radius-md)",
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-warning-text)",
                    textAlign: "center",
                  }}
                >
                  A request is already active for this shift
                </div>
              )}
              {isStale && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "10px 12px",
                    background: "var(--dg-color-danger-bg)",
                    border: "1px solid var(--dg-color-danger-border)",
                    borderRadius: "var(--dg-radius-md)",
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-danger-dark)",
                  }}
                >
                  This shift changed in another tab or by another editor. Close and reopen it before
                  saving.
                </div>
              )}
              {overlapWarnings.length > 0 && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "10px 12px",
                    background: enforceConflicts
                      ? "var(--dg-color-danger-bg)"
                      : "var(--dg-color-warning-bg)",
                    border: `1px solid ${enforceConflicts ? "var(--dg-color-danger-border)" : "var(--dg-color-warning-border)"}`,
                    borderRadius: "var(--dg-radius-md)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "var(--dg-fs-badge)",
                      fontWeight: 700,
                      color: enforceConflicts
                        ? "var(--dg-color-danger-dark)"
                        : "var(--dg-color-warning-text)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 4,
                    }}
                  >
                    {enforceConflicts ? "Conflict Blocked" : "Overlap Warning"}
                  </div>
                  {overlapWarnings.map((w, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        color: enforceConflicts
                          ? "var(--dg-color-danger-dark)"
                          : "var(--dg-color-warning-text)",
                        marginTop: i > 0 ? 4 : 0,
                      }}
                    >
                      {w}
                    </div>
                  ))}
                  {enforceConflicts && (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-muted)",
                        marginTop: 6,
                        fontStyle: "italic",
                      }}
                    >
                      Resolve the overlap to save this shift.
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            // ── Picker mode ───────────────────────────────────────────────────
            <>
              {/* Back button when we already have an active shift */}
              {hasActiveShift && (
                <Button
                  onClick={() => {
                    setShowPicker(false);
                    setPickingRestOfDayAbsence(false);
                  }}
                  className="dg-btn dg-btn-ghost"
                  style={{
                    fontSize: "var(--dg-fs-caption)",
                    padding: "5px 10px",
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    border: "1px solid var(--dg-color-border)",
                  }}
                >
                  <ChevronLeft size={12} strokeWidth={2.5} />
                  Back
                </Button>
              )}

              {/* Shift Picker Component */}
              {isAddingSecondShift && pickerAssignmentDefinitions.length === 0 ? (
                <div
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    color: "var(--dg-color-text-subtle)",
                    fontSize: "var(--dg-fs-label)",
                  }}
                >
                  No other shifts to add.
                </div>
              ) : (
                <div data-tour="shift-picker">
                  <ShiftPicker
                    assignments={pickerAssignmentDefinitions}
                    shiftCategories={shiftCategories}
                    jobs={jobs}
                    orgRoles={orgRoles}
                    certifications={certifications}
                    absenceTypes={pickerAbsenceTypes}
                    focusAreas={focusAreas}
                    currentAssignmentDefinitionIds={currentAssignmentIds}
                    currentSegments={currentSegments.map((segment, index) => ({
                      shiftId: segment.shiftId,
                      jobId: segment.jobId,
                      position: segment.position ?? index,
                      isMentored: segment.isMentored ?? false,
                    }))}
                    currentAbsenceTypeId={currentAbsenceTypeId}
                    defaultShiftEnabled={defaultShiftEnabled}
                    date={formatDateKey(modal.date)}
                    workingShift={pickerWorkingShift}
                    blockClashes={enforceConflicts}
                    absenceScope={pickingRestOfDayAbsence ? "restOfDay" : "allDay"}
                    onSelect={selectPickerSegments}
                    onAbsenceSelect={(at) => {
                      if (pickingRestOfDayAbsence) {
                        startAbsence(at.id);
                        setPickingRestOfDayAbsence(false);
                        setShowPicker(false);
                        return;
                      }
                      onSelect(
                        buildPanelInput({
                          segments: [],
                          absenceTypeId: at.id,
                          customStartTime: null,
                          customEndTime: null,
                        }),
                        seriesId ? seriesScope : undefined,
                      );
                      setShowPicker(false);
                    }}
                    empFocusAreaIds={modal.empFocusAreaIds}
                    empCertificationId={modal.empCertificationId}
                    empRoleIds={modal.empRoleIds}
                    initialTab={modal.activeFocusAreaId}
                    multiSelect={true}
                    closeOnSelect={false}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {showStandaloneRequestFlow && (
          <div
            style={{
              flexShrink: 0,
              padding: "12px 20px 20px",
              borderTop: "1px solid var(--dg-color-border)",
              background: "var(--dg-color-surface)",
            }}
          >
            <Button
              type="button"
              onClick={closeRequestSection}
              className="dg-btn dg-btn-secondary"
              style={{
                width: "100%",
                fontSize: "var(--dg-fs-caption)",
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {repeatFormOpen && (
          <div
            style={{
              flexShrink: 0,
              padding: "12px 20px",
              borderTop: "1px solid var(--dg-color-border)",
              display: "flex",
              gap: 8,
              background: "var(--dg-color-surface)",
            }}
          >
            <Button
              onClick={() => {
                setShowRepeatForm(false);
                setSeriesPattern(null);
                setSeriesFormOpen(false);
              }}
              className="dg-btn dg-btn-ghost"
              disabled={isCreatingRepeatSeries}
              style={{
                flex: 1,
                fontSize: "var(--dg-fs-caption)",
                padding: "9px 12px",
                border: "1px solid var(--dg-color-border)",
              }}
            >
              Back
            </Button>
            <Button
              onClick={() => repeatFormRef.current?.submit()}
              className="dg-btn dg-btn-primary"
              style={{ flex: 1, fontSize: "var(--dg-fs-caption)", padding: "9px 12px" }}
              disabled={isCreatingRepeatSeries}
            >
              <ButtonLoading loading={isCreatingRepeatSeries} spinnerSize={16}>
                {showSeriesPatternForm
                  ? isAbsence
                    ? "Save Repeating Absence"
                    : "Save Repeating Shift"
                  : isAbsence
                    ? "Create Repeating Absence"
                    : "Create Repeating Shift"}
              </ButtonLoading>
            </Button>
          </div>
        )}

        {inViewMode && !repeatFormOpen && (
          <div
            style={{
              flexShrink: 0,
              padding: "12px 20px",
              borderTop: "1px solid var(--dg-color-border)",
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
              background: "var(--dg-color-surface)",
            }}
          >
            <Button
              onClick={() => {
                setSeriesScope("this");
                setPendingDelete({ type: "all" });
              }}
              className="dg-btn dg-btn-danger"
              style={{ fontSize: "var(--dg-fs-caption)", padding: "9px 12px" }}
            >
              {holdsSeveralItems ? "Clear day" : "Remove"}
            </Button>
            <Button
              onClick={() => {
                setSeriesScope("this");
                if (seriesId) setEditScopeOpen(true);
                else setViewing(false);
              }}
              className="dg-btn dg-btn-primary"
              style={{ fontSize: "var(--dg-fs-caption)", padding: "9px 12px" }}
            >
              Edit
            </Button>
          </div>
        )}

        {!inViewMode && !repeatFormOpen && (hasEdits || canReturnToView) && (
          <div
            style={{
              flexShrink: 0,
              padding: "12px 20px",
              borderTop: "1px solid var(--dg-color-border)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              background: "var(--dg-color-surface)",
            }}
          >
            {(showsUnsavedChange || noteSummary) && (
              <div
                style={{
                  fontSize: "var(--dg-fs-badge)",
                  color: "var(--dg-color-text-muted)",
                  lineHeight: 1.4,
                }}
              >
                {showsUnsavedChange && (
                  <ShiftChangeCard change={unsavedChange} layout="stacked" className="mb-1.5" />
                )}
                {noteSummary && <div>{noteSummary}</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                onClick={canReturnToView ? returnToView : handleUndo}
                className="dg-btn dg-btn-secondary"
                style={{ flex: 1, fontSize: "var(--dg-fs-caption)", padding: "9px 12px" }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => onConfirmDraft?.(seriesId ? seriesScope : undefined)}
                className="dg-btn dg-btn-primary"
                style={{ flex: 1, fontSize: "var(--dg-fs-caption)", padding: "9px 12px" }}
                disabled={confirmBlocked || absenceBlocksSave() || !hasEdits}
              >
                Save changes
              </Button>
            </div>
          </div>
        )}
        <ScrollOverflowCue />
      </div>

      {renderPendingRequestConfirmation()}

      {/* Confirm delete dialog */}
      {pendingDelete && pendingDelete.type === "all" && seriesId && (
        <ConfirmDialog
          title={`Remove the ${repeatingNoun} "${
            isAbsence
              ? absenceName(currentAbsenceTypeId ?? null)
              : formatPreviewLabel(
                  resolveShiftPreview(currentAssignmentIds[0], currentLabels[0], "name")
                    .displayParts,
                )
          }"?`}
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span>
                Choose the days to remove. Published days are removed in the draft and leave the
                schedule when you publish.
              </span>
              <SeriesScopeChoices
                label="Days to remove"
                options={scopeOptions}
                value={seriesScope}
                onChange={setSeriesScope}
              />
            </div>
          }
          confirmLabel={
            chosenScopeOption?.count != null
              ? `Remove ${chosenScopeOption.count} ${chosenScopeOption.count === 1 ? "day" : "days"}`
              : "Remove"
          }
          variant="danger"
          onConfirm={() => {
            onSelect(null, seriesScope);
            if (onCustomTimeChange) onCustomTimeChange(null, null);
            setPendingCommitScope(seriesScope);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {editScopeOpen && (
        <ConfirmDialog
          title={`Edit ${repeatingNoun}`}
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span>Choose which days this change applies to.</span>
              <SeriesScopeChoices
                label="Days to edit"
                options={scopeOptions}
                value={seriesScope}
                onChange={setSeriesScope}
                notes={{ all: "You can also change the dates and pattern." }}
              />
            </div>
          }
          confirmLabel="Continue"
          variant="info"
          onConfirm={() => {
            setEditScopeOpen(false);
            setViewing(false);
          }}
          onCancel={() => setEditScopeOpen(false)}
        />
      )}

      {pendingDelete?.type === "all" && runDateKeys && (
        <ConfirmDialog
          title={
            runRemoveScope === "all"
              ? `Remove all ${runDateKeys.length} days of "${absenceName(currentAbsenceTypeId ?? null)}"?`
              : `Remove the absence "${absenceName(currentAbsenceTypeId ?? null)}" on ${formatDisplayDate(formatDateKey(modal.date))}?`
          }
          message={
            <SeriesScopeChoices
              label="Days to remove"
              options={[
                {
                  scope: "this",
                  label: "This day",
                  detail: formatDisplayDate(formatDateKey(modal.date)),
                  count: 1,
                },
                {
                  scope: "all",
                  label: `All ${runDateKeys.length} days`,
                  detail: formatRunRange(runDateKeys),
                  count: runDateKeys.length,
                },
              ]}
              value={runRemoveScope}
              onChange={(scope) => setRunRemoveScope(scope === "all" ? "all" : "this")}
            />
          }
          confirmLabel={
            runRemoveScope === "all" ? `Remove all ${runDateKeys.length} days` : "Remove this day"
          }
          variant="danger"
          onConfirm={() => {
            setPendingDelete(null);
            if (runRemoveScope === "all") {
              onRemoveAbsenceRun?.();
              close();
              return;
            }
            removeWholeCell();
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingDelete && !(pendingDelete.type === "all" && (seriesId || runDateKeys)) && (
        <ConfirmDialog
          title={`Remove ${
            isAbsence
              ? `the absence "${currentLabels[0]}"`
              : pendingDelete.type === "restOfDay"
                ? absenceName(currentRestOfDayAbsenceTypeId)
                : pendingDelete.type === "pill"
                  ? `"${currentLabels[pendingDelete.index]}"`
                  : hasRestOfDayAbsence
                    ? `the ${currentLabels.length > 1 ? "shifts" : "shift"} ${quotedShiftLabels} and the absence "${absenceName(currentRestOfDayAbsenceTypeId)}"`
                    : currentLabels.length > 1
                      ? `both shifts, ${quotedShiftLabels},`
                      : `"${currentLabels[0]}"`
          } on ${formatDate(modal.date)}?`}
          message={removedAbsenceRestores.length === 1 ? removedAbsenceRestores[0] : undefined}
          summary={
            removedAbsenceRestores.length > 1 ? { points: removedAbsenceRestores } : undefined
          }
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => {
            if (pendingDelete.type === "all") {
              removeWholeCell();
            } else if (pendingDelete.type === "restOfDay") {
              removeAbsence();
            } else {
              const removedIdx = pendingDelete.index;
              const remainingSegments = currentSegments.filter((_, j) => j !== removedIdx);
              onSelect(
                buildPanelInput({
                  segments: remainingSegments,
                  absenceTypeId: null,
                  customStartTime: customStartTime ?? null,
                  customEndTime: customEndTime ?? null,
                }),
                seriesId ? seriesScope : undefined,
              );
              // Realign pipe-delimited custom times by removing the deleted pill's entry
              if (onCustomTimeChange) {
                const pillStarts = parseMultiTimes(customStartTime, currentSegments.length);
                const pillEnds = parseMultiTimes(customEndTime, currentSegments.length);
                pillStarts.splice(removedIdx, 1);
                pillEnds.splice(removedIdx, 1);
                onCustomTimeChange(joinMultiTimes(pillStarts), joinMultiTimes(pillEnds));
              }
            }
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>,
    document.body,
  );
}
