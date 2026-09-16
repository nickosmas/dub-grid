"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { formatDate, getCertName, formatRelativeTime, calcTimeDuration } from "@/lib/utils";
import { Button } from "@/components/Button";
import { addDays as addDaysUtil, formatDateKey } from "@/lib/utils";
import { timesOverlap } from "@/lib/schedule-logic";
import { toDarkPillColors, resolveShiftPillColors, darkenColor } from "@/lib/colors";
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
  FocusArea,
  NamedItem,
  DraftKind,
  ShiftDisplayMode,
  Employee,
  ScheduleCellInput,
  ShiftJobSegment,
} from "@/types";
import CustomSelect from "./CustomSelect";
import ShiftPicker from "./ShiftPicker";
import { fmt12h, subtractOneHour, addOneHour } from "./shiftEditTime";
import { PillTimeEditor } from "./PillTimeEditor";
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
import { Check, ChevronLeft, ChevronRight, Clock, User } from "lucide-react";
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
  getActiveIndicatorIds?: (focusAreaId: number) => number[];
  onNoteToggle?: (indicatorTypeId: number, active: boolean, focusAreaId: number) => void;
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
  ) => void;
  /** True while a repeating series is being created. */
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
  /** Available absence types for off-day selection. */
  absenceTypes?: AbsenceType[];
  /** Currently active absence type ID on this cell. */
  currentAbsenceTypeId?: number | null;
  /** Cross-date overlap warnings to display (non-blocking). */
  overlapWarnings?: string[];
  /** When true, overlap warnings block saving (admin can override). */
  enforceConflicts?: boolean;
  /** Whether the org allows shift-only ("default shift") assignments in the picker. */
  defaultShiftEnabled?: boolean;
  /** Controls shift display: 'code' shows short labels, 'name' shows full names. */
  shiftDisplayMode?: ShiftDisplayMode;
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

const shiftEditCardOuterRadius = "var(--dg-radius-md)";
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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ── Per-pill custom time editor (custom dropdown views, immediate save) ───
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
  isCreatingRepeatSeries = false,
  empId,
  customStartTime,
  customEndTime,
  onCustomTimeChange,
  publishedAssignmentIds = [],
  publishedAbsenceTypeId = null,
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
  overlapWarnings = [],
  enforceConflicts = false,
  shiftDisplayMode = "code",
  defaultShiftEnabled = true,
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
    { type: "all" } | { type: "pill"; index: number } | null
  >(null);

  const hasActiveShift = !!(currentShift && currentShift !== "OFF");
  const isAbsence = currentAbsenceTypeId != null;
  const [showPicker, setShowPicker] = useState(!hasActiveShift);
  const [showRepeatForm, setShowRepeatForm] = useState(false);
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
  const [initialCustomStartTime] = useState(() => customStartTime ?? null);
  const [initialCustomEndTime] = useState(() => customEndTime ?? null);
  const [initialNotesByFocusArea] = useState<Record<number, number[]>>(() => {
    if (!getActiveIndicatorIds) return {};
    const focusAreaIds = new Set<number>(modal.empFocusAreaIds);
    for (const st of assignments) {
      if (st.focusAreaId != null) focusAreaIds.add(st.focusAreaId);
    }
    const record: Record<number, number[]> = {};
    for (const faId of focusAreaIds) {
      record[faId] = [...getActiveIndicatorIds(faId)];
    }
    return record;
  });
  const hasPublishedBaseline = publishedAssignmentIds.length > 0 || publishedAbsenceTypeId != null;
  const panelDiff = useMemo(
    () =>
      buildShiftDiffDescriptors({
        before: {
          assignmentIds: hasPublishedBaseline ? publishedAssignmentIds : initialAssignmentIds,
          absenceTypeId: hasPublishedBaseline ? publishedAbsenceTypeId : initialAbsenceTypeId,
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
      publishedCustomStartTime,
      publishedCustomEndTime,
      initialAssignmentIds,
      initialAbsenceTypeId,
      initialCustomStartTime,
      initialCustomEndTime,
      currentAssignmentIds,
      currentAbsenceTypeId,
      customStartTime,
      customEndTime,
      assignableShiftDisplayMap,
      absenceTypes,
    ],
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

  // Derive whether any edits have been made since panel opened
  const hasShiftEdit =
    currentShift !== initialShift ||
    (currentAbsenceTypeId ?? null) !== initialAbsenceTypeId ||
    !segmentsMatchInitial();
  const hasTimeEdit =
    (customStartTime ?? null) !== initialCustomStartTime ||
    (customEndTime ?? null) !== initialCustomEndTime;
  const hasNoteEdit = (() => {
    if (!getActiveIndicatorIds) return false;
    for (const [faIdStr, initTypes] of Object.entries(initialNotesByFocusArea)) {
      const curTypes = getActiveIndicatorIds(Number(faIdStr));
      if (curTypes.length !== initTypes.length) return true;
      if (curTypes.some((t) => !initTypes.includes(t))) return true;
    }
    return false;
  })();
  const hasEdits = hasShiftEdit || hasNoteEdit || hasTimeEdit;

  // Build concise change descriptions for the footer summary
  function describeShiftChange(): string | null {
    if (!hasShiftEdit) return null;

    // Absence type changed — no per-pill detail needed
    if ((currentAbsenceTypeId ?? null) !== initialAbsenceTypeId) {
      const resolveLabel = (shift: string | null, absId: number | null): string | null => {
        if (absId != null) {
          const at = absenceTypes.find((a) => a.id === absId);
          if (!at) return null;
          return at.name || at.label;
        }
        return shift && shift !== "OFF" ? shift : null;
      };
      const from = resolveLabel(initialShift, initialAbsenceTypeId);
      const to = resolveLabel(currentShift, currentAbsenceTypeId ?? null);
      if (!from && to) return `Shift: added ${to}`;
      if (from && !to) return `Shift: ${from} removed`;
      if (from && to) return `Shift: ${from} \u2192 ${to}`;
      return null;
    }

    const codeLabel = (id: number): string => {
      return assignableShiftDisplayMap.get(id) ?? "?";
    };

    const initIds = initialAssignmentIds;
    const curIds = currentAssignmentIds;

    // Single pill
    if (initIds.length <= 1 && curIds.length <= 1) {
      const from = initIds[0] != null ? codeLabel(initIds[0]) : null;
      const to = curIds[0] != null ? codeLabel(curIds[0]) : null;
      if (!from && to) return `Shift: added ${to}`;
      if (from && !to) return `Shift: ${from} removed`;
      if (from && to && initIds[0] !== curIds[0]) return `Shift: ${from} \u2192 ${to}`;
      return null;
    }

    // Multi-pill: per-pill detail
    const maxLen = Math.max(initIds.length, curIds.length);
    const parts: string[] = [];
    for (let i = 0; i < maxLen; i++) {
      const fromId = initIds[i];
      const toId = curIds[i];
      const from = fromId != null ? codeLabel(fromId) : null;
      const to = toId != null ? codeLabel(toId) : null;
      if (fromId === toId) continue;
      if (!from && to) parts.push(`added ${to}`);
      else if (from && !to) parts.push(`removed ${from}`);
      else if (from && to) parts.push(`${from} \u2192 ${to}`);
    }
    return parts.length > 0 ? `Shift: ${parts.join(", ")}` : null;
  }

  function describeTimeChange(): string | null {
    if (!hasTimeEdit) return null;

    const pillCount = currentAssignmentIds.length;
    const codeLabel = (id: number): string => {
      return assignableShiftDisplayMap.get(id) ?? "?";
    };

    // Single pill
    if (pillCount <= 1) {
      const hadTime = initialCustomStartTime != null || initialCustomEndTime != null;
      const hasTime = (customStartTime ?? null) != null || (customEndTime ?? null) != null;
      if (!hadTime && hasTime) {
        return `Time: added ${fmt12h(customStartTime)} \u2013 ${fmt12h(customEndTime)}`;
      }
      if (hadTime && !hasTime) return "Time: removed custom time";
      return `Time: ${fmt12h(initialCustomStartTime)} \u2013 ${fmt12h(initialCustomEndTime)} \u2192 ${fmt12h(customStartTime)} \u2013 ${fmt12h(customEndTime)}`;
    }

    // Multi-pill: per-pill detail
    const maxPills = Math.max(initialAssignmentIds.length, pillCount);
    const initStarts = parseMultiTimes(initialCustomStartTime, maxPills);
    const initEnds = parseMultiTimes(initialCustomEndTime, maxPills);
    const curStarts = parseMultiTimes(customStartTime, maxPills);
    const curEnds = parseMultiTimes(customEndTime, maxPills);

    const parts: string[] = [];
    for (let i = 0; i < pillCount; i++) {
      if (initStarts[i] === curStarts[i] && initEnds[i] === curEnds[i]) continue;
      const label = currentAssignmentIds[i] != null ? codeLabel(currentAssignmentIds[i]) : "?";
      const hadPillTime = initStarts[i] != null || initEnds[i] != null;
      const hasPillTime = curStarts[i] != null || curEnds[i] != null;
      if (!hadPillTime && hasPillTime) {
        parts.push(`${label}: added ${fmt12h(curStarts[i])} \u2013 ${fmt12h(curEnds[i])}`);
      } else if (hadPillTime && !hasPillTime) {
        parts.push(`${label}: removed custom time`);
      } else {
        parts.push(
          `${label}: ${fmt12h(initStarts[i])} \u2013 ${fmt12h(initEnds[i])} \u2192 ${fmt12h(curStarts[i])} \u2013 ${fmt12h(curEnds[i])}`,
        );
      }
    }
    return parts.length > 0 ? `Time: ${parts.join("; ")}` : null;
  }

  function describeNoteChange(): string | null {
    if (!hasNoteEdit || !getActiveIndicatorIds) return null;
    const tokens: string[] = [];
    for (const [faIdStr, initTypes] of Object.entries(initialNotesByFocusArea)) {
      const curTypes = getActiveIndicatorIds(Number(faIdStr));
      for (const id of curTypes) {
        if (!initTypes.includes(id)) {
          const name = indicatorTypes.find((ind) => ind.id === id)?.name ?? "?";
          tokens.push(`+${name}`);
        }
      }
      for (const id of initTypes) {
        if (!curTypes.includes(id)) {
          const name = indicatorTypes.find((ind) => ind.id === id)?.name ?? "?";
          tokens.push(`\u2212${name}`);
        }
      }
    }
    return tokens.length > 0 ? `Notes: ${tokens.join(", ")}` : null;
  }

  const shiftSummary = hasShiftEdit ? describeShiftChange() : null;
  const timeSummary = hasTimeEdit ? describeTimeChange() : null;
  const noteSummary = hasNoteEdit ? describeNoteChange() : null;
  const confirmBlocked = isStale || (enforceConflicts && overlapWarnings.length > 0);

  function buildPanelInput(args: {
    segments: Array<Pick<ShiftJobSegment, "shiftId" | "jobId" | "position" | "isMentored">>;
    absenceTypeId: number | null;
    customStartTime: string | null;
    customEndTime: string | null;
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

    return {
      kind: "worked",
      segments: args.segments.map((segment, index) => ({
        shiftId: segment.shiftId,
        jobId: segment.jobId,
        position: segment.position ?? index,
        isMentored: segment.isMentored ?? false,
      })),
      absenceTypeId: null,
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
    // Revert absence type if it changed
    if ((currentAbsenceTypeId ?? null) !== initialAbsenceTypeId || currentShift !== initialShift) {
      onSelect(
        buildPanelInput({
          segments: initialSegments,
          absenceTypeId: initialAbsenceTypeId,
          customStartTime: initialCustomStartTime,
          customEndTime: initialCustomEndTime,
        }),
      );
    }
    // Revert custom times if changed
    if (hasTimeEdit && onCustomTimeChange) {
      onCustomTimeChange(initialCustomStartTime, initialCustomEndTime);
    }
    // Revert notes for each focus area
    if (getActiveIndicatorIds) {
      for (const [faIdStr, initTypes] of Object.entries(initialNotesByFocusArea)) {
        const faId = Number(faIdStr);
        const curTypes = getActiveIndicatorIds(faId);
        for (const type of initTypes) {
          if (!curTypes.includes(type)) onNoteToggle?.(type, true, faId);
        }
        for (const type of curTypes) {
          if (!initTypes.includes(type)) onNoteToggle?.(type, false, faId);
        }
      }
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

  // ── Double-shift time-sequential filtering ──────────────────────────────
  const isAddingSecondShift = showPicker && currentAssignmentIds.length === 1;
  const firstShiftId = isAddingSecondShift ? currentAssignmentIds[0] : null;

  const firstShiftEndTime: string | null = (() => {
    if (!isAddingSecondShift) return null;
    const firstCode = assignments.find((sc) => sc.id === firstShiftId);
    return resolveDefaultTimes(firstCode).end;
  })();

  const pickerAssignmentDefinitions =
    isAddingSecondShift && firstShiftEndTime
      ? assignments.filter((sc) => {
          // Never show the already-selected first shift
          if (sc.id === firstShiftId) return false;
          if (sc.isGeneral) return false;
          const { start } = resolveDefaultTimes(sc);
          if (!start) return false;
          // Candidate must start at or after first shift ends (prevents overlap + same-time)
          return timeToMinutes(start) >= timeToMinutes(firstShiftEndTime);
        })
      : assignments;

  const pickerAbsenceTypes = isAddingSecondShift ? [] : absenceTypes;

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
    [getShiftTimeRanges, modal.empId, requestShiftDate],
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
            ? "Offer shift for pickup?"
            : pendingRequestConfirmation.kind === "targeted_pickup"
              ? "Request pickup?"
              : pendingRequestConfirmation.kind === "calloff"
                ? "Submit call off request?"
                : "Submit swap request?"
        }
        message={
          pendingRequestConfirmation.kind === "pickup"
            ? `Offer your ${selectedRequesterLabel} shift on ${formatDate(modal.date)} for pickup?`
            : pendingRequestConfirmation.kind === "targeted_pickup"
              ? `Ask ${pendingRequestConfirmation.targetName} to pick up your ${selectedRequesterLabel} shift on ${formatDate(modal.date)} while you use ${getAbsenceTypeDisplayName(pendingRequestConfirmation.absenceType)}?`
              : pendingRequestConfirmation.kind === "calloff"
                ? `Submit ${indefiniteArticle(getAbsenceTypeDisplayName(pendingRequestConfirmation.absenceType))} ${getAbsenceTypeDisplayName(pendingRequestConfirmation.absenceType)} absence request for your ${selectedRequesterLabel} shift on ${formatDate(modal.date)}?`
                : `Swap your ${selectedRequesterLabel} shift on ${formatDate(modal.date)} with ${pendingRequestConfirmation.targetName}'s ${pendingRequestConfirmation.targetShiftLabel || "selected"} shift on ${formatDate(new Date(`${pendingRequestConfirmation.targetShiftDate}T00:00:00`))}?`
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
                  const renderTargetOptions =
                    targetSegmentOptions.length > 1
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
                      targetOption.segmentIndex != null
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
                          {targetOption.segmentIndex != null
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
    const noteTypes = getActiveIndicatorIds ? getActiveIndicatorIds(activeTab) : [];
    const cellDiffBadge = panelDiff.cellBadge;
    const cellBorderKind: ShiftDiffBorderKind =
      cellDiffBadge?.kind === "new" ? "new" : cellDiffBadge ? "modified" : null;

    // Absence type pill — use absence type colors directly
    if (isAbsence) {
      const at = absenceTypes.find((a) => a.id === currentAbsenceTypeId);
      if (!at) return null;
      const absenceLabel = at.name || at.label;
      const atResolved = resolveShiftPillColors(
        { color: at.color, text: at.text, border: at.border },
        isDarkTheme,
      );
      return (
        <div
          style={{
            background: atResolved.color,
            border: getPanelDiffBorder({
              diffKind: cellBorderKind,
              fallback:
                atResolved.border === "transparent"
                  ? `1.5px solid ${darkenColor(atResolved.color, 0.25)}`
                  : `1.5px solid ${atResolved.border}`,
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
          const pillNoteTypes = getActiveIndicatorIds ? getActiveIndicatorIds(shiftWingId) : [];
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
              }}
            >
              {renderShiftDiffBadge(pillDiff.badge, i)}
              {/* Pill header */}
              <div
                data-shift-edit-card-header={i}
                style={{
                  background: s.color,
                  borderBottom: `1px solid ${darkenColor(s.color, 0.2)}`,
                  minHeight: 44,
                  padding: isNameMode ? "10px 12px" : "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: `${shiftEditCardInnerRadius} ${shiftEditCardInnerRadius} 0 0`,
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
                </div>
                {/* Per-pill remove button */}
                {allowShiftEdits && (
                  <Button
                    onClick={() => setPendingDelete({ type: "pill", index: i })}
                    aria-label={`Remove ${previewLabel}`}
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      border: "none",
                      background: "rgba(0,0,0,0.12)",
                      color: s.text,
                      fontSize: "var(--dg-fs-body)",
                      lineHeight: 1,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "inherit",
                    }}
                  >
                    ×
                  </Button>
                )}
                {/* Note dots — left side to avoid × button */}
                {renderNoteDots(pillNoteTypes, "left")}
              </div>
              {/* Card body: default time, per-pill custom time editor, + indicators */}
              <div
                data-shift-edit-card-body={i}
                style={{
                  padding: "10px 12px",
                  background: "var(--dg-color-surface)",
                  borderRadius: `0 0 ${shiftEditCardInnerRadius} ${shiftEditCardInnerRadius}`,
                }}
              >
                {/* Default time info */}
                {(defaultStart || defaultEnd) && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--dg-color-text-subtle)",
                    }}
                  >
                    <Clock size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>
                      {[
                        defaultStart ? fmt12h(defaultStart) : null,
                        defaultEnd ? fmt12h(defaultEnd) : null,
                      ]
                        .filter(Boolean)
                        .join(" – ")}
                    </span>
                    {calcTimeDuration(defaultStart, defaultEnd) && (
                      <span style={{ opacity: 0.7 }}>
                        · {calcTimeDuration(defaultStart, defaultEnd)}
                      </span>
                    )}
                  </div>
                )}
                {focusAreaLabel ? (
                  <div
                    style={{
                      marginTop: defaultStart || defaultEnd ? 6 : 0,
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--dg-color-text-secondary)",
                      fontWeight: 500,
                    }}
                  >
                    {focusAreaLabel}
                  </div>
                ) : null}
                {allowShiftEdits && currentSegments[i] ? (
                  <div
                    style={{
                      marginTop: defaultStart || defaultEnd || focusAreaLabel ? 10 : 0,
                      paddingTop: defaultStart || defaultEnd || focusAreaLabel ? 10 : 0,
                      borderTop:
                        defaultStart || defaultEnd || focusAreaLabel
                          ? "1px solid var(--dg-color-border-light)"
                          : "none",
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
                          const newStarts = [...pillStarts];
                          const newEnds = [...pillEnds];
                          newStarts[i] = start;
                          newEnds[i] = end;
                          onCustomTimeChange(joinMultiTimes(newStarts), joinMultiTimes(newEnds));
                        }}
                        onRemove={() => {
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
                {renderInlineIndicators(shiftWingId)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderInlineIndicators(focusAreaId: number) {
    if (!canEditScheduleIndicators || indicatorTypes.length === 0) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 6 }}>
        {indicatorTypes.map(({ id, name, color }) => {
          const isActive = getActiveIndicatorIds
            ? getActiveIndicatorIds(focusAreaId).includes(id)
            : false;
          if (isActive) {
            return (
              <div
                key={id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  border: `1.5px solid ${color}`,
                  borderRadius: 20,
                  background: `${color}18`,
                  color,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    paddingLeft: 10,
                    fontSize: "var(--dg-fs-footnote)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  {name}
                </div>
                <Button
                  aria-label={`Remove ${name} indicator`}
                  onClick={() => onNoteToggle?.(id, false, focusAreaId)}
                  className="dg-btn dg-btn-ghost"
                  style={{
                    height: 28,
                    minHeight: 28,
                    padding: "0 9px",
                    marginLeft: 6,
                    borderLeft: `1px solid ${color}40`,
                    borderRadius: 0,
                    fontSize: "var(--dg-fs-footnote)",
                    color,
                  }}
                >
                  Remove
                </Button>
              </div>
            );
          }
          return (
            <Button
              key={id}
              aria-label={`Add ${name} indicator`}
              onClick={() => onNoteToggle?.(id, true, focusAreaId)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                border: "1.5px solid var(--dg-color-border)",
                borderRadius: 20,
                background: "var(--dg-color-surface)",
                cursor: "pointer",
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 600,
                color: "var(--dg-color-text-subtle)",
                fontFamily: "inherit",
                transition: "border-color 150ms ease, background 150ms ease",
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--dg-color-border)",
                  flexShrink: 0,
                }}
              />
              {name}
            </Button>
          );
        })}
      </div>
    );
  }

  function renderNotesSection() {
    if (!canEditScheduleIndicators || indicatorTypes.length === 0) return null;
    return (
      <div>
        <div style={sectionLabel}>Indicators</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {indicatorTypes.map(({ id, name, color }) => {
            const isActive = getActiveIndicatorIds
              ? getActiveIndicatorIds(activeTab).includes(id)
              : false;
            const identity = (
              <>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                    border: "1px solid rgba(0,0,0,0.08)",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      fontWeight: 700,
                      color: isActive ? color : "var(--dg-color-text-secondary)",
                    }}
                  >
                    {name}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--dg-fs-badge)",
                      color: "var(--dg-color-text-subtle)",
                      marginTop: 1,
                    }}
                  >
                    Appears as a colored dot
                  </div>
                </div>
              </>
            );

            if (isActive) {
              return (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 8px 8px 12px",
                    border: `1.5px solid ${color}`,
                    borderRadius: "var(--dg-radius-md)",
                    background: `${color}18`,
                    width: "100%",
                  }}
                >
                  {identity}
                  <Button
                    aria-label={`Remove ${name} indicator`}
                    onClick={() => onNoteToggle?.(id, false, activeTab)}
                    className="dg-btn dg-btn-secondary"
                    style={{
                      height: 32,
                      minHeight: 32,
                      padding: "0 10px",
                      fontSize: "var(--dg-fs-footnote)",
                      color,
                    }}
                  >
                    Remove
                  </Button>
                </div>
              );
            }

            return (
              <Button
                key={id}
                aria-label={`Add ${name} indicator`}
                onClick={() => onNoteToggle?.(id, true, activeTab)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1.5px solid var(--dg-color-border)",
                  borderRadius: "var(--dg-radius-md)",
                  background: "var(--dg-color-surface)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 150ms ease, background 150ms ease",
                  width: "100%",
                  fontFamily: "inherit",
                }}
              >
                {identity}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  // Detail mode: show when we have an active shift and aren't in picker mode
  // (or when shift edits are not allowed)
  const inDetailMode = !allowShiftEdits || (!showPicker && hasActiveShift);
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
        aria-label="Edit shift"
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
          {isMobile && (
            <Button
              onClick={close}
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
          ) : showRepeatForm && onRepeatConfirm && empId ? (
            // ── Repeat form mode ─────────────────────────────────────────────
            <RepeatForm
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
            />
          ) : inDetailMode ? (
            // ── Detail mode ──────────────────────────────────────────────────
            <>
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
                        onSave={(start, end) => onCustomTimeChange(start, end)}
                        onRemove={() => onCustomTimeChange(null, null)}
                      />
                    </div>
                  );
                })()}

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

              {/* Series scope selector — shown when editing a repeating shift */}
              {allowShiftEdits && seriesId && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 12px",
                    background: "var(--dg-color-warning-bg)",
                    border: "1px solid var(--dg-color-warning-border)",
                    borderRadius: "var(--dg-radius-md)",
                  }}
                >
                  <div
                    style={{
                      ...sectionLabel,
                      marginBottom: 6,
                      color: "var(--dg-color-warning-text)",
                    }}
                  >
                    {isAbsence ? "Repeating: edit scope" : "Repeating shift: edit scope"}
                  </div>
                  <div className="dg-segment" style={{ display: "flex" }}>
                    <Button
                      onClick={() => setSeriesScope("this")}
                      className={`dg-segment-btn${seriesScope === "this" ? " active" : ""}`}
                      style={{ flex: 1, fontSize: "var(--dg-fs-footnote)" }}
                    >
                      {isAbsence ? "This only" : "This shift"}
                    </Button>
                    <Button
                      onClick={() => setSeriesScope("all")}
                      className={`dg-segment-btn${seriesScope === "all" ? " active" : ""}`}
                      style={{ flex: 1, fontSize: "var(--dg-fs-footnote)" }}
                    >
                      All in series
                    </Button>
                  </div>
                </div>
              )}

              {/* Make repeating — disabled for split shifts (max 1 code) */}
              {allowShiftEdits &&
                hasActiveShift &&
                !seriesId &&
                onRepeatConfirm &&
                currentLabels.length <= 1 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={sectionLabel}>Repeating</div>
                    <Hint
                      content={hint("Create a recurring pattern (daily, weekly, biweekly)")}
                      side="top"
                    >
                      <Button
                        data-tour="edit-panel-repeat-btn"
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
                  </div>
                )}

              {/* Notes / Indicators — single shift only; multi-shift shows inline per pill; hidden for
                  absences and for an empty cell, since an indicator describes a shift */}
              {hasActiveShift && currentLabels.length <= 1 && !isAbsence && renderNotesSection()}

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

              {/* Remove shift */}
              {allowShiftEdits && hasActiveShift && (
                <div style={{ marginTop: 16 }}>
                  <Button
                    onClick={() => setPendingDelete({ type: "all" })}
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
                    {isAbsence
                      ? "Remove off day"
                      : currentLabels.length > 1
                        ? "Remove all shifts"
                        : "Remove shift"}
                  </Button>
                </div>
              )}

              {/* Add another shift — hidden when at max (2), absence type, or first shift has no resolvable end time */}
              {allowShiftEdits &&
                !isAbsence &&
                currentLabels.length < 2 &&
                (() => {
                  const firstCode = assignments.find((sc) => sc.id === currentAssignmentIds[0]);
                  return firstCode ? resolveDefaultTimes(firstCode).end != null : true;
                })() && (
                  <div style={{ marginTop: 8 }}>
                    <Button
                      onClick={() => setShowPicker(true)}
                      className="dg-btn dg-btn-ghost"
                      style={{
                        width: "100%",
                        fontSize: "var(--dg-fs-caption)",
                        padding: "9px 12px",
                        border: "1px dashed var(--dg-color-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
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
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add another shift
                    </Button>
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
                  onClick={() => setShowPicker(false)}
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
                  No shifts start at or after {fmt12h(firstShiftEndTime)}.
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
                    onSelect={(segments) => {
                      onSelect(
                        buildPanelInput({
                          segments,
                          absenceTypeId: null,
                          customStartTime: customStartTime ?? null,
                          customEndTime: customEndTime ?? null,
                        }),
                        seriesId ? seriesScope : undefined,
                      );
                      if (segments.length > 0) setShowPicker(false);
                    }}
                    onAbsenceSelect={(at) => {
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

        {showRepeatForm && onRepeatConfirm && empId && (
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
              onClick={() => setShowRepeatForm(false)}
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
                {isAbsence ? "Create Repeating Off Day" : "Create Repeating Shift"}
              </ButtonLoading>
            </Button>
          </div>
        )}

        {/* Sticky footer — only shown when edits exist */}
        {hasEdits && !showRepeatForm && (
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
            {(shiftSummary || timeSummary || noteSummary) && (
              <div
                style={{
                  fontSize: "var(--dg-fs-badge)",
                  color: "var(--dg-color-text-muted)",
                  lineHeight: 1.4,
                }}
              >
                {shiftSummary && <div>{shiftSummary}</div>}
                {timeSummary && <div>{timeSummary}</div>}
                {noteSummary && <div>{noteSummary}</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                onClick={handleUndo}
                className="dg-btn dg-btn-ghost"
                style={{
                  flex: 1,
                  fontSize: "var(--dg-fs-caption)",
                  padding: "9px 12px",
                  border: "1px solid var(--dg-color-border)",
                }}
              >
                Undo
              </Button>
              <Button
                onClick={() => onConfirmDraft?.(seriesId ? seriesScope : undefined)}
                className="dg-btn dg-btn-primary"
                style={{ flex: 1, fontSize: "var(--dg-fs-caption)", padding: "9px 12px" }}
                disabled={confirmBlocked}
              >
                Confirm
              </Button>
            </div>
          </div>
        )}
        <ScrollOverflowCue />
      </div>

      {renderPendingRequestConfirmation()}

      {/* Confirm delete dialog */}
      {pendingDelete && (
        <ConfirmDialog
          title={
            isAbsence
              ? "Remove Off Day?"
              : pendingDelete.type === "all" && currentLabels.length > 1
                ? "Remove All Shifts?"
                : "Remove Shift?"
          }
          message={
            isAbsence
              ? `Remove off day "${currentLabels[0]}" from ${modal.empName} on ${formatDate(modal.date)}?`
              : pendingDelete.type === "pill"
                ? `Remove "${currentLabels[pendingDelete.index]}" from ${modal.empName} on ${formatDate(modal.date)}?`
                : currentLabels.length > 1
                  ? `Remove all shifts (${currentLabels.join(", ")}) from ${modal.empName} on ${formatDate(modal.date)}?`
                  : `Remove "${currentLabels[0]}" from ${modal.empName} on ${formatDate(modal.date)}?`
          }
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => {
            if (pendingDelete.type === "all") {
              onSelect(null, seriesId ? seriesScope : undefined);
              if (onCustomTimeChange) onCustomTimeChange(null, null);
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
