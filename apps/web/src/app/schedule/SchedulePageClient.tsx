"use client";

import * as Sentry from "@/lib/sentry";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import Toolbar from "@/components/Toolbar";
import ScheduleGrid, {
  buildScheduleGridModel,
  type ScheduleGridHandlers,
  type ScheduleGridInteractionState,
} from "@/components/ScheduleGrid";
import MonthView from "@/components/MonthView";
import { EmptyState } from "@/components/EmptyState";
import PrintLegend from "@/components/PrintLegend";
import type { PrintConfig } from "@/components/PrintOptionsModal";
import ChangeLegend from "@/components/ChangeLegend";
import DraftBanner from "@/components/DraftBanner";
import DraftReviewSummary from "@/components/DraftReviewSummary";
import PublishHistoryPanel from "@/components/PublishHistoryPanel";
import ScheduleOperationModal from "@/components/ScheduleOperationModal";
import BulkDeleteReviewContent, {
  type BulkDeleteReviewTarget,
} from "./_components/BulkDeleteReviewContent";
import { resolveGridAuditLabel } from "./_lib/grid-audit-label";
import {
  buildGridCalloffOpenShiftsFromRequests,
  countPendingVolunteerRequestsForCoverageGap,
  hasPendingVolunteerRequestForCoverageGap,
  selectVisibleCoverageGaps,
} from "./_lib/open-shifts";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import { X } from "lucide-react";

const ShiftEditPanel = dynamic(() => import("@/components/ShiftEditPanel"), {
  ssr: false,
});
const PrintOptionsModal = dynamic(
  () => import("@/components/PrintOptionsModal"),
  { ssr: false },
);
const PrintScheduleView = dynamic(
  () => import("@/components/PrintScheduleView"),
  { ssr: false },
);
const ShiftRequestBoard = dynamic(
  () => import("@/components/ShiftRequestBoard"),
  { ssr: false },
);
const CoveragePanel = dynamic(() => import("@/components/CoveragePanel"), {
  ssr: false,
});

import { ScheduleLoadingScreen } from "./ScheduleLoadingScreen";
import {
  addDays,
  formatDate,
  formatDateKey,
  getWeekStart,
  getEmployeeDisplayName,
  iterateDateRange,
} from "@/lib/utils";
import {
  hasShiftStartedAtTimeRanges,
} from "@dubgrid/schedule-core";
import {
  filterAndSortEmployees,
  hasVisibleGridShiftEntry,
  buildAssignmentDefinitionIdsByFocusArea as buildAssignmentIdsByFocusArea,
  buildPublishedDateSet,
  computeCoverageGaps,
  createCoverageCreditResolver,
  filterPublishedDates,
  getPublishedWindowState,
  timesOverlap,
  checkCrossDateOverlap,
  checkSameDayOverlaps,
} from "@/lib/schedule-logic";
import type { TimeRange } from "@/lib/schedule-logic";
import {
  buildShiftDisplayParts,
  formatAssignableShiftOptionLabel,
  formatShiftAssignmentDisqualificationMessage,
  getAssignmentDefinitionDisqualificationReasons as getAssignmentDisqualificationReasons,
  isEmployeeQualifiedForAssignmentDefinition as isEmployeeQualifiedForAssignment,
} from "@/lib/assignable-shifts";
import { createShiftJobCompatibilityMaps } from "@/lib/shift-job-segments";
import {
  buildScheduleCellEntryFromInput,
  deriveAssignmentDefinitionIdsFromScheduleCellInput as deriveAssignmentIdsFromScheduleCellInput,
  resolveScheduleCellSnapshotFromInput,
  scheduleCellSnapshotToInput,
} from "@/lib/schedule-cells";
import {
  OptimisticLockError,
  applyRecurringSchedules,
  createShiftSeries,
  deleteScheduleNote,
  deleteShift,
  deleteShiftBatch,
  deleteShiftSeries,
  discardScheduleDrafts,
  fetchCalloffOpenShifts,
  fetchPublishedDateRanges,
  fetchRecentPublishHistory,
  fetchRecurringShifts,
  fetchScheduleActorNames,
  fetchScheduleNotes,
  fetchShifts,
  getScheduleLastViewed,
  importPreviousSchedule,
  moveShift,
  publishSchedule,
  updateScheduleLastViewed,
  updateSeriesAllShifts,
  upsertScheduleNote,
  upsertShift,
  upsertShiftTimes,
  type DeleteShiftBatchItem,
  type ImportPreviousScheduleOutcome,
} from "@/features/schedule/client";
import {
  computeDraftBreakdown,
  computeOutOfWindowDraftGroups,
  formatDraftBreakdownSummary,
} from "@/lib/draft-utils";
import { exportScheduleCSV } from "@/lib/export-csv";
import { queueNotification } from "@/lib/notify";
import { buildRealtimeDraftDiff } from "@/lib/realtime-draft-utils";
import {
  getScheduleStartForSpan,
  resolveScheduleSpan,
} from "@/lib/schedule-view";
import {
  usePermissions,
  useOrganizationData,
  useEmployees,
  useCellLocks,
  useReliableRealtimeBroadcasts,
  useShiftRequests,
  useDismissibleBanner,
} from "@/hooks";
import { useAuth } from "@/components/AuthProvider";
import {
  type BrowserRealtimeChannel,
  createBrowserRealtimeChannel,
  fetchAccountIdentity,
  removeBrowserRealtimeChannel,
} from "@/features/account/client";
import PresenceAvatars from "@/components/PresenceAvatars";
import { ProtectedRoute } from "@/components/RouteGuards";
import SetupGuard from "@/components/SetupGuard";
import { toast } from "sonner";
import ShiftContextMenu from "@/components/ShiftContextMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import CustomSelect from "@/components/CustomSelect";
import MobileDayView from "@/components/MobileDayView";
import { useMediaQuery, MOBILE, AUTO_ONE_WEEK } from "@/hooks";
import {
  useSetMobileSubNav,
  SubNavItem,
} from "@/components/MobileSubNavContext";
import { mergeDraftChangedBroadcastPayload } from "./_lib/draft-broadcast";
import {
  shouldRenderScheduleAuthorNames,
} from "./_lib/editor-visibility";
import {
  cloneDraftNotes,
  cloneShiftEntry,
  computeScheduleEntryDraftKind,
  serializeNotesSnapshot,
  serializeShiftSnapshot,
  shiftEditableIdentityMatches,
  type DraftNoteState,
  type EditSessionDraft,
} from "./_lib/editor-session";
import {
  clampProgress,
  DRAFT_CHANGED_BROADCAST_KEY,
  formatImportPreviousSkipDescription,
  OPERATION_MODAL_DISMISS_MS,
  PUBLISH_WINDOW_DATE_FORMATTER,
  SCHEDULE_DELETE_BATCH_SIZE,
  summarizeImportPreviousOutcomes,
  type ImportPreviousBreakdown,
  type ScheduleOperation,
} from "./_lib/operations";
import {
  Employee,
  EditModalState,
  GridCellId,
  ShiftMap,
  AssignmentDefinition,
  AbsenceType,
  RecurringShift,
  SeriesFrequency,
  SeriesScope,
  DraftKind,
  PublishChange,
  PublishHistoryEntry,
  GridOpenShift,
  ScheduleCellInput,
  ShiftJobSegment,
} from "@/types";

type CoverageGap = ReturnType<typeof computeCoverageGaps>[number];

type ContextMenuState = {
  anchorEl: HTMLElement;
  cellId: GridCellId;
};

type BulkDeleteTarget = BulkDeleteReviewTarget & {
  key: string;
  empId: string;
  dateKey: string;
};

type ShiftDeleteUpdate = {
  key: string;
  empId: string;
  dateKey: string;
  value: ShiftMap[string] | null;
  expectedVersion: number | undefined;
};

export type SchedulePageInitialState = {
  authenticatedUserId: string | null;
  orgId: string | null;
  serverLoadedAt: string;
};

function getFirstCustomTimeSegment(time: string | null | undefined): string | null {
  if (!time) return null;
  const segment = time.split("|")[0]?.trim();
  return segment ? segment : null;
}

function normalizeCustomTimeForSegmentCount(
  time: string | null | undefined,
  segmentCount: number,
): string | null {
  if (segmentCount === 1) {
    return getFirstCustomTimeSegment(time);
  }
  return time ?? null;
}

type ImportPreviewState = {
  sourceRange: string;
  targetRange: string;
  sourceStartDate: string;
  sourceEndDate: string;
  targetStartDate: string;
  targetEndDate: string;
  outcomes: ImportPreviousScheduleOutcome[];
  breakdown: ImportPreviousBreakdown;
};

function SchedulerContent() {
  const isMobile = useMediaQuery(MOBILE);
  const shouldAutoUseOneWeek = useMediaQuery(AUTO_ONE_WEEK);
  const { user: authUser } = useAuth();
  const {
    canEditShifts,
    canEditNotes,
    canEditScheduleIndicators,
    canApplyRecurringSchedule,
    canViewRecurringShifts,
    canManageShiftSeries,
    canPublishSchedule,
    canApproveShiftRequests,
    isSuperAdmin,
    isLoading: permsLoading,
    orgId,
  } = usePermissions();
  const {
    org,
    focusAreas,
    assignments: assignments,
    allAssignmentDefinitions: allAssignmentDefinitions,
    shiftCategories,
    jobs,
    indicatorTypes,
    certifications,
    orgRoles,
    assignmentLabelMap: assignmentLabelMap,
    absenceTypes,
    allAbsenceTypes,
    absenceTypeMap,
    coverageRequirements,
    departments,
    loading: orgLoading,
    loadError,
  } = useOrganizationData();
  // Use orgId from JWT (available immediately) so employee fetch starts
  // in parallel with org data instead of waiting for it.
  const { employees, loading: empLoading } = useEmployees(
    orgId ?? org?.id ?? null,
  );
  const segmentCompatibility = useMemo(
    () =>
      createShiftJobCompatibilityMaps({
        assignments: assignments,
        shiftCategories,
        jobs,
        shiftDisplayMode: org?.shiftDisplayMode ?? "code",
      }),
    [jobs, org?.shiftDisplayMode, shiftCategories, assignments],
  );

  const [today, setToday] = useState(() => new Date());
  const [currentTimeTick, setCurrentTimeTick] = useState(() => Date.now());
  const payPeriodStartDate = org?.payPeriodStartDate ?? null;

  // Refresh `today` if the app stays open past midnight
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() -
      now.getTime();
    const timer = setTimeout(() => setToday(new Date()), msUntilMidnight + 500);
    return () => clearTimeout(timer);
  }, [today]);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTimeTick(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  // Date range for shift fetching: ±90 days from today.
  // Shifts outside this window are not loaded — keeps payload small for mature orgs.
  const shiftFetchStart = useMemo(
    () => formatDateKey(addDays(today, -90)),
    [today],
  );
  const shiftFetchEnd = useMemo(
    () => formatDateKey(addDays(today, 90)),
    [today],
  );

  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStart(new Date()),
  );
  const [activeFocusArea, setActiveFocusArea] = useState<number | null>(null);
  const [shifts, setShifts] = useState<ShiftMap>({});
  // Ref always points to the latest shifts — used in setShift to read fresh version
  // numbers even when the useCallback closure captures a stale `shifts` object.
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;
  // Serializes DB writes per shift key to prevent race conditions (e.g. edit → undo
  // firing before the edit's DB write completes, causing an optimistic lock conflict).
  const pendingShiftWrites = useRef<Map<string, Promise<void>>>(new Map());
  const [notes, setNotes] = useState<
    Record<
      string,
      {
        indicatorTypeId: number;
        status: "published" | "draft" | "draft_deleted";
      }[]
    >
  >({});
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const [editPanel, setEditPanel] = useState<EditModalState | null>(null);
  const [editSessionDraft, setEditSessionDraft] =
    useState<EditSessionDraft | null>(null);
  const editSessionDraftRef = useRef<EditSessionDraft | null>(null);
  editSessionDraftRef.current = editSessionDraft;
  const isApplyingEditSessionRef = useRef(false);
  const [preferredSpan, setPreferredSpan] = useState<1 | 2 | "month">(2);
  // Auto-downgrade 2-week to 1-week on cramped tablet and small-desktop widths.
  // Wider desktops keep 2-week available and rely on the grid's readable min widths.
  const spanWeeks: 1 | 2 | "month" = resolveScheduleSpan(
    preferredSpan,
    shouldAutoUseOneWeek,
  );
  useEffect(() => {
    if (spanWeeks !== 2) return;
    setWeekStart((prev) =>
      getScheduleStartForSpan({
        date: prev,
        span: 2,
        payPeriodStartDate,
      }),
    );
  }, [payPeriodStartDate, spanWeeks]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [staffSearch, setStaffSearch] = useState("");
  // My Schedule mode: for regular users, default to showing only their own shifts
  const [isPublishing, setIsPublishing] = useState(false);
  const [cancelingMode, setCancelingMode] = useState<null | "mine" | "all">(
    null,
  );
  const [, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [isApplyingRecurring, setIsApplyingRecurring] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [activePrintConfig, setActivePrintConfig] =
    useState<PrintConfig | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showAutoFillConfirm, setShowAutoFillConfirm] = useState(false);
  const [autoFillPreview, setAutoFillPreview] = useState<{
    count: number;
    dateRange: string;
  } | null>(null);
  const [showDiffOverlay, setShowDiffOverlay] = useState(false);
  const [pendingSeriesDelete, setPendingSeriesDelete] = useState<{
    seriesId: string;
    shiftCount: number;
  } | null>(null);
  const [publishHistory, setPublishHistory] = useState<PublishHistoryEntry[]>(
    [],
  );
  const [showPublishDiff, setShowPublishDiff] = useState(false);
  const [showPublishHistory, setShowPublishHistory] = useState(false);
  // Per-banner dismissals, persisted to sessionStorage so the X actually
  // sticks for the rest of the tab session — surviving the data-change
  // re-renders that previously kept re-showing the banner. Hiding is UI-only:
  // drafts and publish history are not touched, and the dismissal clears on
  // sign-out via the dg_* sweep in clearDubgridSessionState.
  const {
    isDismissed: outOfWindowDraftsDismissed,
    dismiss: dismissOutOfWindowDrafts,
  } = useDismissibleBanner("schedule-out-of-window-drafts");
  const {
    isDismissed: publishBannerDismissed,
    dismiss: dismissPublishBanner,
  } = useDismissibleBanner("schedule-publish");
  const {
    isDismissed: outOfWindowPublishesDismissed,
    dismiss: dismissOutOfWindowPublishes,
  } = useDismissibleBanner("schedule-out-of-window-publishes");
  const lastViewedRef = useRef<string | null>(null);
  const hasShownChangeToast = useRef(false);
  const [isImportingPrevious, setIsImportingPrevious] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(
    null,
  );
  const [activeOperation, setActiveOperation] =
    useState<ScheduleOperation | null>(null);
  const [isCreatingRepeatSeries, setIsCreatingRepeatSeries] = useState(false);
  const operationDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const operationTrickleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // ── Coverage Panel ─────────────────────────────────────────────────────────
  const [showCoveragePanel, setShowCoveragePanel] = useState(false);

  // ── Shift Requests (pickup & swap) ────────────────────────────────────────
  const [showRequestBoard, setShowRequestBoard] = useState(false);

  const currentEmpId = useMemo(
    () =>
      authUser
        ? (employees.find((e) => e.userId === authUser.id)?.id ?? null)
        : null,
    [employees, authUser],
  );
  const currentEmployee = useMemo(
    () => (currentEmpId ? (employees.find((e) => e.id === currentEmpId) ?? null) : null),
    [employees, currentEmpId],
  );

  const [coverageGapSelection, setCoverageGapSelection] = useState<{
    openShift: GridOpenShift;
    qualifiedAssignmentDefinitions: AssignmentDefinition[];
    selectedAssignmentDefinitionId: number;
  } | null>(null);

  const shiftRequests = useShiftRequests(
    orgId ?? org?.id ?? null,
    assignmentLabelMap,
    currentEmpId,
    canApproveShiftRequests,
    org?.timezone ?? null,
  );

  // ── Open shifts (calloff-spawned pickups) ──
  const [calloffOpenShifts, setCalloffOpenShifts] = useState<GridOpenShift[]>(
    [],
  );
  const [publishedDateRanges, setPublishedDateRanges] = useState<
    { startDate: string; endDate: string }[]
  >([]);
  const liveCalloffOpenShifts = useMemo(
    () =>
      buildGridCalloffOpenShiftsFromRequests({
        requests: shiftRequests.requests,
        employees,
        startDate: shiftFetchStart,
        endDate: shiftFetchEnd,
      }),
    [employees, shiftFetchEnd, shiftFetchStart, shiftRequests.requests],
  );
  const resolvedCalloffOpenShifts = useMemo(
    () =>
      shiftRequests.loading || shiftRequests.error
        ? calloffOpenShifts
        : liveCalloffOpenShifts,
    [
      calloffOpenShifts,
      liveCalloffOpenShifts,
      shiftRequests.error,
      shiftRequests.loading,
    ],
  );

  const monthStart = useMemo(
    () => new Date(weekStart.getFullYear(), weekStart.getMonth(), 1),
    [weekStart],
  );
  const currentPublishWindow = useMemo(() => {
    const startDate =
      spanWeeks === "month" ? new Date(monthStart) : new Date(weekStart);
    const endDate =
      spanWeeks === "month"
        ? new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
        : addDays(weekStart, spanWeeks * 7 - 1);

    return {
      startDate,
      endDate,
      label: `${PUBLISH_WINDOW_DATE_FORMATTER.format(startDate)} to ${PUBLISH_WINDOW_DATE_FORMATTER.format(endDate)}`,
    };
  }, [monthStart, spanWeeks, weekStart]);

  const publishWindowDateRange = useMemo(
    () => ({
      startDateKey: formatDateKey(currentPublishWindow.startDate),
      endDateKey: formatDateKey(currentPublishWindow.endDate),
    }),
    [currentPublishWindow.endDate, currentPublishWindow.startDate],
  );

  // Breakdown for the currently visible publish window — drives the yellow
  // DraftBanner and the publish confirm dialog. Scoping is critical: the
  // publish RPC only commits cells whose date falls in [startDate, endDate],
  // so the banner count and the publish button must agree on the same set.
  const draftBreakdown = useMemo(
    () => computeDraftBreakdown(shifts, notes, publishWindowDateRange),
    [shifts, notes, publishWindowDateRange],
  );

  // Local "my drafts" breakdown — filter shifts by updatedBy. Notes can't be
  // filtered client-side (no updatedBy on the local ScheduleNote shape), so
  // they're included whole; the server-side discard with scope="mine" filters
  // notes correctly via updated_by, so any over-count here is purely cosmetic
  // for the dialog summary.
  const mineBreakdown = useMemo(() => {
    const uid = authUser?.id ?? null;
    if (!uid) return draftBreakdown;
    const mineShifts: typeof shifts = {};
    for (const [key, entry] of Object.entries(shifts)) {
      if (entry?.updatedBy === uid) mineShifts[key] = entry;
    }
    return computeDraftBreakdown(mineShifts, notes, publishWindowDateRange);
  }, [authUser?.id, draftBreakdown, shifts, notes, publishWindowDateRange]);

  // Drafts that exist in the loaded ±90-day data but fall OUTSIDE the current
  // publish window. Surfaced as a secondary notice so the user can navigate
  // to those periods and publish them.
  const outOfWindowDraftGroups = useMemo(
    () =>
      computeOutOfWindowDraftGroups(
        shifts,
        notes,
        publishWindowDateRange,
        (dateKey) => {
          const [y, m, d] = dateKey.split("-").map((n) => Number(n));
          const date = new Date(y, m - 1, d);
          return formatDateKey(
            getScheduleStartForSpan({
              date,
              span: spanWeeks,
              payPeriodStartDate,
            }),
          );
        },
        (periodKey) => {
          const [y, m, d] = periodKey.split("-").map((n) => Number(n));
          return new Date(y, m - 1, d);
        },
      ),
    [shifts, notes, publishWindowDateRange, spanWeeks, payPeriodStartDate],
  );

  const hasUnpublishedChanges = draftBreakdown.totalChanges > 0;

  // Adapts the diff-toggle label between "Show Changes" (when modified/
  // deleted drafts have a hidden baseline worth revealing) and
  // "Highlight New" (when every draft is brand-new — the overlay only
  // outlines what's already drawn).
  const hasRevealableDraftChanges =
    draftBreakdown.modifiedShifts > 0 || draftBreakdown.deletedShifts > 0;

  const publishSummary = useMemo(
    () => formatDraftBreakdownSummary(draftBreakdown),
    [draftBreakdown],
  );
  // Super admins see both "discard mine" and "discard all" options only when
  // the org actually has drafts from other editors (i.e. mine totals differ).
  const showOrganizationDiscardScope =
    isSuperAdmin && mineBreakdown.totalChanges !== draftBreakdown.totalChanges;

  const openDiscardConfirm = useCallback(() => {
    setShowDiscardConfirm(true);
  }, []);

  const closeDiscardConfirm = useCallback(() => {
    if (cancelingMode) return;
    setShowDiscardConfirm(false);
  }, [cancelingMode]);

  const stopOperationTrickle = useCallback(() => {
    if (operationTrickleIntervalRef.current) {
      clearInterval(operationTrickleIntervalRef.current);
      operationTrickleIntervalRef.current = null;
    }
  }, []);

  const clearOperationDismissTimeout = useCallback(() => {
    if (operationDismissTimeoutRef.current) {
      clearTimeout(operationDismissTimeoutRef.current);
      operationDismissTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopOperationTrickle();
      clearOperationDismissTimeout();
    };
  }, [clearOperationDismissTimeout, stopOperationTrickle]);

  const startScheduleOperation = useCallback(
    (operation: ScheduleOperation) => {
      stopOperationTrickle();
      clearOperationDismissTimeout();
      setActiveOperation({
        ...operation,
        progress: clampProgress(operation.progress),
      });
    },
    [clearOperationDismissTimeout, stopOperationTrickle],
  );

  const updateScheduleOperation = useCallback(
    (
      kind: ScheduleOperation["kind"],
      updates: Partial<Omit<ScheduleOperation, "kind">>,
    ) => {
      setActiveOperation((current) => {
        if (!current || current.kind !== kind) return current;
        return {
          ...current,
          ...updates,
          progress:
            updates.progress == null
              ? current.progress
              : clampProgress(updates.progress),
        };
      });
    },
    [],
  );

  const startOperationTrickle = useCallback(
    (kind: ScheduleOperation["kind"], ceiling = 85) => {
      stopOperationTrickle();
      operationTrickleIntervalRef.current = setInterval(() => {
        setActiveOperation((current) => {
          if (!current || current.kind !== kind) return current;
          if (current.progress >= ceiling) return current;
          const remaining = ceiling - current.progress;
          const increment = Math.max(1, Math.round(remaining * 0.18));
          return {
            ...current,
            progress: clampProgress(Math.min(ceiling, current.progress + increment)),
          };
        });
      }, 240);
    },
    [stopOperationTrickle],
  );

  const finishScheduleOperation = useCallback(
    (kind: ScheduleOperation["kind"], detail?: string) => {
      stopOperationTrickle();
      clearOperationDismissTimeout();
      setActiveOperation((current) => {
        if (!current || current.kind !== kind) return current;
        return {
          ...current,
          progress: 100,
          detail: detail ?? current.detail,
        };
      });
      operationDismissTimeoutRef.current = setTimeout(() => {
        setActiveOperation((current) => (current?.kind === kind ? null : current));
        operationDismissTimeoutRef.current = null;
      }, OPERATION_MODAL_DISMISS_MS);
    },
    [clearOperationDismissTimeout, stopOperationTrickle],
  );

  const clearScheduleOperation = useCallback(
    (kind: ScheduleOperation["kind"]) => {
      stopOperationTrickle();
      clearOperationDismissTimeout();
      setActiveOperation((current) => (current?.kind === kind ? null : current));
    },
    [clearOperationDismissTimeout, stopOperationTrickle],
  );

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const editorSessionIdRef = useRef(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `editor-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const isScheduleEditor = canEditShifts || canEditNotes;

  // Audit mode: toggle to show who created each shift under grid cells
  const [showAudit, setShowAudit] = useState(false);
  const profileNameCache = useRef<Map<string, string>>(new Map());
  const [auditInfo, setAuditInfo] = useState<{
    createdByName: string | null;
    updatedByName: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null>(null);

  const collectCellNotesSnapshot = useCallback(
    (empId: string, date: Date): Record<number, DraftNoteState[]> => {
      const dateKey = formatDateKey(date);
      const cellKey = `${empId}_${dateKey}`;
      const snapshot: Record<number, DraftNoteState[]> = {};

      for (const focusArea of focusAreas) {
        const noteKey = `${cellKey}_${focusArea.id}`;
        const noteList = notesRef.current[noteKey];
        if (noteList?.length) {
          snapshot[focusArea.id] = cloneDraftNotes(noteList);
        }
      }

      const genericNotes = notesRef.current[cellKey];
      if (genericNotes?.length) {
        snapshot[-1] = cloneDraftNotes(genericNotes);
      }

      return snapshot;
    },
    [focusAreas],
  );

  const buildEditSessionFingerprint = useCallback(
    (
      shift: ShiftMap[string] | null,
      notesByFocusArea: Record<number, DraftNoteState[]>,
    ): string =>
      JSON.stringify({
        shift: serializeShiftSnapshot(shift),
        notes: serializeNotesSnapshot(notesByFocusArea),
      }),
    [],
  );

  const computeEditSessionDirty = useCallback(
    (
      baseFingerprint: string,
      draftShift: ShiftMap[string] | null,
      draftNotes: Record<number, DraftNoteState[]>,
    ): boolean =>
      buildEditSessionFingerprint(draftShift, draftNotes) !== baseFingerprint,
    [buildEditSessionFingerprint],
  );

  const startEditSession = useCallback(
    (modal: EditModalState) => {
      const cellKey = `${modal.empId}_${formatDateKey(modal.date)}`;
      const baseShift = cloneShiftEntry(shiftsRef.current[cellKey]);
      const baseNotes = collectCellNotesSnapshot(modal.empId, modal.date);
      const baseFingerprint = buildEditSessionFingerprint(baseShift, baseNotes);

      setEditPanel(modal);
      setEditSessionDraft({
        cellKey,
        baseShift,
        draftShift: cloneShiftEntry(baseShift),
        baseNotes,
        draftNotes: Object.fromEntries(
          Object.entries(baseNotes).map(([focusAreaId, noteList]) => [
            Number(focusAreaId),
            cloneDraftNotes(noteList),
          ]),
        ),
        baseVersion: baseShift?.version,
        baseFingerprint,
        isDirty: false,
        isStale: false,
      });
    },
    [buildEditSessionFingerprint, collectCellNotesSnapshot],
  );

  // ── Clipboard state (copy-paste shifts) ───────────────────────────────────
  const [clipboard, setClipboard] = useState<ScheduleCellInput | null>(null);

  // ── Context menu state ────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingClearShift, setPendingClearShift] = useState<{
    empId: string;
    date: Date;
    empName: string;
    shiftLabel: string;
  } | null>(null);
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [bulkDeleteSelectedKeys, setBulkDeleteSelectedKeys] = useState<
    Set<string>
  >(() => new Set());
  const [showBulkDeleteReview, setShowBulkDeleteReview] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [pendingPasteOver, setPendingPasteOver] = useState<{
    empId: string;
    date: Date;
    existingLabel: string;
    pasteEntry: ScheduleCellInput;
  } | null>(null);
  const [pendingClaimShift, setPendingClaimShift] =
    useState<GridOpenShift | null>(null);
  const [isClaimShiftPending, setIsClaimShiftPending] = useState(false);
  const [pendingCoverageGapVolunteer, setPendingCoverageGapVolunteer] = useState<{
    assignmentLabel: string;
    date: string;
    focusAreaId: number;
    input: ScheduleCellInput;
  } | null>(null);
  const [isCoverageGapVolunteerPending, setIsCoverageGapVolunteerPending] =
    useState(false);

  const realtimeChannelRef = useRef<BrowserRealtimeChannel | null>(null);
  const draftChangedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const {
    sendBroadcast: sendReliableBroadcast,
    flushPendingBroadcasts,
    clearPendingBroadcast,
    resetPendingBroadcasts,
  } = useReliableRealtimeBroadcasts(realtimeChannelRef);

  // Refs for values used by the realtime channel — reading from refs avoids
  // tearing down & recreating the channel when these change.
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const canEditShiftsRef = useRef(canEditShifts);
  canEditShiftsRef.current = canEditShifts;
  const canEditNotesRef = useRef(canEditNotes);
  canEditNotesRef.current = canEditNotes;
  // Stable refs for map objects — avoids recreating callbacks when maps get new
  // references (which happens on every React Query revalidation).
  const assignmentLabelMapRef = useRef(assignmentLabelMap);
  assignmentLabelMapRef.current = assignmentLabelMap;
  const absenceTypeMapRef = useRef(absenceTypeMap);
  absenceTypeMapRef.current = absenceTypeMap;

  // ── Shared refetch helper (eliminates 4x duplication) ──────────────────────
  const refetchScheduleData = useCallback(async () => {
    if (!org) return;
    const [shiftData, noteRows] = await Promise.all([
      fetchShifts(
        org.id,
        canEditShiftsRef.current,
        assignmentLabelMapRef.current,
        absenceTypeMapRef.current,
        shiftFetchStart,
        shiftFetchEnd,
        segmentCompatibility,
      ),
      fetchScheduleNotes(org.id, shiftFetchStart, shiftFetchEnd),
    ]);
    const noteMap: Record<
      string,
      {
        indicatorTypeId: number;
        status: "published" | "draft" | "draft_deleted";
      }[]
    > = {};
    for (const note of noteRows) {
      const key =
        note.focusAreaId != null
          ? `${note.empId}_${note.date}_${note.focusAreaId}`
          : `${note.empId}_${note.date}`;
      if (!noteMap[key]) noteMap[key] = [];
      noteMap[key].push({
        indicatorTypeId: note.indicatorTypeId,
        status: note.status,
      });
    }
    setShifts(shiftData);
    setNotes(noteMap);
    lastRefetchAtRef.current = Date.now();
    return { shiftData, noteMap };
  }, [org, shiftFetchStart, shiftFetchEnd]);

  // Load schedule-specific data (shifts, notes, recurring, publish history) once org data is ready.
  const scheduleLoadStarted = useRef(false);
  const draftCheckStarted = useRef(false);
  const initialLoadUsedEditPerms = useRef(false);
  const prevOrgIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Reset load guards when org changes (e.g. org switcher)
    if (org && org.id !== prevOrgIdRef.current) {
      prevOrgIdRef.current = org.id;
      scheduleLoadStarted.current = false;
      draftCheckStarted.current = false;
    }
    if (orgLoading || !org || scheduleLoadStarted.current) return;
    scheduleLoadStarted.current = true;
    initialLoadUsedEditPerms.current = canEditShifts;
    const orgId = org.id;

    async function fetchCurrentUser(): Promise<{
      id: string;
      name: string;
    } | null> {
      try {
        if (!authUser) return null;
        const identity = await fetchAccountIdentity();
        const name =
          identity.displayName || authUser.email?.split("@")[0] || "Unknown";
        return { id: authUser.id, name };
      } catch {
        return null;
      }
    }

    async function loadSchedule() {
      try {
        // Fetch per-user last-viewed timestamp + critical data in parallel
        const [
          shiftData,
          noteRows,
          recShifts,
          lastViewed,
          initialCalloffOpenShifts,
          initialPublishedDateRanges,
        ] =
          await Promise.all([
            fetchShifts(
              orgId,
              canEditShifts,
              assignmentLabelMap,
              absenceTypeMap,
              shiftFetchStart,
              shiftFetchEnd,
              segmentCompatibility,
            ),
            fetchScheduleNotes(orgId, shiftFetchStart, shiftFetchEnd),
            canViewRecurringShifts
              ? fetchRecurringShifts(
                  orgId,
                  undefined,
                  assignmentLabelMap,
                  false,
                  absenceTypeMap,
                )
              : Promise.resolve([] as RecurringShift[]),
            getScheduleLastViewed(orgId).catch(() => null),
            fetchCalloffOpenShifts(
              orgId,
              shiftFetchStart,
              shiftFetchEnd,
              assignmentLabelMap,
            ).catch((err) => {
              Sentry.captureException(err, {
                tags: { component: "calloff_open_shifts" },
                extra: {
                  context: "schedule.initial_calloff_open_shifts",
                  orgId,
                  startDate: shiftFetchStart,
                  endDate: shiftFetchEnd,
                },
              });
              toast.error("Failed to load available shift opportunities");
              return [] as GridOpenShift[];
            }),
            fetchPublishedDateRanges(
              orgId,
              shiftFetchStart,
              shiftFetchEnd,
            ).catch((err) => {
              Sentry.captureException(err, {
                extra: {
                  context: "schedule.initial_published_ranges",
                  orgId,
                  startDate: shiftFetchStart,
                  endDate: shiftFetchEnd,
                },
              });
              return [] as { startDate: string; endDate: string }[];
            }),
          ]);

        lastViewedRef.current = lastViewed;

        // Fetch publish history since user's last view (falls back to 24h if null)
        const recentPublishes = await fetchRecentPublishHistory(
          orgId,
          lastViewed,
        ).catch(() => [] as PublishHistoryEntry[]);

        const noteMap: Record<
          string,
          {
            indicatorTypeId: number;
            status: "published" | "draft" | "draft_deleted";
          }[]
        > = {};
        for (const note of noteRows) {
          const key =
            note.focusAreaId != null
              ? `${note.empId}_${note.date}_${note.focusAreaId}`
              : `${note.empId}_${note.date}`;
          if (!noteMap[key]) noteMap[key] = [];
          noteMap[key].push({
            indicatorTypeId: note.indicatorTypeId,
            status: note.status,
          });
        }
        setShifts(shiftData);
        setNotes(noteMap);
        setRecurringShifts(recShifts);
        setCalloffOpenShifts(initialCalloffOpenShifts);
        setPublishedDateRanges(initialPublishedDateRanges);
        if (recentPublishes.length > 0) setPublishHistory(recentPublishes);

        // Show "what changed" toast once per mount
        if (recentPublishes.length > 0 && !hasShownChangeToast.current) {
          hasShownChangeToast.current = true;
          const allChanges = recentPublishes.flatMap((e) => e.changes);
          const newCount = allChanges.filter((c) => c.kind === "new").length;
          const modCount = allChanges.filter(
            (c) => c.kind === "modified",
          ).length;
          const delCount = allChanges.filter(
            (c) => c.kind === "deleted",
          ).length;
          const parts: string[] = [];
          if (newCount > 0) parts.push(`${newCount} new`);
          if (modCount > 0) parts.push(`${modCount} modified`);
          if (delCount > 0) parts.push(`${delCount} removed`);
          if (parts.length > 0) {
            toast.info(
              `${allChanges.length} shift${allChanges.length !== 1 ? "s" : ""} changed since your last visit — ${parts.join(", ")}`,
              { duration: 6000 },
            );
          }
        }

        // Fire-and-forget: update last-viewed timestamp for this user
        void updateScheduleLastViewed(orgId);

        // Fetch current user in background — not needed for grid render
        fetchCurrentUser()
          .then((info) => {
            if (info) setCurrentUser(info);
          })
          .catch(() => {});
      } catch (err) {
        Sentry.captureException(err);
      } finally {
        setScheduleLoading(false);
      }
    }
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org]);

  // Resolve a user UUID to a display name via profiles table (cached).
  const resolveUserName = useCallback(
    async (userId: string | null | undefined): Promise<string | null> => {
      if (!org?.id || !userId) return null;
      const cached = profileNameCache.current.get(userId);
      if (cached) return cached;
      try {
        const { names } = await fetchScheduleActorNames({
          ids: [userId],
          orgId: org.id,
        });
        const name = names[userId] ?? null;
        if (name) {
          profileNameCache.current.set(userId, name);
          return name;
        }
        // Profile deleted or has no name — cache fallback to avoid re-fetching
        profileNameCache.current.set(userId, "Deleted user");
        return "Deleted user";
      } catch {
        return null;
      }
    },
    [org?.id],
  );

  const {
    lockCell,
    unlockCell,
    refreshPresence,
    clearPresenceState,
    getCellLock,
    getCellActivity,
    getCurrentCell,
    lockedCells,
    onlineUsers,
    syncPresence,
    handleLockBroadcast,
    handleUnlockBroadcast,
  } = useCellLocks(
    realtimeChannelRef,
    currentUser,
    editorSessionIdRef.current,
    isScheduleEditor,
    canEditShifts,
    sendReliableBroadcast,
  );
  const canRenderAuthorNames = shouldRenderScheduleAuthorNames({
    showAudit,
    onlineUsers,
    currentUserId: authUser?.id ?? currentUser?.id ?? null,
  });

  // Resolve audit metadata (created/updated by names) when the edit panel opens.
  useEffect(() => {
    if (!editPanel || !canRenderAuthorNames) {
      setAuditInfo(null);
      return;
    }
    const key = `${editPanel.empId}_${formatDateKey(editPanel.date)}`;
    const meta = shifts[key];
    if (!meta?.createdBy && !meta?.updatedBy) {
      setAuditInfo(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const [createdByName, updatedByName] = await Promise.all([
        resolveUserName(meta.createdBy),
        resolveUserName(meta.updatedBy),
      ]);
      if (!cancelled) {
        // Only include "updated by" if the update was meaningfully later (>5s) than creation
        const cTime = meta.createdAt ? new Date(meta.createdAt).getTime() : 0;
        const uTime = meta.updatedAt ? new Date(meta.updatedAt).getTime() : 0;
        const wasActuallyUpdated = Math.abs(uTime - cTime) > 5000;
        setAuditInfo({
          createdByName,
          updatedByName: wasActuallyUpdated ? updatedByName : null,
          createdAt: meta.createdAt ?? null,
          updatedAt: wasActuallyUpdated ? (meta.updatedAt ?? null) : null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canRenderAuthorNames, editPanel, shifts, resolveUserName]);

  // Batch-fetch profile names for shift creators (audit mode) and publishers (publish tooltips).
  const [auditNames, setAuditNames] = useState<Map<string, string>>(new Map());
  const needsAuditNames =
    publishHistory.length > 0 ||
    (canRenderAuthorNames &&
      (showAudit ||
        Object.values(shifts).some(
          (entry) => entry.isDraft && (!!entry.updatedBy || !!entry.createdBy),
        )));
  useEffect(() => {
    if (!needsAuditNames) return;
    // Collect unique creator/updater UUIDs not yet in the cache
    const uncached = new Set<string>();
    for (const entry of Object.values(shifts)) {
      if (entry.createdBy && !profileNameCache.current.has(entry.createdBy))
        uncached.add(entry.createdBy);
      if (entry.updatedBy && !profileNameCache.current.has(entry.updatedBy))
        uncached.add(entry.updatedBy);
    }
    // Also collect updatedBy + publishedBy UUIDs from publish history (for tooltips and deleted shifts)
    for (const entry of publishHistory) {
      if (entry.publishedBy && !profileNameCache.current.has(entry.publishedBy))
        uncached.add(entry.publishedBy);
      for (const change of entry.changes) {
        if (change.updatedBy && !profileNameCache.current.has(change.updatedBy))
          uncached.add(change.updatedBy);
      }
    }
    if (uncached.size === 0) {
      // All already cached — just build the map from cache
      setAuditNames(new Map(profileNameCache.current));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ids = Array.from(uncached);
        if (!org?.id) return;
        const { names } = await fetchScheduleActorNames({
          ids,
          orgId: org.id,
        });
        if (cancelled) return;
        for (const [id, name] of Object.entries(names)) {
          if (name) profileNameCache.current.set(id, name);
        }
        for (const id of ids) {
          if (!profileNameCache.current.has(id)) {
            profileNameCache.current.set(id, "Deleted user");
          }
        }
        setAuditNames(new Map(profileNameCache.current));
      } catch {
        // Silently fail — audit names are non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsAuditNames, org?.id, publishHistory, shifts]);

  // Split publish history by overlap with the currently visible window so
  // the banner, toggle, and overlay only describe publishes that touch
  // what the user is looking at. YYYY-MM-DD strings sort lexically, so
  // plain string comparison is a correct interval overlap test.
  const inWindowPublishHistory = useMemo(
    () =>
      publishHistory.filter(
        (entry) =>
          entry.startDate <= publishWindowDateRange.endDateKey &&
          entry.endDate >= publishWindowDateRange.startDateKey,
      ),
    [
      publishHistory,
      publishWindowDateRange.endDateKey,
      publishWindowDateRange.startDateKey,
    ],
  );
  const outOfWindowPublishHistory = useMemo(
    () =>
      publishHistory.filter(
        (entry) =>
          !(
            entry.startDate <= publishWindowDateRange.endDateKey &&
            entry.endDate >= publishWindowDateRange.startDateKey
          ),
      ),
    [
      publishHistory,
      publishWindowDateRange.endDateKey,
      publishWindowDateRange.startDateKey,
    ],
  );

  // Build a lookup map from in-window publish history changes for O(1) access.
  // Iterate oldest→newest so the most recent publish wins per cell key.
  const publishChangesMap = useMemo(() => {
    if (inWindowPublishHistory.length === 0) return null;
    const map = new Map<
      string,
      PublishChange & { publishedAt: string; publishedBy: string }
    >();
    // inWindowPublishHistory is newest-first, so iterate in reverse (oldest first) to let newer entries overwrite
    for (let i = inWindowPublishHistory.length - 1; i >= 0; i--) {
      const entry = inWindowPublishHistory[i];
      for (const change of entry.changes) {
        map.set(`${change.empId}_${change.date}`, {
          ...change,
          publishedAt: entry.publishedAt,
          publishedBy: entry.publishedBy,
        });
      }
    }
    return map;
  }, [inWindowPublishHistory]);

  // Same logic as drafts: only "modified" / "deleted" entries reveal hidden
  // state when the publish-diff overlay is on. An all-"new" publish history
  // would just ring every cell green.
  const publishHasRevealableChanges = useMemo(() => {
    if (!publishChangesMap) return false;
    for (const change of publishChangesMap.values()) {
      if (change.kind !== "new") return true;
    }
    return false;
  }, [publishChangesMap]);

  // Defensive bookkeeping: when the banner that hosts the toggle unmounts,
  // clear the overlay state so it doesn't come back on stuck-true the next
  // time drafts/publishes appear.
  useEffect(() => {
    if (!hasUnpublishedChanges && showDiffOverlay) {
      setShowDiffOverlay(false);
    }
  }, [hasUnpublishedChanges, showDiffOverlay]);

  useEffect(() => {
    if (inWindowPublishHistory.length === 0 && showPublishDiff) {
      setShowPublishDiff(false);
    }
  }, [inWindowPublishHistory.length, showPublishDiff]);

  // Dismissals persist for the tab session via useDismissibleBanner — no
  // auto-reset on data change. The X means "hide this for the rest of the
  // session"; sign-out wipes it.

  // Lookup function for grid cells: returns "F. LastName" for compact display.
  // Shows who last touched each cell (updatedBy, falling back to createdBy).
  // Also resolves from publish history changes for cells whose rows are gone after publish.
  const createdByNameForKey = useCallback(
    (empId: string, date: Date): string | null => {
      const key = `${empId}_${formatDateKey(date)}`;
      return resolveGridAuditLabel({
        cellKey: key,
        shifts,
        publishChangesMap,
        auditNames,
        currentUserId: authUser?.id ?? currentUser?.id ?? null,
      });
    },
    [shifts, publishChangesMap, auditNames, authUser?.id, currentUser?.id],
  );

  const closeEditPanel = useCallback(() => {
    unlockCell();
    setEditPanel(null);
    setEditSessionDraft(null);
  }, [unlockCell]);

  // Refs for realtime callbacks — allows the channel effect to depend only on
  // [org] while still calling the latest versions of these functions.
  const syncPresenceRef = useRef(syncPresence);
  syncPresenceRef.current = syncPresence;
  const handleLockBroadcastRef = useRef(handleLockBroadcast);
  handleLockBroadcastRef.current = handleLockBroadcast;
  const handleUnlockBroadcastRef = useRef(handleUnlockBroadcast);
  handleUnlockBroadcastRef.current = handleUnlockBroadcast;
  const getCurrentCellRef = useRef(getCurrentCell);
  getCurrentCellRef.current = getCurrentCell;
  const refreshPresenceRef = useRef(refreshPresence);
  refreshPresenceRef.current = refreshPresence;
  const refetchScheduleDataRef = useRef(refetchScheduleData);
  refetchScheduleDataRef.current = refetchScheduleData;
  const refetchPublishedRangesRef = useRef<() => Promise<void>>(async () => {});
  // Tracks when data was last fetched — used to throttle tab-visibility refetches
  const lastRefetchAtRef = useRef(0);

  useEffect(() => {
    if (!editPanel || !editSessionDraft || isApplyingEditSessionRef.current) {
      return;
    }

    const currentShift = cloneShiftEntry(shiftsRef.current[editSessionDraft.cellKey]);
    const currentNotes = collectCellNotesSnapshot(editPanel.empId, editPanel.date);
    const currentFingerprint = buildEditSessionFingerprint(currentShift, currentNotes);

    if (currentFingerprint !== editSessionDraft.baseFingerprint) {
      setEditSessionDraft((prev) => {
        if (!prev || prev.cellKey !== editSessionDraft.cellKey || prev.isStale) {
          return prev;
        }
        return { ...prev, isStale: true };
      });
    }
  }, [
    buildEditSessionFingerprint,
    collectCellNotesSnapshot,
    editPanel,
    editSessionDraft,
    notes,
    shifts,
  ]);

  // Subscribe to real-time schedule broadcasts so other tabs/users see
  // published and draft changes immediately without a manual refresh.
  // Depends only on [org] — all callbacks read from refs so the channel
  // is never torn down due to permission/user/callback reference changes.
  useEffect(() => {
    if (!org) return;

    let hadError = false;

    const channel = createBrowserRealtimeChannel(`schedule:${org.id}`)
      .on("broadcast", { event: "schedule_published" }, async () => {
        try {
          await refetchScheduleDataRef.current();
          await refetchPublishedRangesRef.current();
          const history = await fetchRecentPublishHistory(
            org.id,
            lastViewedRef.current,
          );
          setPublishHistory(history);
        } catch (err) {
          Sentry.captureException(err);
        }
      })
      .on("broadcast", { event: "drafts_discarded" }, async () => {
        try {
          await refetchScheduleDataRef.current();
        } catch (err) {
          Sentry.captureException(err);
        }
      })
      .on(
        "broadcast",
        { event: "draft_changed" },
        (msg: { payload?: Record<string, unknown> }) => {
          if (
            msg.payload?.senderSessionId === editorSessionIdRef.current
          ) {
            return;
          }

          const p = msg.payload;
          if (p?.shifts) {
            const shiftUpdates = p.shifts as Record<
              string,
              ShiftMap[string] | null
            >;
            setShifts((prev) => {
              const next = { ...prev };
              for (const [key, value] of Object.entries(shiftUpdates)) {
                if (value === null) delete next[key];
                else next[key] = value;
              }
              return next;
            });
          }
          if (p?.notes) {
            const noteUpdates = p.notes as Record<
              string,
              {
                indicatorTypeId: number;
                status: "published" | "draft" | "draft_deleted";
              }[]
            >;
            setNotes((prev) => ({ ...prev, ...noteUpdates }));
          }
          if (draftChangedDebounceRef.current)
            clearTimeout(draftChangedDebounceRef.current);
          draftChangedDebounceRef.current = setTimeout(
            async () => {
              try {
                await refetchScheduleDataRef.current();
              } catch (err) {
                Sentry.captureException(err);
              }
            },
            p?.shifts || p?.notes ? 2000 : 150,
          );
        },
      )
      .on(
        "broadcast",
        { event: "cell_locked" },
        (msg: {
          payload?: {
            cellKey: string;
            userId: string;
            userName: string;
            editorSessionId: string;
            lockRevision: number;
            canLockCells?: boolean;
          };
        }) => {
          if (msg.payload) handleLockBroadcastRef.current(msg.payload);
        },
      )
      .on(
        "broadcast",
        { event: "cell_unlocked" },
        (msg: {
          payload?: {
            userId: string;
            editorSessionId: string;
            cellKey: string | null;
            lockRevision: number;
          };
        }) => {
          if (msg.payload) handleUnlockBroadcastRef.current(msg.payload);
        },
      )
      .on("presence", { event: "sync" }, () => syncPresenceRef.current())
      .on("presence", { event: "join" }, () => syncPresenceRef.current())
      .on("presence", { event: "leave" }, () => syncPresenceRef.current())
      .subscribe(async (status: string, err?: Error) => {
        if (status === "SUBSCRIBED") {
          // Refetch on reconnection to catch events missed during downtime
          if (hadError) {
            hadError = false;
            Promise.all([
              refetchScheduleDataRef.current(),
              refetchPublishedRangesRef.current(),
            ]).catch(() => {});
          }
          if (
            currentUserRef.current &&
            (canEditShiftsRef.current || canEditNotesRef.current)
          ) {
            await refreshPresenceRef.current();
          }
          syncPresenceRef.current();
          await flushPendingBroadcasts();
        } else if (status === "CHANNEL_ERROR") {
          hadError = true;
          console.warn(
            "[Realtime] Channel error (auto-retrying):",
            err ?? "unknown",
          );
        }
      });

    realtimeChannelRef.current = channel;

    return () => {
      unlockCell({ removePresence: true });
      clearPresenceState();
      realtimeChannelRef.current = null;
      resetPendingBroadcasts();
      if (draftChangedDebounceRef.current)
        clearTimeout(draftChangedDebounceRef.current);
      void removeBrowserRealtimeChannel(channel);
    };
  }, [
    clearPresenceState,
    createBrowserRealtimeChannel,
    flushPendingBroadcasts,
    org,
    resetPendingBroadcasts,
    removeBrowserRealtimeChannel,
    unlockCell,
  ]);

  // Track presence once currentUser and schedule-editor permissions are available.
  // Handles the case where the channel subscribes before user profile loads.
  useEffect(() => {
    const channel = realtimeChannelRef.current;
    if (!channel || !currentUser || !isScheduleEditor) return;
    if (channel.state !== "joined") return;

    void refreshPresence();
  }, [currentUser, isScheduleEditor, refreshPresence]);

  // Refetch when the tab regains focus — catches any missed broadcasts
  // (e.g. browser throttled WebSocket while tab was backgrounded).
  // Also re-tracks presence to recover from server-side expiry.
  useEffect(() => {
    if (!org) return;
    const handleVisibilityChange = () => {
      const channel = realtimeChannelRef.current;
      const isVisible = document.visibilityState === "visible";

      if (
        channel &&
        channel.state === "joined" &&
        isVisible &&
        currentUserRef.current &&
        (canEditShiftsRef.current || canEditNotesRef.current)
      ) {
        void refreshPresenceRef.current();
      }

      if (!isVisible && !getCurrentCellRef.current()) {
        unlockCell();
        return;
      }

      if (isVisible && Date.now() - lastRefetchAtRef.current > 10_000) {
        Promise.all([
          refetchScheduleDataRef.current(),
          refetchPublishedRangesRef.current(),
        ]).catch((err) => {
          Sentry.captureException(err);
          toast.error("Couldn't refresh the schedule. Try reloading the page.");
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [org, unlockCell]);

  useEffect(() => {
    const releasePresence = () => {
      unlockCell({ removePresence: true });
    };
    window.addEventListener("pagehide", releasePresence);
    window.addEventListener("beforeunload", releasePresence);
    return () => {
      window.removeEventListener("pagehide", releasePresence);
      window.removeEventListener("beforeunload", releasePresence);
    };
  }, [unlockCell]);

  // Re-fetch with scheduler visibility once permissions resolve, so editors
  // see draft data even if the initial load ran before permissions were ready.
  // Skip if the initial load already used canEditShifts=true (no extra fetch needed).
  const [draftCheckComplete, setDraftCheckComplete] = useState(false);
  useEffect(() => {
    if (permsLoading || !org || scheduleLoading || draftCheckStarted.current)
      return;
    if (!canEditShifts || initialLoadUsedEditPerms.current) {
      setDraftCheckComplete(true);
      return;
    }
    draftCheckStarted.current = true;

    (async () => {
      try {
        const draftShifts = await fetchShifts(
          org.id,
          true,
          assignmentLabelMapRef.current,
          absenceTypeMapRef.current,
          shiftFetchStart,
          shiftFetchEnd,
          segmentCompatibility,
        );
        setShifts(draftShifts);
      } catch (err) {
        Sentry.captureException(err);
      } finally {
        setDraftCheckComplete(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permsLoading, org, scheduleLoading, canEditShifts]);

  const dates = useMemo(
    () =>
      spanWeeks === "month"
        ? []
        : Array.from({ length: spanWeeks * 7 }, (_, i) =>
            addDays(weekStart, i),
          ),
    [weekStart, spanWeeks],
  );
  const availableSwapDates = useMemo(
    () =>
      Array.from(
        iterateDateRange(
          new Date(`${shiftFetchStart}T00:00:00`),
          new Date(`${shiftFetchEnd}T00:00:00`),
        ),
        ({ dateKey }) => dateKey,
      ),
    [shiftFetchEnd, shiftFetchStart],
  );
  const week1 = useMemo(() => dates.slice(0, 7), [dates]);
  const week2 = useMemo(
    () => (spanWeeks === 2 ? dates.slice(7, 14) : []),
    [dates, spanWeeks],
  );
  const publishedDateSet = useMemo(
    () => buildPublishedDateSet(publishedDateRanges),
    [publishedDateRanges],
  );
  const publishedWindowState = useMemo(() => {
    if (coverageRequirements.length === 0 || dates.length === 0) {
      return "published";
    }
    return getPublishedWindowState(dates, publishedDateSet);
  }, [coverageRequirements.length, dates, publishedDateSet]);
  const publishedVisibleDates = useMemo(() => {
    if (coverageRequirements.length === 0 || dates.length === 0) return dates;
    return filterPublishedDates(dates, publishedDateSet);
  }, [coverageRequirements.length, dates, publishedDateSet]);
  // Use the raw publish state (ignoring the coverage-requirements shortcut that
  // forces publishedWindowState to "published") so non-editors see the empty
  // state whenever the visible window genuinely has no published dates.
  const rawPublishedWindowState = useMemo(
    () => getPublishedWindowState(dates, publishedDateSet),
    [dates, publishedDateSet],
  );
  const hideGridForUnpublishedViewer =
    !isScheduleEditor && rawPublishedWindowState === "unpublished";

  const filteredEmployees = useMemo(
    () => filterAndSortEmployees(employees, activeFocusArea),
    [employees, activeFocusArea],
  );
  const normalizedStaffSearch = staffSearch.trim().toLowerCase();
  const searchMatchedEmployeeIds = useMemo(() => {
    if (!normalizedStaffSearch) return undefined;
    return new Set(
      employees
        .filter((employee) =>
          getEmployeeDisplayName(employee)
            .toLowerCase()
            .includes(normalizedStaffSearch),
        )
        .map((employee) => employee.id),
    );
  }, [employees, normalizedStaffSearch]);
  const refetchPublishedRanges = useCallback(async () => {
    if (!org) {
      setPublishedDateRanges([]);
      return;
    }

    try {
      const ranges = await fetchPublishedDateRanges(
        org.id,
        shiftFetchStart,
        shiftFetchEnd,
      );
      setPublishedDateRanges(ranges);
    } catch (err) {
      Sentry.captureException(err, {
        extra: {
          context: "schedule.published_ranges",
          orgId: org.id,
          startDate: shiftFetchStart,
          endDate: shiftFetchEnd,
        },
      });
      setPublishedDateRanges([]);
    }
  }, [org, shiftFetchEnd, shiftFetchStart]);
  refetchPublishedRangesRef.current = refetchPublishedRanges;

  useEffect(() => {
    void refetchPublishedRanges();
  }, [refetchPublishedRanges]);

  // Register focus areas as sub-nav items for the mobile bottom sheet
  const focusAreaSubNav: SubNavItem[] = useMemo(
    () => [
      {
        id: "all",
        label: "All " + (org?.focusAreaLabel || "Focus Areas"),
        active: activeFocusArea === null,
        onClick: () => setActiveFocusArea(null),
      },
      ...focusAreas.map((fa) => ({
        id: String(fa.id),
        label: fa.name,
        active: activeFocusArea === fa.id,
        onClick: () => setActiveFocusArea(fa.id),
      })),
    ],
    [focusAreas, activeFocusArea, org?.focusAreaLabel],
  );
  useSetMobileSubNav(focusAreaSubNav);

  // ── Shift helpers ────────────────────────────────────────────────────────────

  const buildEntryPayload = useCallback(
    (entry: ShiftMap[string]): ScheduleCellInput => {
      const input =
        scheduleCellSnapshotToInput(
        entry.effective ?? entry.draft ?? entry.published,
        ) ?? {
          kind:
            entry.isDelete
              ? "deleted"
              : entry.absenceTypeId != null
                ? "absence"
                : "worked",
          segments: (entry.segments ?? []).map((segment, index) => ({
            shiftId: segment.shiftId,
            jobId: segment.jobId,
            position: segment.position ?? index,
            isMentored: segment.isMentored ?? false,
          })),
          absenceTypeId: entry.absenceTypeId ?? null,
          customStartTime:
            entry.absenceTypeId != null ? null : (entry.customStartTime ?? null),
          customEndTime:
            entry.absenceTypeId != null ? null : (entry.customEndTime ?? null),
          seriesId: entry.seriesId ?? null,
          fromRecurring: entry.fromRecurring ?? false,
        };

      if (input.kind !== "worked") {
        return input;
      }

      return {
        ...input,
        customStartTime: normalizeCustomTimeForSegmentCount(
          input.customStartTime,
          input.segments.length,
        ),
        customEndTime: normalizeCustomTimeForSegmentCount(
          input.customEndTime,
          input.segments.length,
        ),
      };
    },
    [],
  );

  const getInputAssignmentDefinitionIds = useCallback(
    (input: ScheduleCellInput): number[] =>
      deriveAssignmentIdsFromScheduleCellInput(input, segmentCompatibility),
    [segmentCompatibility],
  );

  const resolveInputSnapshot = useCallback(
    (input: ScheduleCellInput) =>
      resolveScheduleCellSnapshotFromInput(input, {
        segmentCompatibility,
        absenceTypeMap,
      }),
    [absenceTypeMap, segmentCompatibility],
  );

  const getInputLabel = useCallback(
    (input: ScheduleCellInput): string => {
      const snapshot = resolveInputSnapshot(input);
      if (snapshot.label) return snapshot.label;
      if (input.kind === "absence") {
        return absenceTypeMap.get(input.absenceTypeId ?? -1) ?? "?";
      }
      return "shift";
    },
    [absenceTypeMap, resolveInputSnapshot],
  );

  const getPublishedSnapshot = useCallback(
    (entry: ShiftMap[string] | null | undefined) => {
      if (!entry) return null;
      if (entry.published !== undefined) {
        return entry.published ?? null;
      }
      if (
        (entry.publishedAssignmentDefinitionIds?.length ?? 0) === 0 &&
        entry.publishedAbsenceTypeId == null
      ) {
        return null;
      }
      return resolveScheduleCellSnapshotFromInput(
        {
          kind:
            entry.publishedAbsenceTypeId != null ? "absence" : "worked",
          segments: (entry.publishedSegments ?? []).map((segment, index) => ({
            shiftId: segment.shiftId,
            jobId: segment.jobId,
            position: segment.position ?? index,
            isMentored: segment.isMentored ?? false,
          })),
          absenceTypeId: entry.publishedAbsenceTypeId ?? null,
          customStartTime: entry.publishedCustomStartTime ?? null,
          customEndTime: entry.publishedCustomEndTime ?? null,
          seriesId: entry.seriesId ?? null,
          fromRecurring: entry.fromRecurring ?? false,
        },
        {
          segmentCompatibility,
          absenceTypeMap,
        },
      );
    },
    [absenceTypeMap, segmentCompatibility],
  );

  const shiftForKey = useCallback(
    (empId: string, date: Date): string | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return null;
      if (entry.isDelete) return null;
      if (entry.absenceTypeId != null)
        return absenceTypeMap.get(entry.absenceTypeId) ?? "?";
      if (entry.assignmentIds.length > 0)
        return entry.assignmentIds
          .map((id) => assignmentLabelMap.get(id) ?? "?")
          .join("/");
      return entry.label ?? null;
    },
    [shifts, assignmentLabelMap, absenceTypeMap],
  );

  const shiftNameForKey = useCallback(
    (empId: string, date: Date): string | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry || entry.isDelete) return null;

      const absenceTypeId =
        entry.absenceTypeId ?? entry.publishedAbsenceTypeId ?? null;
      if (absenceTypeId != null) {
        return absenceTypeMap.get(absenceTypeId) ?? "?";
      }

      const assignmentIds =
        (entry.publishedAssignmentDefinitionIds?.length ?? 0) > 0
          ? entry.publishedAssignmentDefinitionIds
          : entry.assignmentIds;
      if (assignmentIds.length > 0) {
        return assignmentIds
          .map((id) => {
            const assignment = assignments.find((item) => item.id === id);
            if (!assignment) {
              return assignmentLabelMap.get(id) ?? "?";
            }

            const shiftId = assignment.shiftId ?? assignment.categoryId ?? null;
            const shift =
              shiftId != null
                ? (shiftCategories.find((item) => item.id === shiftId) ?? null)
                : null;
            const job =
              assignment.jobId != null
                ? (jobs.find((item) => item.id === assignment.jobId) ?? null)
                : null;
            const displayParts = buildShiftDisplayParts({
              shift,
              job,
              assignment,
              shiftDisplayMode: "name",
            });

            return formatAssignableShiftOptionLabel(displayParts);
          })
          .join(" / ");
      }

      return entry.label ?? null;
    },
    [
      absenceTypeMap,
      assignmentLabelMap,
      assignments,
      jobs,
      shiftCategories,
      shifts,
    ],
  );

  const getAbsenceTypeIdForKey = useCallback(
    (empId: string, date: Date): number | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry || entry.isDelete) return null;
      return entry.absenceTypeId ?? null;
    },
    [shifts],
  );

  const assignmentIdsForKey = useCallback(
    (empId: string, date: Date): number[] =>
      shifts[`${empId}_${formatDateKey(date)}`]?.assignmentIds ?? [],
    [shifts],
  );

  const segmentsForKey = useCallback(
    (empId: string, date: Date) => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry || entry.isDelete || entry.absenceTypeId != null) {
        return [];
      }
      return (entry.segments ?? []).map((segment, index) => ({
        shiftId: segment.shiftId,
        jobId: segment.jobId,
        position: segment.position ?? index,
        isMentored: segment.isMentored ?? false,
      }));
    },
    [shifts],
  );

  const coverageCreditForKey = useMemo(
    () => createCoverageCreditResolver(shifts, org?.coverageRuleConfig),
    [org?.coverageRuleConfig, shifts],
  );

  const editSessionCellKey = editPanel
    ? `${editPanel.empId}_${formatDateKey(editPanel.date)}`
    : null;
  const panelShiftEntry = useMemo(() => {
    if (!editSessionCellKey) return null;
    if (editSessionDraft?.cellKey === editSessionCellKey) {
      return editSessionDraft.draftShift;
    }
    return shifts[editSessionCellKey] ?? null;
  }, [editSessionCellKey, editSessionDraft, shifts]);
  const panelCurrentShift = panelShiftEntry ? panelShiftEntry.label : null;
  const panelCurrentAssignmentIds = panelShiftEntry?.assignmentIds ?? [];
  const panelCurrentAbsenceTypeId =
    editSessionDraft?.cellKey === editSessionCellKey
      ? panelShiftEntry?.absenceTypeId ?? null
      : (panelShiftEntry?.absenceTypeId ??
          panelShiftEntry?.publishedAbsenceTypeId ??
          null);
  const panelCustomStartTime = panelShiftEntry?.customStartTime ?? null;
  const panelCustomEndTime = panelShiftEntry?.customEndTime ?? null;
  const panelDraftKind = panelShiftEntry?.draftKind ?? null;

  const isAbsenceForKey = useCallback(
    (empId: string, date: Date): boolean => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return false;
      return (
        entry.absenceTypeId != null || entry.publishedAbsenceTypeId != null
      );
    },
    [shifts],
  );

  const absenceTypeIdForKey = useCallback(
    (empId: string, date: Date): number | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return null;
      return entry.absenceTypeId ?? null;
    },
    [shifts],
  );

  const publishedAbsenceTypeIdForKey = useCallback(
    (empId: string, date: Date): number | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return null;
      return entry.publishedAbsenceTypeId ?? null;
    },
    [shifts],
  );

  /** Full AbsenceType object map for grid cell styling (includes archived for historical cells) */
  const absenceTypeObjectMap = useMemo(
    () => new Map(allAbsenceTypes.map((at) => [at.id, at])),
    [allAbsenceTypes],
  );

  /** Returns time ranges for an employee's shift. Prefers custom times, falls back to category times. */
  const getShiftTimeRanges = useCallback(
    (empId: string, date: Date): { start: string; end: string }[] => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry || entry.assignmentIds.length === 0) return [];
      const startParts = entry.customStartTime?.split("|") ?? [];
      const endParts = entry.customEndTime?.split("|") ?? [];
      const ranges: { start: string; end: string }[] = [];
      for (let i = 0; i < entry.assignmentIds.length; i++) {
        const customStart = startParts[i] || null;
        const customEnd = endParts[i] || null;
        if (customStart && customEnd) {
          ranges.push({ start: customStart, end: customEnd });
          continue;
        }
        const sc = assignments.find((c) => c.id === entry.assignmentIds[i]);
        if (sc?.defaultStartTime && sc?.defaultEndTime) {
          ranges.push({ start: sc.defaultStartTime, end: sc.defaultEndTime });
          continue;
        }
        if (sc?.categoryId != null) {
          const cat = shiftCategories.find((c) => c.id === sc.categoryId);
          if (cat?.startTime && cat?.endTime) {
            ranges.push({ start: cat.startTime, end: cat.endTime });
          }
        }
      }
      return ranges;
    },
    [shifts, assignments, shiftCategories],
  );

  const getShiftFocusAreaIds = useCallback(
    (empId: string, date: Date): number[] => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) {
        return [];
      }

      const focusAreaIds = new Set<number>();
      for (const assignmentId of entry.publishedAssignmentDefinitionIds ?? []) {
        const assignment = assignments.find((item) => item.id === assignmentId);
        if (assignment?.focusAreaId != null) {
          focusAreaIds.add(assignment.focusAreaId);
        }
      }

      return [...focusAreaIds];
    },
    [assignments, shifts],
  );

  const getOpenShiftTimeRanges = useCallback(
    (
      assignmentIds: number[],
      customStartTime: string | null,
      customEndTime: string | null,
    ): { start: string; end: string }[] => {
      const ranges: { start: string; end: string }[] = [];
      if (customStartTime && customEndTime) {
        ranges.push({ start: customStartTime, end: customEndTime });
        return ranges;
      }

      for (const assignmentId of assignmentIds) {
        const assignment =
          assignments.find((item) => item.id === assignmentId) ??
          allAssignmentDefinitions.find((item) => item.id === assignmentId);
        if (assignment?.defaultStartTime && assignment.defaultEndTime) {
          ranges.push({
            start: assignment.defaultStartTime,
            end: assignment.defaultEndTime,
          });
          continue;
        }
        if (assignment?.categoryId != null) {
          const category = shiftCategories.find((item) => item.id === assignment.categoryId);
          if (category?.startTime && category.endTime) {
            ranges.push({ start: category.startTime, end: category.endTime });
          }
        }
      }

      return ranges;
    },
    [assignments, allAssignmentDefinitions, shiftCategories],
  );

  const buildOpenShiftInput = useCallback(
    (args: {
      segments?: ScheduleCellInput["segments"];
      shiftIds?: Array<number | null>;
      jobIds?: number[];
      customStartTime: string | null;
      customEndTime: string | null;
    }): ScheduleCellInput | null => {
      const explicitSegments = args.segments ?? [];
      const explicitShiftIds = args.shiftIds ?? [];
      const explicitJobIds = args.jobIds ?? [];
      const segments =
        explicitSegments.length > 0
          ? explicitSegments.map((segment, index) => ({
              shiftId: segment.shiftId ?? null,
              jobId: segment.jobId,
              position: index,
              isMentored: segment.isMentored ?? false,
            }))
          : explicitJobIds.map((jobId, index) => ({
              shiftId: explicitShiftIds[index] ?? null,
              jobId,
              position: index,
              isMentored: false,
            }));

      if (segments.length === 0) {
        return null;
      }

      return {
        kind: "worked",
        segments,
        absenceTypeId: null,
        customStartTime: args.customStartTime,
        customEndTime: args.customEndTime,
        seriesId: null,
        fromRecurring: false,
      };
    },
    [],
  );

  const hasOpenShiftConflict = useCallback(
    (
      assignmentIds: number[],
      date: Date,
      customStartTime: string | null,
      customEndTime: string | null,
    ) => {
      if (!currentEmpId) return false;
      const myRanges = getShiftTimeRanges(currentEmpId, date);
      if (myRanges.length === 0) return false;
      const openShiftRanges = getOpenShiftTimeRanges(
        assignmentIds,
        customStartTime,
        customEndTime,
      );
      return openShiftRanges.length > 0 && timesOverlap(myRanges, openShiftRanges);
    },
    [currentEmpId, getOpenShiftTimeRanges, getShiftTimeRanges],
  );

  const hasDateAndTimeStarted = useCallback(
    (dateKey: string, timeRanges: TimeRange[]): boolean =>
      hasShiftStartedAtTimeRanges({
        shiftDate: dateKey,
        timeRanges,
        now: new Date(currentTimeTick),
        timeZone: org?.timezone ?? null,
      }),
    [currentTimeTick, org?.timezone],
  );

  const isCoverageGapStarted = useCallback(
    (gap: CoverageGap, assignmentIds: number[]): boolean =>
      hasDateAndTimeStarted(
        formatDateKey(gap.date),
        getOpenShiftTimeRanges(assignmentIds, null, null),
      ),
    [getOpenShiftTimeRanges, hasDateAndTimeStarted],
  );

  const getActionableCoverageGapAssignmentIds = useCallback(
    (gap: CoverageGap): number[] =>
      gap.eligibleAssignmentDefinitionIds.filter(
        (assignmentId) => !isCoverageGapStarted(gap, [assignmentId]),
      ),
    [isCoverageGapStarted],
  );

  const isOpenShiftStarted = useCallback(
    (openShift: GridOpenShift): boolean =>
      hasDateAndTimeStarted(
        openShift.date,
        getOpenShiftTimeRanges(
          openShift.assignmentIds ?? [],
          openShift.customStartTime ?? null,
          openShift.customEndTime ?? null,
        ),
      ),
    [getOpenShiftTimeRanges, hasDateAndTimeStarted],
  );

  // ── Coverage gaps ──────────────────────────────────────────────────────────
  const assignmentById = useMemo(() => {
    const map = new Map<number, AssignmentDefinition>();
    for (const sc of assignments) map.set(sc.id, sc);
    // Include archived codes from allAssignmentDefinitions for shift lookup
    for (const sc of allAssignmentDefinitions) {
      if (!map.has(sc.id)) map.set(sc.id, sc);
    }
    return map;
  }, [assignments, allAssignmentDefinitions]);

  // ── Cross-date overlap warnings for the open edit panel ─────────────────
  const overnightOverlapWarnings = useMemo((): string[] => {
    if (!editPanel) return [];
    const empId = editPanel.empId;
    const date = editPanel.date;
    const entry =
      editSessionDraft?.cellKey === `${empId}_${formatDateKey(date)}`
        ? editSessionDraft.draftShift
        : shifts[`${empId}_${formatDateKey(date)}`];
    if (!entry || (entry.assignmentIds.length === 0 && !entry.absenceTypeId))
      return [];

    // Resolve effective start/end: custom times → shift code defaults → category defaults
    const resolveEffective = (
      customStart: string | null | undefined,
      customEnd: string | null | undefined,
      codeIds: number[],
    ): { start: string; end: string } | null => {
      const s = customStart?.split("|")[0];
      const e = customEnd?.split("|")[0];
      if (s && e) return { start: s, end: e };
      const code =
        codeIds[0] != null ? assignmentById.get(codeIds[0]) : undefined;
      if (code?.defaultStartTime && code?.defaultEndTime) {
        return { start: code.defaultStartTime, end: code.defaultEndTime };
      }
      const cat =
        code?.categoryId != null
          ? shiftCategories.find((c) => c.id === code.categoryId)
          : undefined;
      if (cat?.startTime && cat?.endTime) {
        return { start: cat.startTime, end: cat.endTime };
      }
      return null;
    };

    const currentTimes = resolveEffective(
      entry.customStartTime,
      entry.customEndTime,
      entry.assignmentIds,
    );
    if (!currentTimes) return [];

    // D-1 shift
    const prevDate = addDays(date, -1);
    const prevEntry = shifts[`${empId}_${formatDateKey(prevDate)}`];
    const prevTimes =
      prevEntry && prevEntry.assignmentIds.length > 0
        ? resolveEffective(
            prevEntry.customStartTime,
            prevEntry.customEndTime,
            prevEntry.assignmentIds,
          )
        : null;

    // D+1 shift
    const nextDate = addDays(date, 1);
    const nextEntry = shifts[`${empId}_${formatDateKey(nextDate)}`];
    const nextTimes =
      nextEntry && nextEntry.assignmentIds.length > 0
        ? resolveEffective(
            nextEntry.customStartTime,
            nextEntry.customEndTime,
            nextEntry.assignmentIds,
          )
        : null;

    const warnings = checkCrossDateOverlap(currentTimes, {
      prev: prevTimes,
      next: nextTimes,
    });

    // Same-day overlap check for multi-code cells
    if (entry.assignmentIds.length >= 2) {
      const pillRanges: { start: string; end: string }[] = [];
      const pillLabels: string[] = [];
      const startParts = entry.customStartTime?.split("|") ?? [];
      const endParts = entry.customEndTime?.split("|") ?? [];
      for (let i = 0; i < entry.assignmentIds.length; i++) {
        const code = assignmentById.get(entry.assignmentIds[i]);
        const cat =
          code?.categoryId != null
            ? shiftCategories.find((c) => c.id === code.categoryId)
            : undefined;
        const s = startParts[i] || code?.defaultStartTime || cat?.startTime;
        const e = endParts[i] || code?.defaultEndTime || cat?.endTime;
        if (s && e) {
          pillRanges.push({ start: s, end: e });
          pillLabels.push(
            assignmentLabelMap.get(entry.assignmentIds[i]) ?? code?.label ?? "?",
          );
        }
      }
      warnings.push(...checkSameDayOverlaps(pillRanges, pillLabels));
    }

    return warnings;
  }, [
    editPanel,
    editSessionDraft,
    shifts,
    assignmentById,
    shiftCategories,
    assignmentLabelMap,
  ]);

  const employeesByFocusArea = useMemo(() => {
    const next = new Map<number, Employee[]>();
    for (const fa of focusAreas) {
      next.set(
        fa.id,
        employees.filter((employee) => employee.focusAreaIds.includes(fa.id)),
      );
    }
    return next;
  }, [employees, focusAreas]);

  const assignmentIdsByFocusArea = useMemo(
    () => buildAssignmentIdsByFocusArea(focusAreas, assignments),
    [focusAreas, assignments],
  );

  const allCoverageGaps = useMemo(() => {
    if (!coverageRequirements.length || !focusAreas.length) return [];

    return computeCoverageGaps(
      focusAreas,
      shiftCategories,
      assignments,
      coverageRequirements,
      dates,
      employeesByFocusArea,
      assignmentIdsForKey,
      assignmentById,
      assignmentIdsByFocusArea,
      assignmentLabelMap,
      coverageCreditForKey,
    );
  }, [
    coverageRequirements,
    focusAreas,
    shiftCategories,
    assignments,
    dates,
    employeesByFocusArea,
    assignmentIdsForKey,
    assignmentById,
    assignmentIdsByFocusArea,
    assignmentLabelMap,
    coverageCreditForKey,
  ]);

  const publishedCoverageGaps = useMemo(() => {
    if (
      !coverageRequirements.length ||
      !focusAreas.length ||
      publishedVisibleDates.length === 0
    ) {
      return [];
    }

    return computeCoverageGaps(
      focusAreas,
      shiftCategories,
      assignments,
      coverageRequirements,
      publishedVisibleDates,
      employeesByFocusArea,
      assignmentIdsForKey,
      assignmentById,
      assignmentIdsByFocusArea,
      assignmentLabelMap,
      coverageCreditForKey,
    ).filter(
      (gap) => getActionableCoverageGapAssignmentIds(gap).length > 0,
    );
  }, [
    coverageRequirements,
    focusAreas,
    shiftCategories,
    assignments,
    publishedVisibleDates,
    employeesByFocusArea,
    assignmentIdsForKey,
    assignmentById,
    assignmentIdsByFocusArea,
    assignmentLabelMap,
    coverageCreditForKey,
    getActionableCoverageGapAssignmentIds,
  ]);

  const visibleCoverageGaps = useMemo(
    () =>
      selectVisibleCoverageGaps({
        allCoverageGaps: allCoverageGaps.filter(
          (gap) => getActionableCoverageGapAssignmentIds(gap).length > 0,
        ),
        publishedCoverageGaps,
        canEditShifts,
      }),
    [
      allCoverageGaps,
      canEditShifts,
      getActionableCoverageGapAssignmentIds,
      publishedCoverageGaps,
    ],
  );

  // ── Merge calloff open shifts + coverage-gap open shifts ──
  const openShifts = useMemo<GridOpenShift[]>(() => {
    const gapShifts = visibleCoverageGaps.reduce<GridOpenShift[]>(
      (items, gap) => {
        const actionableAssignmentIds = getActionableCoverageGapAssignmentIds(gap);

        if (
          hasPendingVolunteerRequestForCoverageGap({
            actionableAssignmentIds,
            employeeId: currentEmpId,
            gap,
            requests: shiftRequests.requests,
          })
        ) {
          return items;
        }

        const remainingNeeded =
          gap.status.required -
          gap.status.actual -
          countPendingVolunteerRequestsForCoverageGap({
            actionableAssignmentIds,
            gap,
            requests: shiftRequests.requests,
          });

        if (remainingNeeded <= 0) {
          return items;
        }

        const representativeAssignmentId =
          actionableAssignmentIds.find(
            (assignmentId) =>
              assignmentId === gap.preferredOpenAssignmentDefinitionId,
          ) ??
          actionableAssignmentIds[0];
        if (!representativeAssignmentId) {
          return items;
        }
        const sc = assignmentById.get(representativeAssignmentId);
        const representativeShiftId = sc?.shiftId ?? sc?.categoryId ?? null;
        const representativeJobId = sc?.jobId ?? null;
        items.push({
          id: `gap_${gap.focusAreaId}_${gap.requirementAssignmentDefinitionId}_${formatDateKey(gap.date)}`,
          source: "coverage_gap" as const,
          date: formatDateKey(gap.date),
          focusAreaId: gap.focusAreaId,
          requirementAssignmentDefinitionId: gap.requirementAssignmentDefinitionId,
          shiftIds: representativeJobId != null ? [representativeShiftId] : [],
          jobIds: representativeJobId != null ? [representativeJobId] : [],
          assignmentIds: [representativeAssignmentId],
          eligibleAssignmentDefinitionIds: actionableAssignmentIds,
          preferredOpenAssignmentDefinitionId: representativeAssignmentId,
          ruleLabel: gap.ruleLabel,
          assignmentLabel: gap.assignmentLabel,
          customStartTime: sc?.defaultStartTime ?? null,
          customEndTime: sc?.defaultEndTime ?? null,
          needed: remainingNeeded,
        });
        return items;
      },
      [],
    );
    return [...resolvedCalloffOpenShifts, ...gapShifts].filter((openShift) => {
      if (isOpenShiftStarted(openShift)) return false;
      // Schedulers always see every open shift as a filling tool. The
      // org-level visibility setting only governs the regular-staff view.
      if (canEditShifts) return true;
      const mode =
        openShift.source === "calloff"
          ? (org?.openShiftVisibility?.calloff ?? "matched")
          : (org?.openShiftVisibility?.coverageGap ?? "matched");
      if (mode === "hidden") return false;
      if (mode === "always") return true;
      // matched: only show open shifts that fit the viewer's own schedule.
      return !hasOpenShiftConflict(
        openShift.assignmentIds ?? [],
        new Date(`${openShift.date}T00:00:00`),
        openShift.customStartTime ?? null,
        openShift.customEndTime ?? null,
      );
    });
  }, [
    assignmentById,
    canEditShifts,
    currentEmpId,
    getActionableCoverageGapAssignmentIds,
    hasOpenShiftConflict,
    isOpenShiftStarted,
    org?.openShiftVisibility,
    resolvedCalloffOpenShifts,
    shiftRequests.requests,
    visibleCoverageGaps,
  ]);

  const draftKindForKey = useCallback(
    (empId: string, date: Date): DraftKind => {
      if (!draftCheckComplete) return null;
      if (!canEditShifts) return null;
      return shifts[`${empId}_${formatDateKey(date)}`]?.draftKind ?? null;
    },
    [shifts, draftCheckComplete, canEditShifts],
  );

  const publishedLabelForKey = useCallback(
    (empId: string, date: Date): string | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return null;
      if (entry.publishedAbsenceTypeId != null)
        return absenceTypeMap.get(entry.publishedAbsenceTypeId) ?? "?";
      if (entry.publishedAssignmentDefinitionIds.length > 0)
        return entry.publishedAssignmentDefinitionIds
          .map((id) => assignmentLabelMap.get(id) ?? "?")
          .join("/");
      return null;
    },
    [shifts, assignmentLabelMap, absenceTypeMap],
  );

  const publishedAssignmentIdsForKey = useCallback(
    (empId: string, date: Date): number[] =>
      shifts[`${empId}_${formatDateKey(date)}`]?.publishedAssignmentDefinitionIds ?? [],
    [shifts],
  );

  const hasActiveRequestForShift = useCallback(
    (empId: string, date: Date): boolean =>
      shiftRequests.requests.some(
        (r) =>
          r.requesterEmpId === empId &&
          r.requesterShiftDate === formatDateKey(date) &&
          (r.status === "open" || r.status === "pending_approval"),
      ),
    [shiftRequests.requests],
  );

  const publishDiffKindForKey = useCallback(
    (
      empId: string,
      date: Date,
    ):
      | (PublishChange & { publishedAt: string; publishedBy: string })
      | null => {
      if (!showPublishDiff || !publishChangesMap) return null;
      return publishChangesMap.get(`${empId}_${formatDateKey(date)}`) ?? null;
    },
    [showPublishDiff, publishChangesMap],
  );

  // Set of cell keys published since user's last view — used for subtle background tint
  const recentlyPublishedKeys = useMemo(() => {
    if (!publishChangesMap) return undefined;
    return new Set(publishChangesMap.keys());
  }, [publishChangesMap]);

  const getCustomShiftTimes = useCallback(
    (
      empId: string,
      date: Date,
    ): {
      start: string;
      end: string;
      perPill?: { start: string; end: string }[];
    } | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return null;
      const rawStart = entry.customStartTime ?? "";
      const rawEnd = entry.customEndTime ?? "";
      const startParts = rawStart.split("|");
      const endParts = rawEnd.split("|");
      const start = startParts[0] || "";
      const end = endParts[0] || "";
      const maxLen = Math.max(startParts.length, endParts.length);
      const perPill =
        maxLen > 1
          ? Array.from({ length: maxLen }, (_, i) => ({
              start: startParts[i] || "",
              end: endParts[i] || "",
            }))
          : undefined;
      if (!start && !end && !perPill) return null;
      return { start, end, perPill };
    },
    [shifts],
  );

  const getPublishedCustomShiftTimes = useCallback(
    (
      empId: string,
      date: Date,
    ): {
      start: string;
      end: string;
      perPill?: { start: string; end: string }[];
    } | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return null;
      const rawStart = entry.publishedCustomStartTime ?? "";
      const rawEnd = entry.publishedCustomEndTime ?? "";
      const startParts = rawStart.split("|");
      const endParts = rawEnd.split("|");
      const start = startParts[0] || "";
      const end = endParts[0] || "";
      const maxLen = Math.max(startParts.length, endParts.length);
      const perPill =
        maxLen > 1
          ? Array.from({ length: maxLen }, (_, i) => ({
              start: startParts[i] || "",
              end: endParts[i] || "",
            }))
          : undefined;
      if (!start && !end && !perPill) return null;
      return { start, end, perPill };
    },
    [shifts],
  );

  const hasTimeChangesForKey = useCallback(
    (empId: string, date: Date): boolean => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return false;
      return (
        (entry.customStartTime ?? null) !==
          (entry.publishedCustomStartTime ?? null) ||
        (entry.customEndTime ?? null) !== (entry.publishedCustomEndTime ?? null)
      );
    },
    [shifts],
  );

  /** Returns published-state data used to decide whether request actions are valid. */
  const getPublishedRequestShift = useCallback(
    (empId: string, date: Date) => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return null;
      return {
        publishedAssignmentDefinitionIds: entry.publishedAssignmentDefinitionIds ?? [],
        publishedSegments: entry.publishedSegments ?? entry.segments ?? [],
        publishedCustomStartTime: entry.publishedCustomStartTime ?? null,
        publishedCustomEndTime: entry.publishedCustomEndTime ?? null,
      };
    },
    [shifts],
  );

  const getPublishedShiftSegments = useCallback(
    (empId: string, date: Date): ShiftJobSegment[] => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry || entry.isDelete || entry.publishedAbsenceTypeId != null) {
        return [];
      }
      return entry.publishedSegments ?? entry.segments ?? [];
    },
    [shifts],
  );

  const getPublishedShiftSegmentOptions = useCallback(
    (empId: string, date: Date) =>
      getPublishedShiftSegments(empId, date)
        .map((segment, originalIndex) => ({ segment, originalIndex }))
        .sort((left, right) => {
          const leftStart = left.segment.startTime ?? "99:99:99";
          const rightStart = right.segment.startTime ?? "99:99:99";
          const timeComparison = leftStart.localeCompare(rightStart);

          return timeComparison === 0
            ? left.originalIndex - right.originalIndex
            : timeComparison;
        })
        .map(({ segment }, index) => ({ segment, segmentIndex: index })),
    [getPublishedShiftSegments],
  );

  const getPublishedShiftTimeRanges = useCallback(
    (empId: string, date: Date): { start: string; end: string }[] => {
      const publishedShift = getPublishedRequestShift(empId, date);
      if (!publishedShift) {
        return [];
      }

      const startParts = publishedShift.publishedCustomStartTime?.split("|") ?? [];
      const endParts = publishedShift.publishedCustomEndTime?.split("|") ?? [];
      const ranges: { start: string; end: string }[] = [];

      for (let i = 0; i < publishedShift.publishedAssignmentDefinitionIds.length; i++) {
        const customStart = startParts[i] || null;
        const customEnd = endParts[i] || null;
        if (customStart && customEnd) {
          ranges.push({ start: customStart, end: customEnd });
          continue;
        }

        const assignment = assignments.find(
          (item) => item.id === publishedShift.publishedAssignmentDefinitionIds[i],
        );
        if (assignment?.defaultStartTime && assignment?.defaultEndTime) {
          ranges.push({
            start: assignment.defaultStartTime,
            end: assignment.defaultEndTime,
          });
          continue;
        }

        if (assignment?.categoryId != null) {
          const category = shiftCategories.find(
            (item) => item.id === assignment.categoryId,
          );
          if (category?.startTime && category?.endTime) {
            ranges.push({ start: category.startTime, end: category.endTime });
          }
        }
      }

      return ranges;
    },
    [assignments, getPublishedRequestShift, shiftCategories],
  );

  const isPublishedShiftSegmentStarted = useCallback(
    (empId: string, date: Date, segmentIndex: number): boolean => {
      const option = getPublishedShiftSegmentOptions(empId, date)[segmentIndex];
      const sortedRanges = [...getPublishedShiftTimeRanges(empId, date)].sort(
        (left, right) => {
          const startComparison = left.start.localeCompare(right.start);
          return startComparison === 0
            ? left.end.localeCompare(right.end)
            : startComparison;
        },
      );
      const range =
        option?.segment.startTime != null
          ? { start: option.segment.startTime, end: option.segment.endTime ?? "" }
          : (sortedRanges[segmentIndex] ?? null);

      return hasDateAndTimeStarted(formatDateKey(date), range ? [range] : []);
    },
    [
      getPublishedShiftSegmentOptions,
      getPublishedShiftTimeRanges,
      hasDateAndTimeStarted,
    ],
  );

  /** True if the published shift date is in the past, or it's today and the published shift has already started. */
  const isPublishedShiftStarted = useCallback(
    (empId: string, date: Date): boolean => {
      const dateStr = formatDateKey(date);
      const publishedShift = getPublishedRequestShift(empId, date);
      if (!publishedShift || publishedShift.publishedAssignmentDefinitionIds.length === 0)
        return true;
      const ranges = getPublishedShiftTimeRanges(empId, date);
      if (ranges.length === 0) {
        return true;
      }

      return ranges.every((range) =>
        hasDateAndTimeStarted(dateStr, [range]),
      );
    },
    [getPublishedRequestShift, getPublishedShiftTimeRanges, hasDateAndTimeStarted],
  );

  /** True if the published shift has at least one categorized, non-off-day shift code. */
  const isPublishedRequestableShift = useCallback(
    (empId: string, date: Date): boolean => {
      const publishedShift = getPublishedRequestShift(empId, date);
      if (!publishedShift || publishedShift.publishedAssignmentDefinitionIds.length === 0)
        return false;
      return publishedShift.publishedAssignmentDefinitionIds.some((codeId) => {
        const sc = assignments.find((c) => c.id === codeId);
        return sc != null && sc.categoryId != null;
      });
    },
    [getPublishedRequestShift, assignments],
  );

  const canCreateOwnShiftRequest = useCallback(
    (empId: string, date: Date): boolean =>
      !!currentEmpId &&
      empId === currentEmpId &&
      !isPublishedShiftStarted(empId, date) &&
      isPublishedRequestableShift(empId, date),
    [currentEmpId, isPublishedRequestableShift, isPublishedShiftStarted],
  );

  const canOpenOwnRequestPanel = useCallback(
    (empId: string, date: Date): boolean =>
      !!currentEmpId &&
      empId === currentEmpId &&
      (hasActiveRequestForShift(empId, date) ||
        canCreateOwnShiftRequest(empId, date)),
    [
      canCreateOwnShiftRequest,
      currentEmpId,
      hasActiveRequestForShift,
    ],
  );

  const activeIndicatorIdsForKey = useCallback(
    (empId: string, date: Date, focusAreaId?: number): number[] => {
      const dateKey = formatDateKey(date);
      const key =
        focusAreaId != null
          ? `${empId}_${dateKey}_${focusAreaId}`
          : `${empId}_${dateKey}`;
      const noteList = notes[key] ?? [];
      // Only return notes that aren't marked as deleted in draft
      return noteList
        .filter((n) => n.status !== "draft_deleted")
        .map((n) => n.indicatorTypeId);
    },
    [notes],
  );

  const panelActiveIndicatorIds = useCallback(
    (focusAreaId: number): number[] => {
      if (
        editSessionDraft &&
        editSessionCellKey &&
        editSessionDraft.cellKey === editSessionCellKey
      ) {
        return (editSessionDraft.draftNotes[focusAreaId] ?? [])
          .filter((note) => note.status !== "draft_deleted")
          .map((note) => note.indicatorTypeId);
      }
      if (!editPanel) return [];
      return activeIndicatorIdsForKey(editPanel.empId, editPanel.date, focusAreaId);
    },
    [activeIndicatorIdsForKey, editPanel, editSessionCellKey, editSessionDraft],
  );

  const broadcastDraftChanged = useCallback(
    (payload?: Record<string, unknown>) => {
      sendReliableBroadcast(
        "draft_changed",
        {
          ...payload,
          senderId: currentUserRef.current?.id,
          senderSessionId: editorSessionIdRef.current,
        },
        {
          key: DRAFT_CHANGED_BROADCAST_KEY,
          merge: mergeDraftChangedBroadcastPayload,
        },
      );
    },
    [sendReliableBroadcast],
  );

  const handleShiftWriteConflict = useCallback(async () => {
    const orgId = org?.id;
    if (!orgId) return;
    toast.error("This shift was modified elsewhere. Refreshing now.");
    const freshShifts = await fetchShifts(
      orgId,
      canEditShifts,
      assignmentLabelMapRef.current,
      absenceTypeMapRef.current,
      shiftFetchStart,
      shiftFetchEnd,
      segmentCompatibility,
    );
    setShifts(freshShifts);
  }, [org?.id, canEditShifts, shiftFetchStart, shiftFetchEnd]);

  const enqueueShiftWrite = useCallback(
    (key: string, write: () => Promise<void>): Promise<void> => {
      const previous = pendingShiftWrites.current.get(key) ?? Promise.resolve();
      const queued = previous.catch(() => {}).then(write);
      pendingShiftWrites.current.set(key, queued);
      void queued.finally(() => {
        if (pendingShiftWrites.current.get(key) === queued) {
          pendingShiftWrites.current.delete(key);
        }
      });
      return queued;
    },
    [],
  );

  const updateEditSessionDraft = useCallback(
    (
      updater: (prev: EditSessionDraft) => {
        draftShift: ShiftMap[string] | null;
        draftNotes: Record<number, DraftNoteState[]>;
      },
    ) => {
      setEditSessionDraft((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        return {
          ...prev,
          draftShift: next.draftShift,
          draftNotes: next.draftNotes,
          isDirty: computeEditSessionDirty(
            prev.baseFingerprint,
            next.draftShift,
            next.draftNotes,
          ),
        };
      });
    },
    [computeEditSessionDirty],
  );

  const handleCustomTimeChange = useCallback(
    (start: string | null, end: string | null) => {
      updateEditSessionDraft((prev) => {
        if (!prev.draftShift) {
          return {
            draftShift: prev.draftShift,
            draftNotes: prev.draftNotes,
          };
        }

        const updated = {
          ...prev.draftShift,
          customStartTime: start,
          customEndTime: end,
        };
        const draftKind = computeScheduleEntryDraftKind(updated);
        return {
          draftShift: {
            ...updated,
            isDraft: draftKind !== null,
            draftKind,
          },
          draftNotes: prev.draftNotes,
        };
      });
    },
    [updateEditSessionDraft],
  );

  const buildShiftDeleteUpdate = useCallback(
    (empId: string, dateKey: string): ShiftDeleteUpdate | null => {
      const key = `${empId}_${dateKey}`;
      const existing = shiftsRef.current[key];
      const hasContent =
        existing &&
        (existing.assignmentIds.length > 0 ||
          existing.publishedAssignmentDefinitionIds?.length ||
          existing.absenceTypeId != null ||
          existing.publishedAbsenceTypeId != null);
      if (!existing || !hasContent) return null;

      const expectedVersion = existing.version;
      const hasPublishedBacking =
        (existing.publishedAssignmentDefinitionIds?.length ?? 0) > 0 ||
        existing.publishedAbsenceTypeId != null;

      if (!hasPublishedBacking) {
        return {
          key,
          empId,
          dateKey,
          value: null,
          expectedVersion,
        };
      }

      const deleteValue = buildScheduleCellEntryFromInput({
        input: {
          kind: "deleted",
          segments: [],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: existing.seriesId ?? null,
          fromRecurring: existing.fromRecurring ?? false,
        },
        published: getPublishedSnapshot(existing),
        segmentCompatibility,
        absenceTypeMap,
        draftKind: "deleted",
        isDelete: true,
        version: expectedVersion != null ? expectedVersion + 1 : undefined,
        createdBy: existing.createdBy ?? null,
        updatedBy: currentUserRef.current?.id ?? null,
        createdAt: existing.createdAt ?? null,
        updatedAt: existing.updatedAt ?? null,
      });
      if (!deleteValue) return null;

      return {
        key,
        empId,
        dateKey,
        value: deleteValue,
        expectedVersion,
      };
    },
    [absenceTypeMap, getPublishedSnapshot, segmentCompatibility],
  );

  const applyShiftDeleteUpdates = useCallback(
    async (
      updates: ShiftDeleteUpdate[],
      options: { broadcast: boolean; failureMessage: string },
    ): Promise<void> => {
      if (updates.length === 0) return;
      const orgId = org?.id;
      if (!orgId) {
        console.error("Cannot modify shifts before org is loaded");
        return;
      }

      setShifts((prev) => {
        const next = { ...prev };
        for (const update of updates) {
          if (update.value) {
            next[update.key] = update.value;
          } else {
            delete next[update.key];
          }
        }
        return next;
      });

      if (options.broadcast) {
        const broadcastPayload: Record<string, ShiftMap[string] | null> = {};
        for (const update of updates) {
          broadcastPayload[update.key] = update.value;
        }
        broadcastDraftChanged({ shifts: broadcastPayload });
      }

      if (updates.length > 1) {
        try {
          await Promise.all(
            updates.map(
              (update) =>
                pendingShiftWrites.current.get(update.key) ?? Promise.resolve(),
            ),
          );
          const deleteItems: DeleteShiftBatchItem[] = updates.map((update) => ({
            employeeId: update.empId,
            date: update.dateKey,
            expectedVersion: update.expectedVersion,
          }));
          for (let i = 0; i < deleteItems.length; i += SCHEDULE_DELETE_BATCH_SIZE) {
            await deleteShiftBatch(
              orgId,
              deleteItems.slice(i, i + SCHEDULE_DELETE_BATCH_SIZE),
            );
          }
        } catch (err) {
          if (err instanceof OptimisticLockError) {
            await handleShiftWriteConflict();
          } else {
            toast.error(options.failureMessage);
            Sentry.captureException(err);
          }
        }
        return;
      }

      await Promise.all(
        updates.map((update) =>
          enqueueShiftWrite(update.key, async () => {
            try {
              await deleteShift(
                update.empId,
                update.dateKey,
                orgId,
                update.expectedVersion,
              );
            } catch (err) {
              if (err instanceof OptimisticLockError) {
                await handleShiftWriteConflict();
              } else {
                toast.error(options.failureMessage);
                Sentry.captureException(err);
              }
            }
          }),
        ),
      );
    },
    [
      broadcastDraftChanged,
      deleteShiftBatch,
      enqueueShiftWrite,
      handleShiftWriteConflict,
      org?.id,
    ],
  );

  const setShift = useCallback(
    (
      empId: string,
      date: Date,
      entry: ScheduleCellInput | null,
    ) => {
      const orgId = org?.id;
      if (!orgId) {
        console.error("Cannot modify shifts before org is loaded");
        return;
      }

      const dateKey = formatDateKey(date);
      const key = `${empId}_${dateKey}`;
      // Read from ref to get the latest version, not the stale closure value
      const existing = shiftsRef.current[key];
      const existingVersion = existing?.version;
      const isDelete =
        !entry ||
        entry.kind === "deleted" ||
        (entry.kind === "worked" &&
          entry.segments.length === 0 &&
          entry.absenceTypeId == null);

      if (isDelete) {
        const deleteUpdate = buildShiftDeleteUpdate(empId, dateKey);
        if (!deleteUpdate) return;
        void applyShiftDeleteUpdates([deleteUpdate], {
          broadcast: true,
          failureMessage: "Failed to delete shift",
        });
      } else {
        const derivedCodeIds = getInputAssignmentDefinitionIds(entry);
        // Filter out any stale/archived shift code IDs
        const validCodeIds = derivedCodeIds.filter((id) =>
          assignmentLabelMapRef.current.has(id),
        );
        if (
          entry.kind === "worked" &&
          (derivedCodeIds.length === 0 ||
            derivedCodeIds.length !== entry.segments.length)
        ) {
          toast.error("That assignment is no longer available.");
          return;
        }
        if (validCodeIds.length < derivedCodeIds.length) {
          toast.warning("Removed assignments that are no longer available.");
          return;
        }
        if (
          entry.kind === "absence" &&
          entry.absenceTypeId != null &&
          !absenceTypeMapRef.current.has(entry.absenceTypeId)
        ) {
          toast.error("That absence type is no longer available.");
          return;
        }
        const ex = shiftsRef.current[key];
        const normalizedEntry: ScheduleCellInput =
          entry.kind === "worked"
            ? {
                ...entry,
                customStartTime: entry.customStartTime ?? null,
                customEndTime: entry.customEndTime ?? null,
              }
            : entry.kind === "absence"
              ? {
                  ...entry,
                  segments: [],
                  customStartTime: null,
                  customEndTime: null,
                }
              : entry;
        const provisional = buildScheduleCellEntryFromInput({
          input: normalizedEntry,
          published: getPublishedSnapshot(ex),
          segmentCompatibility,
          absenceTypeMap,
          draftKind: null,
          version: existingVersion != null ? existingVersion + 1 : undefined,
          createdBy: ex?.createdBy ?? null,
          updatedBy: currentUserRef.current?.id ?? null,
          createdAt: ex?.createdAt ?? null,
          updatedAt: ex?.updatedAt ?? null,
        });
        if (!provisional) {
          toast.error("That assignment could not be resolved.");
          return;
        }
        const dk = computeScheduleEntryDraftKind(provisional);
        const upsertValue = buildScheduleCellEntryFromInput({
          input: normalizedEntry,
          published: getPublishedSnapshot(ex),
          segmentCompatibility,
          absenceTypeMap,
          draftKind: dk,
          version: existingVersion != null ? existingVersion + 1 : undefined,
          createdBy: ex?.createdBy ?? null,
          updatedBy: currentUserRef.current?.id ?? null,
          createdAt: ex?.createdAt ?? null,
          updatedAt: ex?.updatedAt ?? null,
        });
        if (!upsertValue) return;
        setShifts((prev) => ({ ...prev, [key]: upsertValue }));
        void enqueueShiftWrite(key, async () => {
          try {
            await upsertShift(
              empId,
              dateKey,
              normalizedEntry,
              orgId,
              existingVersion,
            );
          } catch (err) {
            if (err instanceof OptimisticLockError) {
              await handleShiftWriteConflict();
            } else {
              toast.error("Failed to save shift");
              Sentry.captureException(err);
            }
          }
        });
        broadcastDraftChanged({ shifts: { [key]: upsertValue } });
      }
    },
    [
      absenceTypeMapRef,
      org?.id,
      applyShiftDeleteUpdates,
      buildShiftDeleteUpdate,
      broadcastDraftChanged,
      enqueueShiftWrite,
      getInputAssignmentDefinitionIds,
      getPublishedSnapshot,
      handleShiftWriteConflict,
      segmentCompatibility,
      absenceTypeMap,
    ],
  );

  const getShiftStyle = useCallback(
    (type: string, focusAreaName?: string): AssignmentDefinition => {
      const fa = focusAreaName
        ? focusAreas.find((w) => w.name === focusAreaName)
        : null;
      const matchesType = (t: AssignmentDefinition) => t.label === type || t.name === type;

      // 1. Code associated with this focus area → use the code's own colors
      if (fa) {
        const specific = assignments.find(
          (t) => matchesType(t) && t.focusAreaId === fa.id,
        );
        if (specific) return specific;
      }
      // 2. Global code (no focus area associations)
      const general = assignments.find(
        (t) => matchesType(t) && t.focusAreaId == null,
      );
      if (general) return general;
      // 3. Cross-area code — belongs to another focus area; use its own colors.
      const crossArea = assignments.find((t) => matchesType(t));
      if (crossArea) return crossArea;
      // 4. Fallback
      return {
        id: 0,
        orgId: "",
        label: type,
        name: type,
        color: "var(--color-bg)",
        border: "var(--color-border)",
        text: "var(--color-text-muted)",
        sortOrder: 999,
      } satisfies AssignmentDefinition;
    },
    [assignments, focusAreas],
  );

  // ── Event handlers ───────────────────────────────────────────────────────────

  const handleCellClick = useCallback(
    (emp: Employee, date: Date, focusAreaName?: string) => {
      const canEditCell = canEditShiftsRef.current || canEditNotes;
      const canOpenRequestPanel = canOpenOwnRequestPanel(emp.id, date);
      if (!canEditCell && !canOpenRequestPanel) return;
      const cellKey = `${emp.id}_${formatDateKey(date)}`;
      if (canEditCell) {
        const activity = getCellActivity(cellKey);
        const lock = getCellLock(cellKey);
        if (lock) {
          toast.info(`Being edited by ${lock.userName}`);
          return;
        }
        if (activity?.isSameUser) {
          toast.error(
            "This cell is already open in another tab for your account",
          );
          return;
        }
        lockCell(cellKey);
      }
      const activeFaId = focusAreaName
        ? (focusAreas.find((fa) => fa.name === focusAreaName)?.id ?? null)
        : null;
      startEditSession({
        empId: emp.id,
        empName: getEmployeeDisplayName(emp),
        date,
        empFocusAreaIds: emp.focusAreaIds,
        empCertificationId: emp.certificationId,
        empRoleIds: emp.roleIds,
        activeFocusAreaId: activeFaId,
      });
    },
    [
      canEditNotes,
      canOpenOwnRequestPanel,
      focusAreas,
      getCellActivity,
      getCellLock,
      lockCell,
      startEditSession,
    ],
  );

  const buildDraftShiftFromInput = useCallback(
    (
      currentShift: ShiftMap[string] | null,
      input: ScheduleCellInput | null,
    ): ShiftMap[string] | null => {
      const published = getPublishedSnapshot(currentShift);
      const hasPublishedContent =
        (currentShift?.publishedAssignmentDefinitionIds.length ?? 0) > 0 ||
        currentShift?.publishedAbsenceTypeId != null;

      if (!input || input.kind === "deleted") {
        if (!currentShift) return null;
        if (!hasPublishedContent) {
          return null;
        }
        return buildScheduleCellEntryFromInput({
          input: {
            kind: "deleted",
            segments: [],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: currentShift.seriesId ?? null,
            fromRecurring: currentShift.fromRecurring ?? false,
          },
          published,
          segmentCompatibility,
          absenceTypeMap,
          draftKind: "deleted",
          isDelete: true,
          version: currentShift.version,
          createdBy: currentShift.createdBy ?? null,
          updatedBy: currentUserRef.current?.id ?? null,
          createdAt: currentShift.createdAt ?? null,
          updatedAt: currentShift.updatedAt ?? null,
        });
      }

      if (input.kind === "worked") {
        const derivedCodeIds = getInputAssignmentDefinitionIds(input);
        if (
          derivedCodeIds.length === 0 ||
          derivedCodeIds.length !== input.segments.length
        ) {
          toast.error("That assignment is no longer available.");
          return currentShift;
        }

        const validCodeIds = derivedCodeIds.filter((id) =>
          assignmentLabelMapRef.current.has(id),
        );
        if (validCodeIds.length < derivedCodeIds.length) {
          toast.warning("Removed assignments that are no longer available.");
          return currentShift;
        }
      }

      if (
        input.kind === "absence" &&
        input.absenceTypeId != null &&
        !absenceTypeMapRef.current.has(input.absenceTypeId)
      ) {
        toast.error("That absence type is no longer available.");
        return currentShift;
      }

      const provisional = buildScheduleCellEntryFromInput({
        input,
        published,
        segmentCompatibility,
        absenceTypeMap,
        draftKind: null,
        isDelete: false,
        version: currentShift?.version,
        createdBy: currentShift?.createdBy ?? null,
        updatedBy: currentUserRef.current?.id ?? null,
        createdAt: currentShift?.createdAt ?? null,
        updatedAt: currentShift?.updatedAt ?? null,
      });
      if (!provisional) {
        toast.error("That assignment could not be resolved.");
        return currentShift;
      }

      const draftKind = computeScheduleEntryDraftKind(provisional);
      return buildScheduleCellEntryFromInput({
        input,
        published,
        segmentCompatibility,
        absenceTypeMap,
        draftKind,
        isDelete: false,
        version: currentShift?.version,
        createdBy: currentShift?.createdBy ?? null,
        updatedBy: currentUserRef.current?.id ?? null,
        createdAt: currentShift?.createdAt ?? null,
        updatedAt: currentShift?.updatedAt ?? null,
      });
    },
    [
      absenceTypeMap,
      getInputAssignmentDefinitionIds,
      getPublishedSnapshot,
      segmentCompatibility,
    ],
  );

  const handleShiftSelect = useCallback(
    (input: ScheduleCellInput | null) => {
      updateEditSessionDraft((prev) => ({
        draftShift: buildDraftShiftFromInput(prev.draftShift, input),
        draftNotes: prev.draftNotes,
      }));
    },
    [buildDraftShiftFromInput, updateEditSessionDraft],
  );

  const handleConfirmEditPanel = useCallback(
    async (seriesScope?: SeriesScope) => {
      const orgId = org?.id;
      const session = editSessionDraftRef.current;
      const panel = editPanel;
      if (!orgId || !session || !panel) return;

      if (session.isStale) {
        toast.error(
          "This cell changed while you were editing. Close and reopen it.",
        );
        return;
      }

      const shiftIsDeleted = (shift: ShiftMap[string] | null) =>
        !shift ||
        shift.isDelete ||
        (shift.assignmentIds.length === 0 && shift.absenceTypeId == null);

      try {
        isApplyingEditSessionRef.current = true;
        const previousShifts = shiftsRef.current;
        const previousNotes = notesRef.current;
        await (pendingShiftWrites.current.get(session.cellKey) ?? Promise.resolve());

        const currentShift = cloneShiftEntry(shiftsRef.current[session.cellKey]);
        const currentNotes = collectCellNotesSnapshot(panel.empId, panel.date);
        const currentFingerprint = buildEditSessionFingerprint(
          currentShift,
          currentNotes,
        );
        if (currentFingerprint !== session.baseFingerprint) {
          setEditSessionDraft((prev) =>
            prev ? { ...prev, isStale: true } : prev,
          );
          toast.error("This shift changed in another tab or by another editor.");
          await refetchScheduleDataRef.current();
          return;
        }

        if (!session.isDirty) {
          closeEditPanel();
          return;
        }

        let workingShift = currentShift;
        let workingBaseShift = session.baseShift;
        const initialIdentityChanged = !shiftEditableIdentityMatches(
          session.baseShift,
          session.draftShift,
        );

        if (
          seriesScope === "all" &&
          workingBaseShift?.seriesId &&
          initialIdentityChanged
        ) {
          if (shiftIsDeleted(session.draftShift)) {
            await deleteShiftSeries(workingBaseShift.seriesId, orgId);
          } else if (session.draftShift) {
            await updateSeriesAllShifts(
              workingBaseShift.seriesId,
              buildEntryPayload(session.draftShift),
              orgId,
            );
          }

          const freshShifts = await fetchShifts(
            orgId,
            canEditShiftsRef.current,
            assignmentLabelMapRef.current,
            absenceTypeMapRef.current,
            shiftFetchStart,
            shiftFetchEnd,
            segmentCompatibility,
          );
          setShifts(freshShifts);
          shiftsRef.current = freshShifts;
          workingShift = cloneShiftEntry(freshShifts[session.cellKey]);
          workingBaseShift = workingShift;
        }

        const expectedVersion = workingShift?.version;
        const remainingIdentityChanged = !shiftEditableIdentityMatches(
          workingBaseShift,
          session.draftShift,
        );
        const remainingTimeChanged =
          (workingBaseShift?.customStartTime ?? null) !==
            (session.draftShift?.customStartTime ?? null) ||
          (workingBaseShift?.customEndTime ?? null) !==
            (session.draftShift?.customEndTime ?? null);

        if (remainingIdentityChanged) {
          if (shiftIsDeleted(session.draftShift)) {
            if (workingShift) {
              await deleteShift(
                panel.empId,
                formatDateKey(panel.date),
                orgId,
                expectedVersion,
              );
            }
          } else if (session.draftShift) {
            await upsertShift(
              panel.empId,
              formatDateKey(panel.date),
              buildEntryPayload(session.draftShift),
              orgId,
              expectedVersion,
            );
          }
        } else if (remainingTimeChanged && session.draftShift && workingShift) {
          await upsertShiftTimes(
            panel.empId,
            formatDateKey(panel.date),
            session.draftShift.customStartTime ?? null,
            session.draftShift.customEndTime ?? null,
            orgId,
            expectedVersion,
          );
        }

        const focusAreaIds = new Set<number>([
          ...Object.keys(session.baseNotes).map(Number),
          ...Object.keys(session.draftNotes).map(Number),
        ]);

        for (const focusAreaId of focusAreaIds) {
          const baseEntries = session.baseNotes[focusAreaId] ?? [];
          const draftEntries = session.draftNotes[focusAreaId] ?? [];
          const indicatorIds = new Set<number>([
            ...baseEntries.map((note) => note.indicatorTypeId),
            ...draftEntries.map((note) => note.indicatorTypeId),
          ]);

          for (const indicatorTypeId of indicatorIds) {
            const baseStatus =
              baseEntries.find((note) => note.indicatorTypeId === indicatorTypeId)
                ?.status;
            const draftStatus =
              draftEntries.find((note) => note.indicatorTypeId === indicatorTypeId)
                ?.status;
            if (baseStatus === draftStatus) continue;

            if (draftStatus && draftStatus !== "draft_deleted") {
              await upsertScheduleNote(
                orgId,
                panel.empId,
                formatDateKey(panel.date),
                indicatorTypeId,
                focusAreaId,
                baseStatus,
              );
            } else if (baseStatus) {
              await deleteScheduleNote(
                orgId,
                panel.empId,
                formatDateKey(panel.date),
                indicatorTypeId,
                focusAreaId,
                baseStatus,
              );
            }
          }
        }

        const refreshed = await refetchScheduleDataRef.current();
        const realtimeDiff =
          refreshed
            ? buildRealtimeDraftDiff(
                previousShifts,
                refreshed.shiftData,
                previousNotes,
                refreshed.noteMap,
              )
            : null;
        if (realtimeDiff) {
          broadcastDraftChanged(realtimeDiff);
        }
        closeEditPanel();
        toast.success("Shift changes saved to draft");
      } catch (err) {
        if (err instanceof OptimisticLockError) {
          setEditSessionDraft((prev) =>
            prev ? { ...prev, isStale: true } : prev,
          );
          toast.error("This shift changed in another tab or by another editor.");
          await refetchScheduleDataRef.current();
        } else {
          toast.error("Failed to save shift changes");
          Sentry.captureException(err);
        }
      } finally {
        isApplyingEditSessionRef.current = false;
      }
    },
    [
      buildEditSessionFingerprint,
      closeEditPanel,
      collectCellNotesSnapshot,
      editPanel,
      org?.id,
      broadcastDraftChanged,
      shiftFetchEnd,
      shiftFetchStart,
    ],
  );

  const handleConfirmSeriesDelete = useCallback(async () => {
    if (!pendingSeriesDelete || !org) return;
    try {
      const prevShifts = shifts;
      const deletedCount = await deleteShiftSeries(
        pendingSeriesDelete.seriesId,
        org.id,
      );
      const shiftData = await fetchShifts(
        org.id,
        canEditShifts,
        assignmentLabelMapRef.current,
        absenceTypeMapRef.current,
        shiftFetchStart,
        shiftFetchEnd,
        segmentCompatibility,
      );
      setShifts(shiftData);
      const shiftUpdates: Record<string, ShiftMap[string] | null> = {};
      // Detect removed shifts
      for (const k of Object.keys(prevShifts)) {
        if (!shiftData[k]) shiftUpdates[k] = null;
      }
      // Detect changed shifts
      for (const [k, v] of Object.entries(shiftData)) {
        if (
          !prevShifts[k] ||
          JSON.stringify(prevShifts[k]) !== JSON.stringify(v)
        ) {
          shiftUpdates[k] = v;
        }
      }
      if (Object.keys(shiftUpdates).length > 0) {
        broadcastDraftChanged({ shifts: shiftUpdates });
      }
      toast.success(
        `Series deleted (${deletedCount} shifts marked for removal on publish)`,
      );
    } catch (err) {
      toast.error("Failed to delete series");
      Sentry.captureException(err);
    } finally {
      setPendingSeriesDelete(null);
      closeEditPanel();
    }
  }, [
    pendingSeriesDelete,
    org,
    canEditShifts,
    shifts,
    broadcastDraftChanged,
    closeEditPanel,
    shiftFetchStart,
    shiftFetchEnd,
  ]);

  const handleRepeatConfirm = useCallback(
    async (
      frequency: SeriesFrequency,
      daysOfWeek: number[] | null,
      startDate: string,
      endDate: string | null,
      maxOccurrences: number | null,
      previewTotal: number,
    ) => {
      if (!editPanel || !org) return;
      const cellKey = `${editPanel.empId}_${formatDateKey(editPanel.date)}`;
      const draftEntry =
        editSessionDraftRef.current?.cellKey === cellKey
          ? editSessionDraftRef.current.draftShift
          : null;
      const currentLabel = draftEntry?.label ?? shiftForKey(editPanel.empId, editPanel.date);
      if (!currentLabel || currentLabel === "OFF") return;
      const absenceTypeId =
        draftEntry?.absenceTypeId ??
        absenceTypeIdForKey(editPanel.empId, editPanel.date);
      const seriesInputSource =
        draftEntry ??
        shiftsRef.current[cellKey] ??
        null;
      const seriesInput = seriesInputSource
        ? buildEntryPayload(seriesInputSource)
        : null;
      if (!seriesInput || (seriesInput.kind === "worked" && seriesInput.segments.length === 0)) {
        return;
      }
      setIsCreatingRepeatSeries(true);
      startScheduleOperation({
        kind: "repeat_series",
        title:
          absenceTypeId != null
            ? "Creating repeating off day..."
            : "Creating repeating shift...",
        detail:
          previewTotal > 0
            ? `Creating ${previewTotal} scheduled occurrence${previewTotal === 1 ? "" : "s"} for ${currentLabel}.`
            : `Creating a recurring pattern for ${currentLabel}.`,
        progress: 8,
      });
      try {
        const persistedEntry = cloneShiftEntry(shiftsRef.current[cellKey]);
        const pendingEntry = cloneShiftEntry(draftEntry);
        const pendingNeedsPersist =
          pendingEntry != null &&
          serializeShiftSnapshot(persistedEntry) !== serializeShiftSnapshot(pendingEntry);

        if (pendingNeedsPersist) {
          updateScheduleOperation("repeat_series", {
            progress: 12,
            detail: `Saving the current ${absenceTypeId != null ? "off day" : "shift"} before creating the repeating pattern...`,
          });
          await upsertShift(
            editPanel.empId,
            formatDateKey(editPanel.date),
            buildEntryPayload(pendingEntry),
            org.id,
            persistedEntry?.version,
          );
        }

        updateScheduleOperation("repeat_series", {
          progress: 20,
          detail:
            previewTotal > 0
              ? `Creating ${previewTotal} scheduled occurrence${previewTotal === 1 ? "" : "s"}...`
              : "Creating the repeating schedule pattern...",
        });
        await createShiftSeries(
          editPanel.empId,
          org.id,
          seriesInput,
          currentLabel,
          frequency,
          daysOfWeek,
          startDate,
          endDate,
          maxOccurrences,
          {
            onProgress: (progress) => {
              updateScheduleOperation("repeat_series", {
                progress: 20 + Math.round(progress * 0.7),
              });
            },
          },
        );
        updateScheduleOperation("repeat_series", {
          progress: 95,
          detail: "Refreshing the schedule with the new repeating entries...",
        });
        const prevShifts = shifts;
        const shiftData = await fetchShifts(
          org.id,
          canEditShifts,
          assignmentLabelMapRef.current,
          absenceTypeMapRef.current,
          shiftFetchStart,
          shiftFetchEnd,
          segmentCompatibility,
        );
        setShifts(shiftData);
        // Broadcast new/changed shifts to other editors
        const shiftUpdates: Record<string, ShiftMap[string] | null> = {};
        for (const [key, value] of Object.entries(shiftData)) {
          if (
            !prevShifts[key] ||
            JSON.stringify(prevShifts[key]) !== JSON.stringify(value)
          ) {
            shiftUpdates[key] = value;
          }
        }
        if (Object.keys(shiftUpdates).length > 0) {
          broadcastDraftChanged({ shifts: shiftUpdates });
        }
        toast.success("Repeating shift created");
        finishScheduleOperation("repeat_series");
      } catch (err) {
        clearScheduleOperation("repeat_series");
        toast.error(
          err instanceof Error
            ? err.message || "Failed to create repeating shift"
            : "Failed to create repeating shift",
        );
        Sentry.captureException(err);
      } finally {
        setIsCreatingRepeatSeries(false);
        closeEditPanel();
      }
    },
    [
      editPanel,
      org,
      canEditShifts,
      shiftForKey,
      assignmentIdsForKey,
      absenceTypeIdForKey,
      startScheduleOperation,
      updateScheduleOperation,
      finishScheduleOperation,
      clearScheduleOperation,
      closeEditPanel,
      shifts,
      broadcastDraftChanged,
      shiftFetchStart,
      shiftFetchEnd,
    ],
  );

  // ── Qualification check for drag/paste ──────────────────────────────────
  const focusAreaNameMap = useMemo(
    () => new Map(focusAreas.map((fa) => [fa.id, fa.name])),
    [focusAreas],
  );
  const handleGridCellActivate = useCallback<
    ScheduleGridHandlers["onActivateCell"]
  >(
    ({ emp, date, cellId }) => {
      handleCellClick(
        emp,
        date,
        focusAreaNameMap.get(cellId.sectionId),
      );
    },
    [handleCellClick, focusAreaNameMap],
  );
  const certificationNameMap = useMemo(
    () => new Map(certifications.map((c) => [c.id, c.name])),
    [certifications],
  );
  const roleNameMap = useMemo(
    () => new Map(orgRoles.map((role) => [role.id, role.name])),
    [orgRoles],
  );

  /** Returns null if qualified, or an error message string if not. */
  const checkQualification = useCallback(
    (empId: string, assignmentIds: number[]): string | null => {
      const emp = employees.find((e) => e.id === empId);
      if (!emp) return null; // shouldn't happen, but don't block

      for (const codeId of assignmentIds) {
        const code = assignments.find((sc) => sc.id === codeId);
        if (!code) continue;
        if (
          !isEmployeeQualifiedForAssignment(emp, {
            assignment: code,
            shiftCategories,
            jobs,
            orgRoles,
          })
        ) {
          const reasons = getAssignmentDisqualificationReasons(emp, {
            assignment: code,
            shiftCategories,
            jobs,
            focusAreaNames: focusAreaNameMap,
            roleNames: roleNameMap,
            certificationNames: certificationNameMap,
            orgRoles,
          });
          const displayLabel =
            assignmentLabelMapRef.current.get(codeId) ?? code.label;
          return formatShiftAssignmentDisqualificationMessage({
            employeeName: getEmployeeDisplayName(emp),
            assignmentLabel: displayLabel,
            reasons,
          });
        }
      }
      return null;
    },
    [
      certificationNameMap,
      employees,
      focusAreaNameMap,
      jobs,
      roleNameMap,
      orgRoles,
      shiftCategories,
      assignments,
    ],
  );

  // ── Grid-owned drag/drop handler ─────────────────────────────────────────
  const handleMoveGridEntry = useCallback<
    NonNullable<ScheduleGridHandlers["onMoveEntry"]>
  >(
    ({ sourceCellId, targetCellId, payload, mode }) => {
      const sourceKey = `${sourceCellId.empId}_${sourceCellId.dateKey}`;
      const targetKey = `${targetCellId.empId}_${targetCellId.dateKey}`;
      if (sourceKey === targetKey) return;

      const targetLock = getCellLock(targetKey);
      if (targetLock) {
        toast.info(`Cell is being edited by ${targetLock.userName}`);
        return;
      }

      const payloadAssignmentDefinitionIds = getInputAssignmentDefinitionIds(payload);
      if (payloadAssignmentDefinitionIds.length > 0) {
        const disqualified = checkQualification(
          targetCellId.empId,
          payloadAssignmentDefinitionIds,
        );
        if (disqualified) {
          toast.error(disqualified);
          return;
        }
      }

      const sourceEntry = shifts[sourceKey];
      const targetEntry = shifts[targetKey];
      const targetPublishedAssignmentDefinitionIds =
        targetEntry?.publishedAssignmentDefinitionIds ?? [];
      const targetPublishedAbsenceTypeId =
        targetEntry?.publishedAbsenceTypeId ?? null;
      const targetPublishedLabel = targetEntry?.publishedLabel ?? "";
      const targetHasPublished =
        targetPublishedAssignmentDefinitionIds.length > 0 ||
        targetPublishedAbsenceTypeId != null;
      const targetDraftKind: DraftKind = targetHasPublished
        ? "modified"
        : "new";
      const movedEntry = buildScheduleCellEntryFromInput({
        input: {
          ...payload,
          customStartTime:
            payload.kind === "worked"
              ? (sourceEntry?.customStartTime ?? payload.customStartTime ?? null)
              : null,
          customEndTime:
            payload.kind === "worked"
              ? (sourceEntry?.customEndTime ?? payload.customEndTime ?? null)
              : null,
        },
        published: getPublishedSnapshot(shifts[targetKey]),
        segmentCompatibility,
        absenceTypeMap,
        draftKind: targetDraftKind,
        version:
          shifts[targetKey]?.version != null
            ? shifts[targetKey]!.version + 1
            : undefined,
        createdBy: shifts[targetKey]?.createdBy ?? null,
        updatedBy: currentUserRef.current?.id ?? null,
        createdAt: shifts[targetKey]?.createdAt ?? null,
        updatedAt: shifts[targetKey]?.updatedAt ?? null,
      });
      if (!movedEntry) {
        toast.error("That assignment could not be moved.");
        return;
      }
      const sourceReplacement =
        mode === "move"
          ? sourceEntry?.publishedAssignmentDefinitionIds?.length ||
            sourceEntry?.publishedAbsenceTypeId != null
            ? buildScheduleCellEntryFromInput({
                input: {
                  kind: "deleted",
                  segments: [],
                  absenceTypeId: null,
                  customStartTime: null,
                  customEndTime: null,
                  seriesId: sourceEntry?.seriesId ?? null,
                  fromRecurring: sourceEntry?.fromRecurring ?? false,
                },
                published: getPublishedSnapshot(sourceEntry),
                segmentCompatibility,
                absenceTypeMap,
                draftKind: "deleted",
                isDelete: true,
                version:
                  sourceEntry?.version != null
                    ? sourceEntry.version + 1
                    : undefined,
                createdBy: sourceEntry?.createdBy ?? null,
                updatedBy: currentUserRef.current?.id ?? null,
                createdAt: sourceEntry?.createdAt ?? null,
                updatedAt: sourceEntry?.updatedAt ?? null,
              })
            : null
          : undefined;

      setShifts((prev) => {
        const next = { ...prev };
        next[targetKey] = movedEntry;
        if (mode === "move") {
          if (sourceReplacement) {
            next[sourceKey] = sourceReplacement;
          } else {
            delete next[sourceKey];
          }
        }
        return next;
      });

      broadcastDraftChanged({
        shifts: {
          [targetKey]: movedEntry,
          ...(mode === "move"
            ? {
                [sourceKey]: sourceReplacement,
              }
            : {}),
        },
      });

      void Promise.all([
        pendingShiftWrites.current.get(sourceKey) ?? Promise.resolve(),
        pendingShiftWrites.current.get(targetKey) ?? Promise.resolve(),
      ])
        .then(() =>
          moveShift(
            org!.id,
            sourceCellId.empId,
            sourceCellId.dateKey,
            targetCellId.empId,
            targetCellId.dateKey,
            payload,
            mode,
            sourceEntry?.version,
            targetEntry?.version,
            targetEntry == null,
          ),
        )
        .then(() => {
          toast.success(mode === "copy" ? "Entry copied" : "Entry moved");
        })
        .catch(async (err) => {
          if (err instanceof OptimisticLockError) {
            toast.error(
              "Entry was modified by another editor or another tab — refreshing",
            );
          } else {
            toast.error(
              mode === "copy" ? "Failed to copy entry" : "Failed to move entry",
            );
            Sentry.captureException(err);
          }
          await refetchScheduleData();
        });
    },
    [
      shifts,
      org,
      getCellLock,
      getInputAssignmentDefinitionIds,
      getPublishedSnapshot,
      checkQualification,
      broadcastDraftChanged,
      refetchScheduleData,
      segmentCompatibility,
      absenceTypeMap,
    ],
  );

  // ── Copy-paste handlers ──────────────────────────────────────────────────
  const handleCopyShift = useCallback(
    (empId: string, date: Date) => {
      const key = `${empId}_${formatDateKey(date)}`;
      const shift = shifts[key];
      if (
        !shift ||
        shift.isDelete ||
        (shift.assignmentIds.length === 0 && shift.absenceTypeId == null)
      ) {
        return;
      }
      setClipboard(buildEntryPayload(shift));
      toast.success("Entry copied");
    },
    [shifts, buildEntryPayload],
  );

  const handlePasteShift = useCallback(
    (empId: string, date: Date) => {
      if (!clipboard) return;
      const cellKey = `${empId}_${formatDateKey(date)}`;
      const lock = getCellLock(cellKey);
      if (lock) {
        toast.info(`Cell is being edited by ${lock.userName}`);
        return;
      }

      // Check if target employee qualifies for the pasted shift
      const clipboardAssignmentDefinitionIds = getInputAssignmentDefinitionIds(clipboard);
      if (clipboardAssignmentDefinitionIds.length > 0) {
        const disqualified = checkQualification(empId, clipboardAssignmentDefinitionIds);
        if (disqualified) {
          toast.error(disqualified);
          return;
        }
      }

      // If the target cell already has an entry, confirm before overwriting
      const existing = shifts[cellKey];
      if (
        existing &&
        (existing.assignmentIds.length > 0 || existing.absenceTypeId != null) &&
        !existing.isDelete
      ) {
        setPendingPasteOver({
          empId,
          date,
          existingLabel: existing.label,
          pasteEntry: clipboard,
        });
        return;
      }

      setShift(empId, date, clipboard);
      toast.success("Entry pasted");
    },
    [
      clipboard,
      setShift,
      getCellLock,
      getInputAssignmentDefinitionIds,
      checkQualification,
      shifts,
    ],
  );

  const handleClearShift = useCallback(
    (empId: string, date: Date) => {
      const cellKey = `${empId}_${formatDateKey(date)}`;
      const lock = getCellLock(cellKey);
      if (lock) {
        toast.info(`Cell is being edited by ${lock.userName}`);
        return;
      }
      const emp = employees.find((e) => e.id === empId);
      const empName = emp ? getEmployeeDisplayName(emp) : "";
      const label = shiftForKey(empId, date) ?? "";
      setPendingClearShift({ empId, date, empName, shiftLabel: label });
    },
    [getCellLock, employees, shiftForKey],
  );

  const getDateFromCellId = useCallback(
    (cellId: GridCellId) => new Date(`${cellId.dateKey}T00:00:00`),
    [],
  );

  const handleCopyGridCell = useCallback(
    (cellId: GridCellId) => {
      handleCopyShift(cellId.empId, getDateFromCellId(cellId));
    },
    [getDateFromCellId, handleCopyShift],
  );

  const handlePasteGridCell = useCallback(
    (cellId: GridCellId) => {
      handlePasteShift(cellId.empId, getDateFromCellId(cellId));
    },
    [getDateFromCellId, handlePasteShift],
  );

  // Context menu handlers
  const handleGridCellContextMenu = useCallback<
    NonNullable<ScheduleGridHandlers["onOpenCellMenu"]>
  >(
    ({ event, anchorEl, cellId, date }) => {
      event.preventDefault();
      if (isBulkDeleteMode) {
        setContextMenu(null);
        return;
      }
      const cellKey = `${cellId.empId}_${formatDateKey(date)}`;
      const shiftEntry = shifts[cellKey];
      const hasShift = !!(
        shiftEntry &&
        (shiftEntry.assignmentIds.length > 0 ||
          shiftEntry.absenceTypeId != null) &&
        !shiftEntry.isDelete
      );
      const canRequestBase =
        !shiftEntry?.absenceTypeId &&
        canCreateOwnShiftRequest(cellId.empId, date);
      const hasActiveRequest = hasActiveRequestForShift(cellId.empId, date);
      const canRequest = canRequestBase && !hasActiveRequest;
      const hasEditActions = canEditShifts && (hasShift || !!clipboard);
      const hasRequestActions = canRequest && !hasActiveRequest;

      if (!hasEditActions && !hasRequestActions) {
        setContextMenu(null);
        return;
      }

      setContextMenu({
        anchorEl,
        cellId,
      });
    },
    [
      canCreateOwnShiftRequest,
      canEditShifts,
      clipboard,
      hasActiveRequestForShift,
      isBulkDeleteMode,
      shifts,
    ],
  );

  // Compute the auto-fill date range (reused by preview + apply)
  const getAutoFillRange = useCallback((): {
    startDate: Date;
    endDate: Date;
  } => {
    if (spanWeeks === "month") {
      return {
        startDate: new Date(monthStart),
        endDate: new Date(
          monthStart.getFullYear(),
          monthStart.getMonth() + 1,
          0,
        ),
      };
    }
    return {
      startDate: new Date(weekStart),
      endDate: addDays(weekStart, spanWeeks * 7 - 1),
    };
  }, [spanWeeks, monthStart, weekStart]);

  // Preview: count how many slots would be filled, then show confirmation dialog
  const handleAutoFillPreview = useCallback(async () => {
    if (!org) return;
    const { startDate, endDate } = getAutoFillRange();

    // Fetch fresh recurring shifts to get an accurate count
    const freshRecurringShifts = await fetchRecurringShifts(
      org.id,
      undefined,
      assignmentLabelMapRef.current,
      false,
      absenceTypeMapRef.current,
    );
    setRecurringShifts(freshRecurringShifts);

    // Count empty slots that would be filled (matches server-side RPC logic)
    const byEmp: Record<string, RecurringShift[]> = {};
    for (const rs of freshRecurringShifts) {
      if (!byEmp[rs.empId]) byEmp[rs.empId] = [];
      byEmp[rs.empId].push(rs);
    }

    let count = 0;
    // DST-safe iteration using UTC arithmetic
    for (const { dateKey, dayOfWeek } of iterateDateRange(startDate, endDate)) {
      for (const [empId, empShifts] of Object.entries(byEmp)) {
        if (hasVisibleGridShiftEntry(shifts[`${empId}_${dateKey}`])) continue;
        // Match RPC logic: filter by dayOfWeek, effectiveFrom/Until, most recent first
        const candidates = empShifts
          .filter((rs) => rs.dayOfWeek === dayOfWeek)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
        const match = candidates.find((rs) => {
          const from = rs.effectiveFrom;
          const until = rs.effectiveUntil;
          return from <= dateKey && (!until || until >= dateKey);
        });
        // Verify the canonical recurring state still references active schedule definitions.
        if (match) {
          if (match.input.kind === "worked") {
            const activeShiftIds = new Set(shiftCategories.map((shift) => shift.id));
            const activeJobIds = new Set(jobs.map((job) => job.id));
            const isActive = match.input.segments.every(
              (segment) =>
                activeJobIds.has(segment.jobId) &&
                (segment.shiftId == null || activeShiftIds.has(segment.shiftId)),
            );
            if (isActive) count++;
          } else if (
            match.input.kind === "absence" &&
            match.input.absenceTypeId != null &&
            absenceTypes.some((at) => at.id === match.input.absenceTypeId)
          ) {
            count++;
          }
        }
      }
    }

    if (count === 0) {
      toast.info("No empty schedule slots matched recurring templates for this date range");
      return;
    }

    const dateRange = `${formatDate(startDate)} – ${formatDate(endDate)}`;
    setAutoFillPreview({ count, dateRange });
    setShowAutoFillConfirm(true);
  }, [org, getAutoFillRange, absenceTypes, shifts, shiftCategories, jobs]);

  // Actually apply recurring schedules (called after confirmation)
  const handleApplyRecurring = useCallback(async () => {
    if (!org) return;
    const { startDate, endDate } = getAutoFillRange();
    const dateRange = `${formatDate(startDate)} – ${formatDate(endDate)}`;
    startScheduleOperation({
      kind: "autofill",
      title: "Auto filling shifts...",
      detail: autoFillPreview?.count
        ? `Applying recurring templates to ${autoFillPreview.count} empty schedule slot${autoFillPreview.count === 1 ? "" : "s"} for ${dateRange}.`
        : `Applying recurring templates for ${dateRange}.`,
      progress: 10,
    });
    startOperationTrickle("autofill", 72);
    setShowAutoFillConfirm(false);
    setIsApplyingRecurring(true);
    try {
      const previousShifts = shiftsRef.current;
      const previousNotes = notesRef.current;
      // RPC reads fresh data from DB — no stale closures for recurringShifts/shifts
      const generated = await applyRecurringSchedules(
        org.id,
        startDate,
        endDate,
      );

      if (generated.length > 0) {
        // Refetch to get accurate state (including from_recurring flags)
        updateScheduleOperation("autofill", {
          progress: 88,
          detail: `Applied recurring templates to ${generated.length} schedule slot${generated.length === 1 ? "" : "s"}. Refreshing the schedule...`,
        });
        const refreshed = await refetchScheduleData();
        toast.success(
          `Applied recurring templates to ${generated.length} schedule slot${generated.length === 1 ? "" : "s"}`,
        );
        const realtimeDiff =
          refreshed
            ? buildRealtimeDraftDiff(
                previousShifts,
                refreshed.shiftData,
                previousNotes,
                refreshed.noteMap,
              )
            : null;
        if (realtimeDiff) {
          broadcastDraftChanged(realtimeDiff);
        }
        finishScheduleOperation("autofill");
      } else {
        finishScheduleOperation(
          "autofill",
          "No empty schedule slots matched recurring templates for this date range.",
        );
        toast.info("No empty schedule slots matched recurring templates for this date range");
      }
    } catch (err) {
      clearScheduleOperation("autofill");
      toast.error("Failed to apply recurring templates to the schedule");
      Sentry.captureException(err);
    } finally {
      setIsApplyingRecurring(false);
      setAutoFillPreview(null);
    }
  }, [
    org,
    getAutoFillRange,
    autoFillPreview,
    refetchScheduleData,
    broadcastDraftChanged,
    startScheduleOperation,
    startOperationTrickle,
    updateScheduleOperation,
    finishScheduleOperation,
    clearScheduleOperation,
  ]);

  // ── Import Previous Schedule ────────────────────────────────────────────────
  //
  // Planning and execution both happen on the server in a single atomic RPC.
  // The client renders counts and refetches the period — no batching, no
  // local-state planning, no post-fetch reconciliation. See
  // `public.import_previous_schedule` in 002_functions_triggers.sql.

  const handleImportPreviousPreview = useCallback(async () => {
    if (!org || spanWeeks === "month") return;

    const days = spanWeeks * 7;
    const sourceStart = addDays(weekStart, -days);
    const sourceEnd = addDays(sourceStart, days - 1);
    const targetEnd = addDays(weekStart, days - 1);
    const sourceStartKey = formatDateKey(sourceStart);
    const sourceEndKey = formatDateKey(sourceEnd);
    const targetStartKey = formatDateKey(weekStart);
    const targetEndKey = formatDateKey(targetEnd);

    setIsImportingPrevious(true);
    try {
      const outcomes = await importPreviousSchedule({
        orgId: org.id,
        sourceStartDate: sourceStartKey,
        sourceEndDate: sourceEndKey,
        targetStartDate: targetStartKey,
        targetEndDate: targetEndKey,
        dryRun: true,
      });

      if (outcomes.length === 0) {
        toast.info(
          "Nothing to import — the previous period has no shifts.",
        );
        return;
      }

      const breakdown = summarizeImportPreviousOutcomes(outcomes);
      if (breakdown.imported === 0 && breakdown.totalSkipped > 0) {
        const nameByEmpId = new Map(
          employees.map((e) => [e.id, getEmployeeDisplayName(e)]),
        );
        toast.info(
          `Nothing new to import — ${formatImportPreviousSkipDescription(outcomes, breakdown, nameByEmpId)}.`,
        );
        return;
      }

      setImportPreview({
        sourceRange: `${formatDate(sourceStart)} – ${formatDate(sourceEnd)}`,
        targetRange: `${formatDate(weekStart)} – ${formatDate(targetEnd)}`,
        sourceStartDate: sourceStartKey,
        sourceEndDate: sourceEndKey,
        targetStartDate: targetStartKey,
        targetEndDate: targetEndKey,
        outcomes,
        breakdown,
      });
      setShowImportConfirm(true);
    } catch (err) {
      Sentry.captureException(err);
      toast.error("Couldn't load the import preview. Try again.");
    } finally {
      setIsImportingPrevious(false);
    }
  }, [org, spanWeeks, weekStart, employees]);

  const handleImportPrevious = useCallback(async () => {
    if (!org || spanWeeks === "month" || !importPreview) return;

    const expected = importPreview.breakdown.imported;
    startScheduleOperation({
      kind: "import_previous",
      title: "Importing previous schedule...",
      detail: `Copying ${expected} shift${expected === 1 ? "" : "s"} from ${importPreview.sourceRange} into ${importPreview.targetRange}.`,
      progress: 25,
    });
    setShowImportConfirm(false);
    setIsImportingPrevious(true);

    try {
      const outcomes = await importPreviousSchedule({
        orgId: org.id,
        sourceStartDate: importPreview.sourceStartDate,
        sourceEndDate: importPreview.sourceEndDate,
        targetStartDate: importPreview.targetStartDate,
        targetEndDate: importPreview.targetEndDate,
        dryRun: false,
      });

      updateScheduleOperation("import_previous", {
        progress: 80,
        detail: "Refreshing the schedule with the imported shifts...",
      });
      await refetchScheduleData();
      finishScheduleOperation("import_previous");

      const breakdown = summarizeImportPreviousOutcomes(outcomes);
      const nameByEmpId = new Map(
        employees.map((e) => [e.id, getEmployeeDisplayName(e)]),
      );
      const skipDescription = formatImportPreviousSkipDescription(
        outcomes,
        breakdown,
        nameByEmpId,
      );

      if (breakdown.imported === 0) {
        toast.info(
          skipDescription
            ? `Nothing imported — ${skipDescription}.`
            : "Nothing imported.",
        );
      } else if (breakdown.totalSkipped > 0) {
        toast.warning(
          `Imported ${breakdown.imported} shift${
            breakdown.imported === 1 ? "" : "s"
          }, skipped ${breakdown.totalSkipped} (${skipDescription}).`,
          { duration: 12000 },
        );
      } else {
        toast.success(
          `Imported ${breakdown.imported} shift${
            breakdown.imported === 1 ? "" : "s"
          } from previous ${spanWeeks === 1 ? "week" : "2 weeks"}.`,
        );
      }
    } catch (err) {
      clearScheduleOperation("import_previous");
      Sentry.captureException(err);
      toast.error("Couldn't import the previous schedule. Refreshing now.");
      await refetchScheduleData();
    } finally {
      setIsImportingPrevious(false);
      setImportPreview(null);
    }
  }, [
    org,
    spanWeeks,
    importPreview,
    employees,
    refetchScheduleData,
    startScheduleOperation,
    updateScheduleOperation,
    finishScheduleOperation,
    clearScheduleOperation,
  ]);

  const handleNoteToggle = useCallback(
    (indicatorTypeId: number, active: boolean, focusAreaId: number) => {
      updateEditSessionDraft((prev) => {
        const existing = prev.draftNotes[focusAreaId] ?? [];
        const existingStatus = existing.find(
          (note) => note.indicatorTypeId === indicatorTypeId,
        )?.status;

        let updated: DraftNoteState[];
        if (active) {
          if (existingStatus === "draft_deleted") {
            updated = existing.map((note) =>
              note.indicatorTypeId === indicatorTypeId
                ? { ...note, status: "published" }
                : note,
            );
          } else {
            updated = [
              ...existing.filter(
                (note) => note.indicatorTypeId !== indicatorTypeId,
              ),
              { indicatorTypeId, status: "draft" },
            ];
          }
        } else if (existingStatus === "published") {
          updated = existing.map((note) =>
            note.indicatorTypeId === indicatorTypeId
              ? { ...note, status: "draft_deleted" }
              : note,
          );
        } else {
          updated = existing.filter(
            (note) => note.indicatorTypeId !== indicatorTypeId,
          );
        }

        return {
          draftShift: prev.draftShift,
          draftNotes: {
            ...prev.draftNotes,
            [focusAreaId]: updated,
          },
        };
      });
    },
    [updateEditSessionDraft],
  );

  const handlePrev = useCallback(() => {
    if (spanWeeks === "month") {
      setWeekStart(
        (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
      );
    } else {
      const step = isMobile ? 7 : spanWeeks * 7;
      setWeekStart((prev) =>
        getScheduleStartForSpan({
          date: addDays(prev, -step),
          span: spanWeeks,
          payPeriodStartDate,
        }),
      );
    }
  }, [spanWeeks, isMobile, payPeriodStartDate]);

  const handleNext = useCallback(() => {
    if (spanWeeks === "month") {
      setWeekStart(
        (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
      );
    } else {
      const step = isMobile ? 7 : spanWeeks * 7;
      setWeekStart((prev) =>
        getScheduleStartForSpan({
          date: addDays(prev, step),
          span: spanWeeks,
          payPeriodStartDate,
        }),
      );
    }
  }, [spanWeeks, isMobile, payPeriodStartDate]);

  const handleToday = useCallback(
    () => {
      if (spanWeeks === "month") {
        setWeekStart(new Date(today.getFullYear(), today.getMonth(), 1));
        return;
      }

      setWeekStart(
        getScheduleStartForSpan({
          date: today,
          span: spanWeeks,
          payPeriodStartDate,
        }),
      );
    },
    [payPeriodStartDate, spanWeeks, today],
  );

  const handleSpanChange = useCallback((next: 1 | 2 | "month") => {
    if (next !== "month") {
      setWeekStart((prev) =>
        getScheduleStartForSpan({
          date: prev,
          span: next,
          payPeriodStartDate,
        }),
      );
    }
    setPreferredSpan(next);
  }, [payPeriodStartDate]);

  const handlePublish = useCallback(async () => {
    if (!org) return;
    setIsPublishing(true);
    try {
      let startDate: Date;
      let endDate: Date;

      if (spanWeeks === "month") {
        startDate = new Date(monthStart);
        endDate = new Date(
          monthStart.getFullYear(),
          monthStart.getMonth() + 1,
          0,
        ); // Last day of month
      } else {
        startDate = new Date(weekStart);
        endDate = addDays(weekStart, spanWeeks * 7 - 1);
      }

      await publishSchedule(org.id, startDate, endDate);

      // Notify affected employees about the published schedule
      queueNotification({
        action: "schedule_published",
        orgId: org.id,
        startDate: formatDateKey(startDate),
        endDate: formatDateKey(endDate),
      });

      // Cancel any pending draft-changed debounce to prevent stale data
      // from overwriting the fresh post-publish refetch.
      if (draftChangedDebounceRef.current) {
        clearTimeout(draftChangedDebounceRef.current);
        draftChangedDebounceRef.current = null;
      }

      await refetchScheduleData();
      await refetchPublishedRanges();
      const recentPublishes = await fetchRecentPublishHistory(
        org.id,
        lastViewedRef.current,
      );
      setPublishHistory(recentPublishes);
      setShowPublishDiff(false);
      closeEditPanel();
      setShowDiffOverlay(false);
      toast.success("Schedule published");
      // Update last-viewed so publisher doesn't see their own changes as "new" on next visit
      void updateScheduleLastViewed(org.id);

      // Notify other tabs/users to refetch the published schedule
      clearPendingBroadcast(DRAFT_CHANGED_BROADCAST_KEY);
      sendReliableBroadcast("schedule_published", {}, { key: "schedule_published" });
    } catch (err: unknown) {
      Sentry.captureException(err);
      toast.error("Failed to publish schedule");
    } finally {
      setIsPublishing(false);
    }
  }, [
    org,
    weekStart,
    monthStart,
    spanWeeks,
    refetchScheduleData,
    refetchPublishedRanges,
    closeEditPanel,
    clearPendingBroadcast,
    sendReliableBroadcast,
  ]);

  const handleCancelChanges = useCallback(
    async (discardAll = false) => {
      const user = currentUserRef.current;
      if (!org || !user) return;
      setCancelingMode(discardAll ? "all" : "mine");
      try {
        const previousShifts = shiftsRef.current;
        const previousNotes = notesRef.current;
        await discardScheduleDrafts(
          org.id,
          discardAll ? undefined : user.id,
        );

        const refreshed = await refetchScheduleDataRef.current();
        setShowDiscardConfirm(false);
        closeEditPanel();
        setShowDiffOverlay(false);
        if (discardAll) {
          // Dedicated event for discard-all — triggers immediate refetch on all clients
          clearPendingBroadcast(DRAFT_CHANGED_BROADCAST_KEY);
          sendReliableBroadcast("drafts_discarded", {}, { key: "drafts_discarded" });
        } else {
          const realtimeDiff =
            refreshed
              ? buildRealtimeDraftDiff(
                  previousShifts,
                  refreshed.shiftData,
                  previousNotes,
                  refreshed.noteMap,
                )
              : null;
          if (realtimeDiff) {
            broadcastDraftChanged(realtimeDiff);
          }
        }
        toast.success(
          discardAll ? "All changes discarded" : "Your changes discarded",
        );
      } catch (err: unknown) {
        toast.error("Failed to discard changes");
        Sentry.captureException(err);
      } finally {
        setCancelingMode(null);
      }
    },
    [
      org,
      broadcastDraftChanged,
      closeEditPanel,
      clearPendingBroadcast,
      sendReliableBroadcast,
    ],
  );

  // Open shifts map to an exact assignment (the shift + job configured in the
  // coverage requirement). Popups spell that out in full names rather than the
  // compact code/category label shown in the grid.
  const spellOutAssignment = useCallback(
    (assignmentId: number | null | undefined): string | null => {
      if (assignmentId == null) return null;
      const assignment = assignments.find((item) => item.id === assignmentId);
      if (!assignment) return null;
      const shiftId = assignment.shiftId ?? assignment.categoryId ?? null;
      const shift =
        shiftId != null
          ? (shiftCategories.find((item) => item.id === shiftId) ?? null)
          : null;
      const job =
        assignment.jobId != null
          ? (jobs.find((item) => item.id === assignment.jobId) ?? null)
          : null;
      return formatAssignableShiftOptionLabel(
        buildShiftDisplayParts({
          shift,
          job,
          assignment,
          shiftDisplayMode: "name",
        }),
      );
    },
    [assignments, jobs, shiftCategories],
  );

  const handleClaimOpenShift = useMemo<
    ScheduleGridHandlers["onClaimOpenShift"]
  >(
    () =>
      currentEmpId
        ? (openShift: GridOpenShift) => {
            const dateObj = new Date(openShift.date + "T00:00:00");
            if (openShift.source === "coverage_gap" && currentEmployee) {
              if (!currentEmployee.focusAreaIds.includes(openShift.focusAreaId)) {
                toast.error(
                  "You are not assigned to the focus area required for this shift.",
                );
                return;
              }

              const eligibleAssignmentDefinitions = (
                openShift.eligibleAssignmentDefinitionIds?.length
                  ? openShift.eligibleAssignmentDefinitionIds
                  : openShift.assignmentIds
              )
                .map((codeId) => assignmentById.get(codeId))
                .filter((assignment): assignment is AssignmentDefinition => !!assignment)
                .filter((assignment) =>
                  isEmployeeQualifiedForAssignment(
                    {
                      certificationId: currentEmployee.certificationId,
                      focusAreaIds: currentEmployee.focusAreaIds,
                      roleIds: currentEmployee.roleIds,
                    },
                    {
                      assignment,
                      shiftCategories,
                      jobs,
                      orgRoles,
                    },
                  ),
                );

              if (eligibleAssignmentDefinitions.length === 0) {
                toast.error(
                  "You aren't qualified to cover this gap.",
                );
                return;
              }

              if (eligibleAssignmentDefinitions.length === 1) {
                const selectedAssignmentDefinition = eligibleAssignmentDefinitions[0];
                const selectedRange = getOpenShiftTimeRanges(
                  [selectedAssignmentDefinition.id],
                  null,
                  null,
                )[0];
                if (
                  hasOpenShiftConflict(
                    [selectedAssignmentDefinition.id],
                    dateObj,
                    selectedRange?.start ?? null,
                    selectedRange?.end ?? null,
                  )
                ) {
                  toast.error("You already have a shift during that time.");
                  return;
                }
                setPendingClaimShift({
                  ...openShift,
                  assignmentIds: [selectedAssignmentDefinition.id],
                  shiftIds: [
                    selectedAssignmentDefinition.shiftId ??
                      selectedAssignmentDefinition.categoryId ??
                      null,
                  ],
                  jobIds:
                    selectedAssignmentDefinition.jobId != null
                      ? [selectedAssignmentDefinition.jobId]
                      : [],
                  customStartTime: selectedRange?.start ?? null,
                  customEndTime: selectedRange?.end ?? null,
                });
                return;
              }

              const preferredAssignmentDefinition =
                eligibleAssignmentDefinitions.find(
                  (assignment) =>
                    assignment.id === openShift.preferredOpenAssignmentDefinitionId,
                ) ?? eligibleAssignmentDefinitions[0];

              setCoverageGapSelection({
                openShift,
                qualifiedAssignmentDefinitions: eligibleAssignmentDefinitions,
                selectedAssignmentDefinitionId: preferredAssignmentDefinition.id,
              });
              return;
            }

            if (
              hasOpenShiftConflict(
                openShift.assignmentIds,
                dateObj,
                openShift.customStartTime,
                openShift.customEndTime,
              )
            ) {
              toast.error("You already have a shift during that time.");
              return;
            }

            setPendingClaimShift(openShift);
          }
        : undefined,
    [
      currentEmpId,
      currentEmployee,
      getOpenShiftTimeRanges,
      hasOpenShiftConflict,
      jobs,
      orgRoles,
      shiftCategories,
      assignmentById,
    ],
  );

  const scheduleGridModel = useMemo(
    () =>
      buildScheduleGridModel({
        filteredEmployees,
        allEmployees: employees,
        week1,
        week2,
        spanWeeks: spanWeeks === "month" ? 1 : spanWeeks,
        today,
        focusAreas,
        departments,
        assignments,
        historicalAssignments: allAssignmentDefinitions,
        shiftCategories,
        jobs,
        indicatorTypes,
        certifications,
        orgRoles,
        coverageRequirements,
        absenceTypeMap: absenceTypeObjectMap,
        recentlyPublishedKeys,
        cellLocks: lockedCells,
        resolvePublisherName: (userId: string) => auditNames.get(userId) ?? null,
        openShifts,
        activeFocusArea,
        highlightEmpIds: searchMatchedEmployeeIds,
        highlightScrollKey: normalizedStaffSearch || undefined,
        isCellInteractive: canEditShifts || canEditNotes || !!currentEmpId,
        canDragShifts: canEditShifts,
        shiftDisplayMode: org?.shiftDisplayMode ?? "code",
        showDiffOverlay,
        showPublishDiffOverlay: showPublishDiff,
        showAudit,
        accessors: {
          shiftForKey,
          assignmentIdsForKey,
          segmentsForKey,
          publishedSegmentsForKey: getPublishedShiftSegments,
          getShiftStyle,
          activeIndicatorIdsForKey,
          getCustomShiftTimes,
          getPublishedCustomShiftTimes,
          draftKindForKey,
          publishedLabelForKey,
          publishedAssignmentIdsForKey,
          publishedAbsenceTypeIdForKey,
          hasTimeChangesForKey,
          publishDiffForKey: publishDiffKindForKey,
          createdByNameForKey:
            canRenderAuthorNames ? createdByNameForKey : undefined,
          absenceTypeIdForKey,
        },
      }),
    [
      filteredEmployees,
      employees,
      week1,
      week2,
      spanWeeks,
      today,
      focusAreas,
      departments,
      assignments,
      allAssignmentDefinitions,
      shiftCategories,
      jobs,
      indicatorTypes,
      certifications,
      orgRoles,
      coverageRequirements,
      absenceTypeObjectMap,
      recentlyPublishedKeys,
      lockedCells,
      auditNames,
      openShifts,
      activeFocusArea,
      searchMatchedEmployeeIds,
      normalizedStaffSearch,
      canEditShifts,
      canEditNotes,
      currentEmpId,
      org?.shiftDisplayMode,
      showDiffOverlay,
      showPublishDiff,
      showAudit,
      shiftForKey,
      assignmentIdsForKey,
      segmentsForKey,
      getPublishedShiftSegments,
      getShiftStyle,
      activeIndicatorIdsForKey,
      getCustomShiftTimes,
      getPublishedCustomShiftTimes,
      draftKindForKey,
      publishedLabelForKey,
      publishedAssignmentIdsForKey,
      publishedAbsenceTypeIdForKey,
      hasTimeChangesForKey,
      publishDiffKindForKey,
      canRenderAuthorNames,
      createdByNameForKey,
      absenceTypeIdForKey,
    ],
  );

  const visibleBulkDeleteTargets = useMemo<BulkDeleteTarget[]>(() => {
    if (!canEditShifts || isMobile || spanWeeks === "month") return [];
    const targetsByKey = new Map<string, BulkDeleteTarget>();

    for (const department of scheduleGridModel.departments) {
      for (const section of department.sections) {
        for (const emp of section.employees) {
          for (const column of scheduleGridModel.columns) {
            const key = `${emp.id}_${column.dateKey}`;
            if (targetsByKey.has(key) || lockedCells.has(key)) continue;

            const entry = shifts[key];
            const hasEntry =
              entry &&
              !entry.isDelete &&
              (entry.assignmentIds.length > 0 ||
                entry.publishedAssignmentDefinitionIds?.length ||
                entry.absenceTypeId != null ||
                entry.publishedAbsenceTypeId != null);
            if (!entry || !hasEntry) continue;

            const date = new Date(`${column.dateKey}T00:00:00`);
            targetsByKey.set(key, {
              key,
              empId: emp.id,
              dateKey: column.dateKey,
              date,
              empName: getEmployeeDisplayName(emp),
              shiftLabel: shiftForKey(emp.id, date) ?? entry.label ?? "Entry",
              isPublishedBacked:
                (entry.publishedAssignmentDefinitionIds?.length ?? 0) > 0 ||
                entry.publishedAbsenceTypeId != null,
            });
          }
        }
      }
    }

    return Array.from(targetsByKey.values()).sort((left, right) => {
      if (left.dateKey !== right.dateKey) {
        return left.dateKey.localeCompare(right.dateKey);
      }
      return left.empName.localeCompare(right.empName);
    });
  }, [
    canEditShifts,
    isMobile,
    lockedCells,
    scheduleGridModel.columns,
    scheduleGridModel.departments,
    shiftForKey,
    shifts,
    spanWeeks,
  ]);

  const visibleBulkDeleteTargetByKey = useMemo(
    () =>
      new Map(
        visibleBulkDeleteTargets.map((target) => [target.key, target]),
      ),
    [visibleBulkDeleteTargets],
  );

  const visibleBulkDeleteCellKeys = useMemo(
    () => new Set(visibleBulkDeleteTargets.map((target) => target.key)),
    [visibleBulkDeleteTargets],
  );

  const hasVisibleScheduleEntries = useMemo(() => {
    for (const department of scheduleGridModel.departments) {
      for (const section of department.sections) {
        for (const emp of section.employees) {
          for (const column of scheduleGridModel.columns) {
            const entry = shifts[`${emp.id}_${column.dateKey}`];
            if (
              entry &&
              !entry.isDelete &&
              (entry.assignmentIds.length > 0 ||
                entry.publishedAssignmentDefinitionIds?.length ||
                entry.absenceTypeId != null ||
                entry.publishedAbsenceTypeId != null)
            ) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }, [scheduleGridModel.columns, scheduleGridModel.departments, shifts]);

  const bulkDeleteSelectedTargets = useMemo(
    () =>
      Array.from(bulkDeleteSelectedKeys)
        .map((key) => visibleBulkDeleteTargetByKey.get(key))
        .filter((target): target is BulkDeleteTarget => !!target)
        .sort((left, right) => {
          if (left.dateKey !== right.dateKey) {
            return left.dateKey.localeCompare(right.dateKey);
          }
          return left.empName.localeCompare(right.empName);
        }),
    [bulkDeleteSelectedKeys, visibleBulkDeleteTargetByKey],
  );

  useEffect(() => {
    if (!isBulkDeleteMode) return;
    setBulkDeleteSelectedKeys((prev) => {
      const next = new Set<string>();
      for (const key of prev) {
        if (visibleBulkDeleteTargetByKey.has(key)) next.add(key);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [isBulkDeleteMode, visibleBulkDeleteTargetByKey]);

  useEffect(() => {
    if (canEditShifts && !isMobile && spanWeeks !== "month") return;
    setIsBulkDeleteMode(false);
    setShowBulkDeleteReview(false);
    setBulkDeleteSelectedKeys(new Set());
  }, [canEditShifts, isMobile, spanWeeks]);

  const handleToggleBulkDeleteMode = useCallback(() => {
    setContextMenu(null);
    setPendingClearShift(null);
    setShowBulkDeleteReview(false);
    if (isBulkDeleteMode) {
      setIsBulkDeleteMode(false);
      setBulkDeleteSelectedKeys(new Set());
      return;
    }

    closeEditPanel();
    setBulkDeleteSelectedKeys(new Set());
    setIsBulkDeleteMode(true);
  }, [closeEditPanel, isBulkDeleteMode]);

  const handleToggleBulkDeleteCell = useCallback((cellId: GridCellId) => {
    const key = `${cellId.empId}_${cellId.dateKey}`;
    setBulkDeleteSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleSelectVisibleBulkDeleteEntries = useCallback(() => {
    setBulkDeleteSelectedKeys(new Set(visibleBulkDeleteCellKeys));
  }, [visibleBulkDeleteCellKeys]);

  const handleCancelBulkDeleteMode = useCallback(() => {
    setIsBulkDeleteMode(false);
    setShowBulkDeleteReview(false);
    setBulkDeleteSelectedKeys(new Set());
  }, []);

  const handleConfirmBulkDelete = useCallback(async () => {
    if (bulkDeleteSelectedTargets.length === 0) {
      setShowBulkDeleteReview(false);
      return;
    }

    const updates = bulkDeleteSelectedTargets
      .map((target) => buildShiftDeleteUpdate(target.empId, target.dateKey))
      .filter((update): update is ShiftDeleteUpdate => !!update);

    if (updates.length === 0) {
      toast.info("No selected entries are still removable.");
      setShowBulkDeleteReview(false);
      setBulkDeleteSelectedKeys(new Set());
      return;
    }

    setIsBulkDeleting(true);
    try {
      await applyShiftDeleteUpdates(updates, {
        broadcast: true,
        failureMessage: "Failed to remove one or more entries",
      });
      toast.success(
        `${updates.length} selected entr${updates.length === 1 ? "y" : "ies"} removed`,
      );
      setShowBulkDeleteReview(false);
      setIsBulkDeleteMode(false);
      setBulkDeleteSelectedKeys(new Set());
    } finally {
      setIsBulkDeleting(false);
    }
  }, [
    applyShiftDeleteUpdates,
    buildShiftDeleteUpdate,
    bulkDeleteSelectedTargets,
  ]);

  const scheduleGridInteractionState = useMemo<ScheduleGridInteractionState>(() => {
    const editPanelSectionId =
      editPanel?.activeFocusAreaId ?? editPanel?.empFocusAreaIds[0] ?? null;
    const activeCellId =
      contextMenu?.cellId ??
      (editPanel && editPanelSectionId != null
        ? {
            empId: editPanel.empId,
            dateKey: formatDateKey(editPanel.date),
            sectionId: editPanelSectionId,
          }
        : null);

    return {
      activeCellId,
      contextMenuCellId: contextMenu?.cellId ?? null,
      hasClipboard: !!clipboard,
      bulkDeleteMode: isBulkDeleteMode,
      bulkSelectedCellKeys: bulkDeleteSelectedKeys,
      bulkSelectableCellKeys: visibleBulkDeleteCellKeys,
    };
  }, [
    bulkDeleteSelectedKeys,
    clipboard,
    contextMenu,
    editPanel,
    isBulkDeleteMode,
    visibleBulkDeleteCellKeys,
  ]);

  const scheduleGridHandlers = useMemo<ScheduleGridHandlers>(
    () => ({
      onActivateCell: handleGridCellActivate,
      onOpenCellMenu: isBulkDeleteMode ? undefined : handleGridCellContextMenu,
      onMoveEntry: isBulkDeleteMode ? undefined : handleMoveGridEntry,
      onCopyCell:
        canEditShifts && !isBulkDeleteMode ? handleCopyGridCell : undefined,
      onPasteCell:
        canEditShifts && !isBulkDeleteMode ? handlePasteGridCell : undefined,
      onClearCell: canEditShifts && !isBulkDeleteMode
        ? (cellId) => handleClearShift(cellId.empId, getDateFromCellId(cellId))
        : undefined,
      onToggleBulkDeleteCell: isBulkDeleteMode
        ? handleToggleBulkDeleteCell
        : undefined,
      onClaimOpenShift: handleClaimOpenShift,
    }),
    [
      handleGridCellActivate,
      handleGridCellContextMenu,
      handleMoveGridEntry,
      canEditShifts,
      isBulkDeleteMode,
      handleCopyGridCell,
      handlePasteGridCell,
      handleClearShift,
      getDateFromCellId,
      handleToggleBulkDeleteCell,
      handleClaimOpenShift,
    ],
  );

  // ── Loading / error states ───────────────────────────────────────────────────

  const isLoading = orgLoading || empLoading || scheduleLoading;

  if (orgLoading || (scheduleLoading && !org)) {
    return <ScheduleLoadingScreen />;
  }
  if (loadError && !org) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          flexDirection: "column",
          gap: 24,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          background:
            "linear-gradient(180deg, var(--color-bg-secondary) 0%, var(--color-surface) 100%)",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--color-danger-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-danger)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>

        <div style={{ maxWidth: 400 }}>
          <h1
            style={{
              fontSize: "var(--dg-fs-section-title)",
              fontWeight: 800,
              color: "var(--color-text-primary)",
              marginBottom: 12,
              letterSpacing: "-0.02em",
            }}
          >
            Organization Setup Required
          </h1>
          <p
            style={{
              fontSize: "var(--dg-fs-title)",
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              marginBottom: 32,
            }}
          >
            Your account is active, but it looks like your organization hasn&apos;t
            been initialized yet. Once your administrator completes the setup,
            you&apos;ll be able to access the schedule.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 24px",
                background: "var(--color-brand)",
                color: "var(--color-surface)",
                border: "none",
                borderRadius: "8px",
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                cursor: "pointer",
                transition: "opacity 150ms ease",
              }}
            >
              Check Again
            </button>
            <button
              onClick={() =>
                (window.location.href = "mailto:support@dubgrid.com")
              }
              style={{
                padding: "12px 24px",
                background: "var(--color-bg-secondary)",
                color: "var(--color-text-secondary)",
                border: "none",
                borderRadius: "8px",
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Contact Support
            </button>
          </div>
        </div>

        {/* Technical details accessible only via hover/inspect for developers */}
        <div
          style={{
            marginTop: 40,
            opacity: 0.1,
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--color-text-faint)",
          }}
        >
          System status: {loadError}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "var(--color-bg)",
        minHeight: "100vh",
        color: "var(--color-text-primary)",
      }}
    >
      {isLoading && employees.length > 0 && <ScheduleLoadingScreen />}

      {!isLoading && (
        <>
          <div
            className="no-print"
            style={{
              position: "sticky",
              top: "var(--app-shell-header-h, 56px)",
              display: "flow-root",
              zIndex: 99,
              background: "var(--color-bg)",
            }}
          >
            {isBulkDeleteMode && (
              <div
                className="dg-draft-banner no-print"
                style={{
                  background: "var(--color-danger-bg)",
                  borderColor: "var(--color-danger-border)",
                  color: "var(--color-danger-text)",
                }}
              >
                <div
                  className="dg-draft-banner-dot"
                  style={{ background: "var(--color-danger)" }}
                />
                <span style={{ fontWeight: 700 }}>Bulk delete</span>
                <span
                  style={{
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--color-danger-text)",
                    opacity: 0.82,
                    marginLeft: 4,
                  }}
                >
                  {`${bulkDeleteSelectedKeys.size} selected of ${visibleBulkDeleteTargets.length} removable visible entr${visibleBulkDeleteTargets.length === 1 ? "y" : "ies"}`}
                </span>
                <div className="dg-draft-banner-actions">
                  <button
                    type="button"
                    className="dg-btn dg-btn-danger"
                    onClick={handleSelectVisibleBulkDeleteEntries}
                    disabled={visibleBulkDeleteTargets.length === 0}
                    style={{ fontSize: "var(--dg-fs-caption)", padding: "5px 12px" }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="dg-btn dg-btn-secondary"
                    onClick={() => setBulkDeleteSelectedKeys(new Set())}
                    disabled={bulkDeleteSelectedKeys.size === 0}
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      padding: "5px 12px",
                      color: "var(--color-danger-text)",
                      borderColor: "var(--color-danger-border)",
                    }}
                  >
                    Clear selection
                  </button>
                  <button
                    type="button"
                    className="dg-btn dg-btn-danger-filled"
                    onClick={() => setShowBulkDeleteReview(true)}
                    disabled={bulkDeleteSelectedKeys.size === 0}
                    style={{ fontSize: "var(--dg-fs-caption)", padding: "5px 12px" }}
                  >
                    Review removal
                  </button>
                  <button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={handleCancelBulkDeleteMode}
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      color: "var(--color-danger-text)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {!isBulkDeleteMode &&
              canEditShifts &&
              hasUnpublishedChanges && (
                <DraftBanner
                  onPublish={() => setShowPublishConfirm(true)}
                  onCancel={openDiscardConfirm}
                  isPublishing={isPublishing}
                  isCanceling={cancelingMode !== null}
                  breakdown={draftBreakdown}
                  showDiff={showDiffOverlay}
                  onToggleDiff={() => setShowDiffOverlay((v) => !v)}
                  canPublish={canPublishSchedule}
                />
              )}
            {!isBulkDeleteMode &&
              canEditShifts &&
              outOfWindowDraftGroups.length > 0 &&
              !outOfWindowDraftsDismissed && (
                <div
                  className="dg-draft-banner no-print"
                  data-tour="draft-banner-other-weeks"
                  style={{
                    background: "var(--color-info-bg)",
                    borderColor: "var(--color-info-border)",
                    color: "var(--color-info-text)",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    className="dg-draft-banner-dot"
                    style={{ background: "var(--color-info-text)" }}
                  />
                  <span style={{ fontWeight: 600 }}>
                    Also unpublished:
                  </span>
                  <span style={{ opacity: 0.85 }}>
                    {(() => {
                      const total = outOfWindowDraftGroups.reduce(
                        (s, g) => s + g.count,
                        0,
                      );
                      return `${total} draft${total === 1 ? "" : "s"} in ${outOfWindowDraftGroups.length} other ${spanWeeks === "month" ? "month" : spanWeeks === 2 ? "pay period" : "week"}${outOfWindowDraftGroups.length === 1 ? "" : "s"}`;
                    })()}
                  </span>
                  <div
                    className="dg-draft-banner-actions"
                    style={{ flexWrap: "wrap" }}
                  >
                    {outOfWindowDraftGroups.map((group) => {
                      const end =
                        spanWeeks === "month"
                          ? new Date(
                              group.periodStart.getFullYear(),
                              group.periodStart.getMonth() + 1,
                              0,
                            )
                          : addDays(group.periodStart, spanWeeks * 7 - 1);
                      return (
                        <Hint
                          key={group.periodKey}
                          content={hint(
                            `Jump to this period to publish or discard its drafts`,
                          )}
                          side="bottom"
                        >
                          <button
                            type="button"
                            onClick={() => setWeekStart(group.periodStart)}
                            className="dg-btn dg-btn-secondary dg-btn-sm"
                          >
                            {`${formatDate(group.periodStart)}–${formatDate(end)}`}{" "}
                            <span style={{ opacity: 0.7, marginLeft: 4 }}>
                              ({group.count})
                            </span>
                          </button>
                        </Hint>
                      );
                    })}
                    <Hint
                      content={hint("Hide this banner for the rest of this session")}
                      side="bottom"
                    >
                      <button
                        type="button"
                        onClick={dismissOutOfWindowDrafts}
                        className="dg-btn dg-btn-secondary dg-btn-sm"
                      >
                        Close
                      </button>
                    </Hint>
                  </div>
                </div>
              )}
            {!isBulkDeleteMode &&
              outOfWindowPublishHistory.length > 0 &&
              !outOfWindowPublishesDismissed &&
              (() => {
                type PublishGroup = {
                  key: string;
                  startDate: string;
                  endDate: string;
                  changeCount: number;
                };
                const groups = new Map<string, PublishGroup>();
                for (const entry of outOfWindowPublishHistory) {
                  const key = `${entry.startDate}_${entry.endDate}`;
                  const existing = groups.get(key);
                  if (existing) {
                    existing.changeCount += entry.changeCount;
                  } else {
                    groups.set(key, {
                      key,
                      startDate: entry.startDate,
                      endDate: entry.endDate,
                      changeCount: entry.changeCount,
                    });
                  }
                }
                const sortedGroups = [...groups.values()].sort((a, b) =>
                  a.startDate < b.startDate
                    ? -1
                    : a.startDate > b.startDate
                      ? 1
                      : 0,
                );
                const totalChanges = sortedGroups.reduce(
                  (s, g) => s + g.changeCount,
                  0,
                );
                const noun =
                  spanWeeks === "month"
                    ? "month"
                    : spanWeeks === 2
                      ? "pay period"
                      : "week";
                return (
                  <div
                    className="dg-draft-banner no-print"
                    style={{
                      background: "var(--color-info-bg)",
                      borderColor: "var(--color-info-border)",
                      color: "var(--color-info-text)",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      className="dg-draft-banner-dot"
                      style={{ background: "var(--color-info-text)" }}
                    />
                    <span style={{ fontWeight: 600 }}>
                      Recently published:
                    </span>
                    <span style={{ opacity: 0.85 }}>
                      {`${totalChanges} change${totalChanges === 1 ? "" : "s"} in ${sortedGroups.length} other ${noun}${sortedGroups.length === 1 ? "" : "s"}`}
                    </span>
                    <div
                      className="dg-draft-banner-actions"
                      style={{ flexWrap: "wrap" }}
                    >
                      {sortedGroups.map((group) => {
                        const [sy, sm, sd] = group.startDate
                          .split("-")
                          .map(Number);
                        const startDate = new Date(sy, sm - 1, sd);
                        const [ey, em, ed] = group.endDate
                          .split("-")
                          .map(Number);
                        const endDate = new Date(ey, em - 1, ed);
                        return (
                          <Hint
                            key={group.key}
                            content={hint(
                              "Jump to this period to view what changed",
                            )}
                            side="bottom"
                          >
                            <button
                              type="button"
                              onClick={() => setWeekStart(startDate)}
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                            >
                              {`${formatDate(startDate)}–${formatDate(endDate)}`}{" "}
                              <span
                                style={{ opacity: 0.7, marginLeft: 4 }}
                              >
                                ({group.changeCount})
                              </span>
                            </button>
                          </Hint>
                        );
                      })}
                      <Hint
                        content={hint(
                          "Hide this banner for the rest of this session",
                        )}
                        side="bottom"
                      >
                        <button
                          type="button"
                          onClick={dismissOutOfWindowPublishes}
                          className="dg-btn dg-btn-secondary dg-btn-sm"
                        >
                          Close
                        </button>
                      </Hint>
                    </div>
                  </div>
                );
              })()}
            {!isBulkDeleteMode &&
              inWindowPublishHistory.length > 0 &&
              !publishBannerDismissed &&
              (() => {
                const latest = inWindowPublishHistory[0];
                const totalChanges = inWindowPublishHistory.reduce(
                  (sum, e) => sum + e.changeCount,
                  0,
                );
                return (
                  <div
                    className="dg-draft-banner no-print"
                    style={{
                      background: "var(--color-info-bg)",
                      borderColor: "var(--color-info-border)",
                      color: "var(--color-info-text)",
                    }}
                  >
                    <div
                      className="dg-draft-banner-dot"
                      style={{ background: "var(--color-primary)" }}
                    />
                    <span style={{ fontWeight: 600 }}>
                      Published{" "}
                      {(() => {
                        const diff =
                          Date.now() - new Date(latest.publishedAt).getTime();
                        const mins = Math.floor(diff / 60000);
                        if (mins < 1) return "just now";
                        if (mins < 60) return `${mins} min ago`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs} hr ago`;
                        const days = Math.floor(hrs / 24);
                        return `${days} day${days !== 1 ? "s" : ""} ago`;
                      })()}
                    </span>
                    <span style={{ opacity: 0.7, marginLeft: 4 }}>
                      {totalChanges} change{totalChanges !== 1 ? "s" : ""}
                      {inWindowPublishHistory.length > 1
                        ? ` across ${inWindowPublishHistory.length} publishes`
                        : ""}
                    </span>
                    {!isMobile && showPublishDiff && <ChangeLegend />}
                    <div className="dg-draft-banner-actions">
                      {isMobile ? (
                        <span
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            opacity: 0.6,
                            fontStyle: "italic",
                          }}
                        >
                          Use a larger screen to view details
                        </span>
                      ) : (
                        <>
                          <Hint
                            content={hint(
                              publishHasRevealableChanges
                                ? "Highlight differences from the published schedule"
                                : "Outline the newly published shifts",
                            )}
                            side="bottom"
                          >
                            <button
                              onClick={() => setShowPublishDiff((v) => !v)}
                              className="dg-btn dg-btn-secondary"
                              style={{
                                fontSize: "var(--dg-fs-caption)",
                                padding: "5px 12px",
                                background: showPublishDiff
                                  ? "var(--color-info-bg)"
                                  : undefined,
                                color: showPublishDiff
                                  ? "var(--color-accent-text)"
                                  : undefined,
                              }}
                            >
                              {publishHasRevealableChanges
                                ? showPublishDiff
                                  ? "Hide Changes"
                                  : "Show What Changed"
                                : showPublishDiff
                                  ? "Hide Highlights"
                                  : "Highlight New"}
                            </button>
                          </Hint>
                          <button
                            onClick={() => setShowPublishHistory(true)}
                            className="dg-btn dg-btn-secondary"
                            style={{
                              fontSize: "var(--dg-fs-caption)",
                              padding: "5px 12px",
                            }}
                          >
                            View History
                          </button>
                          <button
                            onClick={async () => {
                              if (org) {
                                void updateScheduleLastViewed(org.id);
                                lastViewedRef.current =
                                  new Date().toISOString();
                              }
                              setPublishHistory([]);
                              setShowPublishDiff(false);
                            }}
                            className="dg-btn dg-btn-secondary"
                            style={{
                              fontSize: "var(--dg-fs-caption)",
                              padding: "5px 12px",
                            }}
                          >
                            Mark as Seen
                          </button>
                        </>
                      )}
                      <Hint
                        content={hint(
                          "Hide this banner for the rest of this session",
                        )}
                        side="bottom"
                      >
                        <button
                          type="button"
                          onClick={dismissPublishBanner}
                          className="dg-btn dg-btn-secondary dg-btn-sm"
                        >
                          Close
                        </button>
                      </Hint>
                    </div>
                  </div>
                );
              })()}
            <div
              data-tour="schedule-toolbar"
              style={{
                padding: "12px 16px 0",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <Toolbar
                weekStart={weekStart}
                spanWeeks={spanWeeks}
                activeFocusArea={activeFocusArea}
                staffSearch={staffSearch}
                focusAreas={focusAreas}
                onPrev={handlePrev}
                onNext={handleNext}
                onToday={handleToday}
                onSpanChange={handleSpanChange}
                onFocusAreaChange={setActiveFocusArea}
                onStaffSearchChange={setStaffSearch}
                canApplyRecurringSchedule={
                  canEditShifts && canApplyRecurringSchedule
                }
                onApplyRecurring={handleAutoFillPreview}
                isApplyingRecurring={isApplyingRecurring}
                canImportPrevious={canEditShifts}
                onImportPrevious={
                  spanWeeks !== "month"
                    ? handleImportPreviousPreview
                    : undefined
                }
                isImportingPrevious={isImportingPrevious}
                onPrintOpen={() => setShowPrintOptions(true)}
                onExportCSV={
                  dates.length > 0 && filteredEmployees.length > 0
                    ? () =>
                        exportScheduleCSV(filteredEmployees, dates, shiftForKey)
                    : undefined
                }
                presenceSlot={
                  canEditShifts ? (
                    <PresenceAvatars onlineUsers={onlineUsers} />
                  ) : null
                }
                showAudit={showAudit}
                onAuditToggle={
                  canEditShifts && !isMobile
                    ? () => setShowAudit((prev) => !prev)
                    : undefined
                }
                requestsBadgeCount={shiftRequests.badgeCount}
                onRequestsToggle={() => setShowRequestBoard((prev) => !prev)}
                coverageGapCount={visibleCoverageGaps.length}
                onCoverageToggle={() => setShowCoveragePanel((prev) => !prev)}
                hideTwoWeek={shouldAutoUseOneWeek}
                onPublishHistory={() => setShowPublishHistory(true)}
                onBulkDeleteToggle={
                  canEditShifts && !isMobile && spanWeeks !== "month"
                    ? handleToggleBulkDeleteMode
                    : undefined
                }
                isBulkDeleteMode={isBulkDeleteMode}
                hasData={employees.length > 0}
                hasVisibleGridRows={dates.length > 0 && filteredEmployees.length > 0}
                hasVisibleScheduleEntries={hasVisibleScheduleEntries}
                hasRemovableVisibleEntries={visibleBulkDeleteTargets.length > 0}
              />
            </div>
          </div>

          <div style={{ padding: isMobile ? "8px 0" : "16px 16px" }}>
            {hideGridForUnpublishedViewer && (
              <EmptyState
                heading="This period has not been published yet"
                description="Your schedule will appear here once your manager publishes it."
              />
            )}

            {/* Mobile Day View */}
            {spanWeeks !== "month" && isMobile && !hideGridForUnpublishedViewer && (
              <MobileDayView
                filteredEmployees={filteredEmployees}
                allEmployees={employees}
                dates={dates.slice(0, 7)}
                shiftForKey={shiftForKey}
                assignmentIdsForKey={assignmentIdsForKey}
                getShiftStyle={getShiftStyle}
                handleCellClick={handleCellClick}
                today={today}
                focusAreas={focusAreas}
                assignments={assignments}
                shiftCategories={shiftCategories}
                indicatorTypes={indicatorTypes}
                certifications={certifications}
                orgRoles={orgRoles}
                isCellInteractive={
                  canEditShifts || canEditNotes || !!currentEmpId
                }
                activeIndicatorIdsForKey={activeIndicatorIdsForKey}
                activeFocusArea={activeFocusArea}
                draftKindForKey={draftKindForKey}
                shiftDisplayMode={org?.shiftDisplayMode}
                absenceTypeIdForKey={absenceTypeIdForKey}
                absenceTypeMap={absenceTypeObjectMap}
                highlightEmpIds={searchMatchedEmployeeIds}
                highlightScrollKey={normalizedStaffSearch || undefined}
              />
            )}

            {/* Desktop/Tablet Grid */}
            {spanWeeks !== "month" && !isMobile && !hideGridForUnpublishedViewer && (
              <div data-tour="schedule-grid">
                <ScheduleGrid
                  model={scheduleGridModel}
                  interactionState={scheduleGridInteractionState}
                  handlers={scheduleGridHandlers}
                />
              </div>
            )}

            {/* Context menu for copy/paste/requests */}
            {(() => {
              if (!contextMenu) return null;
              const contextMenuDate = getDateFromCellId(contextMenu.cellId);
              const cmKey = `${contextMenu.cellId.empId}_${contextMenu.cellId.dateKey}`;
              const cmShiftEntry = shifts[cmKey];
              const cmHasEntry = !!(
                cmShiftEntry &&
                (cmShiftEntry.assignmentIds.length > 0 ||
                  cmShiftEntry.absenceTypeId != null) &&
                !cmShiftEntry.isDelete
              );
              const cmCanRequestBase =
                !cmShiftEntry?.absenceTypeId &&
                canCreateOwnShiftRequest(
                  contextMenu.cellId.empId,
                  contextMenuDate,
                );
              const cmCanRequest =
                cmCanRequestBase &&
                !hasActiveRequestForShift(
                  contextMenu.cellId.empId,
                  contextMenuDate,
                );
              const cmHasActiveRequest = hasActiveRequestForShift(
                contextMenu.cellId.empId,
                contextMenuDate,
              );
              // Only show the menu when at least one action is usable
              const hasEditActions =
                canEditShifts && (cmHasEntry || !!clipboard);
              const hasRequestActions = cmCanRequest && !cmHasActiveRequest;
              if (!hasEditActions && !hasRequestActions) return null;
              return (
                <ShiftContextMenu
                  anchorEl={contextMenu.anchorEl}
                  hasShift={cmHasEntry}
                  hasClipboard={!!clipboard}
                  canEdit={canEditShifts}
                  canRequest={cmCanRequest}
                  hasActiveRequest={cmHasActiveRequest}
                  onCopy={() => handleCopyGridCell(contextMenu.cellId)}
                  onPaste={() => handlePasteGridCell(contextMenu.cellId)}
                  onClear={() =>
                    handleClearShift(
                      contextMenu.cellId.empId,
                      contextMenuDate,
                    )
                  }
                  onNeedCoverage={() => {
                    const emp = employees.find(
                      (e) => e.id === contextMenu.cellId.empId,
                    );
                    if (!emp) return;
                    const cellKey = `${emp.id}_${contextMenu.cellId.dateKey}`;
                    const activity = getCellActivity(cellKey);
                    const lock = getCellLock(cellKey);
                    if (lock) {
                      toast.info(`Being edited by ${lock.userName}`);
                      return;
                    }
                    if (activity?.isSameUser) {
                      toast.error(
                        "This cell is already open in another tab for your account",
                      );
                      return;
                    }
                    lockCell(cellKey);
                    startEditSession({
                      empId: emp.id,
                      empName: getEmployeeDisplayName(emp),
                      date: contextMenuDate,
                      empFocusAreaIds: emp.focusAreaIds,
                      empCertificationId: emp.certificationId,
                      empRoleIds: emp.roleIds,
                      activeFocusAreaId: contextMenu.cellId.sectionId,
                      requestMode: "coverage",
                    });
                  }}
                  onProposeSwap={() => {
                    const emp = employees.find(
                      (e) => e.id === contextMenu.cellId.empId,
                    );
                    if (!emp) return;
                    startEditSession({
                      empId: emp.id,
                      empName: getEmployeeDisplayName(emp),
                      date: contextMenuDate,
                      empFocusAreaIds: emp.focusAreaIds,
                      empCertificationId: emp.certificationId,
                      empRoleIds: emp.roleIds,
                      activeFocusAreaId: contextMenu.cellId.sectionId,
                      requestMode: "swap",
                    });
                  }}
                  onClose={() => setContextMenu(null)}
                />
              );
            })()}

            {/* Confirm dialog for context-menu shift removal */}
            {pendingClearShift && (
              <ConfirmDialog
                title="Remove Entry?"
                message={`Remove "${pendingClearShift.shiftLabel}" from ${pendingClearShift.empName} on ${formatDate(pendingClearShift.date)}?`}
                confirmLabel="Remove"
                variant="danger"
                onConfirm={() => {
                  setShift(
                    pendingClearShift.empId,
                    pendingClearShift.date,
                    null,
                  );
                  setPendingClearShift(null);
                }}
                onCancel={() => setPendingClearShift(null)}
              />
            )}

            {showBulkDeleteReview && (
              <ConfirmDialog
                title="Review Bulk Removal"
                message={
                  <BulkDeleteReviewContent
                    targets={bulkDeleteSelectedTargets}
                  />
                }
                confirmLabel="Remove selected entries"
                cancelLabel="Back"
                variant="danger"
                maxWidth={620}
                wrapActions
                isLoading={isBulkDeleting}
                confirmDisabled={bulkDeleteSelectedTargets.length === 0}
                onConfirm={() => {
                  void handleConfirmBulkDelete();
                }}
                onCancel={() => setShowBulkDeleteReview(false)}
              />
            )}

            {/* Confirm dialog for claiming / volunteering for an open shift */}
            {coverageGapSelection && currentEmpId && (
              <Modal
                title="Choose Assignment"
                onClose={() => setCoverageGapSelection(null)}
                style={{ maxWidth: 420 }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                    <strong>{coverageGapSelection.openShift.ruleLabel ?? coverageGapSelection.openShift.assignmentLabel}</strong> on{" "}
                    <strong>{coverageGapSelection.openShift.date}</strong> can be covered by more than one exact assignment option.
                    Choose which option you want to volunteer for.
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)" }}>
                      Shift and job
                    </span>
                    <CustomSelect
                      value={String(coverageGapSelection.selectedAssignmentDefinitionId)}
                      options={coverageGapSelection.qualifiedAssignmentDefinitions.map((assignment) => ({
                        value: String(assignment.id),
                        label:
                          spellOutAssignment(assignment.id) ??
                          assignmentLabelMap.get(assignment.id) ??
                          (assignment.name || assignment.label),
                      }))}
                      onChange={(value) =>
                        setCoverageGapSelection((current) =>
                          current
                            ? { ...current, selectedAssignmentDefinitionId: Number(value) }
                            : current,
                        )
                      }
                      style={{ width: "100%" }}
                      fontSize="var(--dg-fs-caption)"
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button
                      type="button"
                      className="dg-btn dg-btn-secondary"
                      onClick={() => setCoverageGapSelection(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="dg-btn dg-btn-primary"
                      onClick={() => {
                        const selectedAssignmentDefinition = coverageGapSelection.qualifiedAssignmentDefinitions.find(
                          (assignment) =>
                            assignment.id === coverageGapSelection.selectedAssignmentDefinitionId,
                        );
                        if (!selectedAssignmentDefinition) return;
                        const dateObj = new Date(
                          coverageGapSelection.openShift.date + "T00:00:00",
                        );
                        const selectedRange = getOpenShiftTimeRanges(
                          [selectedAssignmentDefinition.id],
                          null,
                          null,
                        )[0];
                        if (
                          hasOpenShiftConflict(
                            [selectedAssignmentDefinition.id],
                            dateObj,
                            selectedRange?.start ?? null,
                            selectedRange?.end ?? null,
                          )
                        ) {
                          toast.error("You already have a shift during that time.");
                          return;
                        }
                        const volunteerInput = buildOpenShiftInput({
                          shiftIds: [
                            selectedAssignmentDefinition.shiftId ?? selectedAssignmentDefinition.categoryId ?? null,
                          ],
                          jobIds:
                            selectedAssignmentDefinition.jobId != null ? [selectedAssignmentDefinition.jobId] : [],
                          customStartTime: selectedRange?.start ?? null,
                          customEndTime: selectedRange?.end ?? null,
                        });
                        if (!volunteerInput) {
                          toast.error("That open shift is no longer available.");
                          return;
                        }
                        setCoverageGapSelection(null);
                        setPendingCoverageGapVolunteer({
                          assignmentLabel:
                            selectedAssignmentDefinition.label ??
                            coverageGapSelection.openShift.assignmentLabel,
                          date: coverageGapSelection.openShift.date,
                          focusAreaId: coverageGapSelection.openShift.focusAreaId,
                          input: volunteerInput,
                        });
                      }}
                    >
                      Volunteer
                    </button>
                  </div>
                </div>
              </Modal>
            )}
            {pendingCoverageGapVolunteer && currentEmpId && (
              <ConfirmDialog
                confirmLabel="Volunteer"
                isLoading={isCoverageGapVolunteerPending}
                message={
                  <>
                    Volunteer for{" "}
                    <strong>{pendingCoverageGapVolunteer.assignmentLabel}</strong>{" "}
                    on <strong>{pendingCoverageGapVolunteer.date}</strong>? This will be sent to your admin for approval.
                  </>
                }
                title="Volunteer for this shift?"
                variant="info"
                onCancel={() => {
                  if (!isCoverageGapVolunteerPending) {
                    setPendingCoverageGapVolunteer(null);
                  }
                }}
                onConfirm={() => {
                  if (isCoverageGapVolunteerPending) return;

                  const pendingVolunteer = pendingCoverageGapVolunteer;
                  setIsCoverageGapVolunteerPending(true);
                  void (async () => {
                    try {
                      const completed = await shiftRequests.volunteer(
                        currentEmpId,
                        pendingVolunteer.date,
                        pendingVolunteer.input,
                        pendingVolunteer.focusAreaId,
                      );
                      if (completed) {
                        setPendingCoverageGapVolunteer(null);
                      }
                    } finally {
                      setIsCoverageGapVolunteerPending(false);
                    }
                  })();
                }}
              />
            )}
            {pendingClaimShift && currentEmpId && (
              <ConfirmDialog
                title={
                  pendingClaimShift.source === "calloff"
                    ? "Claim This Shift?"
                    : "Volunteer for This Shift?"
                }
                message={
                  <>
                    <strong>
                      {spellOutAssignment(pendingClaimShift.assignmentIds[0]) ??
                        pendingClaimShift.assignmentLabel}
                    </strong>{" "}
                    on <strong>{pendingClaimShift.date}</strong>
                    {pendingClaimShift.calledOffBy && (
                      <> (called off by {pendingClaimShift.calledOffBy})</>
                    )}
                    <br />
                    This will be sent to your admin for approval.
                  </>
                }
                confirmLabel={
                  pendingClaimShift.source === "calloff" ? "Claim" : "Volunteer"
                }
                variant="info"
                isLoading={isClaimShiftPending}
                onConfirm={() => {
                  if (isClaimShiftPending) return;

                  const os = pendingClaimShift;
                  setIsClaimShiftPending(true);
                  void (async () => {
                    try {
                      let completed = false;
                      if (os.source === "calloff" && os.requestId) {
                        completed = await shiftRequests.claim(
                          os.requestId,
                          currentEmpId,
                        );
                      } else if (os.source === "coverage_gap") {
                        const volunteerInput = buildOpenShiftInput({
                          segments:
                            os.segments?.map((segment, index) => ({
                              shiftId: segment.shiftId ?? null,
                              jobId: segment.jobId,
                              position: index,
                              isMentored: segment.isMentored ?? false,
                            })) ?? [],
                          shiftIds: os.shiftIds,
                          jobIds: os.jobIds,
                          customStartTime: os.customStartTime,
                          customEndTime: os.customEndTime,
                        });
                        if (!volunteerInput) {
                          toast.error("That open shift is no longer available.");
                          setPendingClaimShift(null);
                          return;
                        }
                        completed = await shiftRequests.volunteer(
                          currentEmpId,
                          os.date,
                          volunteerInput,
                          os.focusAreaId,
                        );
                      }

                      if (completed) {
                        setPendingClaimShift(null);
                      }
                    } finally {
                      setIsClaimShiftPending(false);
                    }
                  })();
                }}
                onCancel={() => {
                  if (!isClaimShiftPending) {
                    setPendingClaimShift(null);
                  }
                }}
              />
            )}

            {/* Confirm dialog for pasting over an existing shift */}
            {pendingPasteOver && (
              <ConfirmDialog
                title="Replace Entry?"
                message={`Replace "${pendingPasteOver.existingLabel}" with "${getInputLabel(pendingPasteOver.pasteEntry)}"?`}
                confirmLabel="Replace"
                variant="warning"
                onConfirm={() => {
                  setShift(
                    pendingPasteOver.empId,
                    pendingPasteOver.date,
                    pendingPasteOver.pasteEntry,
                  );
                  setPendingPasteOver(null);
                  toast.success("Entry pasted");
                }}
                onCancel={() => setPendingPasteOver(null)}
              />
            )}

            {spanWeeks === "month" && !hideGridForUnpublishedViewer && (
              <MonthView
                monthStart={monthStart}
                filteredEmployees={filteredEmployees}
                shiftForKey={shiftForKey}
                assignmentIdsForKey={assignmentIdsForKey}
                isAbsenceForKey={isAbsenceForKey}
                getShiftStyle={getShiftStyle}
                today={today}
                focusAreas={focusAreas}
                assignments={assignments}
                shiftCategories={shiftCategories}
                activeFocusArea={activeFocusArea}
                draftKindForKey={draftKindForKey}
                shiftDisplayMode={org?.shiftDisplayMode}
                highlightEmpIds={searchMatchedEmployeeIds}
                highlightScrollKey={normalizedStaffSearch || undefined}
              />
            )}
          </div>

          {editPanel && (
            <ShiftEditPanel
              key={`${editSessionCellKey ?? "panel"}_${editSessionDraft?.baseVersion ?? "new"}_${editPanel.requestMode ?? "edit"}`}
              modal={editPanel}
              currentShift={panelCurrentShift}
              currentAssignmentIds={panelCurrentAssignmentIds}
              currentSegments={panelShiftEntry?.segments ?? []}
              assignments={assignments}
              shiftCategories={shiftCategories}
              jobs={jobs}
              focusAreas={focusAreas}
              certifications={certifications}
              orgRoles={orgRoles}
              indicatorTypes={indicatorTypes}
              onSelect={handleShiftSelect}
              onConfirmDraft={handleConfirmEditPanel}
              allowShiftEdits={canEditShifts}
              canEditScheduleIndicators={canEditScheduleIndicators}
              getActiveIndicatorIds={panelActiveIndicatorIds}
              onNoteToggle={handleNoteToggle}
              onClose={closeEditPanel}
              seriesId={
                panelShiftEntry?.seriesId ??
                shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]
                  ?.seriesId ??
                null
              }
              fromRecurring={panelShiftEntry?.fromRecurring ?? false}
              onRepeatConfirm={
                canEditShifts && canManageShiftSeries
                  ? handleRepeatConfirm
                  : undefined
              }
              isCreatingRepeatSeries={isCreatingRepeatSeries}
              empId={editPanel.empId}
              customStartTime={panelCustomStartTime}
              customEndTime={panelCustomEndTime}
              onCustomTimeChange={
                canEditShifts ? handleCustomTimeChange : undefined
              }
              publishedAssignmentIds={
                panelShiftEntry?.publishedAssignmentDefinitionIds ??
                shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]
                  ?.publishedAssignmentDefinitionIds ??
                []
              }
              publishedAbsenceTypeId={
                panelShiftEntry?.publishedAbsenceTypeId ??
                shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]
                  ?.publishedAbsenceTypeId ??
                null
              }
              publishedCustomStartTime={
                panelShiftEntry?.publishedCustomStartTime ??
                shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]
                  ?.publishedCustomStartTime ??
                null
              }
              publishedCustomEndTime={
                panelShiftEntry?.publishedCustomEndTime ??
                shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]
                  ?.publishedCustomEndTime ??
                null
              }
              draftKind={panelDraftKind}
              isStale={editSessionDraft?.isStale ?? false}
              auditInfo={
                canEditShifts && canRenderAuthorNames ? auditInfo : undefined
              }
              overlapWarnings={overnightOverlapWarnings}
              enforceConflicts={org?.enforceConflictPrevention ?? false}
              isOwnShift={!!currentEmpId && editPanel.empId === currentEmpId}
              hasActiveRequest={hasActiveRequestForShift(
                editPanel.empId,
                editPanel.date,
              )}
              onMakeAvailable={
                canCreateOwnShiftRequest(editPanel.empId, editPanel.date)
                  ? async (options) => {
                      const requestId = await shiftRequests.create(
                        "pickup",
                        editPanel.empId,
                        formatDateKey(editPanel.date),
                        options?.targetEmpId,
                        options?.targetShiftDate,
                        options?.absenceTypeId,
                        options?.requesterSegmentIndex,
                      );
                      if (requestId) {
                        closeEditPanel();
                      }
                      return requestId;
                    }
                  : undefined
              }
              onCallOff={
                canCreateOwnShiftRequest(editPanel.empId, editPanel.date)
                  ? async (absenceType, options) => {
                      const requestId = await shiftRequests.create(
                        "calloff",
                        editPanel.empId,
                        formatDateKey(editPanel.date),
                        undefined,
                        undefined,
                        absenceType.id,
                        options?.requesterSegmentIndex,
                      );
                      if (requestId) {
                        closeEditPanel();
                      }
                      return requestId;
                    }
                  : undefined
              }
              employees={employees}
              shiftForKey={shiftForKey}
              shiftNameForKey={shiftNameForKey}
              isRequestableShift={isPublishedRequestableShift}
              availableSwapDates={availableSwapDates}
              isShiftStarted={isPublishedShiftStarted}
              isShiftSegmentStarted={isPublishedShiftSegmentStarted}
              getShiftTimeRanges={getShiftTimeRanges}
              getShiftFocusAreaIds={getShiftFocusAreaIds}
              getShiftSegments={getPublishedShiftSegments}
              getAbsenceTypeIdForKey={getAbsenceTypeIdForKey}
              onSubmitSwap={
                canCreateOwnShiftRequest(editPanel.empId, editPanel.date)
                  ? async (targetEmpId, targetShiftDate, options) => {
                      const requestId = await shiftRequests.create(
                        "swap",
                        editPanel.empId,
                        formatDateKey(editPanel.date),
                        targetEmpId,
                        targetShiftDate,
                        undefined,
                        options?.requesterSegmentIndex,
                        options?.targetSegmentIndex,
                      );
                      if (requestId) {
                        closeEditPanel();
                      }
                      return requestId;
                    }
                  : undefined
              }
              shiftDisplayMode={org?.shiftDisplayMode}
              absenceTypes={absenceTypes}
              currentAbsenceTypeId={panelCurrentAbsenceTypeId}
            />
          )}

          {/* ── Shift Request Board (slide-out panel) ── */}
          {showRequestBoard && (
            <ShiftRequestBoard
              openPickups={(canEditShifts
                ? shiftRequests.openPickups
                : shiftRequests.openPickups.filter((req) => {
                if (!currentEmpId) return true;
                const dateObj = new Date(req.requesterShiftDate + "T00:00:00");
                const myRanges = getShiftTimeRanges(currentEmpId, dateObj);
                if (myRanges.length === 0) return true;
                const pickupRanges: TimeRange[] = [];
                // Use request custom times as highest priority
                if (
                  req.requesterCustomStartTime &&
                  req.requesterCustomEndTime
                ) {
                  pickupRanges.push({
                    start: req.requesterCustomStartTime,
                    end: req.requesterCustomEndTime,
                  });
                } else {
                  for (const codeId of req.requesterAssignmentDefinitionIds) {
                    const sc = assignments.find((c) => c.id === codeId);
                    if (sc?.defaultStartTime && sc?.defaultEndTime) {
                      pickupRanges.push({
                        start: sc.defaultStartTime,
                        end: sc.defaultEndTime,
                      });
                    } else if (sc?.categoryId != null) {
                      const cat = shiftCategories.find(
                        (c) => c.id === sc.categoryId,
                      );
                      if (cat?.startTime && cat?.endTime) {
                        pickupRanges.push({
                          start: cat.startTime,
                          end: cat.endTime,
                        });
                      }
                    }
                  }
                }
                if (pickupRanges.length === 0) return true;
                return !timesOverlap(myRanges, pickupRanges);
              }))}
              myRequests={shiftRequests.myRequests}
              pendingApproval={shiftRequests.pendingApproval}
              approvalQueue={canEditShifts ? shiftRequests.requests : undefined}
              canViewAllRequests={canEditShifts}
              loading={shiftRequests.loading}
              currentEmpId={currentEmpId}
              canApprove={canApproveShiftRequests}
              onClaim={(id) => {
                if (!currentEmpId) return;
                return shiftRequests.claim(id, currentEmpId);
              }}
              onRespond={(id, accept) => {
                if (!currentEmpId) return;
                return shiftRequests.respond(id, currentEmpId, accept);
              }}
              onResolve={(id, approved, note) =>
                shiftRequests.resolve(id, approved, note)
              }
              onCancel={(id) => {
                if (!currentEmpId) return;
                return shiftRequests.cancel(id, currentEmpId);
              }}
              onClose={() => setShowRequestBoard(false)}
              absenceTypeMap={absenceTypeObjectMap}
            />
          )}

          {/* ── Coverage Panel (slide-out) ── */}
          {showCoveragePanel && (
            <CoveragePanel
              gaps={visibleCoverageGaps}
              focusAreas={focusAreas}
              shiftCategories={shiftCategories}
              activeFocusArea={activeFocusArea}
              publishedWindowState={publishedWindowState}
              onClose={() => setShowCoveragePanel(false)}
            />
          )}

          <PrintLegend
            assignments={assignments}
            shiftDisplayMode={org?.shiftDisplayMode}
          />

          {showPrintOptions && (
            <PrintOptionsModal
              focusAreas={focusAreas}
              currentSpanWeeks={spanWeeks}
              onPrint={(config) => {
                setShowPrintOptions(false);
                setActivePrintConfig(config);
              }}
              onClose={() => setShowPrintOptions(false)}
              focusAreaLabel={org?.focusAreaLabel}
            />
          )}

          {activePrintConfig && (
            <PrintScheduleView
              orgName={org?.name}
              weekStart={spanWeeks === "month" ? monthStart : weekStart}
              config={activePrintConfig}
              employees={employees}
              allEmployees={employees}
              focusAreas={focusAreas}
              assignments={assignments}
              shiftCategories={shiftCategories}
              jobs={jobs}
              certifications={certifications}
              orgRoles={orgRoles}
              shiftForKey={shiftForKey}
              assignmentIdsForKey={assignmentIdsForKey}
              getShiftStyle={getShiftStyle}
              getCustomShiftTimes={getCustomShiftTimes}
              onClose={() => setActivePrintConfig(null)}
              focusAreaLabel={org?.focusAreaLabel}
              shiftDisplayMode={org?.shiftDisplayMode}
            />
          )}

          {showDiscardConfirm && (
            <ConfirmDialog
              title="Discard drafts?"
              message={
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--dg-fs-body-sm)",
                      lineHeight: 1.5,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {showOrganizationDiscardScope
                      ? "Published schedule stays live. Choose which drafts to discard."
                      : "Published schedule stays live. These drafts will be removed."}
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: showOrganizationDiscardScope
                        ? "repeat(auto-fit, minmax(220px, 1fr))"
                        : "1fr",
                      gap: 10,
                    }}
                  >
                    <DraftReviewSummary
                      title="Your drafts"
                      breakdown={mineBreakdown}
                      emptyMessage="No drafts to discard."
                    />
                    {showOrganizationDiscardScope ? (
                      <DraftReviewSummary
                        title="All drafts"
                        breakdown={draftBreakdown}
                        emptyMessage="No organization drafts."
                      />
                    ) : null}
                  </div>
                </div>
              }
              confirmLabel="Discard my drafts"
              cancelLabel="Keep drafts"
              variant="danger"
              maxWidth={560}
              wrapActions
              isLoading={cancelingMode === "mine"}
              confirmDisabled={mineBreakdown.totalChanges === 0}
              onConfirm={() => {
                void handleCancelChanges();
              }}
              onCancel={closeDiscardConfirm}
              secondaryConfirmLabel={
                showOrganizationDiscardScope ? "Discard all drafts" : undefined
              }
              isSecondaryLoading={cancelingMode === "all"}
              secondaryConfirmDisabled={draftBreakdown.totalChanges === 0}
              onSecondaryConfirm={
                showOrganizationDiscardScope
                  ? () => {
                      void handleCancelChanges(true);
                    }
                  : undefined
              }
            />
          )}

          {showPublishConfirm && (
            <ConfirmDialog
              title="Publish Schedule?"
              message={
                allCoverageGaps.length > 0
                  ? `Publish ${draftBreakdown.totalChanges} unpublished change${draftBreakdown.totalChanges === 1 ? "" : "s"} for ${currentPublishWindow.label}? ${publishSummary}. ${allCoverageGaps.length} coverage gap${allCoverageGaps.length === 1 ? "" : "s"} remain${allCoverageGaps.length === 1 ? "s" : ""} in this period.`
                  : `Publish ${draftBreakdown.totalChanges} unpublished change${draftBreakdown.totalChanges === 1 ? "" : "s"} for ${currentPublishWindow.label}? ${publishSummary}.`
              }
              confirmLabel="Publish"
              variant={allCoverageGaps.length > 0 ? "warning" : "info"}
              isLoading={isPublishing}
              onConfirm={() => {
                setShowPublishConfirm(false);
                handlePublish();
              }}
              onCancel={() => setShowPublishConfirm(false)}
            />
          )}

          {showAutoFillConfirm && autoFillPreview && (
            <ConfirmDialog
              title="Auto Fill Shifts?"
              message={`This will fill ${autoFillPreview.count} empty schedule slot${autoFillPreview.count === 1 ? "" : "s"} for ${autoFillPreview.dateRange} using recurring templates. Existing visible shifts will not be overwritten.`}
              confirmLabel="Fill Shifts"
              variant="info"
              isLoading={isApplyingRecurring}
              onConfirm={handleApplyRecurring}
              onCancel={() => {
                setShowAutoFillConfirm(false);
                setAutoFillPreview(null);
              }}
            />
          )}

          {pendingSeriesDelete && (
            <ConfirmDialog
              title="Delete Shift Series?"
              message={`This will mark ${pendingSeriesDelete.shiftCount} shift${pendingSeriesDelete.shiftCount === 1 ? "" : "s"} for deletion. They will be permanently removed when you publish.`}
              confirmLabel="Delete Series"
              variant="danger"
              onConfirm={handleConfirmSeriesDelete}
              onCancel={() => {
                setPendingSeriesDelete(null);
                closeEditPanel();
              }}
            />
          )}

          {showImportConfirm && importPreview && (
            <ConfirmDialog
              title="Import Previous Schedule?"
              message={(() => {
                const { breakdown, sourceRange, targetRange, outcomes } =
                  importPreview;
                const copyLine = `This will copy ${breakdown.imported} shift${
                  breakdown.imported === 1 ? "" : "s"
                } from ${sourceRange} into ${targetRange}.`;
                if (breakdown.totalSkipped === 0) return copyLine;
                const nameByEmpId = new Map(
                  employees.map((e) => [e.id, getEmployeeDisplayName(e)]),
                );
                const description = formatImportPreviousSkipDescription(
                  outcomes,
                  breakdown,
                  nameByEmpId,
                );
                return `${copyLine} ${breakdown.totalSkipped} will be skipped: ${description}.`;
              })()}
              confirmLabel="Import Shifts"
              variant="info"
              isLoading={isImportingPrevious}
              onConfirm={handleImportPrevious}
              onCancel={() => {
                setShowImportConfirm(false);
                setImportPreview(null);
              }}
            />
          )}
          {showPublishHistory && org && (
            <PublishHistoryPanel
              orgId={org.id}
              open={showPublishHistory}
              onClose={() => setShowPublishHistory(false)}
              onSelectEntry={(entry) => {
                // Navigate grid to the publish's date range
                const publishStart = new Date(entry.startDate + "T00:00:00");
                setWeekStart(
                  getScheduleStartForSpan({
                    date: publishStart,
                    span: spanWeeks,
                    payPeriodStartDate,
                  }),
                );
                setPublishHistory([entry]);
                setShowPublishDiff(true);
                setShowPublishHistory(false);
              }}
              assignments={assignments}
              assignmentLabelMap={assignmentLabelMap}
              employees={employees}
              absenceTypeMap={absenceTypeMap}
            />
          )}
          {activeOperation && (
            <ScheduleOperationModal
              title={activeOperation.title}
              detail={activeOperation.detail}
              progress={activeOperation.progress}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function SchedulerPageClient({
  initialState,
}: {
  initialState: SchedulePageInitialState;
}) {
  void initialState;

  return (
    <ProtectedRoute>
      <SetupGuard>
        <SchedulerContent />
      </SetupGuard>
    </ProtectedRoute>
  );
}
