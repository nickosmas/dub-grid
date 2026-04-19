"use client";

import * as Sentry from "@/lib/sentry";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import Toolbar from "@/components/Toolbar";
import ScheduleGrid from "@/components/ScheduleGrid";
import MonthView from "@/components/MonthView";
import PrintLegend from "@/components/PrintLegend";
import type { PrintConfig } from "@/components/PrintOptionsModal";
import DraftBanner from "@/components/DraftBanner";
import DraftReviewSummary from "@/components/DraftReviewSummary";
import PublishHistoryPanel from "@/components/PublishHistoryPanel";
import ScheduleOperationModal from "@/components/ScheduleOperationModal";
import { resolveGridAuditLabel } from "./_lib/grid-audit-label";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";

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

import { AnimatedDubGridLogo } from "@/components/Logo";
import {
  addDays,
  formatDate,
  formatDateKey,
  getWeekStart,
  getEmployeeDisplayName,
  iterateDateRange,
} from "@/lib/utils";
import {
  filterAndSortEmployees,
  isEmployeeQualified,
  getDisqualificationReasons,
  hasVisibleGridShiftEntry,
  buildShiftCodeIdsByFocusArea,
  buildPublishedDateSet,
  computeCoverageGaps,
  filterPublishedDates,
  getPublishedWindowState,
  timesOverlap,
  checkCrossDateOverlap,
  checkSameDayOverlaps,
} from "@/lib/schedule-logic";
import type { TimeRange } from "@/lib/schedule-logic";
import {
  fetchShifts,
  fetchScheduleNotes,
  fetchRecurringShifts,
  fetchPublishedDateRanges,
  fetchRecentPublishHistory,
  upsertShiftTimes,
  deleteShift,
  upsertShift,
  updateSeriesAllShifts,
  deleteShiftSeries,
  createShiftSeries,
  moveShift,
  applyRecurringSchedules,
  fetchScheduleDraftSummary,
  publishSchedule,
  discardScheduleDrafts,
  upsertScheduleNote,
  deleteScheduleNote,
  OptimisticLockError,
  ScheduleDraftConflictError,
  updateScheduleLastViewed,
  getScheduleLastViewed,
  fetchCalloffOpenShifts,
} from "@/lib/db";
import {
  computeDraftBreakdown,
  draftBreakdownsEqual,
  formatDraftBreakdownSummary,
  type DraftBreakdown,
} from "@/lib/draft-utils";
import { exportScheduleCSV } from "@/lib/export-csv";
import { queueNotification } from "@/lib/notify";
import { buildRealtimeDraftDiff } from "@/lib/realtime-draft-utils";
import { resolveScheduleSpan } from "@/lib/schedule-view";
import { supabase } from "@/lib/supabase";
import {
  usePermissions,
  useOrganizationData,
  useEmployees,
  useCellLocks,
  useReliableRealtimeBroadcasts,
  useShiftRequests,
} from "@/hooks";
import { useAuth } from "@/components/AuthProvider";
import PresenceAvatars from "@/components/PresenceAvatars";
import { ProtectedRoute } from "@/components/RouteGuards";
import SetupGuard from "@/components/SetupGuard";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import type { ShiftDragData } from "@/components/DraggableShift";
import type { CellDropData } from "@/components/DroppableCell";
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
import { shouldShowScheduleEditorNames } from "./_lib/editor-visibility";
import {
  cloneDraftNotes,
  cloneShiftEntry,
  serializeNotesSnapshot,
  serializeShiftSnapshot,
  type DraftNoteState,
  type EditSessionDraft,
} from "./_lib/editor-session";
import {
  clampProgress,
  DRAFT_CHANGED_BROADCAST_KEY,
  IMPORT_PREVIOUS_BATCH_SIZE,
  OPERATION_MODAL_DISMISS_MS,
  PUBLISH_WINDOW_DATE_FORMATTER,
  type ScheduleEntryPayload,
  type ScheduleOperation,
} from "./_lib/operations";
import {
  Employee,
  EditModalState,
  ShiftMap,
  ShiftCode,
  AbsenceType,
  RecurringShift,
  SeriesFrequency,
  SeriesScope,
  DraftKind,
  PublishChange,
  PublishHistoryEntry,
  GridOpenShift,
} from "@/types";

function SchedulerContent() {
  const isMobile = useMediaQuery(MOBILE);
  const shouldAutoUseOneWeek = useMediaQuery(AUTO_ONE_WEEK);
  const { user: authUser } = useAuth();
  const {
    canEditShifts,
    canEditNotes,
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
    shiftCodes,
    allShiftCodes,
    shiftCategories,
    indicatorTypes,
    certifications,
    orgRoles,
    shiftCodeMap,
    absenceTypes,
    allAbsenceTypes,
    absenceTypeMap,
    coverageRequirements,
    coverageRuleConfigs,
    departments,
    loading: orgLoading,
    loadError,
  } = useOrganizationData();
  // Use orgId from JWT (available immediately) so employee fetch starts
  // in parallel with org data instead of waiting for it.
  const { employees, loading: empLoading } = useEmployees(
    orgId ?? org?.id ?? null,
  );

  const [today, setToday] = useState(() => new Date());

  // Refresh `today` if the app stays open past midnight
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() -
      now.getTime();
    const timer = setTimeout(() => setToday(new Date()), msUntilMidnight + 500);
    return () => clearTimeout(timer);
  }, [today]);

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
  const [publishReviewSummary, setPublishReviewSummary] =
    useState<DraftBreakdown | null>(null);
  const [discardMineReviewSummary, setDiscardMineReviewSummary] =
    useState<DraftBreakdown | null>(null);
  const [discardAllReviewSummary, setDiscardAllReviewSummary] =
    useState<DraftBreakdown | null>(null);
  const [loadingPublishReviewSummary, setLoadingPublishReviewSummary] =
    useState(false);
  const [loadingDiscardReviewSummary, setLoadingDiscardReviewSummary] =
    useState(false);
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
  const lastViewedRef = useRef<string | null>(null);
  const hasShownChangeToast = useRef(false);
  const [isImportingPrevious, setIsImportingPrevious] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    count: number;
    sourceRange: string;
    targetRange: string;
  } | null>(null);
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
    qualifiedShiftCodes: ShiftCode[];
    selectedShiftCodeId: number;
  } | null>(null);

  const shiftRequests = useShiftRequests(
    orgId ?? org?.id ?? null,
    shiftCodeMap,
    currentEmpId,
    canApproveShiftRequests,
  );

  // ── Open shifts (calloff-spawned pickups) ──
  const [calloffOpenShifts, setCalloffOpenShifts] = useState<GridOpenShift[]>(
    [],
  );
  const [publishedDateRanges, setPublishedDateRanges] = useState<
    { startDate: string; endDate: string }[]
  >([]);
  useEffect(() => {
    const effectiveOrgId = orgId ?? org?.id;
    if (!effectiveOrgId || !shiftCodeMap.size) return;
    fetchCalloffOpenShifts(
      effectiveOrgId,
      shiftFetchStart,
      shiftFetchEnd,
      shiftCodeMap,
    )
      .then(setCalloffOpenShifts)
      .catch((err) => {
        // BUG 1.6: Capture error to Sentry and show user feedback
        Sentry.captureException(err, {
          tags: { component: "calloff_open_shifts" },
        });
        toast.error("Failed to load available shift opportunities");
        setCalloffOpenShifts([]);
      });
  }, [orgId, org?.id, shiftFetchStart, shiftFetchEnd, shiftCodeMap]);

  const draftBreakdown = useMemo(
    () => computeDraftBreakdown(shifts, notes),
    [shifts, notes],
  );

  const hasUnpublishedChanges = draftBreakdown.totalChanges > 0;
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

  const publishSummary = useMemo(
    () => formatDraftBreakdownSummary(publishReviewSummary ?? draftBreakdown),
    [draftBreakdown, publishReviewSummary],
  );
  const discardSummaryReady =
    discardMineReviewSummary !== null &&
    (!isSuperAdmin || discardAllReviewSummary !== null);
  const isDiscardSummaryLoading =
    loadingDiscardReviewSummary || !discardSummaryReady;
  const showOrganizationDiscardScope =
    isSuperAdmin &&
    discardMineReviewSummary !== null &&
    discardAllReviewSummary !== null &&
    !draftBreakdownsEqual(discardMineReviewSummary, discardAllReviewSummary);

  const openDiscardConfirm = useCallback(() => {
    setDiscardMineReviewSummary(null);
    setDiscardAllReviewSummary(null);
    setLoadingDiscardReviewSummary(true);
    setShowDiscardConfirm(true);
  }, []);

  const closeDiscardConfirm = useCallback(() => {
    if (cancelingMode) return;
    setShowDiscardConfirm(false);
    setLoadingDiscardReviewSummary(false);
    setDiscardMineReviewSummary(null);
    setDiscardAllReviewSummary(null);
  }, [cancelingMode]);

  useEffect(() => {
    if (!showPublishConfirm || !org) return;

    let cancelled = false;
    setLoadingPublishReviewSummary(true);
    setPublishReviewSummary(null);

    void fetchScheduleDraftSummary({
      orgId: org.id,
      scope: "all",
      startDate: formatDateKey(currentPublishWindow.startDate),
      endDate: formatDateKey(currentPublishWindow.endDate),
    })
      .then((summary) => {
        if (!cancelled) setPublishReviewSummary(summary);
      })
      .catch((err) => {
        if (!cancelled) {
          setPublishReviewSummary(null);
          setShowPublishConfirm(false);
          Sentry.captureException(err, {
            extra: { context: "schedule.publish_summary", orgId: org.id },
          });
          toast.error("Failed to load the latest publish summary");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPublishReviewSummary(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPublishWindow.endDate, currentPublishWindow.startDate, org, showPublishConfirm]);

  useEffect(() => {
    if (!showDiscardConfirm || !org) return;

    let cancelled = false;
    setLoadingDiscardReviewSummary(true);
    setDiscardMineReviewSummary(null);
    setDiscardAllReviewSummary(null);

    const requests: Promise<void>[] = [
      fetchScheduleDraftSummary({
        orgId: org.id,
        scope: "mine",
      }).then((summary) => {
        if (!cancelled) setDiscardMineReviewSummary(summary);
      }),
    ];

    if (isSuperAdmin) {
      requests.push(
        fetchScheduleDraftSummary({
          orgId: org.id,
          scope: "all",
        }).then((summary) => {
          if (!cancelled) setDiscardAllReviewSummary(summary);
        }),
      );
    }

    void Promise.all(requests)
      .catch((err) => {
        if (!cancelled) {
          setDiscardMineReviewSummary(null);
          setDiscardAllReviewSummary(null);
          setShowDiscardConfirm(false);
          Sentry.captureException(err, {
            extra: { context: "schedule.discard_summary", orgId: org.id },
          });
          toast.error("Failed to load the latest discard summary");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDiscardReviewSummary(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, org, showDiscardConfirm]);

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

  // ── Drag & Drop state ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );
  const [activeDrag, setActiveDrag] = useState<ShiftDragData | null>(null);

  // ── Clipboard state (copy-paste shifts) ───────────────────────────────────
  const [clipboard, setClipboard] = useState<ScheduleEntryPayload | null>(null);
  const activeDragModeRef = useRef<"move" | "copy">("move");
  const hoveredCellRef = useRef<{
    empId: string;
    date: Date;
    focusAreaName: string;
  } | null>(null);

  // ── Context menu state ────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    anchorEl: HTMLElement;
    empId: string;
    date: Date;
    focusAreaName: string;
  } | null>(null);
  const [pendingClearShift, setPendingClearShift] = useState<{
    empId: string;
    date: Date;
    empName: string;
    shiftLabel: string;
  } | null>(null);
  const [pendingPasteOver, setPendingPasteOver] = useState<{
    empId: string;
    date: Date;
    existingLabel: string;
    pasteEntry: ScheduleEntryPayload;
  } | null>(null);
  const [pendingClaimShift, setPendingClaimShift] =
    useState<GridOpenShift | null>(null);

  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  );
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
  const shiftCodeMapRef = useRef(shiftCodeMap);
  shiftCodeMapRef.current = shiftCodeMap;
  const absenceTypeMapRef = useRef(absenceTypeMap);
  absenceTypeMapRef.current = absenceTypeMap;

  // ── Shared refetch helper (eliminates 4x duplication) ──────────────────────
  const refetchScheduleData = useCallback(async () => {
    if (!org) return;
    const [shiftData, noteRows] = await Promise.all([
      fetchShifts(
        org.id,
        canEditShiftsRef.current,
        shiftCodeMapRef.current,
        absenceTypeMapRef.current,
        shiftFetchStart,
        shiftFetchEnd,
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
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", authUser.id)
          .maybeSingle();
        const first = profile?.first_name?.trim() || "";
        const last = profile?.last_name?.trim() || "";
        const full = [first, last].filter(Boolean).join(" ");
        const name = full || authUser.email?.split("@")[0] || "Unknown";
        return { id: authUser.id, name };
      } catch {
        return null;
      }
    }

    async function loadSchedule() {
      try {
        // Fetch per-user last-viewed timestamp + critical data in parallel
        const [shiftData, noteRows, recShifts, lastViewed] =
          await Promise.all([
            fetchShifts(
              orgId,
              canEditShifts,
              shiftCodeMap,
              absenceTypeMap,
              shiftFetchStart,
              shiftFetchEnd,
            ),
            fetchScheduleNotes(orgId, shiftFetchStart, shiftFetchEnd),
            canViewRecurringShifts
              ? fetchRecurringShifts(
                  orgId,
                  undefined,
                  shiftCodeMap,
                  false,
                  absenceTypeMap,
                )
              : Promise.resolve([] as RecurringShift[]),
            getScheduleLastViewed(orgId).catch(() => null),
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
      if (!userId) return null;
      const cached = profileNameCache.current.get(userId);
      if (cached) return cached;
      try {
        const { data } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", userId)
          .maybeSingle();
        const first = data?.first_name?.trim() || "";
        const last = data?.last_name?.trim() || "";
        const name = [first, last].filter(Boolean).join(" ") || null;
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
    [],
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
  const canShowEditorNames = shouldShowScheduleEditorNames(
    onlineUsers,
    authUser?.id ?? currentUser?.id ?? null,
  );

  // Resolve audit metadata (created/updated by names) when the edit panel opens.
  useEffect(() => {
    if (!editPanel || !canShowEditorNames) {
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
  }, [canShowEditorNames, editPanel, shifts, resolveUserName]);

  // Batch-fetch profile names for shift creators (audit mode) and publishers (publish tooltips).
  const [auditNames, setAuditNames] = useState<Map<string, string>>(new Map());
  const needsAuditNames =
    publishHistory.length > 0 ||
    (canShowEditorNames &&
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
        // 1. Try profiles table first
        const { data, error } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", ids);
        if (cancelled) return;
        if (error) {
          console.warn(
            "Audit names: profile query failed, will retry",
            error.message,
          );
          // Don't cache "Deleted user" — let the next trigger retry
          return;
        }
        for (const row of data ?? []) {
          const first = row.first_name?.trim() || "";
          const last = row.last_name?.trim() || "";
          const name = [first, last].filter(Boolean).join(" ");
          if (name) profileNameCache.current.set(row.id, name);
        }
        // 2. Fallback: resolve remaining IDs from employees table (names are NOT NULL there)
        const unresolvedIds = ids.filter(
          (id) => !profileNameCache.current.has(id),
        );
        if (unresolvedIds.length > 0) {
          const { data: empData } = await supabase
            .from("employees")
            .select("user_id, first_name, last_name")
            .in("user_id", unresolvedIds);
          if (cancelled) return;
          for (const row of empData ?? []) {
            if (row.user_id) {
              const name = [row.first_name?.trim(), row.last_name?.trim()]
                .filter(Boolean)
                .join(" ");
              if (name) profileNameCache.current.set(row.user_id, name);
            }
          }
        }
        // 3. Cache "Deleted user" only for IDs not found in either table
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
  }, [needsAuditNames, shifts, publishHistory]);

  // Build a lookup map from all recent publish history changes for O(1) access.
  // Iterate oldest→newest so the most recent publish wins per cell key.
  const publishChangesMap = useMemo(() => {
    if (publishHistory.length === 0) return null;
    const map = new Map<
      string,
      PublishChange & { publishedAt: string; publishedBy: string }
    >();
    // publishHistory is newest-first, so iterate in reverse (oldest first) to let newer entries overwrite
    for (let i = publishHistory.length - 1; i >= 0; i--) {
      const entry = publishHistory[i];
      for (const change of entry.changes) {
        map.set(`${change.empId}_${change.date}`, {
          ...change,
          publishedAt: entry.publishedAt,
          publishedBy: entry.publishedBy,
        });
      }
    }
    return map;
  }, [publishHistory]);

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

    const channel = supabase
      .channel(`schedule:${org.id}`)
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
      supabase.removeChannel(channel);
    };
  }, [
    clearPresenceState,
    flushPendingBroadcasts,
    org,
    resetPendingBroadcasts,
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
          toast.error("Failed to refresh schedule — try reloading the page");
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
          shiftCodeMapRef.current,
          absenceTypeMapRef.current,
          shiftFetchStart,
          shiftFetchEnd,
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
  const week1 = useMemo(() => dates.slice(0, 7), [dates]);
  const week2 = useMemo(
    () => (spanWeeks === 2 ? dates.slice(7, 14) : []),
    [dates, spanWeeks],
  );
  const visibleCoverageStartKey = useMemo(
    () => (dates.length > 0 ? formatDateKey(dates[0]) : null),
    [dates],
  );
  const visibleCoverageEndKey = useMemo(
    () => (dates.length > 0 ? formatDateKey(dates[dates.length - 1]!) : null),
    [dates],
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

  const filteredEmployees = useMemo(
    () => filterAndSortEmployees(employees, activeFocusArea),
    [employees, activeFocusArea],
  );
  const refetchPublishedRanges = useCallback(async () => {
    if (!org || !visibleCoverageStartKey || !visibleCoverageEndKey) {
      setPublishedDateRanges([]);
      return;
    }

    try {
      const ranges = await fetchPublishedDateRanges(
        org.id,
        visibleCoverageStartKey,
        visibleCoverageEndKey,
      );
      setPublishedDateRanges(ranges);
    } catch (err) {
      Sentry.captureException(err, {
        extra: {
          context: "schedule.published_ranges",
          orgId: org.id,
          startDate: visibleCoverageStartKey,
          endDate: visibleCoverageEndKey,
        },
      });
      setPublishedDateRanges([]);
    }
  }, [org, visibleCoverageEndKey, visibleCoverageStartKey]);
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

  const highlightEmpIds = useMemo(() => {
    if (!staffSearch.trim()) return undefined;
    const q = staffSearch.toLowerCase();
    return new Set(
      filteredEmployees
        .filter((e) => getEmployeeDisplayName(e).toLowerCase().includes(q))
        .map((e) => e.id),
    );
  }, [staffSearch, filteredEmployees]);

  // ── Shift helpers ────────────────────────────────────────────────────────────

  const buildEntryPayload = useCallback(
    (entry: ShiftMap[string]): ScheduleEntryPayload => ({
      label: entry.label,
      shiftCodeIds: [...entry.shiftCodeIds],
      absenceTypeId: entry.absenceTypeId ?? null,
      customStartTime:
        entry.absenceTypeId != null ? null : (entry.customStartTime ?? null),
      customEndTime:
        entry.absenceTypeId != null ? null : (entry.customEndTime ?? null),
    }),
    [],
  );

  const shiftForKey = useCallback(
    (empId: string, date: Date): string | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return null;
      if (entry.isDelete) return null;
      if (entry.absenceTypeId != null)
        return absenceTypeMap.get(entry.absenceTypeId) ?? "?";
      if (entry.shiftCodeIds.length > 0)
        return entry.shiftCodeIds
          .map((id) => shiftCodeMap.get(id) ?? "?")
          .join("/");
      return entry.label ?? null;
    },
    [shifts, shiftCodeMap, absenceTypeMap],
  );

  const shiftCodeIdsForKey = useCallback(
    (empId: string, date: Date): number[] =>
      shifts[`${empId}_${formatDateKey(date)}`]?.shiftCodeIds ?? [],
    [shifts],
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
  const panelCurrentShiftCodeIds = panelShiftEntry?.shiftCodeIds ?? [];
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
      return entry.absenceTypeId ?? entry.publishedAbsenceTypeId ?? null;
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
      if (!entry || entry.shiftCodeIds.length === 0) return [];
      const startParts = entry.customStartTime?.split("|") ?? [];
      const endParts = entry.customEndTime?.split("|") ?? [];
      const ranges: { start: string; end: string }[] = [];
      for (let i = 0; i < entry.shiftCodeIds.length; i++) {
        const customStart = startParts[i] || null;
        const customEnd = endParts[i] || null;
        if (customStart && customEnd) {
          ranges.push({ start: customStart, end: customEnd });
          continue;
        }
        const sc = shiftCodes.find((c) => c.id === entry.shiftCodeIds[i]);
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
    [shifts, shiftCodes, shiftCategories],
  );

  const getOpenShiftTimeRanges = useCallback(
    (
      shiftCodeIds: number[],
      customStartTime: string | null,
      customEndTime: string | null,
    ): { start: string; end: string }[] => {
      const ranges: { start: string; end: string }[] = [];
      if (customStartTime && customEndTime) {
        ranges.push({ start: customStartTime, end: customEndTime });
        return ranges;
      }

      for (const shiftCodeId of shiftCodeIds) {
        const shiftCode =
          shiftCodes.find((item) => item.id === shiftCodeId) ??
          allShiftCodes.find((item) => item.id === shiftCodeId);
        if (shiftCode?.defaultStartTime && shiftCode.defaultEndTime) {
          ranges.push({
            start: shiftCode.defaultStartTime,
            end: shiftCode.defaultEndTime,
          });
          continue;
        }
        if (shiftCode?.categoryId != null) {
          const category = shiftCategories.find((item) => item.id === shiftCode.categoryId);
          if (category?.startTime && category.endTime) {
            ranges.push({ start: category.startTime, end: category.endTime });
          }
        }
      }

      return ranges;
    },
    [shiftCodes, allShiftCodes, shiftCategories],
  );

  const hasOpenShiftConflict = useCallback(
    (
      shiftCodeIds: number[],
      date: Date,
      customStartTime: string | null,
      customEndTime: string | null,
    ) => {
      if (!currentEmpId) return false;
      const myRanges = getShiftTimeRanges(currentEmpId, date);
      if (myRanges.length === 0) return false;
      const openShiftRanges = getOpenShiftTimeRanges(
        shiftCodeIds,
        customStartTime,
        customEndTime,
      );
      return openShiftRanges.length > 0 && timesOverlap(myRanges, openShiftRanges);
    },
    [currentEmpId, getOpenShiftTimeRanges, getShiftTimeRanges],
  );

  // ── Coverage gaps ──────────────────────────────────────────────────────────
  const shiftCodeById = useMemo(() => {
    const map = new Map<number, ShiftCode>();
    for (const sc of shiftCodes) map.set(sc.id, sc);
    // Include archived codes from allShiftCodes for shift lookup
    for (const sc of allShiftCodes) {
      if (!map.has(sc.id)) map.set(sc.id, sc);
    }
    return map;
  }, [shiftCodes, allShiftCodes]);

  // ── Cross-date overlap warnings for the open edit panel ─────────────────
  const overnightOverlapWarnings = useMemo((): string[] => {
    if (!editPanel) return [];
    const empId = editPanel.empId;
    const date = editPanel.date;
    const entry =
      editSessionDraft?.cellKey === `${empId}_${formatDateKey(date)}`
        ? editSessionDraft.draftShift
        : shifts[`${empId}_${formatDateKey(date)}`];
    if (!entry || (entry.shiftCodeIds.length === 0 && !entry.absenceTypeId))
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
        codeIds[0] != null ? shiftCodeById.get(codeIds[0]) : undefined;
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
      entry.shiftCodeIds,
    );
    if (!currentTimes) return [];

    // D-1 shift
    const prevDate = addDays(date, -1);
    const prevEntry = shifts[`${empId}_${formatDateKey(prevDate)}`];
    const prevTimes =
      prevEntry && prevEntry.shiftCodeIds.length > 0
        ? resolveEffective(
            prevEntry.customStartTime,
            prevEntry.customEndTime,
            prevEntry.shiftCodeIds,
          )
        : null;

    // D+1 shift
    const nextDate = addDays(date, 1);
    const nextEntry = shifts[`${empId}_${formatDateKey(nextDate)}`];
    const nextTimes =
      nextEntry && nextEntry.shiftCodeIds.length > 0
        ? resolveEffective(
            nextEntry.customStartTime,
            nextEntry.customEndTime,
            nextEntry.shiftCodeIds,
          )
        : null;

    const warnings = checkCrossDateOverlap(currentTimes, {
      prev: prevTimes,
      next: nextTimes,
    });

    // Same-day overlap check for multi-code cells
    if (entry.shiftCodeIds.length >= 2) {
      const pillRanges: { start: string; end: string }[] = [];
      const pillLabels: string[] = [];
      const startParts = entry.customStartTime?.split("|") ?? [];
      const endParts = entry.customEndTime?.split("|") ?? [];
      for (let i = 0; i < entry.shiftCodeIds.length; i++) {
        const code = shiftCodeById.get(entry.shiftCodeIds[i]);
        const cat =
          code?.categoryId != null
            ? shiftCategories.find((c) => c.id === code.categoryId)
            : undefined;
        const s = startParts[i] || code?.defaultStartTime || cat?.startTime;
        const e = endParts[i] || code?.defaultEndTime || cat?.endTime;
        if (s && e) {
          pillRanges.push({ start: s, end: e });
          pillLabels.push(
            shiftCodeMap.get(entry.shiftCodeIds[i]) ?? code?.label ?? "?",
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
    shiftCodeById,
    shiftCategories,
    shiftCodeMap,
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

  const shiftCodeIdsByFocusArea = useMemo(
    () => buildShiftCodeIdsByFocusArea(focusAreas, shiftCodes),
    [focusAreas, shiftCodes],
  );

  const allCoverageGaps = useMemo(() => {
    if (!coverageRequirements.length || !focusAreas.length) return [];

    return computeCoverageGaps(
      focusAreas,
      shiftCategories,
      shiftCodes,
      coverageRequirements,
      coverageRuleConfigs,
      dates,
      employeesByFocusArea,
      shiftCodeIdsForKey,
      shiftCodeById,
      shiftCodeIdsByFocusArea,
      shiftCodeMap,
    );
  }, [
    coverageRequirements,
    coverageRuleConfigs,
    focusAreas,
    shiftCategories,
    shiftCodes,
    dates,
    employeesByFocusArea,
    shiftCodeIdsForKey,
    shiftCodeById,
    shiftCodeIdsByFocusArea,
    shiftCodeMap,
  ]);

  const visibleCoverageGaps = useMemo(() => {
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
      shiftCodes,
      coverageRequirements,
      coverageRuleConfigs,
      publishedVisibleDates,
      employeesByFocusArea,
      shiftCodeIdsForKey,
      shiftCodeById,
      shiftCodeIdsByFocusArea,
      shiftCodeMap,
    );
  }, [
    coverageRequirements,
    coverageRuleConfigs,
    focusAreas,
    shiftCategories,
    shiftCodes,
    publishedVisibleDates,
    employeesByFocusArea,
    shiftCodeIdsForKey,
    shiftCodeById,
    shiftCodeIdsByFocusArea,
    shiftCodeMap,
  ]);

  // ── Merge calloff open shifts + coverage-gap open shifts ──
  const openShifts = useMemo<GridOpenShift[]>(() => {
    const gapShifts: GridOpenShift[] = visibleCoverageGaps
      .map((gap) => {
        const sc = shiftCodeById.get(gap.preferredOpenShiftCodeId);
        return {
          id: `gap_${gap.focusAreaId}_${gap.requirementShiftCodeId}_${formatDateKey(gap.date)}`,
          source: "coverage_gap" as const,
          date: formatDateKey(gap.date),
          focusAreaId: gap.focusAreaId,
          requirementShiftCodeId: gap.requirementShiftCodeId,
          shiftCodeIds: [gap.preferredOpenShiftCodeId],
          eligibleShiftCodeIds: gap.eligibleShiftCodeIds,
          preferredOpenShiftCodeId: gap.preferredOpenShiftCodeId,
          ruleLabel: gap.ruleLabel,
          shiftCodeLabel: gap.shiftCodeLabel,
          customStartTime: sc?.defaultStartTime ?? null,
          customEndTime: sc?.defaultEndTime ?? null,
          needed: gap.status.required - gap.status.actual,
        };
      });
    return [...calloffOpenShifts, ...gapShifts];
  }, [calloffOpenShifts, visibleCoverageGaps, shiftCodeById]);

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
      if (entry.publishedShiftCodeIds.length > 0)
        return entry.publishedShiftCodeIds
          .map((id) => shiftCodeMap.get(id) ?? "?")
          .join("/");
      return null;
    },
    [shifts, shiftCodeMap, absenceTypeMap],
  );

  const publishedShiftCodeIdsForKey = useCallback(
    (empId: string, date: Date): number[] =>
      shifts[`${empId}_${formatDateKey(date)}`]?.publishedShiftCodeIds ?? [],
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
      if (!entry?.customStartTime && !entry?.customEndTime) return null;
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
        publishedShiftCodeIds: entry.publishedShiftCodeIds ?? [],
        publishedCustomStartTime: entry.publishedCustomStartTime ?? null,
        publishedCustomEndTime: entry.publishedCustomEndTime ?? null,
      };
    },
    [shifts],
  );

  /** True if the published shift date is in the past, or it's today and the published shift has already started. */
  const isPublishedShiftStarted = useCallback(
    (empId: string, date: Date): boolean => {
      const todayStr = formatDateKey(today);
      const dateStr = formatDateKey(date);
      if (dateStr < todayStr) return true;
      if (dateStr > todayStr) return false;
      const publishedShift = getPublishedRequestShift(empId, date);
      if (!publishedShift || publishedShift.publishedShiftCodeIds.length === 0)
        return true;
      // Resolve earliest start time from custom times or shift code defaults
      let earliest: string | null = null;
      if (publishedShift.publishedCustomStartTime) {
        // customStartTime can be pipe-delimited for multi-pill shifts
        for (const t of publishedShift.publishedCustomStartTime.split("|")) {
          if (t && (!earliest || t < earliest)) earliest = t;
        }
      }
      if (!earliest) {
        for (const codeId of publishedShift.publishedShiftCodeIds) {
          const sc = shiftCodes.find((c) => c.id === codeId);
          if (
            sc?.defaultStartTime &&
            (!earliest || sc.defaultStartTime < earliest)
          ) {
            earliest = sc.defaultStartTime;
          }
        }
      }
      if (!earliest) return true; // no start time defined — treat as started (safe default)
      const now = new Date();
      const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      return nowTime >= earliest;
    },
    [getPublishedRequestShift, shiftCodes, today],
  );

  /** True if the published shift has at least one categorized, non-off-day shift code. */
  const isPublishedRequestableShift = useCallback(
    (empId: string, date: Date): boolean => {
      const publishedShift = getPublishedRequestShift(empId, date);
      if (!publishedShift || publishedShift.publishedShiftCodeIds.length === 0)
        return false;
      return publishedShift.publishedShiftCodeIds.some((codeId) => {
        const sc = shiftCodes.find((c) => c.id === codeId);
        return sc != null && sc.categoryId != null;
      });
    },
    [getPublishedRequestShift, shiftCodes],
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
    toast.error("Shift was modified by another editor or another tab — refreshing");
    const freshShifts = await fetchShifts(
      orgId,
      canEditShifts,
      shiftCodeMapRef.current,
      absenceTypeMapRef.current,
      shiftFetchStart,
      shiftFetchEnd,
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
        const draftKind = computeDraftKind(updated);
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

  /** Compare current shift values against published state to determine correct draftKind. */
  function computeDraftKind(entry: {
    shiftCodeIds: number[];
    publishedShiftCodeIds?: number[];
    absenceTypeId?: number | null;
    publishedAbsenceTypeId?: number | null;
    customStartTime?: string | null;
    customEndTime?: string | null;
    publishedCustomStartTime?: string | null;
    publishedCustomEndTime?: string | null;
  }): DraftKind {
    const pubCodes = entry.publishedShiftCodeIds ?? [];
    const hasPub = pubCodes.length > 0 || entry.publishedAbsenceTypeId != null;

    if (!hasPub) {
      return entry.shiftCodeIds.length > 0 || entry.absenceTypeId != null
        ? "new"
        : null;
    }

    const codesMatch =
      entry.shiftCodeIds.length === pubCodes.length &&
      entry.shiftCodeIds.every((id, i) => id === pubCodes[i]);
    const absMatch =
      (entry.absenceTypeId ?? null) === (entry.publishedAbsenceTypeId ?? null);
    const startMatch =
      (entry.customStartTime ?? null) ===
      (entry.publishedCustomStartTime ?? null);
    const endMatch =
      (entry.customEndTime ?? null) === (entry.publishedCustomEndTime ?? null);

    if (codesMatch && absMatch && startMatch && endMatch) return null;

    return entry.shiftCodeIds.length === 0 && entry.absenceTypeId == null
      ? "deleted"
      : "modified";
  }

  const setShift = useCallback(
    (
      empId: string,
      date: Date,
      entry: ScheduleEntryPayload | null,
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
        entry.label === "OFF" ||
        (entry.shiftCodeIds.length === 0 && entry.absenceTypeId == null);

      if (isDelete) {
        const ex = shiftsRef.current[key];
        // Nothing to delete — cell is already empty (no shift codes AND no absence type)
        const hasContent =
          ex &&
          (ex.shiftCodeIds.length > 0 ||
            ex.publishedShiftCodeIds?.length ||
            ex.absenceTypeId != null ||
            ex.publishedAbsenceTypeId != null);
        if (!hasContent) return;

        if (
          ex.publishedShiftCodeIds?.length ||
          ex.publishedAbsenceTypeId != null
        ) {
          // Published shift/absence being deleted → mark as draft-deleted
          const deleteValue = {
            label: "OFF",
            shiftCodeIds: [] as number[],
            isDraft: true,
            isDelete: true,
            draftKind: "deleted" as const,
            absenceTypeId: null,
            publishedShiftCodeIds: ex.publishedShiftCodeIds,
            publishedAbsenceTypeId: ex.publishedAbsenceTypeId,
            publishedLabel: ex.publishedLabel ?? "",
            version: existingVersion != null ? existingVersion + 1 : undefined,
            createdBy: ex.createdBy ?? null,
            updatedBy: currentUserRef.current?.id ?? null,
          };
          setShifts((prev) => ({ ...prev, [key]: deleteValue }));
          void enqueueShiftWrite(key, async () => {
            try {
              await deleteShift(empId, dateKey, orgId ?? undefined, existingVersion);
            } catch (err) {
              if (err instanceof OptimisticLockError) {
                await handleShiftWriteConflict();
              } else {
                toast.error("Failed to delete shift");
                Sentry.captureException(err);
              }
            }
          });
          broadcastDraftChanged({ shifts: { [key]: deleteValue } });
        } else {
          // Never-published draft being cleared → remove from map entirely
          setShifts((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          void enqueueShiftWrite(key, async () => {
            try {
              await deleteShift(empId, dateKey, orgId ?? undefined, existingVersion);
            } catch (err) {
              if (err instanceof OptimisticLockError) {
                await handleShiftWriteConflict();
              } else {
                toast.error("Failed to delete shift");
                Sentry.captureException(err);
              }
            }
          });
          broadcastDraftChanged({ shifts: { [key]: null } });
        }
      } else {
        // Filter out any stale/archived shift code IDs
        const validCodeIds = entry.shiftCodeIds.filter((id) =>
          shiftCodeMapRef.current.has(id),
        );
        if (entry.absenceTypeId == null && validCodeIds.length === 0) {
          toast.error("Selected shift code is no longer available");
          return;
        }
        if (validCodeIds.length < entry.shiftCodeIds.length) {
          toast.warning("Some shift codes were removed (no longer available)");
        }
        if (
          entry.absenceTypeId != null &&
          !absenceTypeMapRef.current.has(entry.absenceTypeId)
        ) {
          toast.error("Selected absence type is no longer available");
          return;
        }
        const ex = shiftsRef.current[key];
        const upsertValue: ShiftMap[string] = {
          ...ex,
          label: entry.label,
          shiftCodeIds: entry.absenceTypeId != null ? [] : validCodeIds,
          absenceTypeId: entry.absenceTypeId ?? null,
          isDelete: false,
          publishedShiftCodeIds: ex?.publishedShiftCodeIds ?? [],
          publishedLabel: ex?.publishedLabel ?? "",
          customStartTime:
            entry.absenceTypeId != null ? null : entry.customStartTime,
          customEndTime:
            entry.absenceTypeId != null ? null : entry.customEndTime,
          isDraft: true,
          draftKind: null,
          // Optimistically bump version to match the DB write so subsequent
          // edits use the correct expectedVersion for the optimistic lock.
          version: existingVersion != null ? existingVersion + 1 : undefined,
          updatedBy: currentUserRef.current?.id ?? null,
        };
        const dk = computeDraftKind(upsertValue);
        upsertValue.isDraft = dk !== null;
        upsertValue.draftKind = dk;
        setShifts((prev) => ({ ...prev, [key]: upsertValue }));
        void enqueueShiftWrite(key, async () => {
          try {
            await upsertShift(
              empId,
              dateKey,
              entry.absenceTypeId != null ? [] : validCodeIds,
              orgId,
              entry.absenceTypeId != null ? null : entry.customStartTime,
              entry.absenceTypeId != null ? null : entry.customEndTime,
              existingVersion,
              entry.absenceTypeId ?? null,
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
      broadcastDraftChanged,
      enqueueShiftWrite,
      handleShiftWriteConflict,
    ],
  );

  const getShiftStyle = useCallback(
    (type: string, focusAreaName?: string): ShiftCode => {
      const fa = focusAreaName
        ? focusAreas.find((w) => w.name === focusAreaName)
        : null;
      const matchesType = (t: ShiftCode) => t.label === type || t.name === type;

      // 1. Code associated with this focus area → use the code's own colors
      if (fa) {
        const specific = shiftCodes.find(
          (t) => matchesType(t) && t.focusAreaId === fa.id,
        );
        if (specific) return specific;
      }
      // 2. Global code (no focus area associations)
      const general = shiftCodes.find(
        (t) => matchesType(t) && t.focusAreaId == null,
      );
      if (general) return general;
      // 3. Cross-area code — belongs to another focus area; use its own colors.
      const crossArea = shiftCodes.find((t) => matchesType(t));
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
      } satisfies ShiftCode;
    },
    [shiftCodes, focusAreas],
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

  const handleShiftSelect = useCallback(
    (label: string, shiftCodeIds: number[]) => {
      updateEditSessionDraft((prev) => {
        const currentShift = prev.draftShift;

        if (label === "OFF" || shiftCodeIds.length === 0) {
          const hasContent =
            currentShift &&
            (currentShift.shiftCodeIds.length > 0 ||
              currentShift.publishedShiftCodeIds.length > 0 ||
              currentShift.absenceTypeId != null ||
              currentShift.publishedAbsenceTypeId != null);

          if (!hasContent) {
            return {
              draftShift: currentShift,
              draftNotes: prev.draftNotes,
            };
          }

          if (
            currentShift?.publishedShiftCodeIds.length ||
            currentShift?.publishedAbsenceTypeId != null
          ) {
            return {
              draftShift: {
                ...currentShift,
                label: "OFF",
                shiftCodeIds: [],
                absenceTypeId: null,
                isDraft: true,
                isDelete: true,
                draftKind: "deleted",
                customStartTime: null,
                customEndTime: null,
              },
              draftNotes: prev.draftNotes,
            };
          }

          return {
            draftShift: null,
            draftNotes: prev.draftNotes,
          };
        }

        const validCodeIds = shiftCodeIds.filter((id) =>
          shiftCodeMapRef.current.has(id),
        );
        if (validCodeIds.length === 0) {
          toast.error("Selected shift code is no longer available");
          return {
            draftShift: currentShift,
            draftNotes: prev.draftNotes,
          };
        }
        if (validCodeIds.length < shiftCodeIds.length) {
          toast.warning("Some shift codes were removed (no longer available)");
        }

        const nextShift: ShiftMap[string] = {
          ...(currentShift ?? {
            publishedShiftCodeIds: [],
            publishedLabel: "",
            isDraft: false,
            draftKind: null,
          }),
          label,
          shiftCodeIds: validCodeIds,
          absenceTypeId: null,
          isDelete: false,
        };
        const draftKind = computeDraftKind(nextShift);

        return {
          draftShift: {
            ...nextShift,
            isDraft: draftKind !== null,
            draftKind,
          },
          draftNotes: prev.draftNotes,
        };
      });
    },
    [
      updateEditSessionDraft,
    ],
  );

  const handleAbsenceSelect = useCallback(
    (absenceType: AbsenceType) => {
      updateEditSessionDraft((prev) => {
        const currentShift = prev.draftShift;
        const updated: ShiftMap[string] = {
          ...(currentShift ?? {
            publishedShiftCodeIds: [],
            publishedLabel: "",
            isDraft: false,
            draftKind: null,
          }),
          label: absenceTypeMap.get(absenceType.id) ?? absenceType.label,
          shiftCodeIds: [],
          absenceTypeId: absenceType.id,
          customStartTime: null,
          customEndTime: null,
          isDelete: false,
        };
        const draftKind = computeDraftKind(updated);
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
    [absenceTypeMap, updateEditSessionDraft],
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

      const idsMatch = (a: number[], b: number[]) =>
        a.length === b.length && a.every((id, index) => id === b[index]);
      const shiftIsDeleted = (shift: ShiftMap[string] | null) =>
        !shift ||
        shift.isDelete ||
        (shift.shiftCodeIds.length === 0 && shift.absenceTypeId == null);
      const shiftIdentityMatches = (
        left: ShiftMap[string] | null,
        right: ShiftMap[string] | null,
      ) => {
        const leftDeleted = shiftIsDeleted(left);
        const rightDeleted = shiftIsDeleted(right);
        if (leftDeleted || rightDeleted) return leftDeleted === rightDeleted;
        return (
          idsMatch(left!.shiftCodeIds, right!.shiftCodeIds) &&
          (left!.absenceTypeId ?? null) === (right!.absenceTypeId ?? null)
        );
      };

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
        const initialIdentityChanged = !shiftIdentityMatches(
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
              session.draftShift.shiftCodeIds[0] ?? null,
              orgId,
              session.draftShift.absenceTypeId ?? null,
            );
          }

          const freshShifts = await fetchShifts(
            orgId,
            canEditShiftsRef.current,
            shiftCodeMapRef.current,
            absenceTypeMapRef.current,
            shiftFetchStart,
            shiftFetchEnd,
          );
          setShifts(freshShifts);
          shiftsRef.current = freshShifts;
          workingShift = cloneShiftEntry(freshShifts[session.cellKey]);
          workingBaseShift = workingShift;
        }

        const expectedVersion = workingShift?.version;
        const remainingIdentityChanged = !shiftIdentityMatches(
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
              session.draftShift.shiftCodeIds,
              orgId,
              session.draftShift.customStartTime ?? null,
              session.draftShift.customEndTime ?? null,
              expectedVersion,
              session.draftShift.absenceTypeId ?? null,
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
        shiftCodeMapRef.current,
        absenceTypeMapRef.current,
        shiftFetchStart,
        shiftFetchEnd,
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
      const codeIds = draftEntry?.shiftCodeIds ?? shiftCodeIdsForKey(editPanel.empId, editPanel.date);
      const absenceTypeId =
        draftEntry?.absenceTypeId ??
        absenceTypeIdForKey(editPanel.empId, editPanel.date);
      if (!codeIds.length && absenceTypeId == null) return;
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
            pendingEntry.shiftCodeIds,
            org.id,
            pendingEntry.customStartTime ?? null,
            pendingEntry.customEndTime ?? null,
            persistedEntry?.version,
            pendingEntry.absenceTypeId ?? null,
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
          codeIds[0] ?? null,
          currentLabel,
          frequency,
          daysOfWeek,
          startDate,
          endDate,
          maxOccurrences,
          absenceTypeId ?? null,
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
          shiftCodeMapRef.current,
          absenceTypeMapRef.current,
          shiftFetchStart,
          shiftFetchEnd,
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
      shiftCodeIdsForKey,
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
  const certificationNameMap = useMemo(
    () => new Map(certifications.map((c) => [c.id, c.name])),
    [certifications],
  );

  /** Returns null if qualified, or an error message string if not. */
  const checkQualification = useCallback(
    (empId: string, shiftCodeIds: number[]): string | null => {
      const emp = employees.find((e) => e.id === empId);
      if (!emp) return null; // shouldn't happen, but don't block

      for (const codeId of shiftCodeIds) {
        const code = shiftCodes.find((sc) => sc.id === codeId);
        if (!code) continue;
        if (!isEmployeeQualified(emp, code)) {
          const reasons = getDisqualificationReasons(
            emp,
            code,
            focusAreaNameMap,
            certificationNameMap,
          );
          const displayLabel =
            shiftCodeMapRef.current.get(codeId) ?? code.label;
          return `${getEmployeeDisplayName(emp)} cannot be assigned ${displayLabel}: ${reasons.join(", ")}`;
        }
      }
      return null;
    },
    [employees, shiftCodes, focusAreaNameMap, certificationNameMap],
  );

  // ── Drag & Drop handlers ──────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as ShiftDragData | undefined;
    if (data) {
      const activatorEvent = event.activatorEvent;
      const wantsCopy =
        (activatorEvent instanceof MouseEvent ||
          activatorEvent instanceof KeyboardEvent) &&
        activatorEvent.shiftKey;
      setActiveDrag(data);
      activeDragModeRef.current = wantsCopy ? "copy" : "move";
      document.documentElement.dataset.dragging = "true";
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      const dragMode = activeDragModeRef.current;
      activeDragModeRef.current = "move";
      delete document.documentElement.dataset.dragging;
      const { active, over } = event;
      if (!over) return;

      const dragData = active.data.current as ShiftDragData | undefined;
      const dropData = over.data.current as CellDropData | undefined;
      if (!dragData || !dropData) return;

      // No-op if dropped on same cell
      const sourceKey = `${dragData.empId}_${dragData.dateKey}`;
      const targetKey = `${dropData.empId}_${dropData.dateKey}`;
      if (sourceKey === targetKey) return;

      // Check target lock
      const targetLock = getCellLock(targetKey);
      if (targetLock) {
        toast.info(`Cell is being edited by ${targetLock.userName}`);
        return;
      }

      // Check if target employee qualifies for the shift
      if (dragData.shiftCodeIds.length > 0) {
        const disqualified = checkQualification(
          dropData.empId,
          dragData.shiftCodeIds,
        );
        if (disqualified) {
          toast.error(disqualified);
          return;
        }
      }

      const sourceEntry = shifts[sourceKey];
      const targetPublishedShiftCodeIds =
        shifts[targetKey]?.publishedShiftCodeIds ?? [];
      const targetPublishedAbsenceTypeId =
        shifts[targetKey]?.publishedAbsenceTypeId ?? null;
      const targetPublishedLabel = shifts[targetKey]?.publishedLabel ?? "";
      const targetHasPublished =
        targetPublishedShiftCodeIds.length > 0 ||
        targetPublishedAbsenceTypeId != null;
      const targetDraftKind: DraftKind = targetHasPublished
        ? "modified"
        : "new";
      const movedEntry: ShiftMap[string] = {
        ...(shifts[targetKey] ?? {}),
        label: dragData.label,
        shiftCodeIds: dragData.absenceTypeId != null ? [] : dragData.shiftCodeIds,
        absenceTypeId: dragData.absenceTypeId ?? null,
        isDraft: true,
        isDelete: false,
        draftKind: targetDraftKind,
        publishedShiftCodeIds: targetPublishedShiftCodeIds,
        publishedAbsenceTypeId: targetPublishedAbsenceTypeId,
        publishedLabel: targetPublishedLabel,
        customStartTime:
          dragData.absenceTypeId != null
            ? null
            : (sourceEntry?.customStartTime ?? dragData.customStartTime ?? null),
        customEndTime:
          dragData.absenceTypeId != null
            ? null
            : (sourceEntry?.customEndTime ?? dragData.customEndTime ?? null),
        updatedBy: currentUserRef.current?.id ?? null,
      };
      const sourceReplacement =
        dragMode === "move"
          ? sourceEntry?.publishedShiftCodeIds?.length ||
            sourceEntry?.publishedAbsenceTypeId != null
            ? {
                label: "OFF",
                shiftCodeIds: [],
                absenceTypeId: null,
                isDraft: true,
                isDelete: true,
                draftKind: "deleted" as DraftKind,
                publishedShiftCodeIds: sourceEntry?.publishedShiftCodeIds ?? [],
                publishedAbsenceTypeId:
                  sourceEntry?.publishedAbsenceTypeId ?? null,
                publishedLabel: sourceEntry?.publishedLabel ?? "",
                customStartTime: null,
                customEndTime: null,
                updatedBy: currentUserRef.current?.id ?? null,
              }
            : null
          : undefined;

      // Optimistic UI update
      setShifts((prev) => {
        const next = { ...prev };
        next[targetKey] = movedEntry;
        if (dragMode === "move") {
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
          ...(dragMode === "move"
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
            dragData.empId,
            dragData.dateKey,
            dropData.empId,
            dropData.dateKey,
            dragData.shiftCodeIds,
            dragData.absenceTypeId ?? null,
            dragMode,
            sourceEntry?.version,
          ),
        )
        .then(() => {
          toast.success(dragMode === "copy" ? "Entry copied" : "Entry moved");
        })
        .catch(async (err) => {
          if (err instanceof OptimisticLockError) {
            toast.error(
              "Entry was modified by another editor or another tab — refreshing",
            );
          } else {
            toast.error(
              dragMode === "copy"
                ? "Failed to copy entry"
                : "Failed to move entry",
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
      checkQualification,
      broadcastDraftChanged,
      refetchScheduleData,
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
        (shift.shiftCodeIds.length === 0 && shift.absenceTypeId == null)
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
      if (clipboard.shiftCodeIds.length > 0) {
        const disqualified = checkQualification(empId, clipboard.shiftCodeIds);
        if (disqualified) {
          toast.error(disqualified);
          return;
        }
      }

      // If the target cell already has an entry, confirm before overwriting
      const existing = shifts[cellKey];
      if (
        existing &&
        (existing.shiftCodeIds.length > 0 || existing.absenceTypeId != null) &&
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
    [clipboard, setShift, getCellLock, checkQualification, shifts],
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

  // Context menu handlers
  const handleCellContextMenu = useCallback(
    (
      e: React.MouseEvent | React.KeyboardEvent,
      empId: string,
      date: Date,
      focusAreaName: string,
    ) => {
      e.preventDefault();
      setContextMenu({
        anchorEl: e.currentTarget as HTMLElement,
        empId,
        date,
        focusAreaName,
      });
    },
    [],
  );

  const handleCellHover = useCallback(
    (empId: string, date: Date, focusAreaName: string) => {
      hoveredCellRef.current = { empId, date, focusAreaName };
    },
    [],
  );

  // Keyboard shortcuts for copy-paste (Cmd/Ctrl+C and Cmd/Ctrl+V)
  useEffect(() => {
    if (!canEditShifts) return;

    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const hovered = hoveredCellRef.current;
      if (!hovered) return;

      if (e.key === "c") {
        // Don't intercept if user has text selected
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0) return;
        e.preventDefault();
        handleCopyShift(hovered.empId, hovered.date);
      } else if (e.key === "v") {
        e.preventDefault();
        handlePasteShift(hovered.empId, hovered.date);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canEditShifts, handleCopyShift, handlePasteShift]);

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
      shiftCodeMapRef.current,
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
        // Verify shift code or absence type is still active (not archived)
        if (match) {
          if (
            match.shiftCodeId != null &&
            shiftCodes.some((sc) => sc.id === match.shiftCodeId)
          )
            count++;
          else if (
            match.absenceTypeId != null &&
            absenceTypes.some((at) => at.id === match.absenceTypeId)
          )
            count++;
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
  }, [org, getAutoFillRange, shiftCodes, absenceTypes, shifts]);

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

  // Preview: count how many shifts would be imported, then show confirmation
  const handleImportPreviousPreview = useCallback(() => {
    if (!org || spanWeeks === "month") return;

    const days = spanWeeks * 7;
    const sourceStart = addDays(weekStart, -days);

    // Count source shifts that have data AND whose target cell is empty
    let count = 0;
    for (let i = 0; i < days; i++) {
      const sourceDate = addDays(sourceStart, i);
      const targetDate = addDays(weekStart, i);
      const sourceDateKey = formatDateKey(sourceDate);
      const targetDateKey = formatDateKey(targetDate);

      for (const emp of employees) {
        const sourceKey = `${emp.id}_${sourceDateKey}`;
        const targetKey = `${emp.id}_${targetDateKey}`;
        const sourceShift = shifts[sourceKey];
        if (
          sourceShift &&
          (sourceShift.shiftCodeIds.length > 0 ||
            sourceShift.absenceTypeId != null) &&
          !sourceShift.isDelete &&
          !shifts[targetKey]
        ) {
          count++;
        }
      }
    }

    if (count === 0) {
      toast.info(
        "No shifts to import — either the previous period is empty or all slots are already filled",
      );
      return;
    }

    const sourceRange = `${formatDate(sourceStart)} – ${formatDate(addDays(sourceStart, days - 1))}`;
    const targetRange = `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, days - 1))}`;
    setImportPreview({ count, sourceRange, targetRange });
    setShowImportConfirm(true);
  }, [org, spanWeeks, weekStart, employees, shifts]);

  // Actually apply the import (called after confirmation)
  const handleImportPrevious = useCallback(async () => {
    if (!org || spanWeeks === "month") return;
    const days = spanWeeks * 7;
    const sourceStart = addDays(weekStart, -days);
    const sourceRange = `${formatDate(sourceStart)} – ${formatDate(addDays(sourceStart, days - 1))}`;
    const targetRange = `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, days - 1))}`;
    startScheduleOperation({
      kind: "import_previous",
      title: "Importing previous schedule...",
      detail: importPreview?.count
        ? `Copying ${importPreview.count} shift${importPreview.count === 1 ? "" : "s"} from ${importPreview.sourceRange} into ${importPreview.targetRange}.`
        : `Copying shifts from ${sourceRange} into ${targetRange}.`,
      progress: 6,
    });
    setShowImportConfirm(false);
    setIsImportingPrevious(true);

    try {
      const shiftUpdates: Record<string, ShiftMap[string]> = {};
      const upsertTasks: Array<() => Promise<void>> = [];
      // BUG 1.11: Track disqualified shifts to show warning
      const disqualifiedShifts: Array<{
        empName: string;
        date: string;
        reason: string;
      }> = [];

      for (let i = 0; i < days; i++) {
        const sourceDate = addDays(sourceStart, i);
        const targetDate = addDays(weekStart, i);
        const sourceDateKey = formatDateKey(sourceDate);
        const targetDateKey = formatDateKey(targetDate);

        for (const emp of employees) {
          const sourceKey = `${emp.id}_${sourceDateKey}`;
          const targetKey = `${emp.id}_${targetDateKey}`;
          const sourceShift = shifts[sourceKey];

          if (
            sourceShift &&
            (sourceShift.shiftCodeIds.length > 0 ||
              sourceShift.absenceTypeId != null) &&
            !sourceShift.isDelete &&
            !shifts[targetKey]
          ) {
            // BUG 1.11: Check qualification for shift codes (ignore absence types)
            if (sourceShift.shiftCodeIds.length > 0) {
              const disqualifyReason = checkQualification(
                emp.id,
                sourceShift.shiftCodeIds,
              );
              if (disqualifyReason) {
                disqualifiedShifts.push({
                  empName: getEmployeeDisplayName(emp),
                  date: formatDate(targetDate),
                  reason: disqualifyReason,
                });
                continue; // Skip this shift
              }
            }

            // Build optimistic state entry
            shiftUpdates[targetKey] = {
              label: sourceShift.label,
              shiftCodeIds: sourceShift.shiftCodeIds,
              absenceTypeId: sourceShift.absenceTypeId,
              isDraft: true,
              draftKind: "new",
              publishedShiftCodeIds: [],
              publishedLabel: "",
              updatedBy: currentUserRef.current?.id ?? null,
            };

            // Queue DB upsert
            upsertTasks.push(() =>
              upsertShift(
                emp.id,
                targetDateKey,
                sourceShift.shiftCodeIds,
                org.id,
                sourceShift.customStartTime,
                sourceShift.customEndTime,
                undefined,
                sourceShift.absenceTypeId,
              )
            );
          }
        }
      }

      // Show warning if any shifts were skipped due to disqualification
      if (disqualifiedShifts.length > 0) {
        const msg = disqualifiedShifts
          .slice(0, 3)
          .map((s) => `${s.empName} on ${s.date}`)
          .join(", ");
        const suffix =
          disqualifiedShifts.length > 3
            ? ` and ${disqualifiedShifts.length - 3} more`
            : "";
        toast.warning(
          `Skipped ${disqualifiedShifts.length} shift(s) due to qualifications: ${msg}${suffix}`,
        );
      }

      // Apply optimistic state update immediately for responsive UI
      setShifts((prev) => ({ ...prev, ...shiftUpdates }));
      broadcastDraftChanged({ shifts: shiftUpdates });

      const count = upsertTasks.length;
      if (count === 0) {
        finishScheduleOperation(
          "import_previous",
          "Nothing needed to be imported for this date range.",
        );
        toast.info(
          "No shifts to import — either the previous period is empty or all slots are already filled",
        );
        return;
      }

      updateScheduleOperation("import_previous", {
        progress: 16,
        detail: `Importing ${count} shift${count === 1 ? "" : "s"}...`,
      });

      // Persist to DB in batches so the modal can reflect real progress.
      for (let i = 0; i < upsertTasks.length; i += IMPORT_PREVIOUS_BATCH_SIZE) {
        const batch = upsertTasks.slice(i, i + IMPORT_PREVIOUS_BATCH_SIZE);
        await Promise.all(batch.map((task) => task()));
        const completed = Math.min(upsertTasks.length, i + batch.length);
        updateScheduleOperation("import_previous", {
          progress: 16 + Math.round((completed / upsertTasks.length) * 74),
          detail: `Imported ${completed} of ${upsertTasks.length} shift${upsertTasks.length === 1 ? "" : "s"}...`,
        });
      }
      // Always refetch to reconcile — catches race conditions where another user
      // filled slots between preview and import
      updateScheduleOperation("import_previous", {
        progress: 95,
        detail: "Refreshing the schedule with the imported shifts...",
      });
      await refetchScheduleData();
      finishScheduleOperation("import_previous");
      toast.success(
        `Imported ${count} shift${count !== 1 ? "s" : ""} from previous ${spanWeeks === 1 ? "week" : "2 weeks"}`,
      );
    } catch (err) {
      clearScheduleOperation("import_previous");
      toast.error("Failed to save some imported shifts — refreshing");
      Sentry.captureException(err);
      await refetchScheduleData();
    } finally {
      setIsImportingPrevious(false);
      setImportPreview(null);
    }
  }, [
    org,
    spanWeeks,
    weekStart,
    importPreview,
    employees,
    shifts,
    broadcastDraftChanged,
    checkQualification,
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
      setWeekStart((prev) => addDays(prev, -step));
    }
  }, [spanWeeks, isMobile]);

  const handleNext = useCallback(() => {
    if (spanWeeks === "month") {
      setWeekStart(
        (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
      );
    } else {
      const step = isMobile ? 7 : spanWeeks * 7;
      setWeekStart((prev) => addDays(prev, step));
    }
  }, [spanWeeks, isMobile]);

  const handleToday = useCallback(
    () => setWeekStart(getWeekStart(today)),
    [today],
  );

  const handleSpanChange = useCallback((next: 1 | 2 | "month") => {
    if (next !== "month") {
      // Snap weekStart to Sunday when leaving month view
      setWeekStart((prev) => getWeekStart(prev));
    }
    setPreferredSpan(next);
  }, []);

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

      await publishSchedule(
        org.id,
        startDate,
        endDate,
        publishReviewSummary ?? undefined,
      );

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
      setPublishReviewSummary(null);
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
      if (err instanceof ScheduleDraftConflictError) {
        setPublishReviewSummary(err.latestSummary);
        await refetchScheduleData();
        toast.error(
          "Schedule drafts changed elsewhere. Review the latest summary and try again.",
        );
        return;
      }
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
    publishReviewSummary,
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
          discardAll
            ? (discardAllReviewSummary ?? undefined)
            : (discardMineReviewSummary ?? undefined),
        );

        const refreshed = await refetchScheduleDataRef.current();
        setShowDiscardConfirm(false);
        setDiscardMineReviewSummary(null);
        setDiscardAllReviewSummary(null);
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
        if (err instanceof ScheduleDraftConflictError) {
          if (discardAll) {
            setDiscardAllReviewSummary(err.latestSummary);
          } else {
            setDiscardMineReviewSummary(err.latestSummary);
          }
          await refetchScheduleDataRef.current();
          toast.error(
            "Schedule drafts changed elsewhere. Review the latest summary and try again.",
          );
          return;
        }
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
      discardAllReviewSummary,
      discardMineReviewSummary,
      sendReliableBroadcast,
    ],
  );

  // ── Loading / error states ───────────────────────────────────────────────────

  const isLoading = orgLoading || empLoading || scheduleLoading;

  if (orgLoading || (scheduleLoading && !org)) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg)",
          zIndex: 50,
        }}
      >
        <AnimatedDubGridLogo size={160} />
      </div>
    );
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
            Workspace Setup Required
          </h1>
          <p
            style={{
              fontSize: "var(--dg-fs-title)",
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              marginBottom: 32,
            }}
          >
            Your account is active, but it looks like your workspace hasn&apos;t
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

  // ── Main UI ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "var(--color-bg)",
        minHeight: "100vh",
        color: "var(--color-text-primary)",
      }}
    >
      {isLoading && employees.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-bg)",
            zIndex: 50,
          }}
        >
          <AnimatedDubGridLogo size={160} />
        </div>
      )}

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
            {canEditShifts && hasUnpublishedChanges && (
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
            {publishHistory.length > 0 &&
              (() => {
                const latest = publishHistory[0];
                const totalChanges = publishHistory.reduce(
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
                      {publishHistory.length > 1
                        ? ` across ${publishHistory.length} publishes`
                        : ""}
                    </span>
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
                              "Highlight differences from the published schedule",
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
                              {showPublishDiff
                                ? "Hide Changes"
                                : "Show What Changed"}
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
                  dates.length > 0
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
                hasData={employees.length > 0}
              />
            </div>
          </div>

          <div style={{ padding: isMobile ? "8px 0" : "16px 16px" }}>
            {/* Mobile Day View */}
            {spanWeeks !== "month" && isMobile && (
              <MobileDayView
                filteredEmployees={filteredEmployees}
                allEmployees={employees}
                dates={dates.slice(0, 7)}
                shiftForKey={shiftForKey}
                shiftCodeIdsForKey={shiftCodeIdsForKey}
                getShiftStyle={getShiftStyle}
                handleCellClick={handleCellClick}
                today={today}
                focusAreas={focusAreas}
                shiftCodes={shiftCodes}
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
              />
            )}

            {/* Desktop/Tablet Grid */}
            {spanWeeks !== "month" && !isMobile && (
              <div data-tour="schedule-grid">
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <ScheduleGrid
                    filteredEmployees={filteredEmployees}
                    allEmployees={employees}
                    week1={week1}
                    week2={week2}
                    spanWeeks={spanWeeks}
                    shiftForKey={shiftForKey}
                    shiftCodeIdsForKey={shiftCodeIdsForKey}
                    getShiftStyle={getShiftStyle}
                    handleCellClick={handleCellClick}
                    today={today}
                    highlightEmpIds={highlightEmpIds}
                    focusAreas={focusAreas}
                    departments={departments}
                    shiftCodes={shiftCodes}
                    shiftCategories={shiftCategories}
                    indicatorTypes={indicatorTypes}
                    certifications={certifications}
                    orgRoles={orgRoles}
                    isCellInteractive={
                      canEditShifts || canEditNotes || !!currentEmpId
                    }
                    canDragShifts={canEditShifts}
                    activeIndicatorIdsForKey={activeIndicatorIdsForKey}
                    activeFocusArea={activeFocusArea}
                    getCustomShiftTimes={getCustomShiftTimes}
                    draftKindForKey={draftKindForKey}
                    showDiffOverlay={showDiffOverlay}
                    publishedLabelForKey={publishedLabelForKey}
                    publishedShiftCodeIdsForKey={publishedShiftCodeIdsForKey}
                    hasTimeChangesForKey={hasTimeChangesForKey}
                    publishDiffForKey={publishDiffKindForKey}
                    recentlyPublishedKeys={recentlyPublishedKeys}
                    cellLocks={lockedCells}
                    showAudit={showAudit && canShowEditorNames}
                    createdByNameForKey={
                      canShowEditorNames ? createdByNameForKey : undefined
                    }
                    onCellHover={handleCellHover}
                    onCellContextMenu={handleCellContextMenu}
                    coverageRequirements={coverageRequirements}
                    absenceTypeMap={absenceTypeObjectMap}
                    absenceTypeIdForKey={absenceTypeIdForKey}
                    shiftDisplayMode={org?.shiftDisplayMode}
                    resolvePublisherName={(userId: string) =>
                      auditNames.get(userId) ?? null
                    }
                    selectedCellKey={editSessionCellKey}
                    openShifts={openShifts}
                    onClaimOpenShift={
                      currentEmpId
                        ? (openShift) => {
                            const dateObj = new Date(
                              openShift.date + "T00:00:00",
                            );
                            if (
                              openShift.source === "coverage_gap" &&
                              currentEmployee
                            ) {
                              const eligibleShiftCodes = (
                                openShift.eligibleShiftCodeIds?.length
                                  ? openShift.eligibleShiftCodeIds
                                  : openShift.shiftCodeIds
                              )
                                .map((codeId) => shiftCodeById.get(codeId))
                                .filter((shiftCode): shiftCode is ShiftCode => !!shiftCode)
                                .filter((shiftCode) =>
                                  isEmployeeQualified(
                                    {
                                      certificationId: currentEmployee.certificationId,
                                      focusAreaIds: currentEmployee.focusAreaIds,
                                    },
                                    shiftCode,
                                  ),
                                );

                              if (eligibleShiftCodes.length === 0) {
                                toast.error(
                                  "You are not qualified for any shift code that can cover this gap",
                                );
                                return;
                              }

                              if (eligibleShiftCodes.length === 1) {
                                const selectedShiftCode = eligibleShiftCodes[0];
                                const selectedRange = getOpenShiftTimeRanges(
                                  [selectedShiftCode.id],
                                  null,
                                  null,
                                )[0];
                                if (
                                  hasOpenShiftConflict(
                                    [selectedShiftCode.id],
                                    dateObj,
                                    selectedRange?.start ?? null,
                                    selectedRange?.end ?? null,
                                  )
                                ) {
                                  toast.error(
                                    "You already have a shift at the same time",
                                  );
                                  return;
                                }
                                setPendingClaimShift({
                                  ...openShift,
                                  shiftCodeIds: [selectedShiftCode.id],
                                  customStartTime: selectedRange?.start ?? null,
                                  customEndTime: selectedRange?.end ?? null,
                                });
                                return;
                              }

                              const preferredShiftCode =
                                eligibleShiftCodes.find(
                                  (shiftCode) =>
                                    shiftCode.id ===
                                    openShift.preferredOpenShiftCodeId,
                                ) ?? eligibleShiftCodes[0];

                              setCoverageGapSelection({
                                openShift,
                                qualifiedShiftCodes: eligibleShiftCodes,
                                selectedShiftCodeId: preferredShiftCode.id,
                              });
                              return;
                            }

                            if (
                              hasOpenShiftConflict(
                                openShift.shiftCodeIds,
                                dateObj,
                                openShift.customStartTime,
                                openShift.customEndTime,
                              )
                            ) {
                              toast.error(
                                "You already have a shift at the same time",
                              );
                              return;
                            }
                            setPendingClaimShift(openShift);
                          }
                        : undefined
                    }
                  />
                  <DragOverlay dropAnimation={null}>
                    {activeDrag && (
                      <div
                        style={{
                          background: activeDrag.pillColor,
                          color: activeDrag.pillText,
                          border: `1px solid ${activeDrag.pillText}20`,
                          borderRadius: 8,
                          padding: "6px 16px",
                          fontSize: "var(--dg-fs-title)",
                          fontWeight: 800,
                          boxShadow: "var(--shadow-drag)",
                          cursor: "grabbing",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {activeDrag.label}
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              </div>
            )}

            {/* Context menu for copy/paste/requests */}
            {(() => {
              if (!contextMenu) return null;
              const cmKey = `${contextMenu.empId}_${formatDateKey(contextMenu.date)}`;
              const cmShiftEntry = shifts[cmKey];
              const cmHasEntry = !!(
                cmShiftEntry &&
                (cmShiftEntry.shiftCodeIds.length > 0 ||
                  cmShiftEntry.absenceTypeId != null) &&
                !cmShiftEntry.isDelete
              );
              const cmCanRequestBase =
                !cmShiftEntry?.absenceTypeId &&
                canCreateOwnShiftRequest(
                  contextMenu.empId,
                  contextMenu.date,
                );
              const cmCanRequest =
                cmCanRequestBase &&
                !hasActiveRequestForShift(contextMenu.empId, contextMenu.date);
              const cmHasActiveRequest = hasActiveRequestForShift(
                contextMenu.empId,
                contextMenu.date,
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
                  onCopy={() =>
                    handleCopyShift(contextMenu.empId, contextMenu.date)
                  }
                  onPaste={() =>
                    handlePasteShift(contextMenu.empId, contextMenu.date)
                  }
                  onClear={() =>
                    handleClearShift(contextMenu.empId, contextMenu.date)
                  }
                  onNeedCoverage={() => {
                    const emp = employees.find(
                      (e) => e.id === contextMenu.empId,
                    );
                    if (!emp) return;
                    const cellKey = `${emp.id}_${formatDateKey(contextMenu.date)}`;
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
                    const activeFaId =
                      focusAreas.find(
                        (fa) => fa.name === contextMenu.focusAreaName,
                      )?.id ?? null;
                    startEditSession({
                      empId: emp.id,
                      empName: getEmployeeDisplayName(emp),
                      date: contextMenu.date,
                      empFocusAreaIds: emp.focusAreaIds,
                      empCertificationId: emp.certificationId,
                      activeFocusAreaId: activeFaId,
                      requestMode: "coverage",
                    });
                  }}
                  onProposeSwap={() => {
                    const emp = employees.find(
                      (e) => e.id === contextMenu.empId,
                    );
                    if (!emp) return;
                    const activeFaId =
                      focusAreas.find(
                        (fa) => fa.name === contextMenu.focusAreaName,
                      )?.id ?? null;
                    startEditSession({
                      empId: emp.id,
                      empName: getEmployeeDisplayName(emp),
                      date: contextMenu.date,
                      empFocusAreaIds: emp.focusAreaIds,
                      empCertificationId: emp.certificationId,
                      activeFocusAreaId: activeFaId,
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

            {/* Confirm dialog for claiming / volunteering for an open shift */}
            {coverageGapSelection && currentEmpId && (
              <Modal
                title="Choose Shift Code"
                onClose={() => setCoverageGapSelection(null)}
                style={{ maxWidth: 420 }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                    <strong>{coverageGapSelection.openShift.ruleLabel ?? coverageGapSelection.openShift.shiftCodeLabel}</strong> on{" "}
                    <strong>{coverageGapSelection.openShift.date}</strong> can be covered by more than one exact shift code.
                    Choose which code you want to volunteer for.
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)" }}>
                      Shift code
                    </span>
                    <CustomSelect
                      value={String(coverageGapSelection.selectedShiftCodeId)}
                      options={coverageGapSelection.qualifiedShiftCodes.map((shiftCode) => ({
                        value: String(shiftCode.id),
                        label: org?.shiftDisplayMode === "name"
                          ? (shiftCode.name || shiftCode.label)
                          : shiftCode.label,
                      }))}
                      onChange={(value) =>
                        setCoverageGapSelection((current) =>
                          current
                            ? { ...current, selectedShiftCodeId: Number(value) }
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
                        const selectedShiftCode = coverageGapSelection.qualifiedShiftCodes.find(
                          (shiftCode) =>
                            shiftCode.id === coverageGapSelection.selectedShiftCodeId,
                        );
                        if (!selectedShiftCode) return;
                        const dateObj = new Date(
                          coverageGapSelection.openShift.date + "T00:00:00",
                        );
                        const selectedRange = getOpenShiftTimeRanges(
                          [selectedShiftCode.id],
                          null,
                          null,
                        )[0];
                        if (
                          hasOpenShiftConflict(
                            [selectedShiftCode.id],
                            dateObj,
                            selectedRange?.start ?? null,
                            selectedRange?.end ?? null,
                          )
                        ) {
                          toast.error("You already have a shift at the same time");
                          return;
                        }
                        setCoverageGapSelection(null);
                        shiftRequests.volunteer(
                          currentEmpId,
                          coverageGapSelection.openShift.date,
                          [selectedShiftCode.id],
                          coverageGapSelection.openShift.focusAreaId,
                          selectedRange?.start ?? null,
                          selectedRange?.end ?? null,
                        );
                      }}
                    >
                      Volunteer
                    </button>
                  </div>
                </div>
              </Modal>
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
                    <strong>{pendingClaimShift.shiftCodeLabel}</strong> on{" "}
                    <strong>{pendingClaimShift.date}</strong>
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
                onConfirm={() => {
                  const os = pendingClaimShift;
                  setPendingClaimShift(null);
                  if (os.source === "calloff" && os.requestId) {
                    shiftRequests.claim(os.requestId, currentEmpId);
                  } else if (os.source === "coverage_gap") {
                    shiftRequests.volunteer(
                      currentEmpId,
                      os.date,
                      os.shiftCodeIds,
                      os.focusAreaId,
                      os.customStartTime,
                      os.customEndTime,
                    );
                  }
                }}
                onCancel={() => setPendingClaimShift(null)}
              />
            )}

            {/* Confirm dialog for pasting over an existing shift */}
            {pendingPasteOver && (
              <ConfirmDialog
                title="Replace Entry?"
                message={`Replace "${pendingPasteOver.existingLabel}" with "${pendingPasteOver.pasteEntry.label}"?`}
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

            {spanWeeks === "month" && (
              <MonthView
                monthStart={monthStart}
                filteredEmployees={filteredEmployees}
                shiftForKey={shiftForKey}
                shiftCodeIdsForKey={shiftCodeIdsForKey}
                isAbsenceForKey={isAbsenceForKey}
                getShiftStyle={getShiftStyle}
                today={today}
                focusAreas={focusAreas}
                shiftCodes={shiftCodes}
                shiftCategories={shiftCategories}
                activeFocusArea={activeFocusArea}
                draftKindForKey={draftKindForKey}
                shiftDisplayMode={org?.shiftDisplayMode}
              />
            )}
          </div>

          {editPanel && (
            <ShiftEditPanel
              key={`${editSessionCellKey ?? "panel"}_${editSessionDraft?.baseVersion ?? "new"}_${editPanel.requestMode ?? "edit"}`}
              modal={editPanel}
              currentShift={panelCurrentShift}
              currentShiftCodeIds={panelCurrentShiftCodeIds}
              shiftCodes={shiftCodes}
              shiftCategories={shiftCategories}
              focusAreas={focusAreas}
              certifications={certifications}
              indicatorTypes={indicatorTypes}
              onSelect={handleShiftSelect}
              onConfirmDraft={handleConfirmEditPanel}
              allowShiftEdits={canEditShifts}
              canEditNotes={canEditNotes}
              getActiveIndicatorIds={panelActiveIndicatorIds}
              onNoteToggle={handleNoteToggle}
              onClose={closeEditPanel}
              seriesId={
                panelShiftEntry?.seriesId ??
                shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]
                  ?.seriesId ??
                null
              }
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
              publishedShiftCodeIds={
                panelShiftEntry?.publishedShiftCodeIds ??
                shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]
                  ?.publishedShiftCodeIds ??
                []
              }
              draftKind={panelDraftKind}
              isStale={editSessionDraft?.isStale ?? false}
              auditInfo={
                canEditShifts && canShowEditorNames ? auditInfo : undefined
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
                  ? () => {
                      shiftRequests.create(
                        "pickup",
                        editPanel.empId,
                        formatDateKey(editPanel.date),
                      );
                      closeEditPanel();
                    }
                  : undefined
              }
              onCallOff={
                canCreateOwnShiftRequest(editPanel.empId, editPanel.date)
                  ? (absenceType) => {
                      shiftRequests.create(
                        "calloff",
                        editPanel.empId,
                        formatDateKey(editPanel.date),
                        undefined,
                        undefined,
                        absenceType.id,
                      );
                      closeEditPanel();
                    }
                  : undefined
              }
              employees={employees}
              shiftForKey={shiftForKey}
              isRequestableShift={isPublishedRequestableShift}
              getShiftTimeRanges={getShiftTimeRanges}
              onSubmitSwap={
                canCreateOwnShiftRequest(editPanel.empId, editPanel.date)
                  ? (targetEmpId, targetShiftDate) => {
                      shiftRequests.create(
                        "swap",
                        editPanel.empId,
                        formatDateKey(editPanel.date),
                        targetEmpId,
                        targetShiftDate,
                      );
                      closeEditPanel();
                    }
                  : undefined
              }
              shiftDisplayMode={org?.shiftDisplayMode}
              absenceTypes={absenceTypes}
              currentAbsenceTypeId={panelCurrentAbsenceTypeId}
              onAbsenceSelect={canEditShifts ? handleAbsenceSelect : undefined}
            />
          )}

          {/* ── Shift Request Board (slide-out panel) ── */}
          {showRequestBoard && (
            <ShiftRequestBoard
              openPickups={shiftRequests.openPickups.filter((req) => {
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
                  for (const codeId of req.requesterShiftCodeIds) {
                    const sc = shiftCodes.find((c) => c.id === codeId);
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
              })}
              myRequests={shiftRequests.myRequests}
              pendingApproval={shiftRequests.pendingApproval}
              approvalQueue={
                canApproveShiftRequests ? shiftRequests.requests : undefined
              }
              loading={shiftRequests.loading}
              currentEmpId={currentEmpId}
              canApprove={canApproveShiftRequests}
              onClaim={(id) =>
                currentEmpId && shiftRequests.claim(id, currentEmpId)
              }
              onRespond={(id, accept) =>
                currentEmpId && shiftRequests.respond(id, currentEmpId, accept)
              }
              onResolve={(id, approved, note) =>
                shiftRequests.resolve(id, approved, note)
              }
              onCancel={(id) =>
                currentEmpId && shiftRequests.cancel(id, currentEmpId)
              }
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
            shiftCodes={shiftCodes}
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
              shiftCodes={shiftCodes}
              shiftCategories={shiftCategories}
              certifications={certifications}
              orgRoles={orgRoles}
              shiftForKey={shiftForKey}
              shiftCodeIdsForKey={shiftCodeIdsForKey}
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
                isDiscardSummaryLoading ? (
                  "Checking latest drafts..."
                ) : (
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
                      {discardMineReviewSummary ? (
                        <DraftReviewSummary
                          title="Your drafts"
                          breakdown={discardMineReviewSummary}
                          emptyMessage="No drafts to discard."
                        />
                      ) : null}
                      {showOrganizationDiscardScope &&
                      discardAllReviewSummary ? (
                        <DraftReviewSummary
                          title="All drafts"
                          breakdown={discardAllReviewSummary}
                          emptyMessage="No organization drafts."
                        />
                      ) : null}
                    </div>
                  </div>
                )
              }
              confirmLabel="Discard my drafts"
              cancelLabel="Keep drafts"
              variant="danger"
              maxWidth={560}
              wrapActions
              isLoading={cancelingMode === "mine"}
              confirmDisabled={
                isDiscardSummaryLoading ||
                (discardMineReviewSummary?.totalChanges ?? 0) === 0
              }
              onConfirm={() => {
                void handleCancelChanges();
              }}
              onCancel={closeDiscardConfirm}
              secondaryConfirmLabel={
                showOrganizationDiscardScope ? "Discard all drafts" : undefined
              }
              isSecondaryLoading={cancelingMode === "all"}
              secondaryConfirmDisabled={
                isDiscardSummaryLoading ||
                (discardAllReviewSummary?.totalChanges ?? 0) === 0
              }
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
                loadingPublishReviewSummary
                  ? `Checking the latest unpublished changes for ${currentPublishWindow.label}…`
                  : allCoverageGaps.length > 0
                    ? `Publish ${publishReviewSummary?.totalChanges ?? draftBreakdown.totalChanges} unpublished change${(publishReviewSummary?.totalChanges ?? draftBreakdown.totalChanges) === 1 ? "" : "s"} for ${currentPublishWindow.label}? ${publishSummary}. ${allCoverageGaps.length} coverage gap${allCoverageGaps.length === 1 ? "" : "s"} remain${allCoverageGaps.length === 1 ? "s" : ""} in this period.`
                    : `Publish ${publishReviewSummary?.totalChanges ?? draftBreakdown.totalChanges} unpublished change${(publishReviewSummary?.totalChanges ?? draftBreakdown.totalChanges) === 1 ? "" : "s"} for ${currentPublishWindow.label}? ${publishSummary}.`
              }
              confirmLabel="Publish"
              variant={allCoverageGaps.length > 0 ? "warning" : "info"}
              isLoading={loadingPublishReviewSummary || isPublishing}
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
              message={`This will copy ${importPreview.count} shift${importPreview.count !== 1 ? "s" : ""} from ${importPreview.sourceRange} into ${importPreview.targetRange}. Only empty slots will be filled — existing shifts will not be overwritten.`}
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
                setWeekStart(getWeekStart(publishStart));
                setPublishHistory([entry]);
                setShowPublishDiff(true);
                setShowPublishHistory(false);
              }}
              shiftCodeMap={shiftCodeMap}
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

export default function SchedulerPage() {
  return (
    <ProtectedRoute>
      <SetupGuard>
        <SchedulerContent />
      </SetupGuard>
    </ProtectedRoute>
  );
}
