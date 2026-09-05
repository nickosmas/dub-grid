"use client";

import * as Sentry from "@/lib/sentry";
import { Button } from "@/components/Button";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import Toolbar from "@/components/Toolbar";
import TimeZoneClocks from "@/components/TimeZoneClocks";
import ScheduleGrid, {
  buildScheduleGridModel,
  type ScheduleGridHandlers,
  type ScheduleGridInteractionState,
} from "@/components/ScheduleGrid";
import MonthView from "@/components/MonthView";
import { EmptyState } from "@/components/EmptyState";
import PrintLegend from "@/components/PrintLegend";
import type { PrintConfig } from "@/components/PrintOptionsModal";
import ChangeCountChips from "@/components/ChangeCountChips";
import DraftBanner from "@/components/DraftBanner";
import DraftReviewSummary from "@/components/DraftReviewSummary";
import PublishHistoryPanel from "@/components/PublishHistoryPanel";
import ScheduleOperationModal from "@/components/ScheduleOperationModal";
import ImportResultsModal from "@/components/ImportResultsModal";
import BulkDeleteReviewContent, {
  type BulkDeleteReviewTarget,
} from "./_components/BulkDeleteReviewContent";
import {
  ScheduleSessionEndedDialog,
  ScheduleSessionWarning,
} from "./_components/ScheduleSessionDialogs";
import { resolveGridAuditLabel } from "./_lib/grid-audit-label";
import {
  buildGridCalloffOpenShiftsFromRequests,
  countPendingVolunteerRequestsForCoverageGap,
  hasPendingVolunteerRequestForCoverageGap,
  isEmployeeEligibleForOpenShift,
  selectVisibleCoverageGaps,
} from "./_lib/open-shifts";
import { Hint } from "@/components/ui/hint";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { hint } from "@/components/ui/hint.types";
import { X } from "lucide-react";

const ShiftEditPanel = dynamic(() => import("@/components/ShiftEditPanel"), {
  ssr: false,
});
const PrintOptionsModal = dynamic(() => import("@/components/PrintOptionsModal"), { ssr: false });
const PrintScheduleView = dynamic(() => import("@/components/PrintScheduleView"), { ssr: false });
const ShiftRequestBoard = dynamic(() => import("@/components/ShiftRequestBoard"), { ssr: false });
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
  getIsoDateInTimeZone,
  hasShiftStartedAtTimeRanges,
  parseLocalDateKey,
} from "@dubgrid/schedule-core";
import {
  filterAndSortEmployees,
  hasVisibleGridShiftEntry,
  buildAssignmentDefinitionIdsByFocusArea as buildAssignmentIdsByFocusArea,
  buildPublishedDateSet,
  computeCoverageGaps,
  createCoverageCreditResolver,
  filterPublishedDates,
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
  endScheduleEditorSessions,
  fetchCalloffOpenShifts,
  fetchPublishedDateRanges,
  fetchRecentPublishHistory,
  fetchRecurringShifts,
  fetchScheduleActorNames,
  fetchSchedulePresenceProfiles,
  fetchScheduleEditorSessionStatus,
  fetchScheduleNotes,
  fetchShifts,
  getScheduleLastViewed,
  moveShift,
  publishSchedule,
  updateScheduleLastViewed,
  updateSeriesAllShifts,
  upsertScheduleNote,
  upsertShift,
  upsertShiftTimes,
  type EchoedCells,
  type DeleteShiftBatchItem,
} from "@/features/schedule/client";
import { computeDraftBreakdown, computeOutOfWindowDraftGroups } from "@/lib/draft-utils";
import { exportScheduleCSV } from "@/lib/export-csv";
import { queueNotification } from "@/lib/notify";
import { buildRealtimeDraftDiff } from "@/lib/realtime-draft-utils";
import {
  getScheduleStartForSpan,
  realignTwoWeekScheduleStart,
  resolveScheduleSpan,
} from "@/lib/schedule-view";
import {
  usePermissions,
  useOrganizationData,
  useClientFeatureFlags,
  useEmployees,
  useSchedulePresence,
  useReliableRealtimeBroadcasts,
  useShiftRequests,
  useDismissibleBanner,
  useLogout,
} from "@/hooks";
import { useAuth } from "@/components/AuthProvider";
import {
  type BrowserRealtimeChannel,
  createBrowserRealtimeChannel,
  fetchAccountIdentity,
  getBrowserRealtimeChannels,
  removeBrowserRealtimeChannel,
} from "@/features/account/client";
import PresenceAvatars, { type PresenceProfile } from "@/components/PresenceAvatars";
import { ProtectedRoute } from "@/components/RouteGuards";
import SetupGuard from "@/components/SetupGuard";
import { toast } from "sonner";
import ShiftContextMenu from "@/components/ShiftContextMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import CustomSelect from "@/components/CustomSelect";
import MobileDayView from "@/components/MobileDayView";
import { useMediaQuery, MOBILE, AUTO_ONE_WEEK } from "@/hooks";
import { useSetMobileSubNav, SubNavItem } from "@/components/MobileSubNavContext";
import { mergeDraftChangedBroadcastPayload } from "./_lib/draft-broadcast";
import { shouldRenderScheduleAuthorNames } from "./_lib/editor-visibility";
import { getScheduleRealtimeChannelOptions } from "./_lib/realtime-channel";
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
  buildEmployeeNameById,
  daysBetweenDateKeys,
  DRAFT_CHANGED_BROADCAST_KEY,
  FETCH_WINDOW_RECENTER_BUFFER_DAYS,
  FETCH_WINDOW_RECENTER_THRESHOLD_DAYS,
  FETCH_WINDOW_RETRY_LIMIT,
  formatImportPreviousSkipDescription,
  OPERATION_MODAL_DISMISS_MS,
  PUBLISH_WINDOW_DATE_FORMATTER,
  SCHEDULE_DELETE_BATCH_SIZE,
  widenFetchWindow,
  type ScheduleOperation,
} from "./_lib/operations";
import {
  PublishChangeSummary,
  type PublishActiveEditor,
  type PublishEditorRow,
} from "./_components/PublishChangeSummary";
import { UNATTRIBUTED_EDITOR_ID, computeEditorDraftBreakdowns } from "@/lib/publish-attribution";
import { useQueryClient } from "@tanstack/react-query";
import OrganizationBootstrapRecovery from "@/components/onboarding/OrganizationBootstrapRecovery";
import { queryKeys } from "@/lib/query-keys";
import {
  buildScheduleNoteMap,
  scheduleNoteKey,
  type ScheduleNoteMap,
} from "./_lib/schedule-window";
import {
  beginPublicationRangeLoad,
  completePublicationRangeLoad,
  failPublicationRangeLoad,
  getLoadedPublishedWindowState,
  type PublicationRangeLoadState,
} from "./_lib/publication-range-state";
import { readScheduleWindow, writeScheduleWindow } from "./_lib/schedule-cache";
import { useScheduleImport } from "./_hooks/useScheduleImport";
import {
  Employee,
  EditModalState,
  GridCellId,
  ShiftMap,
  AssignmentDefinition,
  AbsenceType,
  ActiveShiftRequestSummary,
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

/**
 * Editor session ids, keyed by organization and sharing the channel's lifetime.
 *
 * This identifies one editor to everyone else, and the channel's presence key is
 * fixed when the channel is created. Minting a fresh id per mount therefore
 * disagreed with the key the channel still publishes under, and a leftover entry
 * from the previous mount read as a second session for the same account: the
 * account saw a phantom "schedule open elsewhere" against itself. A separate
 * browser tab is a separate module instance, so genuinely distinct sessions
 * still get distinct ids.
 */
const scheduleEditorSessionIds = new Map<string, string>();

/** How long teardown waits for a joining channel to settle before forcing it. */
const CHANNEL_SETTLE_TIMEOUT_MS = 5_000;

function newEditorSessionId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `editor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function SchedulerContent() {
  const isMobile = useMediaQuery(MOBILE);
  const shouldAutoUseOneWeek = useMediaQuery(AUTO_ONE_WEEK);
  const { user: authUser } = useAuth();
  const { signOut } = useLogout();
  const {
    canEditShifts,
    canEditNotes,
    canEditScheduleIndicators,
    canApplyRecurringSchedule,
    canViewRecurringShifts,
    canManageShiftSeries,
    canPublishSchedule,
    canApproveShiftRequests,
    canManageEmployees,
    canViewDashboardAnalytics,
    isSuperAdmin,
    isGridmaster,
    isLoading: permsLoading,
    orgId,
  } = usePermissions();
  const featureFlags = useClientFeatureFlags();
  // Schedulers/staff managers always see every open shift, as a filling
  // tool, regardless of the org's openShiftVisibility setting or their own
  // personal eligibility for a given shift (see openShifts memo below).
  const canSeeAllOpenShifts = canEditShifts || canManageEmployees || isSuperAdmin || isGridmaster;
  // Org-wide staffing shortfalls are a management view, not staff-facing. The
  // same flag gates /api/dashboard/analytics, and authz already derives it from
  // any scheduling capability, so regular staff (and benched accounts) lose the
  // Coverage button while keeping the open shifts they can volunteer for.
  const canViewCoveragePanel = canViewDashboardAnalytics;
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
    assignmentNameMap,
    absenceTypes,
    allAbsenceTypes,
    absenceTypeMap,
    coverageRequirements,
    departments,
    loading: orgLoading,
    loadError,
    bootstrapRetryable,
  } = useOrganizationData();
  // Use orgId from JWT (available immediately) so employee fetch starts
  // in parallel with org data instead of waiting for it.
  const {
    employees,
    inactiveEmployees,
    removedEmployees,
    loading: empLoading,
  } = useEmployees(orgId ?? org?.id ?? null);
  // Assignment controls stay active-staff-only. Historical schedule feedback
  // still needs names for every employee referenced by an older schedule.
  const employeeDirectory = useMemo(
    () => [...employees, ...inactiveEmployees, ...removedEmployees],
    [employees, inactiveEmployees, removedEmployees],
  );
  const employeeNameById = useMemo(
    () => buildEmployeeNameById(employeeDirectory),
    [employeeDirectory],
  );
  const [presenceProfiles, setPresenceProfiles] = useState<Map<string, PresenceProfile>>(
    () => new Map(),
  );
  // Ids already looked up, successes and misses alike, so a member with no
  // employee record is not re-requested every time the roster is opened.
  const requestedPresenceProfileIdsRef = useRef(new Set<string>());
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

  // "Today" is evaluated in the organization's timezone, not the viewer's
  // browser timezone, so the grid highlights the right day for staff and
  // managers viewing the schedule from elsewhere (e.g. a manager traveling
  // ahead of or behind the facility's local day).
  const orgTimeZone = org?.timezone ?? null;
  const todayKey = useMemo(() => getIsoDateInTimeZone(today, orgTimeZone), [today, orgTimeZone]);

  // A local-midnight Date standing in for "today" that's already resolved to
  // the org's calendar day, safe to feed into the local-getter week/month/
  // pay-period math below without re-introducing the device-timezone skew.
  const todayAnchor = useMemo(() => parseLocalDateKey(todayKey), [todayKey]);

  // Refresh `today` when the organization's local calendar day changes.
  // Polls rather than scheduling a single device-midnight timeout, since the
  // org's midnight can fall at any point in the viewer's day depending on
  // their offset from the org's timezone.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = new Date();
      if (getIsoDateInTimeZone(now, orgTimeZone) !== getIsoDateInTimeZone(today, orgTimeZone)) {
        setToday(now);
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [today, orgTimeZone]);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTimeTick(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  // Default date range for shift fetching: ±90 days from today. Used only to
  // seed/reset the actually-loaded window below — never as a fetch bound
  // directly, since the loaded window must follow navigation (see the
  // "sync loaded window to current view" effect further down).
  const defaultShiftFetchStart = useMemo(() => formatDateKey(addDays(today, -90)), [today]);
  const defaultShiftFetchEnd = useMemo(() => formatDateKey(addDays(today, 90)), [today]);

  // Holds the schedule window snapshot across navigations — see _lib/schedule-cache.
  const queryClient = useQueryClient();
  const retryOrganizationBootstrap = useCallback(async () => {
    await queryClient.resetQueries({ queryKey: queryKeys.org.bootstrap() });
  }, [queryClient]);

  // The currently-loaded shift/notes window. Starts at the ±90-day default,
  // then widens (or recenters, for a far jump) to follow wherever the user
  // navigates — see the sync effect below. Every existing reader of
  // shiftFetchStart/shiftFetchEnd keeps the same name so it transparently
  // tracks the live window instead of the fixed default.
  const [loadedShiftWindow, setLoadedShiftWindow] = useState(() => ({
    start: defaultShiftFetchStart,
    end: defaultShiftFetchEnd,
  }));
  const shiftFetchStart = loadedShiftWindow.start;
  const shiftFetchEnd = loadedShiftWindow.end;

  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(todayAnchor));
  const [activeFocusArea, setActiveFocusArea] = useState<number | null>(null);
  const [shifts, setShifts] = useState<ShiftMap>({});
  // Ref always points to the latest shifts — used in setShift to read fresh version
  // numbers even when the useCallback closure captures a stale `shifts` object.
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;
  // Serializes DB writes per shift key to prevent race conditions (e.g. edit → undo
  // firing before the edit's DB write completes, causing an optimistic lock conflict).
  const pendingShiftWrites = useRef<Map<string, Promise<void>>>(new Map());
  const [notes, setNotes] = useState<ScheduleNoteMap>({});
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const [editPanel, setEditPanel] = useState<EditModalState | null>(null);
  const editPanelRef = useRef<EditModalState | null>(null);
  editPanelRef.current = editPanel;
  const [editSessionDraft, setEditSessionDraft] = useState<EditSessionDraft | null>(null);
  const editSessionDraftRef = useRef<EditSessionDraft | null>(null);
  editSessionDraftRef.current = editSessionDraft;
  const isApplyingEditSessionRef = useRef(false);
  const [preferredSpan, setPreferredSpan] = useState<1 | 2 | "month">(2);
  // Auto-downgrade 2-week to 1-week on cramped tablet and small-desktop widths.
  // Wider desktops keep 2-week available and rely on the grid's readable min widths.
  const spanWeeks: 1 | 2 | "month" = resolveScheduleSpan(preferredSpan, shouldAutoUseOneWeek);
  useEffect(() => {
    setWeekStart((current) => realignTwoWeekScheduleStart(current, spanWeeks, payPeriodStartDate));
  }, [payPeriodStartDate, spanWeeks]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  // Set when the grid has been seeded from the previous visit's snapshot.
  // Deliberately separate from scheduleLoading, which still has to mean "a
  // fetch is in flight" — the draft-visibility and window-sync effects below
  // both gate on it to avoid racing the initial load, so clearing it early
  // would let them fire mid-flight and fight over setShifts.
  const [paintedFromSnapshot, setPaintedFromSnapshot] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [scheduleSortBy, setScheduleSortBy] = useState<"seniority" | "name">(() => {
    if (typeof window === "undefined") return "seniority";
    return localStorage.getItem("dg-schedule-sort-by") === "name" ? "name" : "seniority";
  });
  const handleSortByChange = useCallback((value: "seniority" | "name") => {
    setScheduleSortBy(value);
    localStorage.setItem("dg-schedule-sort-by", value);
  }, []);
  // My Schedule mode: for regular users, default to showing only their own shifts
  const [isPublishing, setIsPublishing] = useState(false);
  const [cancelingMode, setCancelingMode] = useState<null | "mine" | "all">(null);
  const [, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [isApplyingRecurring, setIsApplyingRecurring] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [activePrintConfig, setActivePrintConfig] = useState<PrintConfig | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showAutoFillConfirm, setShowAutoFillConfirm] = useState(false);
  const [autoFillPreview, setAutoFillPreview] = useState<{
    count: number;
    dateRange: string;
    cellKeys: string[];
  } | null>(null);
  const [pendingSeriesDelete, setPendingSeriesDelete] = useState<{
    seriesId: string;
    shiftCount: number;
  } | null>(null);
  const [publishHistory, setPublishHistory] = useState<PublishHistoryEntry[]>([]);
  const [showPublishDiff, setShowPublishDiff] = useState(false);
  const [showPublishHistory, setShowPublishHistory] = useState(false);
  const lastViewedRef = useRef<string | null>(null);
  const hasShownChangeToast = useRef(false);
  const [activeOperation, setActiveOperation] = useState<ScheduleOperation | null>(null);
  const [isCreatingRepeatSeries, setIsCreatingRepeatSeries] = useState(false);
  const operationDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationTrickleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Coverage Panel ─────────────────────────────────────────────────────────
  const [showCoveragePanel, setShowCoveragePanel] = useState(false);

  // ── Shift Requests (pickup & swap) ────────────────────────────────────────
  const [showRequestBoard, setShowRequestBoard] = useState(false);

  const currentEmpId = useMemo(
    () => (authUser ? (employees.find((e) => e.userId === authUser.id)?.id ?? null) : null),
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
  const [calloffOpenShifts, setCalloffOpenShifts] = useState<GridOpenShift[]>([]);
  const [publicationRangeState, setPublicationRangeState] = useState<PublicationRangeLoadState>(
    () => beginPublicationRangeLoad(),
  );
  const publishedDateRanges = publicationRangeState.ranges;
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
      shiftRequests.loading || shiftRequests.error ? calloffOpenShifts : liveCalloffOpenShifts,
    [calloffOpenShifts, liveCalloffOpenShifts, shiftRequests.error, shiftRequests.loading],
  );

  const monthStart = useMemo(
    () => new Date(weekStart.getFullYear(), weekStart.getMonth(), 1),
    [weekStart],
  );
  const currentPublishWindow = useMemo(() => {
    const startDate = spanWeeks === "month" ? new Date(monthStart) : new Date(weekStart);
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

  // Formatted "start–end" label per out-of-window group, shared by the
  // summary sentence (so it names every period, not just a count) and the
  // jump-to-period buttons below it.
  const outOfWindowDraftGroupRanges = useMemo(
    () =>
      outOfWindowDraftGroups.map((group) => {
        const end =
          spanWeeks === "month"
            ? new Date(group.periodStart.getFullYear(), group.periodStart.getMonth() + 1, 0)
            : addDays(group.periodStart, spanWeeks * 7 - 1);
        return `${formatDate(group.periodStart)}–${formatDate(end)}`;
      }),
    [outOfWindowDraftGroups, spanWeeks],
  );

  const hasUnpublishedChanges = draftBreakdown.totalChanges > 0;

  const editorBreakdowns = useMemo(
    () => computeEditorDraftBreakdowns(shifts, notes, authUser?.id ?? null, publishWindowDateRange),
    [shifts, notes, authUser?.id, publishWindowDateRange],
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
    (kind: ScheduleOperation["kind"], updates: Partial<Omit<ScheduleOperation, "kind">>) => {
      setActiveOperation((current) => {
        if (!current || current.kind !== kind) return current;
        return {
          ...current,
          ...updates,
          progress: updates.progress == null ? current.progress : clampProgress(updates.progress),
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

  /**
   * Establish the presence identity as early as possible.
   *
   * Presence and cell locking both key off this, and `lockCell` is a no-op
   * without it. It used to be resolved at the tail of the schedule fetch, so
   * every page load had a window where the editor published no avatar and
   * clicking a cell silently took no lock. `authUser` already carries the id,
   * which is the only part either mechanism needs; the display name starts as
   * a readable fallback and is upgraded when the identity call returns.
   */
  useEffect(() => {
    if (!authUser) {
      setCurrentUser(null);
      return;
    }

    // Publish presence exactly once per identity. Each track() adds its own
    // presence entry rather than replacing the previous one, so announcing a
    // provisional name and then correcting it left two entries for one editor,
    // and untracking on leave only cleared one. The leftover kept that person
    // looking present to everyone else. Resolving the name first still shows
    // the avatar promptly: this is one short call, not the whole grid load.
    let cancelled = false;
    void fetchAccountIdentity()
      .then((identity) => {
        if (cancelled) return;
        const name = identity.displayName || authUser.email?.split("@")[0] || "Unknown";
        setCurrentUser((prev) =>
          prev?.id === authUser.id && prev.name === name ? prev : { id: authUser.id, name },
        );
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = authUser.email?.split("@")[0] || "Unknown";
        setCurrentUser((prev) =>
          prev?.id === authUser.id ? prev : { id: authUser.id, name: fallback },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [authUser]);
  const orgIdForSession = org?.id ?? null;
  const editorSessionId = useMemo(() => {
    if (!orgIdForSession) return newEditorSessionId();
    const existing = scheduleEditorSessionIds.get(orgIdForSession);
    if (existing) return existing;
    const created = newEditorSessionId();
    scheduleEditorSessionIds.set(orgIdForSession, created);
    return created;
  }, [orgIdForSession]);
  const editorSessionIdRef = useRef(editorSessionId);
  editorSessionIdRef.current = editorSessionId;
  const [showSessionEndedDialog, setShowSessionEndedDialog] = useState(false);
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
    (shift: ShiftMap[string] | null, notesByFocusArea: Record<number, DraftNoteState[]>): string =>
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
    ): boolean => buildEditSessionFingerprint(draftShift, draftNotes) !== baseFingerprint,
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
  const [bulkDeleteSelectedKeys, setBulkDeleteSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [showBulkDeleteReview, setShowBulkDeleteReview] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [pendingPasteOver, setPendingPasteOver] = useState<{
    empId: string;
    date: Date;
    existingLabel: string;
    pasteEntry: ScheduleCellInput;
  } | null>(null);
  const [pendingClaimShift, setPendingClaimShift] = useState<GridOpenShift | null>(null);
  const [isClaimShiftPending, setIsClaimShiftPending] = useState(false);
  // Read-only info view for scheduler/admin viewers who can see every open
  // shift but aren't personally eligible to claim a given one for themselves.
  const [openShiftDetails, setOpenShiftDetails] = useState<GridOpenShift | null>(null);
  const [pendingCoverageGapVolunteer, setPendingCoverageGapVolunteer] = useState<{
    assignmentLabel: string;
    date: string;
    focusAreaId: number;
    input: ScheduleCellInput;
  } | null>(null);
  const [isCoverageGapVolunteerPending, setIsCoverageGapVolunteerPending] = useState(false);

  const realtimeChannelRef = useRef<BrowserRealtimeChannel | null>(null);
  const draftChangedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  //
  // `opts.ensureStart` / `opts.ensureEnd` widen the fetch window beyond the
  // currently-loaded one when a caller knows it just touched a date outside
  // that band (e.g. import-previous into a far-out period). `opts.recenter`
  // replaces the loaded window with `[ensureStart, ensureEnd]` outright
  // instead of widening — used when a navigation jump is far enough that
  // widening would approach the server's 366-day range cap (see the
  // "sync loaded window to current view" effect below). The default
  // behavior is unchanged for callers that don't pass anything, and every
  // fetch (widened, recentered, or default) persists its actual bounds into
  // `loadedShiftWindow` so subsequent bare calls keep tracking the live window.
  const refetchScheduleData = useCallback(
    async (opts?: { ensureStart?: string; ensureEnd?: string; recenter?: boolean }) => {
      if (!org) return;
      const { start, end } =
        opts?.recenter && opts.ensureStart && opts.ensureEnd
          ? { start: opts.ensureStart, end: opts.ensureEnd }
          : widenFetchWindow(shiftFetchStart, shiftFetchEnd, opts);
      const [shiftData, noteRows] = await Promise.all([
        fetchShifts(
          org.id,
          canEditShiftsRef.current,
          assignmentLabelMapRef.current,
          absenceTypeMapRef.current,
          start,
          end,
          segmentCompatibility,
        ),
        fetchScheduleNotes(org.id, start, end),
      ]);
      const noteMap = buildScheduleNoteMap(noteRows);
      setShifts(shiftData);
      setNotes(noteMap);
      setLoadedShiftWindow({ start, end });
      writeScheduleWindow(queryClient, org.id, {
        window: { start, end },
        shifts: shiftData,
        notes: noteMap,
        canEditShifts: canEditShiftsRef.current,
      });
      lastRefetchAtRef.current = Date.now();
      return { shiftData, noteMap };
    },
    [org, shiftFetchStart, shiftFetchEnd],
  );

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
      setLoadedShiftWindow({ start: defaultShiftFetchStart, end: defaultShiftFetchEnd });
      setPublicationRangeState(beginPublicationRangeLoad());
    }
    if (orgLoading || !org || scheduleLoadStarted.current) return;
    scheduleLoadStarted.current = true;
    initialLoadUsedEditPerms.current = canEditShifts;
    const orgId = org.id;

    // Paint the previous visit's grid immediately while the fetch below
    // refreshes it. Coming back to /schedule otherwise blocked on refetching
    // the whole default window before anything rendered. readScheduleWindow
    // returns null unless the snapshot is this org's and was taken under the
    // same edit permission, so a stale or wrong-shaped grid never shows.
    const cachedWindow = readScheduleWindow(queryClient, orgId, canEditShifts);
    if (cachedWindow) {
      setShifts(cachedWindow.shifts);
      setNotes(cachedWindow.notes);
      setLoadedShiftWindow(cachedWindow.window);
      setPaintedFromSnapshot(true);
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
        ] = await Promise.all([
          fetchShifts(
            orgId,
            canEditShifts,
            assignmentLabelMap,
            absenceTypeMap,
            defaultShiftFetchStart,
            defaultShiftFetchEnd,
            segmentCompatibility,
          ),
          fetchScheduleNotes(orgId, defaultShiftFetchStart, defaultShiftFetchEnd),
          canViewRecurringShifts
            ? fetchRecurringShifts(orgId, undefined, assignmentLabelMap, false, absenceTypeMap)
            : Promise.resolve([] as RecurringShift[]),
          getScheduleLastViewed(orgId).catch(() => null),
          fetchCalloffOpenShifts(
            orgId,
            defaultShiftFetchStart,
            defaultShiftFetchEnd,
            assignmentLabelMap,
          ).catch((err) => {
            Sentry.captureException(err, {
              tags: { component: "calloff_open_shifts" },
              extra: {
                context: "schedule.initial_calloff_open_shifts",
                orgId,
                startDate: defaultShiftFetchStart,
                endDate: defaultShiftFetchEnd,
              },
            });
            toast.error("We couldn't load the open shifts. Refresh and try again.");
            return [] as GridOpenShift[];
          }),
          fetchPublishedDateRanges(orgId, defaultShiftFetchStart, defaultShiftFetchEnd)
            .then(completePublicationRangeLoad)
            .catch((err) => {
              Sentry.captureException(err, {
                extra: {
                  context: "schedule.initial_published_ranges",
                  orgId,
                  startDate: defaultShiftFetchStart,
                  endDate: defaultShiftFetchEnd,
                },
              });
              return failPublicationRangeLoad();
            }),
        ]);

        lastViewedRef.current = lastViewed;
        setLoadedShiftWindow({ start: defaultShiftFetchStart, end: defaultShiftFetchEnd });

        // Fetch publish history since user's last view; if there's no last
        // view yet (brand-new user), the API returns no entries.
        const recentPublishes = await fetchRecentPublishHistory(orgId, lastViewed).catch(
          () => [] as PublishHistoryEntry[],
        );

        const noteMap = buildScheduleNoteMap(noteRows);
        setShifts(shiftData);
        setNotes(noteMap);
        writeScheduleWindow(queryClient, orgId, {
          window: { start: defaultShiftFetchStart, end: defaultShiftFetchEnd },
          shifts: shiftData,
          notes: noteMap,
          canEditShifts,
        });
        setRecurringShifts(recShifts);
        setCalloffOpenShifts(initialCalloffOpenShifts);
        setPublicationRangeState(initialPublishedDateRanges);
        if (recentPublishes.length > 0) setPublishHistory(recentPublishes);

        // Show "what changed" toast once per mount
        if (recentPublishes.length > 0 && !hasShownChangeToast.current) {
          hasShownChangeToast.current = true;
          const allChanges = recentPublishes.flatMap((e) => e.changes);
          const newCount = allChanges.filter((c) => c.kind === "new").length;
          const modCount = allChanges.filter((c) => c.kind === "modified").length;
          const delCount = allChanges.filter((c) => c.kind === "deleted").length;
          const parts: string[] = [];
          if (newCount > 0) parts.push(`${newCount} new`);
          if (modCount > 0) parts.push(`${modCount} modified`);
          if (delCount > 0) parts.push(`${delCount} removed`);
          if (parts.length > 0) {
            toast.info(
              `${allChanges.length} shift${allChanges.length !== 1 ? "s" : ""} changed since your last visit: ${parts.join(", ")}`,
              { duration: 6000 },
            );
          }
        }

        // Fire-and-forget: update last-viewed timestamp for this user
        void updateScheduleLastViewed(orgId);
      } catch (err) {
        Sentry.captureException(err);
      } finally {
        setScheduleLoading(false);
      }
    }
    loadSchedule();
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
    refreshPresence,
    clearPresenceState,
    endCurrentSession,
    removeRemoteSession,
    onlineUsers,
    sameAccountSessions,
    isSessionEnded,
    syncPresence,
    announceEditingCell,
    handleEditingCellBroadcast,
    editingCells,
  } = useSchedulePresence(
    realtimeChannelRef,
    currentUser,
    editorSessionId,
    isScheduleEditor,
    isScheduleEditor,
    sendReliableBroadcast,
  );
  /**
   * Who else has each cell open. Informational only: the grid draws a marker and
   * nothing consults it before allowing an edit.
   */
  const localSessionEndedRef = useRef(isSessionEnded);
  localSessionEndedRef.current = isSessionEnded;

  /**
   * Editor display names for the publish confirmation, resolved only when that
   * dialog is opened. Authors are user ids, and the people who left drafts
   * behind are frequently not online, so their names cannot come from presence.
   */
  const [editorNames, setEditorNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!showPublishConfirm || !org) return;
    const missing = editorBreakdowns
      .filter((row) => !row.isCurrentUser && row.editorId !== UNATTRIBUTED_EDITOR_ID)
      .map((row) => row.editorId)
      .filter((id) => !(id in editorNames));
    if (missing.length === 0) return;

    let cancelled = false;
    void fetchScheduleActorNames({ ids: missing, orgId: org.id })
      .then(({ names }) => {
        if (cancelled) return;
        setEditorNames((prev) => ({ ...prev, ...names }));
      })
      // Names are an enhancement; the dialog still shows correct counts without
      // them, so a failure must not block publishing.
      .catch((error) => Sentry.captureException(error));
    return () => {
      cancelled = true;
    };
  }, [showPublishConfirm, org, editorBreakdowns, editorNames]);

  /**
   * Everyone else on the schedule right now, drafts or not. Publish no longer
   * blocks on cell locks, so this is what tells the publisher that someone is
   * mid-change. Draft-based rows cannot cover it: a colleague who has just
   * started has nothing attributed to them yet.
   */
  const publishActiveEditors = useMemo<PublishActiveEditor[]>(
    () =>
      onlineUsers
        .filter((user) => !user.isSameUser)
        .map((user) => ({ userId: user.userId, name: user.userName })),
    [onlineUsers],
  );

  const publishEditorRows = useMemo<PublishEditorRow[]>(() => {
    const onlineUserIds = new Set(onlineUsers.map((user) => user.userId));
    return editorBreakdowns.map((row) => ({
      ...row,
      name: editorNames[row.editorId] ?? null,
      isOnline: onlineUserIds.has(row.editorId),
    }));
  }, [editorBreakdowns, editorNames, onlineUsers]);

  /**
   * Loads role and email for the editors on screen, only once the roster is
   * actually opened. A failure is silent by design: the card degrades to names,
   * which is still useful, and a popover is no place for an error toast.
   */
  const handlePresenceRosterOpen = useCallback(() => {
    if (!org) return;
    const missing = onlineUsers
      .filter((user) => !user.isSameUser)
      .map((user) => user.userId)
      .filter((userId) => !requestedPresenceProfileIdsRef.current.has(userId));
    if (missing.length === 0) return;

    for (const userId of missing) requestedPresenceProfileIdsRef.current.add(userId);

    void fetchSchedulePresenceProfiles({ orgId: org.id, userIds: missing })
      .then(({ profiles }) => {
        if (profiles.length === 0) return;
        setPresenceProfiles((prev) => {
          const next = new Map(prev);
          for (const profile of profiles) {
            next.set(profile.userId, { orgRole: profile.orgRole, email: profile.email });
          }
          return next;
        });
      })
      .catch((error) => {
        // Allow a retry on the next open rather than caching the failure.
        for (const userId of missing) requestedPresenceProfileIdsRef.current.delete(userId);
        Sentry.captureException(error);
      });
  }, [onlineUsers, org]);
  /**
   * The half of the cell guard that is never negotiable: an ended editor
   * session must not mutate anything. Split out so range-wide actions can
   * enforce it without also inheriting per-cell lock blocking.
   */
  const guardActiveSession = useCallback((): boolean => {
    if (localSessionEndedRef.current) {
      setShowSessionEndedDialog(true);
      return false;
    }
    return true;
  }, []);

  const {
    importPreview,
    importResults,
    showImportConfirm,
    showImportResults,
    isImportingPrevious,
    handleImportPreviousPreview,
    handleImportPrevious,
    cancelImportConfirm,
    closeImportResults,
  } = useScheduleImport({
    org,
    spanWeeks,
    weekStart,
    employeeNameById,
    refetchScheduleData,
    startScheduleOperation,
    updateScheduleOperation,
    finishScheduleOperation,
    clearScheduleOperation,
    canMutateCells: guardActiveSession,
  });
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
    [publishHistory, publishWindowDateRange.endDateKey, publishWindowDateRange.startDateKey],
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
    [publishHistory, publishWindowDateRange.endDateKey, publishWindowDateRange.startDateKey],
  );

  // Per-banner dismissals, persisted to sessionStorage so the X actually
  // sticks — surviving the data-change re-renders that previously kept
  // re-showing the banner. Each is keyed by a signature describing what was
  // dismissed, so closing one notice never swallows the *next* one. Hiding is
  // UI-only: drafts and publish history are not touched, and the dismissal
  // clears on sign-out via the dg_* sweep in clearDubgridSessionState.
  const { isDismissed: outOfWindowDraftsDismissed, dismiss: dismissOutOfWindowDrafts } =
    useDismissibleBanner(
      "schedule-out-of-window-drafts",
      outOfWindowDraftGroups
        .map((group) => `${formatDateKey(group.periodStart)}:${group.count}`)
        .join("|"),
    );
  const {
    isDismissed: publishBannerDismissed,
    dismiss: dismissPublishBanner,
    reset: resetPublishBanner,
  } = useDismissibleBanner(
    "schedule-publish",
    inWindowPublishHistory.map((entry) => entry.publishedAt).join("|"),
  );
  const { isDismissed: outOfWindowPublishesDismissed, dismiss: dismissOutOfWindowPublishes } =
    useDismissibleBanner(
      "schedule-out-of-window-publishes",
      outOfWindowPublishHistory.map((entry) => entry.publishedAt).join("|"),
    );

  // Build a lookup map from in-window publish history changes for O(1) access.
  // Iterate oldest→newest so the most recent publish wins per cell key.
  const publishChangesMap = useMemo(() => {
    if (inWindowPublishHistory.length === 0) return null;
    const map = new Map<string, PublishChange & { publishedAt: string; publishedBy: string }>();
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

  // What the "Highlight Changes" toggle puts on the grid, counted by kind so
  // the banner can name and key each one. A publish can carry any mix of new,
  // edited and deleted cells.
  const publishChangeCounts = useMemo(() => {
    const counts = { newShifts: 0, modifiedShifts: 0, deletedShifts: 0 };
    if (!publishChangesMap) return counts;
    for (const change of publishChangesMap.values()) {
      if (change.kind === "new") counts.newShifts += 1;
      else if (change.kind === "deleted") counts.deletedShifts += 1;
      else counts.modifiedShifts += 1;
    }
    return counts;
  }, [publishChangesMap]);

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
    announceEditingCell(null);
    setEditPanel(null);
    setEditSessionDraft(null);
  }, [announceEditingCell]);

  const endLocalScheduleEditor = useCallback(() => {
    localSessionEndedRef.current = true;
    // Retire this editor session id. The termination marker is durable and
    // keyed by that id, so reusing it meant every later mount read the same
    // marker and ended itself again: leaving and returning to the schedule
    // never recovered, and only a full reload did. Ending applies to this
    // visit; coming back mints a fresh identity, which also stops peers
    // matching it against the session they tombstoned.
    if (orgIdForSession) scheduleEditorSessionIds.delete(orgIdForSession);
    endCurrentSession();
    setEditPanel(null);
    setEditSessionDraft(null);
    setPendingPasteOver(null);
    setPendingClearShift(null);
    setPendingSeriesDelete(null);
    setContextMenu(null);
    setIsBulkDeleteMode(false);
    setShowBulkDeleteReview(false);
    setShowDiscardConfirm(false);
    setShowPublishConfirm(false);
    setShowAutoFillConfirm(false);
    setAutoFillPreview(null);
    cancelImportConfirm();
    setShowSessionEndedDialog(true);
  }, [cancelImportConfirm, endCurrentSession, orgIdForSession]);

  const checkCurrentScheduleEditorSession = useCallback(async (): Promise<boolean> => {
    if (!org || !isScheduleEditor) return isSessionEnded;
    if (localSessionEndedRef.current) return true;

    const status = await fetchScheduleEditorSessionStatus({
      orgId: org.id,
      editorSessionId: editorSessionIdRef.current,
    });
    if (status.ended) {
      endLocalScheduleEditor();
      return true;
    }
    return false;
  }, [endLocalScheduleEditor, isScheduleEditor, isSessionEnded, org]);

  const handleEndOtherScheduleSessions = useCallback(async () => {
    if (!org || sameAccountSessions.length === 0) return;

    if (sameAccountSessions.length > 20) {
      toast.error(
        "Too many schedule sessions were detected to end safely at once. Close unused tabs, then try again.",
      );
      return;
    }
    const targetEditorSessionIds = sameAccountSessions.map((session) => session.editorSessionId);

    try {
      await endScheduleEditorSessions({
        orgId: org.id,
        targetEditorSessionIds,
        endingEditorSessionId: editorSessionIdRef.current,
      });
    } catch (error) {
      Sentry.captureException(error);
      toast.error("We couldn't end the other schedule sessions. Try again.");
      return;
    }

    // The single API write above commits every durable marker before any
    // best-effort Realtime notification is sent.
    for (const targetEditorSessionId of targetEditorSessionIds) {
      removeRemoteSession(targetEditorSessionId);
    }

    const channel = realtimeChannelRef.current;
    const deliveryStatuses =
      channel?.state === "joined"
        ? await Promise.all(
            targetEditorSessionIds.map(async (targetEditorSessionId) => {
              try {
                return await channel.send({
                  type: "broadcast",
                  event: "editor_session_ended",
                  payload: {
                    userId: currentUserRef.current?.id,
                    targetEditorSessionId,
                    endingEditorSessionId: editorSessionIdRef.current,
                  },
                });
              } catch (error) {
                Sentry.captureException(error);
                return null;
              }
            }),
          )
        : [];

    if (
      deliveryStatuses.length === targetEditorSessionIds.length &&
      deliveryStatuses.every((status) => status === "ok")
    ) {
      toast.success("The other schedule sessions were ended. You can use this tab now.");
    } else {
      toast.warning(
        "The other schedule sessions were ended. Their warnings may be delayed until they reconnect.",
      );
    }
  }, [org, removeRemoteSession, sameAccountSessions]);

  // Refs for realtime callbacks — allows the channel effect to depend only on
  // [org] while still calling the latest versions of these functions.
  const syncPresenceRef = useRef(syncPresence);
  syncPresenceRef.current = syncPresence;
  const handleEditingCellBroadcastRef = useRef(handleEditingCellBroadcast);
  handleEditingCellBroadcastRef.current = handleEditingCellBroadcast;
  const announceEditingCellRef = useRef(announceEditingCell);
  announceEditingCellRef.current = announceEditingCell;
  /** The cell this tab has open, for re-announcing on subscribe and on a peer joining. */
  const currentCellKeyRef = useRef<string | null>(null);
  const refreshPresenceRef = useRef(refreshPresence);
  refreshPresenceRef.current = refreshPresence;
  const checkCurrentScheduleEditorSessionRef = useRef(checkCurrentScheduleEditorSession);
  checkCurrentScheduleEditorSessionRef.current = checkCurrentScheduleEditorSession;
  const removeRemoteSessionRef = useRef(removeRemoteSession);
  removeRemoteSessionRef.current = removeRemoteSession;
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

    const channelName = `schedule:${org.id}`;
    // Both flags belong to this effect run, not to the component. They were
    // briefly refs, which meant a later run reset the flag an earlier run's
    // pending async setup was about to check: the stale run then built a second
    // channel for the same topic, and whichever lost the race was handed the
    // already-subscribed one and threw while attaching handlers, killing that
    // mount's realtime. Strict Mode reuses one component instance across
    // mount/cleanup/mount, so shared refs are exactly the wrong lifetime here.
    let disposed = false;
    let hadError = false;
    // Resolves once subscribe() reports a terminal status. Tearing a channel
    // down while it is still joining drops it locally without a clean leave,
    // and the join then lands server-side with nobody left to untrack it. Those
    // stranded entries accumulate under this client's presence key, which is
    // what kept an editor looking present after the first navigation away.
    let settle: () => void = () => {};
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });

    // Every mount gets its own channel. Handlers close over this mount's refs,
    // so a channel kept across mounts would keep dispatching into the unmounted
    // one: the new page would receive no presence or broadcast events at all
    // and sit frozen on whatever it last saw.
    //
    // Channels are cached by topic, and attaching handlers to one that is still
    // subscribed throws and aborts this effect, so wait for any survivor from a
    // previous mount to actually go away first.
    let channel: ReturnType<typeof createBrowserRealtimeChannel> | null = null;
    void (async () => {
      for (const stale of getBrowserRealtimeChannels()) {
        if (stale.topic !== channelName && stale.topic !== `realtime:${channelName}`) continue;
        try {
          await removeBrowserRealtimeChannel(stale);
        } catch {
          // Best effort; creation below still yields a usable channel.
        }
      }
      if (disposed) return;

      channel = createBrowserRealtimeChannel(
        channelName,
        getScheduleRealtimeChannelOptions(editorSessionIdRef.current),
      )
        .on("broadcast", { event: "schedule_published" }, async () => {
          try {
            await refetchScheduleDataRef.current();
            await refetchPublishedRangesRef.current();
            const history = await fetchRecentPublishHistory(org.id, lastViewedRef.current);
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
            if (msg.payload?.senderSessionId === editorSessionIdRef.current) {
              return;
            }

            const p = msg.payload;
            if (p?.shifts) {
              const shiftUpdates = p.shifts as Record<string, ShiftMap[string] | null>;
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
              const noteUpdates = p.notes as ScheduleNoteMap;
              setNotes((prev) => ({ ...prev, ...noteUpdates }));
            }
            // A broadcast that carried a diff has already been applied above, and
            // the sender built it from the cells the server handed back, so it is
            // authoritative — there is nothing left to ask for. Refetching anyway
            // meant one scheduler editing one cell made every other open tab pull
            // the org's whole loaded window two seconds later.
            //
            // A payload-less broadcast is the gap case: the sender is telling us
            // something changed without saying what, so that one still refetches.
            // Reconnect and tab-visibility refetches remain the recovery path for
            // a tab that missed broadcasts entirely.
            if (p?.shifts || p?.notes) return;

            if (draftChangedDebounceRef.current) clearTimeout(draftChangedDebounceRef.current);
            draftChangedDebounceRef.current = setTimeout(async () => {
              try {
                await refetchScheduleDataRef.current();
              } catch (err) {
                Sentry.captureException(err);
              }
            }, 150);
          },
        )
        // Sent by peers as they move around the grid. Informational only: a
        // dropped message means a briefly stale marker, never a blocked cell.
        // a lock change reaches everyone even if the editor that made it has
        // already navigated away.
        .on("broadcast", { event: "editing_cell" }, (msg: { payload?: unknown }) => {
          if (msg.payload) handleEditingCellBroadcastRef.current(msg.payload);
        })
        .on(
          "broadcast",
          { event: "editor_session_ended" },
          async (msg: {
            payload?: {
              userId: string;
              targetEditorSessionId: string;
              endingEditorSessionId: string;
            };
          }) => {
            const payload = msg.payload;
            if (!payload) return;

            if (payload.targetEditorSessionId === editorSessionIdRef.current) {
              try {
                // Broadcast payloads are hints, not authority. The target only
                // shuts down after its owner-scoped durable marker is confirmed.
                await checkCurrentScheduleEditorSessionRef.current();
              } catch (error) {
                Sentry.captureException(error);
              }
              return;
            }

            if (payload.endingEditorSessionId === editorSessionIdRef.current) {
              removeRemoteSessionRef.current(payload.targetEditorSessionId);
            }
          },
        )
        .on("presence", { event: "sync" }, () => syncPresenceRef.current())
        .on("presence", { event: "join" }, () => {
          syncPresenceRef.current();
          announceEditingCellRef.current(currentCellKeyRef.current);
        })
        .on("presence", { event: "leave" }, () => syncPresenceRef.current())
        .subscribe(async (status: string, err?: Error) => {
          if (
            status === "SUBSCRIBED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            settle();
          }
          if (status === "SUBSCRIBED") {
            // Refetch on reconnection to catch events missed during downtime
            if (hadError) {
              hadError = false;
              Promise.all([
                refetchScheduleDataRef.current(),
                refetchPublishedRangesRef.current(),
              ]).catch(() => {});
            }
            if (currentUserRef.current && (canEditShiftsRef.current || canEditNotesRef.current)) {
              // Track presence immediately rather than behind the termination
              // check. That check is an HTTP round trip, and awaiting it meant
              // nobody else saw this editor until it returned. It is not needed
              // as a gate: when it does find the session ended it calls
              // endLocalScheduleEditor, which untracks presence on its own.
              void refreshPresenceRef.current();
              void (async () => {
                try {
                  await checkCurrentScheduleEditorSessionRef.current();
                } catch (error) {
                  // Realtime remains an availability aid. If the status endpoint
                  // is temporarily unavailable, normal version checks still keep
                  // writes safe and the durable marker is checked again later.
                  Sentry.captureException(error);
                }
              })();
            }
            syncPresenceRef.current();
            // Say where this editor is, so peers that joined while we were
            // already in a cell learn our position without waiting for the beat.
            announceEditingCellRef.current(currentCellKeyRef.current);
            await flushPendingBroadcasts();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            hadError = true;
            console.warn("[Realtime] Channel error (auto-retrying):", err ?? "unknown");
          }
        });

      realtimeChannelRef.current = channel;
    })();

    return () => {
      disposed = true;
      announceEditingCell(null);
      void refreshPresence({ removePresence: true });
      clearPresenceState();
      realtimeChannelRef.current = null;
      resetPendingBroadcasts();
      if (draftChangedDebounceRef.current) clearTimeout(draftChangedDebounceRef.current);

      // Untrack directly on the captured channel rather than relying on the
      // queued presence flush above: that flush is skipped whenever one is
      // already in flight, and its deferred retry reads the channel ref this
      // cleanup just cleared, so leaving could complete without telling anyone.
      //
      // Both calls are issued without awaiting, and removal is never delayed
      // behind the untrack. Channels are cached by topic, and this topic is
      // stable across mounts, so holding removal back means a remount is handed
      // the still-subscribed channel and throws when it attaches handlers.
      // Removal also unsubscribes, which is what makes the server drop this
      // client's presence, so it is the reliable half of the leave anyway.
      // Untrack first so peers see the leave, then remove. Removal is issued
      // without awaiting: it also unsubscribes, and delaying it hands the next
      // mount a still-subscribed channel.
      const active = channel;
      if (active) {
        void (async () => {
          if (active.state !== "joined") {
            // Let the join finish (or fail) first, so the untrack below is a
            // real leave rather than a no-op against a half-joined channel.
            await Promise.race([
              settled,
              new Promise((resolve) => setTimeout(resolve, CHANNEL_SETTLE_TIMEOUT_MS)),
            ]);
          }
          try {
            await active.untrack();
          } catch {
            // Already gone; removal below still cleans up.
          }
          await removeBrowserRealtimeChannel(active);
        })();
      }
    };
  }, [
    clearPresenceState,
    createBrowserRealtimeChannel,
    flushPendingBroadcasts,
    org,
    resetPendingBroadcasts,
    removeBrowserRealtimeChannel,
    announceEditingCell,
    refreshPresence,
  ]);

  // Track presence once currentUser and schedule-editor permissions are available.
  // Handles the case where the channel subscribes before user profile loads.
  useEffect(() => {
    const channel = realtimeChannelRef.current;
    if (!channel || !currentUser || !isScheduleEditor) return;
    if (channel.state !== "joined") return;

    // Presence goes out first. On a cold load the profile resolves after the
    // channel subscribes, so this is the path that usually publishes presence,
    // and gating it on the termination round trip is what kept avatars from
    // appearing promptly. An ended session untracks itself from within the
    // check, so running the two concurrently stays correct.
    void refreshPresence();
    void checkCurrentScheduleEditorSession().catch((error) => Sentry.captureException(error));

    // A cell opened before identity resolved has not been announced yet, so
    // peers would not see this editor in it.
    const openPanel = editPanelRef.current;
    if (openPanel) {
      announceEditingCell(`${openPanel.empId}_${formatDateKey(openPanel.date)}`);
    }
  }, [
    checkCurrentScheduleEditorSession,
    currentUser,
    announceEditingCell,
    isScheduleEditor,
    refreshPresence,
  ]);

  // Refetch when the tab regains focus — catches any missed broadcasts
  // (e.g. browser throttled WebSocket while tab was backgrounded).
  // Also re-tracks presence to recover from server-side expiry.
  useEffect(() => {
    if (!org) return;
    const handleVisibilityChange = async () => {
      const channel = realtimeChannelRef.current;
      const isVisible = document.visibilityState === "visible";
      const canEdit = canEditShiftsRef.current || canEditNotesRef.current;

      // Re-publish presence the moment the tab is back, ahead of the
      // termination round trip, so peers see this editor again immediately.
      // An ended session untracks itself from inside that check.
      if (
        isVisible &&
        !isSessionEnded &&
        canEdit &&
        channel &&
        channel.state === "joined" &&
        currentUserRef.current
      ) {
        void refreshPresenceRef.current();
      }

      let ended = isSessionEnded;
      if (isVisible && !ended && canEdit) {
        try {
          ended = await checkCurrentScheduleEditorSessionRef.current();
        } catch (error) {
          Sentry.captureException(error);
        }
      }

      // Coming back with the editor still open: retake the lock we dropped on
      // hide, unless someone else claimed the cell in the meantime.
      if (isVisible && !ended && (canEditShiftsRef.current || canEditNotesRef.current)) {
        const openPanel = editPanelRef.current;
        if (openPanel) {
          announceEditingCell(`${openPanel.empId}_${formatDateKey(openPanel.date)}`);
        }
      }

      // Stop advertising a cell the moment the tab is hidden, so peers do not
      // see a marker for someone who has switched away.
      if (!isVisible) {
        announceEditingCell(null);
        return;
      }

      if (isVisible && Date.now() - lastRefetchAtRef.current > 10_000) {
        Promise.all([refetchScheduleDataRef.current(), refetchPublishedRangesRef.current()]).catch(
          (err) => {
            Sentry.captureException(err);
            toast.error("Couldn't refresh the schedule. Try reloading the page.");
          },
        );
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [org, announceEditingCell, isSessionEnded]);

  useEffect(() => {
    const releasePresence = () => {
      announceEditingCell(null);
      void refreshPresence({ removePresence: true });
      // Also untrack straight on the channel. Sign-out and any other hard
      // navigation tear the page down without a React cleanup, and the queued
      // flush above is skipped whenever one is already in flight, so relying on
      // it left peers showing the avatar until the socket itself timed out.
      // Issuing the send here gives it a chance to leave before teardown.
      const channel = realtimeChannelRef.current;
      if (channel && channel.state === "joined") {
        void channel.untrack().catch(() => {});
      }
    };
    window.addEventListener("pagehide", releasePresence);
    window.addEventListener("beforeunload", releasePresence);
    return () => {
      window.removeEventListener("pagehide", releasePresence);
      window.removeEventListener("beforeunload", releasePresence);
    };
  }, [announceEditingCell, refreshPresence]);

  // Re-fetch with scheduler visibility once permissions resolve, so editors
  // see draft data even if the initial load ran before permissions were ready.
  // Skip if the initial load already used canEditShifts=true (no extra fetch needed).
  const [draftCheckComplete, setDraftCheckComplete] = useState(false);
  useEffect(() => {
    if (permsLoading || !org || scheduleLoading || draftCheckStarted.current) return;
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
        // Restamp the snapshot under the permission it was actually fetched
        // with. Without this the entry keeps the canEditShifts=false written by
        // the initial load, which ran before permissions resolved — and every
        // later visit, arriving with permissions already cached and true, would
        // mismatch and refetch the whole window. That is a guaranteed miss for
        // exactly the schedulers and admins who use this page most.
        writeScheduleWindow(queryClient, org.id, {
          window: { start: shiftFetchStart, end: shiftFetchEnd },
          shifts: draftShifts,
          notes: notesRef.current,
          canEditShifts: true,
        });
      } catch (err) {
        Sentry.captureException(err);
      } finally {
        setDraftCheckComplete(true);
      }
    })();
  }, [permsLoading, org, scheduleLoading, canEditShifts]);

  // Sync the loaded shift/notes window to wherever the user has navigated.
  // Without this, `loadedShiftWindow` stays at its ±90-day default forever —
  // paging far enough forward/backward renders a misleadingly blank grid for
  // periods that actually have data, since nothing ever re-fetches outside
  // that band. Waits on `draftCheckComplete` so this doesn't race the
  // scheduler-visibility re-fetch above (both call fetchShifts + setShifts).
  const isSyncingFetchWindowRef = useRef(false);
  const fetchWindowFailuresRef = useRef(0);
  const fetchWindowRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fetchWindowRetryToken, setFetchWindowRetryToken] = useState(0);
  useEffect(() => {
    if (!org || scheduleLoading || !draftCheckComplete) return;
    if (isSyncingFetchWindowRef.current) return;

    const needed = publishWindowDateRange;
    const isContained =
      needed.startDateKey >= loadedShiftWindow.start && needed.endDateKey <= loadedShiftWindow.end;
    if (isContained) return;

    const widened = widenFetchWindow(loadedShiftWindow.start, loadedShiftWindow.end, {
      ensureStart: needed.startDateKey,
      ensureEnd: needed.endDateKey,
    });
    const shouldRecenter =
      daysBetweenDateKeys(widened.start, widened.end) > FETCH_WINDOW_RECENTER_THRESHOLD_DAYS;

    const fetchOpts = shouldRecenter
      ? {
          ensureStart: formatDateKey(
            addDays(
              new Date(`${needed.startDateKey}T00:00:00`),
              -FETCH_WINDOW_RECENTER_BUFFER_DAYS,
            ),
          ),
          ensureEnd: formatDateKey(
            addDays(new Date(`${needed.endDateKey}T00:00:00`), FETCH_WINDOW_RECENTER_BUFFER_DAYS),
          ),
          recenter: true as const,
        }
      : { ensureStart: needed.startDateKey, ensureEnd: needed.endDateKey };

    isSyncingFetchWindowRef.current = true;
    void refetchScheduleData(fetchOpts)
      .then(() => {
        fetchWindowFailuresRef.current = 0;
      })
      .catch((err) => {
        Sentry.captureException(err);
        // A failed fetch leaves loadedShiftWindow untouched, so no dependency
        // here changes and nothing would ever re-run this effect — the period
        // would stay blank until the user navigated away and back. Nudge it
        // with a token instead, a couple of times, then stop and say so.
        fetchWindowFailuresRef.current += 1;
        if (fetchWindowFailuresRef.current <= FETCH_WINDOW_RETRY_LIMIT) {
          toast.error("Couldn't load the schedule for this period. Retrying.");
          fetchWindowRetryTimerRef.current = setTimeout(() => {
            setFetchWindowRetryToken((token) => token + 1);
          }, 3000);
        } else {
          toast.error("Couldn't load the schedule for this period. Reload to try again.");
        }
      })
      .finally(() => {
        isSyncingFetchWindowRef.current = false;
      });
  }, [
    org,
    scheduleLoading,
    draftCheckComplete,
    publishWindowDateRange,
    loadedShiftWindow,
    refetchScheduleData,
    fetchWindowRetryToken,
  ]);

  useEffect(
    () => () => {
      if (fetchWindowRetryTimerRef.current) clearTimeout(fetchWindowRetryTimerRef.current);
    },
    [],
  );

  const dates = useMemo(
    () =>
      spanWeeks === "month"
        ? []
        : Array.from({ length: spanWeeks * 7 }, (_, i) => addDays(weekStart, i)),
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
  const week2 = useMemo(() => (spanWeeks === 2 ? dates.slice(7, 14) : []), [dates, spanWeeks]);
  const publishedDateSet = useMemo(
    () => buildPublishedDateSet(publishedDateRanges),
    [publishedDateRanges],
  );
  const loadedPublishedWindowState = useMemo(
    () => getLoadedPublishedWindowState(publicationRangeState, dates),
    [dates, publicationRangeState],
  );
  const publishedWindowState = useMemo(() => {
    if (coverageRequirements.length === 0 || dates.length === 0) {
      return "published";
    }
    return loadedPublishedWindowState ?? "published";
  }, [coverageRequirements.length, dates.length, loadedPublishedWindowState]);
  const publishedVisibleDates = useMemo(() => {
    if (coverageRequirements.length === 0 || dates.length === 0) return dates;
    return filterPublishedDates(dates, publishedDateSet);
  }, [coverageRequirements.length, dates, publishedDateSet]);
  // Use the raw publish state (ignoring the coverage-requirements shortcut that
  // forces publishedWindowState to "published") so non-editors see the empty
  // state whenever the visible window genuinely has no published dates.
  const rawPublishedWindowState = loadedPublishedWindowState ?? "published";

  const filteredEmployees = useMemo(
    () => filterAndSortEmployees(employees, activeFocusArea, scheduleSortBy),
    [employees, activeFocusArea, scheduleSortBy],
  );
  const normalizedStaffSearch = staffSearch.trim().toLowerCase();
  const searchMatchedEmployeeIds = useMemo(() => {
    if (!normalizedStaffSearch) return undefined;
    return new Set(
      employees
        .filter((employee) =>
          getEmployeeDisplayName(employee).toLowerCase().includes(normalizedStaffSearch),
        )
        .map((employee) => employee.id),
    );
  }, [employees, normalizedStaffSearch]);
  const refetchPublishedRanges = useCallback(async () => {
    if (!org) {
      setPublicationRangeState(beginPublicationRangeLoad());
      return;
    }

    setPublicationRangeState((current) => beginPublicationRangeLoad(current.ranges));
    try {
      const ranges = await fetchPublishedDateRanges(org.id, shiftFetchStart, shiftFetchEnd);
      setPublicationRangeState(completePublicationRangeLoad(ranges));
    } catch (err) {
      Sentry.captureException(err, {
        extra: {
          context: "schedule.published_ranges",
          orgId: org.id,
          startDate: shiftFetchStart,
          endDate: shiftFetchEnd,
        },
      });
      setPublicationRangeState((current) => failPublicationRangeLoad(current.ranges));
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

  const buildEntryPayload = useCallback((entry: ShiftMap[string]): ScheduleCellInput => {
    const input = scheduleCellSnapshotToInput(
      entry.effective ?? entry.draft ?? entry.published,
    ) ?? {
      kind: entry.isDelete ? "deleted" : entry.absenceTypeId != null ? "absence" : "worked",
      segments: (entry.segments ?? []).map((segment, index) => ({
        shiftId: segment.shiftId,
        jobId: segment.jobId,
        position: segment.position ?? index,
        isMentored: segment.isMentored ?? false,
      })),
      absenceTypeId: entry.absenceTypeId ?? null,
      customStartTime: entry.absenceTypeId != null ? null : (entry.customStartTime ?? null),
      customEndTime: entry.absenceTypeId != null ? null : (entry.customEndTime ?? null),
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
      customEndTime: normalizeCustomTimeForSegmentCount(input.customEndTime, input.segments.length),
    };
  }, []);

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
          kind: entry.publishedAbsenceTypeId != null ? "absence" : "worked",
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
      if (entry.absenceTypeId != null) return absenceTypeMap.get(entry.absenceTypeId) ?? "?";
      if (entry.assignmentIds.length > 0)
        return entry.assignmentIds.map((id) => assignmentLabelMap.get(id) ?? "?").join("/");
      return entry.label ?? null;
    },
    [shifts, assignmentLabelMap, absenceTypeMap],
  );

  const shiftNameForKey = useCallback(
    (empId: string, date: Date): string | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry || entry.isDelete) return null;

      const absenceTypeId = entry.absenceTypeId ?? entry.publishedAbsenceTypeId ?? null;
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
    [absenceTypeMap, assignmentLabelMap, assignments, jobs, shiftCategories, shifts],
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
      ? (panelShiftEntry?.absenceTypeId ?? null)
      : (panelShiftEntry?.absenceTypeId ?? panelShiftEntry?.publishedAbsenceTypeId ?? null);
  const panelCustomStartTime = panelShiftEntry?.customStartTime ?? null;
  const panelCustomEndTime = panelShiftEntry?.customEndTime ?? null;
  const panelDraftKind = panelShiftEntry?.draftKind ?? null;

  const isAbsenceForKey = useCallback(
    (empId: string, date: Date): boolean => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry) return false;
      return entry.absenceTypeId != null || entry.publishedAbsenceTypeId != null;
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
      const openShiftRanges = getOpenShiftTimeRanges(assignmentIds, customStartTime, customEndTime);
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
    if (!entry || (entry.assignmentIds.length === 0 && !entry.absenceTypeId)) return [];

    // Resolve effective start/end: custom times → shift code defaults → category defaults
    const resolveEffective = (
      customStart: string | null | undefined,
      customEnd: string | null | undefined,
      codeIds: number[],
    ): { start: string; end: string } | null => {
      const s = customStart?.split("|")[0];
      const e = customEnd?.split("|")[0];
      if (s && e) return { start: s, end: e };
      const code = codeIds[0] != null ? assignmentById.get(codeIds[0]) : undefined;
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
          pillLabels.push(code?.name || code?.label || "?");
        }
      }
      warnings.push(...checkSameDayOverlaps(pillRanges, pillLabels));
    }

    return warnings;
  }, [editPanel, editSessionDraft, shifts, assignmentById, shiftCategories]);

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

    return computeCoverageGaps({
      focusAreas,
      shiftCategories,
      assignments,
      requirements: coverageRequirements,
      dates,
      employeesByFocusArea,
      assignmentIdsForKey,
      assignmentIdsByFocusArea,
      assignmentLabelMap,
      assignmentNameMap,
      coverageCreditForKey,
    });
  }, [
    coverageRequirements,
    focusAreas,
    shiftCategories,
    assignments,
    dates,
    employeesByFocusArea,
    assignmentIdsForKey,
    assignmentIdsByFocusArea,
    assignmentLabelMap,
    assignmentNameMap,
    coverageCreditForKey,
  ]);

  const publishedCoverageGaps = useMemo(() => {
    if (!coverageRequirements.length || !focusAreas.length || publishedVisibleDates.length === 0) {
      return [];
    }

    return computeCoverageGaps({
      focusAreas,
      shiftCategories,
      assignments,
      requirements: coverageRequirements,
      dates: publishedVisibleDates,
      employeesByFocusArea,
      assignmentIdsForKey,
      assignmentIdsByFocusArea,
      assignmentLabelMap,
      assignmentNameMap,
      coverageCreditForKey,
    }).filter((gap) => getActionableCoverageGapAssignmentIds(gap).length > 0);
  }, [
    coverageRequirements,
    focusAreas,
    shiftCategories,
    assignments,
    publishedVisibleDates,
    employeesByFocusArea,
    assignmentIdsForKey,
    assignmentIdsByFocusArea,
    assignmentLabelMap,
    assignmentNameMap,
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
    [allCoverageGaps, canEditShifts, getActionableCoverageGapAssignmentIds, publishedCoverageGaps],
  );

  // ── Merge calloff open shifts + coverage-gap open shifts ──
  const openShifts = useMemo<GridOpenShift[]>(() => {
    const gapShifts = visibleCoverageGaps.reduce<GridOpenShift[]>((items, gap) => {
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
          (assignmentId) => assignmentId === gap.preferredOpenAssignmentDefinitionId,
        ) ?? actionableAssignmentIds[0];
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
        assignmentFullName: gap.assignmentFullName,
        customStartTime: sc?.defaultStartTime ?? null,
        customEndTime: sc?.defaultEndTime ?? null,
        needed: remainingNeeded,
      });
      return items;
    }, []);
    return [...resolvedCalloffOpenShifts, ...gapShifts].reduce<GridOpenShift[]>(
      (visible, openShift) => {
        if (isOpenShiftStarted(openShift)) return visible;

        const candidateAssignmentIds = openShift.eligibleAssignmentDefinitionIds?.length
          ? openShift.eligibleAssignmentDefinitionIds
          : openShift.assignmentIds;
        const viewerEligible = isEmployeeEligibleForOpenShift(
          candidateAssignmentIds,
          currentEmployee,
          {
            assignmentById,
            shiftCategories,
            jobs,
            orgRoles,
          },
        );

        // Schedulers/staff managers always see every open shift as a filling
        // tool, regardless of the org-level visibility setting or their own
        // personal eligibility for a given shift — click routing (see
        // handleOpenShiftClick) handles the "can't claim this one for
        // myself" case instead of hiding it from them.
        if (canSeeAllOpenShifts) {
          visible.push({ ...openShift, viewerEligible });
          return visible;
        }

        // Plain staff only ever see shifts they're personally eligible for.
        if (!viewerEligible) return visible;

        const mode =
          openShift.source === "calloff"
            ? (org?.openShiftVisibility?.calloff ?? "matched")
            : (org?.openShiftVisibility?.coverageGap ?? "matched");
        if (mode === "hidden") return visible;
        if (
          mode !== "always" &&
          hasOpenShiftConflict(
            openShift.assignmentIds ?? [],
            new Date(`${openShift.date}T00:00:00`),
            openShift.customStartTime ?? null,
            openShift.customEndTime ?? null,
          )
        ) {
          return visible;
        }

        visible.push({ ...openShift, viewerEligible: true });
        return visible;
      },
      [],
    );
  }, [
    assignmentById,
    canSeeAllOpenShifts,
    currentEmpId,
    currentEmployee,
    getActionableCoverageGapAssignmentIds,
    hasOpenShiftConflict,
    isOpenShiftStarted,
    jobs,
    org?.openShiftVisibility,
    orgRoles,
    resolvedCalloffOpenShifts,
    shiftCategories,
    shiftRequests.requests,
    visibleCoverageGaps,
  ]);

  const draftKindForKey = useCallback(
    (empId: string, date: Date): DraftKind => {
      // `paintedFromSnapshot` counts as draft data being here: the snapshot is
      // only read back when it was taken under this same `canEditShifts`, so
      // its entries already carry their draft kinds. Waiting on
      // `draftCheckComplete` alone drew every draft pill with a published
      // (solid) border for the length of the initial fetch — while DraftBanner,
      // reading the same `shifts`, was already counting those drafts — and then
      // snapped them to dashed once the fetch landed.
      if (!draftCheckComplete && !paintedFromSnapshot) return null;
      if (!canEditShifts) return null;
      return shifts[`${empId}_${formatDateKey(date)}`]?.draftKind ?? null;
    },
    [shifts, draftCheckComplete, paintedFromSnapshot, canEditShifts],
  );

  const fromRecurringForKey = useCallback(
    (empId: string, date: Date): boolean =>
      shifts[`${empId}_${formatDateKey(date)}`]?.fromRecurring ?? false,
    [shifts],
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

  /**
   * The live request sitting on a cell, if any — what the grid's corner fold
   * tints itself from and what `hasActiveRequestForShift` answers over.
   *
   * Matches the *requester's* cell only. A swap therefore marks the person who
   * asked, not the person being asked: covering the other side needs a second
   * index keyed on targetEmpId/targetShiftDate, which nothing needs yet.
   */
  const activeRequestForKey = useCallback(
    (empId: string, date: Date): ActiveShiftRequestSummary | null => {
      const dateKey = formatDateKey(date);
      const match = shiftRequests.requests.find(
        (r) =>
          r.requesterEmpId === empId &&
          r.requesterShiftDate === dateKey &&
          (r.status === "open" || r.status === "pending_approval"),
      );
      if (!match) return null;
      // The find above already admitted only these two, so this narrows rather
      // than decides.
      return {
        type: match.type,
        status: match.status === "pending_approval" ? "pending_approval" : "open",
      };
    },
    [shiftRequests.requests],
  );

  const hasActiveRequestForShift = useCallback(
    (empId: string, date: Date): boolean => activeRequestForKey(empId, date) !== null,
    [activeRequestForKey],
  );

  const publishDiffKindForKey = useCallback(
    (
      empId: string,
      date: Date,
    ): (PublishChange & { publishedAt: string; publishedBy: string }) | null => {
      if (!showPublishDiff || !publishChangesMap) return null;
      return publishChangesMap.get(`${empId}_${formatDateKey(date)}`) ?? null;
    },
    [showPublishDiff, publishChangesMap],
  );

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

          return timeComparison === 0 ? left.originalIndex - right.originalIndex : timeComparison;
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
          const category = shiftCategories.find((item) => item.id === assignment.categoryId);
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
      const sortedRanges = [...getPublishedShiftTimeRanges(empId, date)].sort((left, right) => {
        const startComparison = left.start.localeCompare(right.start);
        return startComparison === 0 ? left.end.localeCompare(right.end) : startComparison;
      });
      const range =
        option?.segment.startTime != null
          ? { start: option.segment.startTime, end: option.segment.endTime ?? "" }
          : (sortedRanges[segmentIndex] ?? null);

      return hasDateAndTimeStarted(formatDateKey(date), range ? [range] : []);
    },
    [getPublishedShiftSegmentOptions, getPublishedShiftTimeRanges, hasDateAndTimeStarted],
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

      return ranges.every((range) => hasDateAndTimeStarted(dateStr, [range]));
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
      (hasActiveRequestForShift(empId, date) || canCreateOwnShiftRequest(empId, date)),
    [canCreateOwnShiftRequest, currentEmpId, hasActiveRequestForShift],
  );

  const canOpenOwnShiftDetails = useCallback(
    (empId: string, date: Date): boolean => {
      if (!currentEmpId || empId !== currentEmpId) return false;
      const label = shiftForKey(empId, date);
      return !!label && label !== "OFF";
    },
    [currentEmpId, shiftForKey],
  );

  const activeIndicatorIdsForKey = useCallback(
    (empId: string, date: Date, focusAreaId?: number): number[] => {
      const dateKey = formatDateKey(date);
      const key =
        focusAreaId != null ? `${empId}_${dateKey}_${focusAreaId}` : `${empId}_${dateKey}`;
      const noteList = notes[key] ?? [];
      // Only return notes that aren't marked as deleted in draft
      return noteList.filter((n) => n.status !== "draft_deleted").map((n) => n.indicatorTypeId);
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

  // Conflicts arrive in bursts once several people edit the same period, and a
  // full window refetch per conflict is expensive. Share one in-flight refetch
  // between them: they all want the same fresh state.
  const conflictRefetchRef = useRef<Promise<void> | null>(null);
  const handleShiftWriteConflict = useCallback(async () => {
    const orgId = org?.id;
    if (!orgId) return;
    toast.error("This shift was modified elsewhere. Reloading the latest version.");

    if (conflictRefetchRef.current) {
      await conflictRefetchRef.current;
      return;
    }

    const refetch = (async () => {
      try {
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
      } finally {
        conflictRefetchRef.current = null;
      }
    })();
    conflictRefetchRef.current = refetch;
    await refetch;
  }, [org?.id, canEditShifts, shiftFetchStart, shiftFetchEnd, segmentCompatibility]);

  /**
   * Serializes a write behind every write already pending on the cells it
   * touches. A write spanning two cells (a move) must register on both, or a
   * later edit to either one races it and loses to an optimistic-lock error.
   */
  const enqueueShiftWriteAcross = useCallback(
    (keys: string[], write: () => Promise<void>): Promise<void> => {
      const previous = keys.map((key) => pendingShiftWrites.current.get(key) ?? Promise.resolve());
      const queued = Promise.all(previous.map((pending) => pending.catch(() => {}))).then(write);
      for (const key of keys) pendingShiftWrites.current.set(key, queued);
      void queued
        .finally(() => {
          for (const key of keys) {
            if (pendingShiftWrites.current.get(key) === queued) {
              pendingShiftWrites.current.delete(key);
            }
          }
        })
        .catch(() => {});
      return queued;
    },
    [],
  );

  const enqueueShiftWrite = useCallback(
    (key: string, write: () => Promise<void>): Promise<void> =>
      enqueueShiftWriteAcross([key], write),
    [enqueueShiftWriteAcross],
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
          isDirty: computeEditSessionDirty(prev.baseFingerprint, next.draftShift, next.draftNotes),
        };
      });
    },
    [computeEditSessionDirty],
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

  /**
   * Applies the deletes and reports how many actually committed. Errors are
   * still toasted here, but the count comes back so callers can't announce a
   * success the server never performed — the optimistic `setShifts` above
   * already emptied those cells, so the grid alone proves nothing.
   */
  const applyShiftDeleteUpdates = useCallback(
    async (
      updates: ShiftDeleteUpdate[],
      options: { broadcast: boolean; failureMessage: string },
    ): Promise<{ deleted: number; failed: number }> => {
      if (updates.length === 0) return { deleted: 0, failed: 0 };
      if (!guardActiveSession()) {
        return { deleted: 0, failed: updates.length };
      }
      const orgId = org?.id;
      if (!orgId) {
        console.error("Cannot modify shifts before org is loaded");
        return { deleted: 0, failed: updates.length };
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
        const deleteItems: DeleteShiftBatchItem[] = updates.map((update) => ({
          employeeId: update.empId,
          date: update.dateKey,
          expectedVersion: update.expectedVersion,
        }));
        // Count per chunk. An earlier chunk that committed stays committed
        // when a later one fails, so a single all-or-nothing tally would
        // misreport both halves.
        let deleted = 0;
        try {
          await Promise.all(
            updates.map(
              (update) => pendingShiftWrites.current.get(update.key) ?? Promise.resolve(),
            ),
          );
          for (let i = 0; i < deleteItems.length; i += SCHEDULE_DELETE_BATCH_SIZE) {
            const chunk = deleteItems.slice(i, i + SCHEDULE_DELETE_BATCH_SIZE);
            await deleteShiftBatch(orgId, chunk);
            deleted += chunk.length;
          }
        } catch (err) {
          if (err instanceof OptimisticLockError) {
            await handleShiftWriteConflict();
          } else {
            toast.error(options.failureMessage);
            Sentry.captureException(err);
          }
        }
        return { deleted, failed: updates.length - deleted };
      }

      let deleted = 0;
      await Promise.all(
        updates.map((update) =>
          enqueueShiftWrite(update.key, async () => {
            try {
              await deleteShift(update.empId, update.dateKey, orgId, update.expectedVersion);
              deleted += 1;
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
      return { deleted, failed: updates.length - deleted };
    },
    [
      broadcastDraftChanged,
      deleteShiftBatch,
      enqueueShiftWrite,
      guardActiveSession,
      handleShiftWriteConflict,
      org?.id,
    ],
  );

  const setShift = useCallback(
    (empId: string, date: Date, entry: ScheduleCellInput | null): boolean => {
      const orgId = org?.id;
      if (!orgId) {
        console.error("Cannot modify shifts before org is loaded");
        return false;
      }

      const dateKey = formatDateKey(date);
      const key = `${empId}_${dateKey}`;
      if (!guardActiveSession()) return false;
      // Read from ref to get the latest version, not the stale closure value
      const existing = shiftsRef.current[key];
      const existingVersion = existing?.version;
      const isDelete =
        !entry ||
        entry.kind === "deleted" ||
        (entry.kind === "worked" && entry.segments.length === 0 && entry.absenceTypeId == null);

      if (isDelete) {
        const deleteUpdate = buildShiftDeleteUpdate(empId, dateKey);
        if (!deleteUpdate) return false;
        void applyShiftDeleteUpdates([deleteUpdate], {
          broadcast: true,
          failureMessage: "We couldn't delete shift. Try again.",
        });
        return true;
      } else {
        const derivedCodeIds = getInputAssignmentDefinitionIds(entry);
        // Filter out any stale/archived shift code IDs
        const validCodeIds = derivedCodeIds.filter((id) => assignmentLabelMapRef.current.has(id));
        if (
          entry.kind === "worked" &&
          (derivedCodeIds.length === 0 || derivedCodeIds.length !== entry.segments.length)
        ) {
          toast.error("That assignment is no longer available.");
          return false;
        }
        if (validCodeIds.length < derivedCodeIds.length) {
          toast.warning("Removed assignments that are no longer available.");
          return false;
        }
        if (
          entry.kind === "absence" &&
          entry.absenceTypeId != null &&
          !absenceTypeMapRef.current.has(entry.absenceTypeId)
        ) {
          toast.error("That absence type is no longer available.");
          return false;
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
          toast.error("We couldn't match that assignment.");
          return false;
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
        if (!upsertValue) return false;
        setShifts((prev) => ({ ...prev, [key]: upsertValue }));
        void enqueueShiftWrite(key, async () => {
          try {
            await upsertShift(empId, dateKey, normalizedEntry, orgId, existingVersion);
          } catch (err) {
            if (err instanceof OptimisticLockError) {
              await handleShiftWriteConflict();
            } else {
              toast.error("We couldn't save that shift. Try again.");
              Sentry.captureException(err);
            }
          }
        });
        broadcastDraftChanged({ shifts: { [key]: upsertValue } });
        return true;
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
      guardActiveSession,
      handleShiftWriteConflict,
      segmentCompatibility,
      absenceTypeMap,
    ],
  );

  const getShiftStyle = useCallback(
    (type: string, focusAreaName?: string): AssignmentDefinition => {
      const fa = focusAreaName ? focusAreas.find((w) => w.name === focusAreaName) : null;
      const matchesType = (t: AssignmentDefinition) => t.label === type || t.name === type;

      // 1. Code associated with this focus area → use the code's own colors
      if (fa) {
        const specific = assignments.find((t) => matchesType(t) && t.focusAreaId === fa.id);
        if (specific) return specific;
      }
      // 2. Global code (no focus area associations)
      const general = assignments.find((t) => matchesType(t) && t.focusAreaId == null);
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
        color: "var(--dg-color-bg)",
        border: "var(--dg-color-border)",
        text: "var(--dg-color-text-muted)",
        sortOrder: 999,
      } satisfies AssignmentDefinition;
    },
    [assignments, focusAreas],
  );

  // ── Event handlers ───────────────────────────────────────────────────────────

  const openCellEditor = useCallback(
    (emp: Employee, date: Date, focusAreaName: string | undefined) => {
      const canEditCell = canEditShiftsRef.current || canEditNotes;
      const canOpenRequestPanel = canOpenOwnRequestPanel(emp.id, date);
      const canOpenDetails = canOpenOwnShiftDetails(emp.id, date);
      if (!canEditCell && !canOpenRequestPanel && !canOpenDetails) return;
      const cellKey = `${emp.id}_${formatDateKey(date)}`;
      if (canEditCell) {
        if (!guardActiveSession()) return;
        announceEditingCell(cellKey);
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
      canOpenOwnShiftDetails,
      canOpenOwnRequestPanel,
      focusAreas,
      announceEditingCell,
      guardActiveSession,
      startEditSession,
    ],
  );
  // Lets the busy-cell override re-enter without the callback depending on itself.
  const openCellEditorRef = useRef(openCellEditor);
  openCellEditorRef.current = openCellEditor;

  /**
   * Grid-facing handler. Keeps the exact signature the grid calls, including the
   * trailing `trigger`, which is deliberately not forwarded to the editor.
   */
  const handleCellClick = useCallback(
    (emp: Employee, date: Date, focusAreaName?: string, _trigger?: "click" | "keyboard") => {
      openCellEditorRef.current(emp, date, focusAreaName);
    },
    [],
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
        if (derivedCodeIds.length === 0 || derivedCodeIds.length !== input.segments.length) {
          toast.error("That assignment is no longer available.");
          return currentShift;
        }

        const validCodeIds = derivedCodeIds.filter((id) => assignmentLabelMapRef.current.has(id));
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
        toast.error("We couldn't match that assignment.");
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
    [absenceTypeMap, getInputAssignmentDefinitionIds, getPublishedSnapshot, segmentCompatibility],
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

  // Rebuilt through buildDraftShiftFromInput rather than by setting the entry's
  // top-level customStartTime/customEndTime: those are derived from the entry's
  // effective snapshot, and buildEntryPayload reads the snapshot back out when
  // it builds an upsert. Patching only the derived fields left the snapshot
  // without the time, so saving a shift whose assignment also changed (every
  // brand-new shift) posted customStartTime: null.
  const handleCustomTimeChange = useCallback(
    (start: string | null, end: string | null) => {
      updateEditSessionDraft((prev) => {
        if (!prev.draftShift) {
          return {
            draftShift: prev.draftShift,
            draftNotes: prev.draftNotes,
          };
        }

        const input = buildEntryPayload(prev.draftShift);
        if (input.kind !== "worked") {
          return {
            draftShift: prev.draftShift,
            draftNotes: prev.draftNotes,
          };
        }

        return {
          draftShift: buildDraftShiftFromInput(prev.draftShift, {
            ...input,
            customStartTime: start,
            customEndTime: end,
          }),
          draftNotes: prev.draftNotes,
        };
      });
    },
    [buildDraftShiftFromInput, buildEntryPayload, updateEditSessionDraft],
  );

  const handleConfirmEditPanel = useCallback(
    async (seriesScope?: SeriesScope) => {
      const orgId = org?.id;
      const session = editSessionDraftRef.current;
      const panel = editPanel;
      if (!orgId || !session || !panel) return;

      if (session.isStale) {
        toast.error("This cell changed while you were editing. Close and reopen it.");
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
        if (!guardActiveSession()) return;

        const currentShift = cloneShiftEntry(shiftsRef.current[session.cellKey]);
        const currentNotes = collectCellNotesSnapshot(panel.empId, panel.date);
        const currentFingerprint = buildEditSessionFingerprint(currentShift, currentNotes);
        if (currentFingerprint !== session.baseFingerprint) {
          setEditSessionDraft((prev) => (prev ? { ...prev, isStale: true } : prev));
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
        let seriesRefreshNeeded = false;
        const initialIdentityChanged = !shiftEditableIdentityMatches(
          session.baseShift,
          session.draftShift,
        );

        if (seriesScope === "all" && workingBaseShift?.seriesId && initialIdentityChanged) {
          // The series write is followed by a per-cell write below, which needs
          // this cell's post-series version. Ask the series endpoint to echo
          // just that one cell — this used to refetch the entire loaded window
          // to read a single number.
          const echoCell = { employeeId: panel.empId, date: formatDateKey(panel.date) };
          const seriesEcho = {
            isScheduler: canEditShiftsRef.current,
            assignmentLabelMap: assignmentLabelMapRef.current,
            absenceTypeMap: absenceTypeMapRef.current,
          };

          let seriesCells: EchoedCells | null = null;
          if (shiftIsDeleted(session.draftShift)) {
            seriesCells = (
              await deleteShiftSeries(workingBaseShift.seriesId, orgId, echoCell, seriesEcho)
            ).cells;
          } else if (session.draftShift) {
            seriesCells = await updateSeriesAllShifts(
              workingBaseShift.seriesId,
              buildEntryPayload(session.draftShift),
              orgId,
              echoCell,
              seriesEcho,
            );
          }

          // A series edit touches cells far outside this one, so the grid does
          // still need a full refresh. It is deferred to the end of the confirm
          // rather than started here: a refetch launched now would race the
          // per-cell write below and could resolve with pre-write data,
          // overwriting the very cell this confirm just changed.
          seriesRefreshNeeded = true;

          if (seriesCells) {
            const merged: ShiftMap = { ...shiftsRef.current };
            for (const [key, entry] of Object.entries(seriesCells)) {
              if (entry) merged[key] = entry;
              else delete merged[key];
            }
            setShifts(merged);
            shiftsRef.current = merged;
            workingShift = cloneShiftEntry(merged[session.cellKey]);
          } else {
            workingShift = cloneShiftEntry(shiftsRef.current[session.cellKey]);
          }
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
          (workingBaseShift?.customEndTime ?? null) !== (session.draftShift?.customEndTime ?? null);

        // Ask the write to hand the changed cell back, so this confirm can
        // merge one cell instead of refetching the org's whole loaded window.
        const echo = {
          isScheduler: canEditShiftsRef.current,
          assignmentLabelMap: assignmentLabelMapRef.current,
          absenceTypeMap: absenceTypeMapRef.current,
        };
        let echoedCells: EchoedCells | null = null;

        if (remainingIdentityChanged) {
          if (shiftIsDeleted(session.draftShift)) {
            if (workingShift) {
              echoedCells = await deleteShift(
                panel.empId,
                formatDateKey(panel.date),
                orgId,
                expectedVersion,
                echo,
              );
            }
          } else if (session.draftShift) {
            echoedCells = await upsertShift(
              panel.empId,
              formatDateKey(panel.date),
              buildEntryPayload(session.draftShift),
              orgId,
              expectedVersion,
              echo,
            );
          }
        } else if (remainingTimeChanged && session.draftShift && workingShift) {
          echoedCells = await upsertShiftTimes(
            panel.empId,
            formatDateKey(panel.date),
            session.draftShift.customStartTime ?? null,
            session.draftShift.customEndTime ?? null,
            orgId,
            expectedVersion,
            echo,
          );
        }

        const focusAreaIds = new Set<number>([
          ...Object.keys(session.baseNotes).map(Number),
          ...Object.keys(session.draftNotes).map(Number),
        ]);

        // Collect first, then fire together. Each note write is its own HTTP
        // round trip and they target distinct (indicator, focus area) rows on
        // one cell, so awaiting them one at a time only serialised them.
        const noteWrites: Array<() => Promise<unknown>> = [];
        // The note map this cell will hold once the writes below land. Derived
        // rather than refetched, and it mirrors each endpoint's own rule for
        // what a write leaves behind, so it matches what a refetch would return.
        const noteResults = new Map<number, DraftNoteState[]>();

        for (const focusAreaId of focusAreaIds) {
          const baseEntries = session.baseNotes[focusAreaId] ?? [];
          const draftEntries = session.draftNotes[focusAreaId] ?? [];
          const indicatorIds = new Set<number>([
            ...baseEntries.map((note) => note.indicatorTypeId),
            ...draftEntries.map((note) => note.indicatorTypeId),
          ]);

          const resulting = new Map<number, DraftNoteState["status"]>(
            baseEntries.map((note) => [note.indicatorTypeId, note.status]),
          );

          for (const indicatorTypeId of indicatorIds) {
            const baseStatus = baseEntries.find(
              (note) => note.indicatorTypeId === indicatorTypeId,
            )?.status;
            const draftStatus = draftEntries.find(
              (note) => note.indicatorTypeId === indicatorTypeId,
            )?.status;
            if (baseStatus === draftStatus) continue;

            if (draftStatus && draftStatus !== "draft_deleted") {
              // upsertScheduleNote restores a draft-deleted note to published,
              // and otherwise stores it as a draft.
              resulting.set(
                indicatorTypeId,
                baseStatus === "draft_deleted" ? "published" : "draft",
              );
              noteWrites.push(() =>
                upsertScheduleNote(
                  orgId,
                  panel.empId,
                  formatDateKey(panel.date),
                  indicatorTypeId,
                  focusAreaId,
                  baseStatus,
                ),
              );
            } else if (baseStatus) {
              // deleteScheduleNote removes a draft row outright, but only marks
              // a published one draft_deleted so the publish can undo it.
              if (baseStatus === "draft") resulting.delete(indicatorTypeId);
              else resulting.set(indicatorTypeId, "draft_deleted");
              noteWrites.push(() =>
                deleteScheduleNote(
                  orgId,
                  panel.empId,
                  formatDateKey(panel.date),
                  indicatorTypeId,
                  focusAreaId,
                  baseStatus,
                ),
              );
            }
          }

          noteResults.set(
            focusAreaId,
            [...resulting].map(([indicatorTypeId, status]) => ({ indicatorTypeId, status })),
          );
        }
        await Promise.all(noteWrites.map((write) => write()));

        // ── Merge, don't refetch ──────────────────────────────────────────
        // The write already told us the cell's new state and the note results
        // are derived above, so there is nothing left to ask the server for.
        // This used to await a full ±90-day fetch of every employee's shifts
        // and notes before the panel could close, which is what made confirming
        // one cell feel slow.
        const dateKey = formatDateKey(panel.date);
        const changedShiftKeys = new Set<string>(
          echoedCells ? Object.keys(echoedCells) : [session.cellKey],
        );
        const changedNoteKeys = new Set<string>();

        let nextShifts = previousShifts;
        if (echoedCells) {
          const merged: ShiftMap = { ...previousShifts };
          for (const [key, entry] of Object.entries(echoedCells)) {
            if (entry) merged[key] = entry;
            else delete merged[key];
          }
          nextShifts = merged;
        }

        let nextNotes = previousNotes;
        if (noteWrites.length > 0) {
          nextNotes = { ...previousNotes };
          for (const [focusAreaId, entries] of noteResults) {
            const noteKey = scheduleNoteKey(
              panel.empId,
              dateKey,
              focusAreaId === -1 ? null : focusAreaId,
            );
            changedNoteKeys.add(noteKey);
            if (entries.length > 0) {
              // The editor saving these notes is their author, which is what
              // attributes them in the publish confirmation.
              const author = currentUserRef.current?.id ?? null;
              nextNotes[noteKey] = entries.map((entry) => ({ ...entry, updatedBy: author }));
            } else delete nextNotes[noteKey];
          }
        }

        if (nextShifts !== previousShifts || nextNotes !== previousNotes) {
          setShifts(nextShifts);
          setNotes(nextNotes);
          shiftsRef.current = nextShifts;
          notesRef.current = nextNotes;
          writeScheduleWindow(queryClient, orgId, {
            window: { start: shiftFetchStart, end: shiftFetchEnd },
            shifts: nextShifts,
            notes: nextNotes,
            canEditShifts: canEditShiftsRef.current,
          });
        }

        // Scoped to the keys we actually touched — the unscoped diff walks the
        // whole loaded window and JSON.stringifies every cell twice.
        const realtimeDiff = buildRealtimeDraftDiff(
          previousShifts,
          nextShifts,
          previousNotes,
          nextNotes,
          {
            shiftKeys: changedShiftKeys,
            noteKeys: changedNoteKeys,
          },
        );
        if (realtimeDiff) {
          broadcastDraftChanged(realtimeDiff);
        }

        // Refresh in the background, without holding the panel open, when this
        // confirm changed more than the one cell we merged — or when no echo
        // came back (an older server, or the read-back failed) and the grid
        // would otherwise be left showing stale state. Started only now that
        // every write has landed, so it cannot resolve with pre-write data.
        if (
          seriesRefreshNeeded ||
          (!echoedCells && (remainingIdentityChanged || remainingTimeChanged))
        ) {
          void refetchScheduleDataRef.current();
        }

        closeEditPanel();
        toast.success("Shift changes saved to draft");
      } catch (err) {
        if (err instanceof OptimisticLockError) {
          setEditSessionDraft((prev) => (prev ? { ...prev, isStale: true } : prev));
          toast.error("This shift changed in another tab or by another editor.");
          await refetchScheduleDataRef.current();
        } else {
          toast.error("We couldn't save your shift changes. Try again.");
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
      guardActiveSession,
      org?.id,
      broadcastDraftChanged,
      shiftFetchEnd,
      shiftFetchStart,
    ],
  );

  const handleConfirmSeriesDelete = useCallback(async () => {
    if (!pendingSeriesDelete || !org) return;
    if (!guardActiveSession()) return;
    try {
      const prevShifts = shifts;
      const { deletedCount } = await deleteShiftSeries(pendingSeriesDelete.seriesId, org.id);
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
        if (!prevShifts[k] || JSON.stringify(prevShifts[k]) !== JSON.stringify(v)) {
          shiftUpdates[k] = v;
        }
      }
      if (Object.keys(shiftUpdates).length > 0) {
        broadcastDraftChanged({ shifts: shiftUpdates });
      }
      toast.success(`Series deleted (${deletedCount} shifts marked for removal on publish)`);
    } catch (err) {
      toast.error("We couldn't remove that repeating shift. Try again.");
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
    guardActiveSession,
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
        draftEntry?.absenceTypeId ?? absenceTypeIdForKey(editPanel.empId, editPanel.date);
      const seriesInputSource = draftEntry ?? shiftsRef.current[cellKey] ?? null;
      const seriesInput = seriesInputSource ? buildEntryPayload(seriesInputSource) : null;
      if (!seriesInput || (seriesInput.kind === "worked" && seriesInput.segments.length === 0)) {
        return;
      }
      if (!guardActiveSession()) return;
      setIsCreatingRepeatSeries(true);
      startScheduleOperation({
        kind: "repeat_series",
        title:
          absenceTypeId != null ? "Creating repeating off day..." : "Creating repeating shift...",
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
          if (!prevShifts[key] || JSON.stringify(prevShifts[key]) !== JSON.stringify(value)) {
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
          formatClientErrorMessage(err, "We couldn't create that repeating shift. Try again."),
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
      guardActiveSession,
    ],
  );

  // ── Qualification check for drag/paste ──────────────────────────────────
  const focusAreaNameMap = useMemo(
    () => new Map(focusAreas.map((fa) => [fa.id, fa.name])),
    [focusAreas],
  );
  const handleGridCellActivate = useCallback<ScheduleGridHandlers["onActivateCell"]>(
    ({ emp, date, cellId }) => {
      handleCellClick(emp, date, focusAreaNameMap.get(cellId.sectionId));
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
          const codeShiftId = code.shiftId ?? code.categoryId ?? null;
          const codeShift =
            codeShiftId != null
              ? (shiftCategories.find((item) => item.id === codeShiftId) ?? null)
              : null;
          const codeJob =
            code.jobId != null ? (jobs.find((item) => item.id === code.jobId) ?? null) : null;
          const displayLabel = formatAssignableShiftOptionLabel(
            buildShiftDisplayParts({
              shift: codeShift,
              job: codeJob,
              assignment: code,
              shiftDisplayMode: "name",
            }),
          );
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
  const handleMoveGridEntry = useCallback<NonNullable<ScheduleGridHandlers["onMoveEntry"]>>(
    ({ sourceCellId, targetCellId, payload, mode }) => {
      const sourceKey = `${sourceCellId.empId}_${sourceCellId.dateKey}`;
      const targetKey = `${targetCellId.empId}_${targetCellId.dateKey}`;
      if (sourceKey === targetKey) return;

      if (!guardActiveSession()) return;

      const payloadAssignmentDefinitionIds = getInputAssignmentDefinitionIds(payload);
      if (payloadAssignmentDefinitionIds.length > 0) {
        const disqualified = checkQualification(targetCellId.empId, payloadAssignmentDefinitionIds);
        if (disqualified) {
          toast.error(disqualified);
          return;
        }
      }

      const sourceEntry = shifts[sourceKey];
      const targetEntry = shifts[targetKey];
      const buildMovedEntry = (draftKind: DraftKind) =>
        buildScheduleCellEntryFromInput({
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
          published: getPublishedSnapshot(targetEntry),
          segmentCompatibility,
          absenceTypeMap,
          draftKind,
          version: targetEntry?.version != null ? targetEntry.version + 1 : undefined,
          createdBy: targetEntry?.createdBy ?? null,
          updatedBy: currentUserRef.current?.id ?? null,
          createdAt: targetEntry?.createdAt ?? null,
          updatedAt: targetEntry?.updatedAt ?? null,
        });

      // Read the kind back off the built entry instead of assuming a drop onto
      // a published cell is always a modification: dropping a shift onto the
      // cell that already published that exact shift changes nothing, and
      // assuming otherwise dashed a draft border around it.
      const provisionalEntry = buildMovedEntry(null);
      const movedEntry = provisionalEntry
        ? buildMovedEntry(computeScheduleEntryDraftKind(provisionalEntry))
        : null;
      if (!movedEntry) {
        toast.error("We couldn't move that assignment.");
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
                version: sourceEntry?.version != null ? sourceEntry.version + 1 : undefined,
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

      // Registered on both cells, so an edit saved right after the drop queues
      // behind the move instead of racing it into a version conflict.
      void enqueueShiftWriteAcross([sourceKey, targetKey], async () => {
        await moveShift(
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
        );
      })
        .then(() => {
          toast.success(mode === "copy" ? "Entry copied" : "Entry moved");
        })
        .catch(async (err) => {
          if (err instanceof OptimisticLockError) {
            toast.error("Entry was modified by another editor or another tab. Refreshing.");
          } else {
            toast.error(
              mode === "copy"
                ? "We couldn't copy entry. Try again."
                : "We couldn't move entry. Try again.",
            );
            Sentry.captureException(err);
          }
          // We already broadcast the optimistic move to everyone else, so
          // undoing it locally isn't enough — send the server's truth for both
          // cells or their grids keep showing a move that never happened.
          const refreshed = await refetchScheduleData();
          if (refreshed) {
            broadcastDraftChanged({
              shifts: {
                [sourceKey]: refreshed.shiftData[sourceKey] ?? null,
                [targetKey]: refreshed.shiftData[targetKey] ?? null,
              },
            });
          }
        });
    },
    [
      shifts,
      org,
      guardActiveSession,
      getInputAssignmentDefinitionIds,
      getPublishedSnapshot,
      checkQualification,
      broadcastDraftChanged,
      refetchScheduleData,
      segmentCompatibility,
      absenceTypeMap,
      enqueueShiftWriteAcross,
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
      if (!guardActiveSession()) return;
      const cellKey = `${empId}_${formatDateKey(date)}`;

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

      if (setShift(empId, date, clipboard)) {
        toast.success("Entry pasted");
      }
    },
    [
      clipboard,
      setShift,
      guardActiveSession,
      getInputAssignmentDefinitionIds,
      checkQualification,
      shifts,
    ],
  );

  const handleClearShift = useCallback(
    (empId: string, date: Date) => {
      if (!guardActiveSession()) return;
      const emp = employees.find((e) => e.id === empId);
      const empName = emp ? getEmployeeDisplayName(emp) : "";
      const label = shiftForKey(empId, date) ?? "";
      setPendingClearShift({ empId, date, empName, shiftLabel: label });
    },
    [guardActiveSession, employees, shiftForKey],
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
        (shiftEntry.assignmentIds.length > 0 || shiftEntry.absenceTypeId != null) &&
        !shiftEntry.isDelete
      );
      const canRequestBase =
        !shiftEntry?.absenceTypeId && canCreateOwnShiftRequest(cellId.empId, date);
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
        endDate: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0),
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
    const cellKeys: string[] = [];
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
            if (isActive) {
              count++;
              cellKeys.push(`${empId}_${dateKey}`);
            }
          } else if (
            match.input.kind === "absence" &&
            match.input.absenceTypeId != null &&
            absenceTypes.some((at) => at.id === match.input.absenceTypeId)
          ) {
            count++;
            cellKeys.push(`${empId}_${dateKey}`);
          }
        }
      }
    }

    if (count === 0) {
      toast.info("No empty schedule slots matched recurring templates for this date range");
      return;
    }

    const dateRange = `${formatDate(startDate)} – ${formatDate(endDate)}`;
    setAutoFillPreview({ count, dateRange, cellKeys });
    setShowAutoFillConfirm(true);
  }, [org, getAutoFillRange, absenceTypes, shifts, shiftCategories, jobs]);

  // Actually apply recurring schedules (called after confirmation)
  const handleApplyRecurring = useCallback(async () => {
    if (!org || !autoFillPreview) return;
    if (!guardActiveSession()) return;
    const { startDate, endDate } = getAutoFillRange();
    const dateRange = `${formatDate(startDate)} – ${formatDate(endDate)}`;
    startScheduleOperation({
      kind: "autofill",
      title: "Filling shifts",
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
      const generated = await applyRecurringSchedules(org.id, startDate, endDate);

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
        const realtimeDiff = refreshed
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
      toast.error("We couldn't apply the recurring schedule. Try again.");
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
    guardActiveSession,
  ]);

  // ── Import Previous Schedule ────────────────────────────────────────────────
  //
  // Planning and execution both happen on the server in a single atomic RPC.
  // The client renders counts and refetches the period — no batching, no
  // local-state planning, no post-fetch reconciliation. See
  // `public.import_previous_schedule` in 002_functions_triggers.sql.

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
              note.indicatorTypeId === indicatorTypeId ? { ...note, status: "published" } : note,
            );
          } else {
            updated = [
              ...existing.filter((note) => note.indicatorTypeId !== indicatorTypeId),
              { indicatorTypeId, status: "draft" },
            ];
          }
        } else if (existingStatus === "published") {
          updated = existing.map((note) =>
            note.indicatorTypeId === indicatorTypeId ? { ...note, status: "draft_deleted" } : note,
          );
        } else {
          updated = existing.filter((note) => note.indicatorTypeId !== indicatorTypeId);
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

  // Step by exactly the span on show. A step shorter than the span lands
  // inside the current period and the pay-period snap pulls it straight back,
  // which is how "next period" used to do nothing at all on a phone.
  const handlePrev = useCallback(() => {
    if (spanWeeks === "month") {
      setWeekStart((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    } else {
      setWeekStart((prev) =>
        getScheduleStartForSpan({
          date: addDays(prev, -spanWeeks * 7),
          span: spanWeeks,
          payPeriodStartDate,
        }),
      );
    }
  }, [spanWeeks, payPeriodStartDate]);

  const handleNext = useCallback(() => {
    if (spanWeeks === "month") {
      setWeekStart((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    } else {
      setWeekStart((prev) =>
        getScheduleStartForSpan({
          date: addDays(prev, spanWeeks * 7),
          span: spanWeeks,
          payPeriodStartDate,
        }),
      );
    }
  }, [spanWeeks, payPeriodStartDate]);

  const handleToday = useCallback(() => {
    if (spanWeeks === "month") {
      setWeekStart(new Date(todayAnchor.getFullYear(), todayAnchor.getMonth(), 1));
      return;
    }

    setWeekStart(
      getScheduleStartForSpan({
        date: todayAnchor,
        span: spanWeeks,
        payPeriodStartDate,
      }),
    );
  }, [payPeriodStartDate, spanWeeks, todayAnchor]);

  const handleSpanChange = useCallback(
    (next: 1 | 2 | "month") => {
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
    },
    [payPeriodStartDate],
  );

  const handlePublish = useCallback(async () => {
    if (!org) return;
    // Deliberately not gated on cell locks. Publishing commits every draft in
    // the window whether or not anyone holds a cell, so blocking on a lock did
    // not protect that work: it only meant one editor with one cell open could
    // stop the whole publish. The confirmation now names whose changes are
    // going live and flags editors who are on the schedule, which is the
    // information the publisher actually needs to decide.
    if (!guardActiveSession()) return;
    setIsPublishing(true);
    try {
      let startDate: Date;
      let endDate: Date;

      if (spanWeeks === "month") {
        startDate = new Date(monthStart);
        endDate = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0); // Last day of month
      } else {
        startDate = new Date(weekStart);
        endDate = addDays(weekStart, spanWeeks * 7 - 1);
      }

      // Only the publish itself decides the outcome. Everything after it is
      // bookkeeping on an already-committed change — letting a failed refetch
      // reach the catch below told the user their publish failed when the
      // schedule was in fact live, and they'd publish again.
      await publishSchedule(org.id, startDate, endDate);

      setShowPublishDiff(false);
      closeEditPanel();
      toast.success("Schedule published");

      // Notify affected employees about the published schedule
      queueNotification({
        action: "schedule_published",
        orgId: org.id,
        startDate: formatDateKey(startDate),
        endDate: formatDateKey(endDate),
      });

      // Tell other tabs/users to refetch before we refetch ourselves, so a
      // slow local refresh can't leave them stale.
      clearPendingBroadcast(DRAFT_CHANGED_BROADCAST_KEY);
      sendReliableBroadcast("schedule_published", {}, { key: "schedule_published" });
      // Update last-viewed so publisher doesn't see their own changes as "new" on next visit
      void updateScheduleLastViewed(org.id);

      // Cancel any pending draft-changed debounce to prevent stale data
      // from overwriting the fresh post-publish refetch.
      if (draftChangedDebounceRef.current) {
        clearTimeout(draftChangedDebounceRef.current);
        draftChangedDebounceRef.current = null;
      }

      try {
        await refetchScheduleData();
        await refetchPublishedRanges();
        const recentPublishes = await fetchRecentPublishHistory(org.id, lastViewedRef.current);
        setPublishHistory(recentPublishes);
      } catch (err: unknown) {
        Sentry.captureException(err);
        toast.error("Published, but the view couldn't refresh. Reload to see the latest.");
      }
    } catch (err: unknown) {
      Sentry.captureException(err);
      toast.error("We couldn't publish the schedule. Try again.");
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
    guardActiveSession,
    publishWindowDateRange,
  ]);

  const handleCancelChanges = useCallback(
    async (discardAll = false) => {
      const user = currentUserRef.current;
      if (!org || !user) return;
      // Deliberately not gated on cell locks. Discarding is scoped server-side
      // (by user id for "mine", by window for "all"), so another editor holding
      // an unrelated cell says nothing about whether this discard is safe.
      // Blocking on it left both buttons dead behind a lock notice.
      if (!guardActiveSession()) return;
      setCancelingMode(discardAll ? "all" : "mine");
      try {
        const previousShifts = shiftsRef.current;
        const previousNotes = notesRef.current;
        // Scoped to the same window Publish commits. The confirm dialog counts
        // drafts in this range, and the two buttons sit side by side under that
        // one count — an unscoped discard would delete every other period too.
        await discardScheduleDrafts(
          org.id,
          discardAll ? undefined : user.id,
          publishWindowDateRange.startDateKey,
          publishWindowDateRange.endDateKey,
        );

        // Past this point the drafts are gone; a failed refetch is a stale
        // view, not a failed discard.
        setShowDiscardConfirm(false);
        closeEditPanel();
        toast.success(discardAll ? "All changes discarded" : "Your changes discarded");

        if (discardAll) {
          // Dedicated event for discard-all — triggers immediate refetch on all
          // clients. Sent before our own refetch so a slow local refresh can't
          // leave everyone else looking at drafts that no longer exist.
          clearPendingBroadcast(DRAFT_CHANGED_BROADCAST_KEY);
          sendReliableBroadcast("drafts_discarded", {}, { key: "drafts_discarded" });
        }

        try {
          const refreshed = await refetchScheduleDataRef.current();
          if (!discardAll) {
            const realtimeDiff = refreshed
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
        } catch (err: unknown) {
          Sentry.captureException(err);
          toast.error("Discarded, but the view couldn't refresh. Reload to see the latest.");
        }
      } catch (err: unknown) {
        toast.error("We couldn't discard your changes. Try again.");
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
      publishWindowDateRange.startDateKey,
      publishWindowDateRange.endDateKey,
      guardActiveSession,
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
        shiftId != null ? (shiftCategories.find((item) => item.id === shiftId) ?? null) : null;
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

  // Why the viewer currently looking at openShiftDetails can't personally
  // claim it — shown in the read-only details modal below.
  const openShiftDetailsReasons = useMemo(() => {
    if (!openShiftDetails) return [];
    if (!currentEmployee) return ["a linked staff profile"];
    const representativeId =
      openShiftDetails.assignmentIds[0] ??
      openShiftDetails.eligibleAssignmentDefinitionIds?.[0] ??
      null;
    const assignment = representativeId != null ? assignmentById.get(representativeId) : undefined;
    if (!assignment) return [];
    return getAssignmentDisqualificationReasons(currentEmployee, {
      assignment,
      shiftCategories,
      jobs,
      focusAreaNames: focusAreaNameMap,
      roleNames: roleNameMap,
      certificationNames: certificationNameMap,
      orgRoles,
    });
  }, [
    openShiftDetails,
    currentEmployee,
    assignmentById,
    shiftCategories,
    jobs,
    focusAreaNameMap,
    roleNameMap,
    certificationNameMap,
    orgRoles,
  ]);

  const handleClaimOpenShift = useMemo<ScheduleGridHandlers["onClaimOpenShift"]>(
    () =>
      currentEmpId
        ? (openShift: GridOpenShift) => {
            const dateObj = new Date(openShift.date + "T00:00:00");
            if (openShift.source === "coverage_gap" && currentEmployee) {
              if (!currentEmployee.focusAreaIds.includes(openShift.focusAreaId)) {
                toast.error("You are not assigned to the focus area required for this shift.");
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
                toast.error("You aren't qualified to cover this gap.");
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
                  (assignment) => assignment.id === openShift.preferredOpenAssignmentDefinitionId,
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

  // Routes an open-shift click to the claim/volunteer flow when the viewer is
  // personally eligible, or to a read-only details view when they aren't
  // (only reachable by canSeeAllOpenShifts viewers — everyone else never sees
  // an ineligible shift in the first place, per the openShifts memo above).
  const handleOpenShiftClick = useCallback(
    (openShift: GridOpenShift) => {
      if (openShift.viewerEligible === false) {
        if (canSeeAllOpenShifts) {
          setOpenShiftDetails(openShift);
        }
        return;
      }
      handleClaimOpenShift?.(openShift);
    },
    [canSeeAllOpenShifts, handleClaimOpenShift],
  );

  const scheduleGridModel = useMemo(
    () =>
      buildScheduleGridModel({
        filteredEmployees,
        allEmployees: employees,
        week1,
        week2,
        spanWeeks: spanWeeks === "month" ? 1 : spanWeeks,
        todayKey,
        focusAreas,
        departments,
        assignments,
        historicalAssignments: allAssignmentDefinitions,
        shiftCategories,
        jobs,
        indicatorTypes,
        certifications,
        orgRoles,
        useCompactRoleCertificationLabels: org?.useCompactRoleCertificationLabels ?? false,
        coverageRequirements,
        absenceTypeMap: absenceTypeObjectMap,
        cellEditors: editingCells,
        resolvePublisherName: (userId: string) => auditNames.get(userId) ?? null,
        openShifts,
        activeFocusArea,
        highlightEmpIds: searchMatchedEmployeeIds,
        highlightScrollKey: normalizedStaffSearch || undefined,
        isCellInteractive: canEditShifts || canEditNotes || !!currentEmpId,
        canDragShifts: canEditShifts,
        shiftDisplayMode: org?.shiftDisplayMode ?? "code",
        showShiftDetailHoverCards: org?.showShiftDetailHoverCards ?? true,
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
          fromRecurringForKey,
          publishedLabelForKey,
          publishedAssignmentIdsForKey,
          publishedAbsenceTypeIdForKey,
          publishDiffForKey: publishDiffKindForKey,
          createdByNameForKey: canRenderAuthorNames ? createdByNameForKey : undefined,
          absenceTypeIdForKey,
          activeRequestForKey,
        },
      }),
    [
      filteredEmployees,
      employees,
      week1,
      week2,
      spanWeeks,
      todayKey,
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
      editingCells,
      auditNames,
      openShifts,
      activeFocusArea,
      searchMatchedEmployeeIds,
      normalizedStaffSearch,
      canEditShifts,
      canEditNotes,
      currentEmpId,
      org?.shiftDisplayMode,
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
      fromRecurringForKey,
      publishedLabelForKey,
      publishedAssignmentIdsForKey,
      publishedAbsenceTypeIdForKey,
      publishDiffKindForKey,
      canRenderAuthorNames,
      createdByNameForKey,
      absenceTypeIdForKey,
      activeRequestForKey,
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
            if (targetsByKey.has(key)) continue;

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
    editingCells,
    scheduleGridModel.columns,
    scheduleGridModel.departments,
    shiftForKey,
    shifts,
    spanWeeks,
  ]);

  const visibleBulkDeleteTargetByKey = useMemo(
    () => new Map(visibleBulkDeleteTargets.map((target) => [target.key, target])),
    [visibleBulkDeleteTargets],
  );

  const visibleBulkDeleteCellKeys = useMemo(
    () => new Set(visibleBulkDeleteTargets.map((target) => target.key)),
    [visibleBulkDeleteTargets],
  );

  // Every cell the grid is currently drawing, deletable or not. Used to tell a
  // selection that scrolled out of view (keep it — the user paged away and will
  // page back) apart from one that stopped being removable while on screen
  // (drop it — someone locked or emptied the cell).
  const renderedCellKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const department of scheduleGridModel.departments) {
      for (const section of department.sections) {
        for (const emp of section.employees) {
          for (const column of scheduleGridModel.columns) {
            keys.add(`${emp.id}_${column.dateKey}`);
          }
        }
      }
    }
    return keys;
  }, [scheduleGridModel.columns, scheduleGridModel.departments]);

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

  const showPublicationRangeErrorForViewer =
    !isScheduleEditor && publicationRangeState.status === "error" && !hasVisibleScheduleEntries;
  const hideGridForUnpublishedViewer =
    !isScheduleEditor &&
    publicationRangeState.status === "loaded" &&
    rawPublishedWindowState === "unpublished";
  const hideGridForPublicationState =
    hideGridForUnpublishedViewer || showPublicationRangeErrorForViewer;

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

  // Selections kept from periods the user has paged away from. Only the visible
  // ones can be reviewed and removed, so the banner has to say so rather than
  // let the count quietly disagree with what Remove does.
  const offscreenBulkDeleteCount = bulkDeleteSelectedKeys.size - bulkDeleteSelectedTargets.length;

  useEffect(() => {
    if (!isBulkDeleteMode) return;
    setBulkDeleteSelectedKeys((prev) => {
      const next = new Set<string>();
      for (const key of prev) {
        // On screen and no longer removable: someone locked it or emptied it,
        // so the selection is genuinely stale. Off screen: the user just paged
        // away — silently emptying their selection for that is maddening.
        if (visibleBulkDeleteTargetByKey.has(key) || !renderedCellKeys.has(key)) next.add(key);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [isBulkDeleteMode, visibleBulkDeleteTargetByKey, renderedCellKeys]);

  useEffect(() => {
    if (canEditShifts && !isSessionEnded && !isMobile && spanWeeks !== "month") return;
    setIsBulkDeleteMode(false);
    setShowBulkDeleteReview(false);
    setBulkDeleteSelectedKeys(new Set());
  }, [canEditShifts, isMobile, isSessionEnded, spanWeeks]);

  const handleToggleBulkDeleteMode = useCallback(() => {
    if (isSessionEnded) {
      setShowSessionEndedDialog(true);
      return;
    }
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
    // Bulk mode replaces the publish banner, which is where the overlay's
    // only toggle lives — leaving it on would strand it behind the swap.
    setShowPublishDiff(false);
  }, [closeEditPanel, isBulkDeleteMode, isSessionEnded]);

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

  // Escape leaves whichever grid-wide mode is on. Every one of these is hosted
  // by a banner that other UI can unmount, so the keyboard is the one exit that
  // can't be taken away. Modals stop the event before it reaches us, and the
  // state guards below keep us off any overlay that owns its own Escape.
  const canExitModeWithEscape =
    (showPublishDiff || isBulkDeleteMode) &&
    !editPanel &&
    !contextMenu &&
    !pendingClearShift &&
    !activeOperation &&
    !showBulkDeleteReview &&
    !showDiscardConfirm &&
    !showPublishConfirm &&
    !showAutoFillConfirm &&
    !showPublishHistory &&
    !showPrintOptions &&
    !showRequestBoard;

  useEffect(() => {
    if (!canExitModeWithEscape) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setShowPublishDiff(false);
      handleCancelBulkDeleteMode();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [canExitModeWithEscape, handleCancelBulkDeleteMode]);

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
    if (!guardActiveSession()) return;

    setIsBulkDeleting(true);
    try {
      const { deleted, failed } = await applyShiftDeleteUpdates(updates, {
        broadcast: true,
        failureMessage: "We couldn't remove one or more entries. Try again.",
      });

      if (failed > 0) {
        // applyShiftDeleteUpdates already said what went wrong. Stay in bulk
        // mode with the untouched cells still selected so the user can retry
        // exactly those, rather than being told everything worked.
        const failedKeys = new Set(updates.slice(deleted).map((update) => update.key));
        setBulkDeleteSelectedKeys(failedKeys);
        setShowBulkDeleteReview(false);
        if (deleted > 0) {
          toast.info(
            `Removed ${deleted} of ${updates.length}. The rest are still selected. Try again.`,
          );
        }
        return;
      }

      toast.success(`${deleted} selected entr${deleted === 1 ? "y" : "ies"} removed`);
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
    guardActiveSession,
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
      onActivateCell: isSessionEnded
        ? () => setShowSessionEndedDialog(true)
        : handleGridCellActivate,
      onOpenCellMenu: isSessionEnded || isBulkDeleteMode ? undefined : handleGridCellContextMenu,
      onMoveEntry: isSessionEnded || isBulkDeleteMode ? undefined : handleMoveGridEntry,
      onCopyCell: canEditShifts && !isBulkDeleteMode ? handleCopyGridCell : undefined,
      onPasteCell:
        canEditShifts && !isSessionEnded && !isBulkDeleteMode ? handlePasteGridCell : undefined,
      onClearCell:
        canEditShifts && !isSessionEnded && !isBulkDeleteMode
          ? (cellId) => handleClearShift(cellId.empId, getDateFromCellId(cellId))
          : undefined,
      onToggleBulkDeleteCell:
        isBulkDeleteMode && !isSessionEnded ? handleToggleBulkDeleteCell : undefined,
      onClaimOpenShift: isSessionEnded ? undefined : handleOpenShiftClick,
    }),
    [
      handleGridCellActivate,
      handleGridCellContextMenu,
      handleMoveGridEntry,
      canEditShifts,
      isSessionEnded,
      isBulkDeleteMode,
      handleCopyGridCell,
      handlePasteGridCell,
      handleClearShift,
      getDateFromCellId,
      handleToggleBulkDeleteCell,
      handleOpenShiftClick,
    ],
  );

  // ── Loading / error states ───────────────────────────────────────────────────

  const isLoading = orgLoading || empLoading || scheduleLoading;
  // The snapshot only carries shifts and notes, so it can only stand in for the
  // loading screen once the roster is here too — otherwise the grid would paint
  // with no rows and read as broken.
  const canPaintFromSnapshot = paintedFromSnapshot && employees.length > 0;

  if (orgLoading || (scheduleLoading && !org)) {
    return <ScheduleLoadingScreen />;
  }
  if (loadError && !org) {
    return (
      <OrganizationBootstrapRecovery
        automaticallyRetry={bootstrapRetryable}
        onRetry={retryOrganizationBootstrap}
      />
    );
  }

  return (
    <div
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "var(--dg-color-bg)",
        minHeight: "100vh",
        color: "var(--dg-color-text-primary)",
      }}
    >
      {isLoading && !canPaintFromSnapshot && employees.length > 0 && <ScheduleLoadingScreen />}

      {(!isLoading || canPaintFromSnapshot) && (
        <>
          <div
            className="no-print"
            style={{
              position: "sticky",
              top: "var(--dg-app-shell-header-height)",
              display: "flow-root",
              zIndex: 99,
              background: "var(--dg-color-bg)",
            }}
          >
            {isSessionEnded && (
              <div className="dg-draft-banner no-print" role="status">
                <div className="dg-draft-banner-dot" />
                <strong>Schedule session ended</strong>
                <span>
                  This tab is read-only. Any unsaved schedule changes here were not saved.
                </span>
                <div className="dg-draft-banner-actions">
                  <Button
                    type="button"
                    className="dg-btn dg-btn-secondary dg-btn-sm"
                    onClick={() => window.location.reload()}
                  >
                    Reload to start a new session
                  </Button>
                </div>
              </div>
            )}
            {sameAccountSessions.length > 0 && !isSessionEnded && (
              <ScheduleSessionWarning
                sessionCount={sameAccountSessions.length}
                onEndOtherSessions={handleEndOtherScheduleSessions}
                onSignOutThisDevice={() => signOut({ scope: "local" })}
              />
            )}
            {isBulkDeleteMode && (
              <div
                className="dg-draft-banner no-print"
                style={{
                  background: "var(--dg-color-danger-bg)",
                  borderColor: "var(--dg-color-danger-border)",
                  color: "var(--dg-color-danger-text)",
                }}
              >
                <div
                  className="dg-draft-banner-dot"
                  style={{ background: "var(--dg-color-danger)" }}
                />
                <span style={{ fontWeight: 700 }}>Bulk delete</span>
                <span
                  style={{
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-danger-text)",
                    marginLeft: 4,
                  }}
                >
                  {`${bulkDeleteSelectedKeys.size} selected of ${visibleBulkDeleteTargets.length} removable visible entr${visibleBulkDeleteTargets.length === 1 ? "y" : "ies"}`}
                  {offscreenBulkDeleteCount > 0
                    ? ` (${offscreenBulkDeleteCount} in another period, not removed from here)`
                    : ""}
                </span>
                <div className="dg-draft-banner-actions">
                  <Button
                    type="button"
                    className="dg-btn dg-btn-danger"
                    onClick={handleSelectVisibleBulkDeleteEntries}
                    disabled={visibleBulkDeleteTargets.length === 0}
                    style={{ fontSize: "var(--dg-fs-caption)", padding: "5px 12px" }}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    className="dg-btn dg-btn-secondary"
                    onClick={() => setBulkDeleteSelectedKeys(new Set())}
                    disabled={bulkDeleteSelectedKeys.size === 0}
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      padding: "5px 12px",
                      color: "var(--dg-color-danger-text)",
                      borderColor: "var(--dg-color-danger-border)",
                    }}
                  >
                    Clear selection
                  </Button>
                  <Button
                    type="button"
                    className="dg-btn dg-btn-danger-filled"
                    onClick={() => setShowBulkDeleteReview(true)}
                    disabled={bulkDeleteSelectedKeys.size === 0}
                    style={{ fontSize: "var(--dg-fs-caption)", padding: "5px 12px" }}
                  >
                    Review removal
                  </Button>
                  <Button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={handleCancelBulkDeleteMode}
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      color: "var(--dg-color-danger-text)",
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {!isBulkDeleteMode && canEditShifts && hasUnpublishedChanges && (
              <DraftBanner
                onPublish={() => setShowPublishConfirm(true)}
                onCancel={openDiscardConfirm}
                isPublishing={isPublishing}
                isCanceling={cancelingMode !== null}
                breakdown={draftBreakdown}
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
                    background: "var(--dg-color-info-bg)",
                    borderColor: "var(--dg-color-info-border)",
                    color: "var(--dg-color-info-text)",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    className="dg-draft-banner-dot"
                    style={{ background: "var(--dg-color-info-text)" }}
                  />
                  <span style={{ fontWeight: 600 }}>Also unpublished in other weeks:</span>
                  <span>
                    {(() => {
                      const total = outOfWindowDraftGroups.reduce((s, g) => s + g.count, 0);
                      const unit =
                        spanWeeks === "month" ? "month" : spanWeeks === 2 ? "pay period" : "week";
                      // Counted from the loaded window only, so it can shrink
                      // after a far jump recenters the fetch. Referencing other
                      // weeks makes the schedule relationship clear without
                      // implying a physical location.
                      return `${total} draft${total === 1 ? "" : "s"} in ${outOfWindowDraftGroups.length} other ${unit}${outOfWindowDraftGroups.length === 1 ? "" : "s"} within the loaded dates (${outOfWindowDraftGroupRanges.join(", ")})`;
                    })()}
                  </span>
                  <div className="dg-draft-banner-actions" style={{ flexWrap: "wrap" }}>
                    {outOfWindowDraftGroups.map((group, index) => (
                      <Hint
                        key={group.periodKey}
                        content={hint(`Jump to this period to publish or discard its drafts`)}
                        side="bottom"
                      >
                        <Button
                          type="button"
                          onClick={() => setWeekStart(group.periodStart)}
                          className="dg-btn dg-btn-secondary dg-btn-sm"
                        >
                          {outOfWindowDraftGroupRanges[index]}{" "}
                          <span style={{ marginLeft: 4 }}>({group.count})</span>
                        </Button>
                      </Hint>
                    ))}
                    <Hint
                      content={hint("Hide this banner for the rest of this session")}
                      side="bottom"
                    >
                      <Button
                        type="button"
                        onClick={dismissOutOfWindowDrafts}
                        className="dg-btn dg-btn-secondary dg-btn-sm"
                      >
                        Close
                      </Button>
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
                  a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0,
                );
                const totalChanges = sortedGroups.reduce((s, g) => s + g.changeCount, 0);
                const noun =
                  spanWeeks === "month" ? "month" : spanWeeks === 2 ? "pay period" : "week";
                return (
                  <div
                    className="dg-draft-banner no-print"
                    style={{
                      background: "var(--dg-color-info-bg)",
                      borderColor: "var(--dg-color-info-border)",
                      color: "var(--dg-color-info-text)",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      className="dg-draft-banner-dot"
                      style={{ background: "var(--dg-color-info-text)" }}
                    />
                    <span style={{ fontWeight: 600 }}>Recently published:</span>
                    <span>
                      {`${totalChanges} change${totalChanges === 1 ? "" : "s"} in ${sortedGroups.length} other ${noun}${sortedGroups.length === 1 ? "" : "s"}`}
                    </span>
                    <div className="dg-draft-banner-actions" style={{ flexWrap: "wrap" }}>
                      {sortedGroups.map((group) => {
                        const [sy, sm, sd] = group.startDate.split("-").map(Number);
                        const startDate = new Date(sy, sm - 1, sd);
                        const [ey, em, ed] = group.endDate.split("-").map(Number);
                        const endDate = new Date(ey, em - 1, ed);
                        return (
                          <Hint
                            key={group.key}
                            content={hint("Jump to this period to view what changed")}
                            side="bottom"
                          >
                            <Button
                              type="button"
                              onClick={() =>
                                // Snap to the current span's own period start.
                                // A raw publish start (a month's 1st, say) drops
                                // a 1-week grid onto an arbitrary weekday.
                                setWeekStart(
                                  getScheduleStartForSpan({
                                    date: startDate,
                                    span: spanWeeks,
                                    payPeriodStartDate,
                                  }),
                                )
                              }
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                            >
                              {`${formatDate(startDate)}–${formatDate(endDate)}`}{" "}
                              <span style={{ marginLeft: 4 }}>({group.changeCount})</span>
                            </Button>
                          </Hint>
                        );
                      })}
                      <Hint
                        content={hint("Hide this banner for the rest of this session")}
                        side="bottom"
                      >
                        <Button
                          type="button"
                          onClick={dismissOutOfWindowPublishes}
                          className="dg-btn dg-btn-secondary dg-btn-sm"
                        >
                          Close
                        </Button>
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
                return (
                  <div
                    className="dg-draft-banner no-print"
                    style={{
                      background: "var(--dg-color-info-bg)",
                      borderColor: "var(--dg-color-info-border)",
                      color: "var(--dg-color-info-text)",
                    }}
                  >
                    <div
                      className="dg-draft-banner-dot"
                      style={{ background: "var(--dg-color-primary)" }}
                    />
                    <span style={{ fontWeight: 600 }}>
                      Published{" "}
                      {(() => {
                        const diff = Date.now() - new Date(latest.publishedAt).getTime();
                        const mins = Math.floor(diff / 60000);
                        if (mins < 1) return "just now";
                        if (mins < 60) return `${mins} min ago`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs} hr ago`;
                        const days = Math.floor(hrs / 24);
                        return `${days} day${days !== 1 ? "s" : ""} ago`;
                      })()}
                    </span>
                    {/* The counts are the key: each kind is named, counted
                        and colored once, and only the kinds this publish
                        actually contains appear at all. */}
                    <ChangeCountChips counts={publishChangeCounts} />
                    {inWindowPublishHistory.length > 1 && (
                      <span style={{ marginLeft: 4 }}>
                        across {inWindowPublishHistory.length} publishes
                      </span>
                    )}
                    <div className="dg-draft-banner-actions">
                      {isMobile ? (
                        // Publish History's "Show on Grid" reaches the overlay
                        // on a phone too, so the way back out has to live here
                        // rather than only on the wide layout.
                        showPublishDiff ? (
                          <Button
                            onClick={() => setShowPublishDiff(false)}
                            className="dg-btn dg-btn-info"
                            style={{
                              fontSize: "var(--dg-fs-caption)",
                              padding: "5px 12px",
                            }}
                          >
                            Hide Changes
                          </Button>
                        ) : (
                          <span
                            style={{
                              fontSize: "var(--dg-fs-footnote)",
                              fontStyle: "italic",
                            }}
                          >
                            Use a larger screen to view details
                          </span>
                        )
                      ) : (
                        <>
                          <Hint
                            content={hint("Highlight this publish's changes on the grid")}
                            side="bottom"
                          >
                            <Button
                              onClick={() => setShowPublishDiff((v) => !v)}
                              className={`dg-btn ${showPublishDiff ? "dg-btn-info" : "dg-btn-secondary"}`}
                              style={{
                                fontSize: "var(--dg-fs-caption)",
                                padding: "5px 12px",
                              }}
                            >
                              {showPublishDiff ? "Hide Changes" : "Highlight Changes"}
                            </Button>
                          </Hint>
                          <Button
                            onClick={() => setShowPublishHistory(true)}
                            className="dg-btn dg-btn-secondary"
                            style={{
                              fontSize: "var(--dg-fs-caption)",
                              padding: "5px 12px",
                            }}
                          >
                            View History
                          </Button>
                          <Button
                            // Not async: the write is deliberately
                            // fire-and-forget and the banner goes away on the
                            // spot, so there is nothing to await and nothing
                            // to double-click.
                            onClick={() => {
                              if (org) {
                                void updateScheduleLastViewed(org.id);
                                lastViewedRef.current = new Date().toISOString();
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
                          </Button>
                        </>
                      )}
                      <Hint content={hint("Hide this notice and any highlights")} side="bottom">
                        <Button
                          type="button"
                          onClick={() => {
                            // The banner hosts the only toggle for the
                            // overlay, so it has to take the overlay with it.
                            setShowPublishDiff(false);
                            dismissPublishBanner();
                          }}
                          className="dg-btn dg-btn-secondary dg-btn-sm"
                        >
                          Close
                        </Button>
                      </Hint>
                    </div>
                  </div>
                );
              })()}
            <div
              data-tour="schedule-toolbar"
              style={{
                // Horizontally on the canonical page gutter, shared with the
                // header logo and every other page (see globals.css).
                padding: "12px var(--dg-page-gutter) 0",
                borderBottom: "1px solid var(--dg-color-border)",
              }}
            >
              <Toolbar
                weekStart={weekStart}
                spanWeeks={spanWeeks}
                activeFocusArea={activeFocusArea}
                staffSearch={staffSearch}
                sortBy={scheduleSortBy}
                onSortByChange={handleSortByChange}
                focusAreas={focusAreas}
                onPrev={handlePrev}
                onNext={handleNext}
                onToday={handleToday}
                onSpanChange={handleSpanChange}
                onFocusAreaChange={setActiveFocusArea}
                onStaffSearchChange={setStaffSearch}
                canApplyRecurringSchedule={canEditShifts && canApplyRecurringSchedule}
                onApplyRecurring={handleAutoFillPreview}
                isApplyingRecurring={isApplyingRecurring}
                canImportPrevious={canEditShifts}
                onImportPrevious={spanWeeks !== "month" ? handleImportPreviousPreview : undefined}
                isImportingPrevious={isImportingPrevious}
                onPrintOpen={featureFlags.printing ? () => setShowPrintOptions(true) : undefined}
                onExportCSV={
                  // /api/export already requires canEditShifts for a schedule
                  // export; this client-side one was handing the same roster to
                  // anyone with the page open.
                  canEditShifts && dates.length > 0 && filteredEmployees.length > 0
                    ? () => exportScheduleCSV(filteredEmployees, dates, shiftNameForKey)
                    : undefined
                }
                presenceSlot={
                  isScheduleEditor ? (
                    <PresenceAvatars
                      onlineUsers={onlineUsers}
                      profiles={presenceProfiles}
                      onRosterOpen={handlePresenceRosterOpen}
                    />
                  ) : null
                }
                showAudit={showAudit}
                onAuditToggle={
                  canEditShifts && !isMobile ? () => setShowAudit((prev) => !prev) : undefined
                }
                requestsBadgeCount={shiftRequests.badgeCount}
                onRequestsToggle={() => setShowRequestBoard((prev) => !prev)}
                coverageGapCount={visibleCoverageGaps.length}
                onCoverageToggle={
                  canViewCoveragePanel ? () => setShowCoveragePanel((prev) => !prev) : undefined
                }
                hideTwoWeek={shouldAutoUseOneWeek}
                onPublishHistory={canEditShifts ? () => setShowPublishHistory(true) : undefined}
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
              <div
                data-tour="schedule-timezone-clocks"
                style={{ padding: "2px 0 8px", justifyContent: "flex-end", display: "flex" }}
              >
                <TimeZoneClocks now={new Date(currentTimeTick)} orgTimezone={orgTimeZone} compact />
              </div>
            </div>
          </div>

          <div style={{ padding: isMobile ? "8px 0" : "16px 16px" }}>
            {showPublicationRangeErrorForViewer && (
              <EmptyState
                heading="We couldn't confirm this period's publication status"
                description="Check your connection and try loading the publication status again."
                action={
                  <Button
                    type="button"
                    className="dg-btn dg-btn-secondary"
                    onClick={() => void refetchPublishedRanges()}
                  >
                    Try again
                  </Button>
                }
              />
            )}

            {hideGridForUnpublishedViewer && (
              <EmptyState
                heading="This period has not been published yet"
                description="Your schedule will appear here once your manager publishes it."
              />
            )}

            {/* Mobile Day View */}
            {spanWeeks !== "month" && isMobile && !hideGridForPublicationState && (
              <MobileDayView
                filteredEmployees={filteredEmployees}
                allEmployees={employees}
                dates={dates.slice(0, 7)}
                shiftForKey={shiftForKey}
                assignmentIdsForKey={assignmentIdsForKey}
                getShiftStyle={getShiftStyle}
                handleCellClick={handleCellClick}
                todayKey={todayKey}
                focusAreas={focusAreas}
                assignments={assignments}
                shiftCategories={shiftCategories}
                indicatorTypes={indicatorTypes}
                certifications={certifications}
                orgRoles={orgRoles}
                isCellInteractive={canEditShifts || canEditNotes || !!currentEmpId}
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
            {spanWeeks !== "month" && !isMobile && !hideGridForPublicationState && (
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
                (cmShiftEntry.assignmentIds.length > 0 || cmShiftEntry.absenceTypeId != null) &&
                !cmShiftEntry.isDelete
              );
              const cmCanRequestBase =
                !cmShiftEntry?.absenceTypeId &&
                canCreateOwnShiftRequest(contextMenu.cellId.empId, contextMenuDate);
              const cmCanRequest =
                cmCanRequestBase &&
                !hasActiveRequestForShift(contextMenu.cellId.empId, contextMenuDate);
              const cmHasActiveRequest = hasActiveRequestForShift(
                contextMenu.cellId.empId,
                contextMenuDate,
              );
              // Only show the menu when at least one action is usable
              const hasEditActions = canEditShifts && (cmHasEntry || !!clipboard);
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
                  onClear={() => handleClearShift(contextMenu.cellId.empId, contextMenuDate)}
                  onNeedCoverage={() => {
                    const emp = employees.find((e) => e.id === contextMenu.cellId.empId);
                    if (!emp) return;
                    const cellKey = `${emp.id}_${contextMenu.cellId.dateKey}`;
                    if (!guardActiveSession()) return;
                    announceEditingCell(cellKey);
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
                    const emp = employees.find((e) => e.id === contextMenu.cellId.empId);
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
                  if (setShift(pendingClearShift.empId, pendingClearShift.date, null)) {
                    setPendingClearShift(null);
                  }
                }}
                onCancel={() => setPendingClearShift(null)}
              />
            )}

            {showBulkDeleteReview && (
              <ConfirmDialog
                title="Review Bulk Removal"
                message={<BulkDeleteReviewContent targets={bulkDeleteSelectedTargets} />}
                confirmLabel="Remove"
                cancelLabel="Back"
                variant="danger"
                maxWidth={620}
                wrapActions
                isLoading={isBulkDeleting}
                confirmDisabled={bulkDeleteSelectedTargets.length === 0}
                onConfirm={() => handleConfirmBulkDelete()}
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
                  <div
                    style={{
                      fontSize: "var(--dg-fs-body-sm)",
                      color: "var(--dg-color-text-secondary)",
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>
                      {coverageGapSelection.openShift.assignmentFullName ??
                        coverageGapSelection.openShift.ruleLabel ??
                        coverageGapSelection.openShift.assignmentLabel}
                    </strong>{" "}
                    on <strong>{coverageGapSelection.openShift.date}</strong> can be covered by more
                    than one exact assignment option. Choose which option you want to volunteer for.
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        fontWeight: 600,
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      Shift and job
                    </span>
                    <CustomSelect
                      value={String(coverageGapSelection.selectedAssignmentDefinitionId)}
                      options={coverageGapSelection.qualifiedAssignmentDefinitions.map(
                        (assignment) => ({
                          value: String(assignment.id),
                          label:
                            spellOutAssignment(assignment.id) ??
                            assignmentLabelMap.get(assignment.id) ??
                            (assignment.name || assignment.label),
                        }),
                      )}
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
                    <Button
                      type="button"
                      className="dg-btn dg-btn-secondary"
                      onClick={() => setCoverageGapSelection(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="dg-btn dg-btn-primary"
                      onClick={() => {
                        const selectedAssignmentDefinition =
                          coverageGapSelection.qualifiedAssignmentDefinitions.find(
                            (assignment) =>
                              assignment.id === coverageGapSelection.selectedAssignmentDefinitionId,
                          );
                        if (!selectedAssignmentDefinition) return;
                        const dateObj = new Date(coverageGapSelection.openShift.date + "T00:00:00");
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
                        if (!volunteerInput) {
                          toast.error("That open shift is no longer available.");
                          return;
                        }
                        setCoverageGapSelection(null);
                        setPendingCoverageGapVolunteer({
                          assignmentLabel:
                            spellOutAssignment(selectedAssignmentDefinition.id) ??
                            coverageGapSelection.openShift.assignmentFullName ??
                            selectedAssignmentDefinition.label ??
                            coverageGapSelection.openShift.assignmentLabel,
                          date: coverageGapSelection.openShift.date,
                          focusAreaId: coverageGapSelection.openShift.focusAreaId,
                          input: volunteerInput,
                        });
                      }}
                    >
                      Volunteer
                    </Button>
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
                    Volunteer for <strong>{pendingCoverageGapVolunteer.assignmentLabel}</strong> on{" "}
                    <strong>{pendingCoverageGapVolunteer.date}</strong>? This will be sent to your
                    admin for approval.
                  </>
                }
                title="Volunteer for this shift?"
                variant="info"
                onCancel={() => {
                  if (!isCoverageGapVolunteerPending) {
                    setPendingCoverageGapVolunteer(null);
                  }
                }}
                // Async so the dialog's latch holds for the whole request:
                // returning the promise is what blocks a second confirm, which
                // the old `isCoverageGapVolunteerPending` check could not do
                // (both clicks read it before React re-rendered).
                onConfirm={async () => {
                  const pendingVolunteer = pendingCoverageGapVolunteer;
                  setIsCoverageGapVolunteerPending(true);
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
                    We'll send this to your admin for approval.
                  </>
                }
                confirmLabel={pendingClaimShift.source === "calloff" ? "Claim" : "Volunteer"}
                variant="info"
                isLoading={isClaimShiftPending}
                // Async so the dialog's latch holds for the whole request:
                // returning the promise is what blocks a second confirm, which
                // the old `isClaimShiftPending` check could not do (both clicks
                // read it before React re-rendered).
                onConfirm={async () => {
                  const os = pendingClaimShift;
                  setIsClaimShiftPending(true);
                  try {
                    let completed = false;
                    if (os.source === "calloff" && os.requestId) {
                      completed = await shiftRequests.claim(os.requestId, currentEmpId);
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
                }}
                onCancel={() => {
                  if (!isClaimShiftPending) {
                    setPendingClaimShift(null);
                  }
                }}
              />
            )}

            {/* Read-only info view for scheduler/admin viewers who see every
                open shift but aren't personally eligible to claim this one. */}
            {openShiftDetails && (
              <Modal title="Open Shift Details" onClose={() => setOpenShiftDetails(null)}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <strong>
                      {spellOutAssignment(openShiftDetails.assignmentIds[0]) ??
                        openShiftDetails.assignmentLabel}
                    </strong>{" "}
                    on <strong>{openShiftDetails.date}</strong>
                  </div>
                  {openShiftDetails.calledOffBy && (
                    <div>Called off by {openShiftDetails.calledOffBy}</div>
                  )}
                  <div>{openShiftDetails.needed ?? 1} needed</div>
                  <div style={{ color: "var(--dg-color-text-muted)" }}>
                    {openShiftDetailsReasons.length > 0
                      ? `You can't personally claim this shift: it requires ${openShiftDetailsReasons.join(", ")}.`
                      : "You aren't personally eligible to claim this shift."}
                  </div>
                </div>
              </Modal>
            )}

            {/* Confirm dialog for pasting over an existing shift */}
            {pendingPasteOver && (
              <ConfirmDialog
                title="Replace Entry?"
                message={`Replace "${pendingPasteOver.existingLabel}" with "${getInputLabel(pendingPasteOver.pasteEntry)}"?`}
                confirmLabel="Replace"
                variant="warning"
                onConfirm={() => {
                  if (
                    setShift(
                      pendingPasteOver.empId,
                      pendingPasteOver.date,
                      pendingPasteOver.pasteEntry,
                    )
                  ) {
                    setPendingPasteOver(null);
                    toast.success("Entry pasted");
                  }
                }}
                onCancel={() => setPendingPasteOver(null)}
              />
            )}

            {spanWeeks === "month" && !hideGridForPublicationState && (
              <MonthView
                monthStart={monthStart}
                filteredEmployees={filteredEmployees}
                shiftForKey={shiftForKey}
                assignmentIdsForKey={assignmentIdsForKey}
                isAbsenceForKey={isAbsenceForKey}
                getShiftStyle={getShiftStyle}
                todayKey={todayKey}
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
                shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]?.seriesId ??
                null
              }
              fromRecurring={panelShiftEntry?.fromRecurring ?? false}
              onRepeatConfirm={
                canEditShifts && canManageShiftSeries ? handleRepeatConfirm : undefined
              }
              isCreatingRepeatSeries={isCreatingRepeatSeries}
              empId={editPanel.empId}
              customStartTime={panelCustomStartTime}
              customEndTime={panelCustomEndTime}
              onCustomTimeChange={canEditShifts ? handleCustomTimeChange : undefined}
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
              auditInfo={canEditShifts && canRenderAuthorNames ? auditInfo : undefined}
              overlapWarnings={overnightOverlapWarnings}
              enforceConflicts={org?.enforceConflictPrevention ?? false}
              defaultShiftEnabled={org?.defaultShiftEnabled ?? true}
              isOwnShift={!!currentEmpId && editPanel.empId === currentEmpId}
              hasActiveRequest={hasActiveRequestForShift(editPanel.empId, editPanel.date)}
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
              openPickups={
                canEditShifts
                  ? shiftRequests.openPickups
                  : shiftRequests.openPickups.filter((req) => {
                      if (!currentEmpId) return true;
                      const dateObj = new Date(req.requesterShiftDate + "T00:00:00");
                      const myRanges = getShiftTimeRanges(currentEmpId, dateObj);
                      if (myRanges.length === 0) return true;
                      const pickupRanges: TimeRange[] = [];
                      // Use request custom times as highest priority
                      if (req.requesterCustomStartTime && req.requesterCustomEndTime) {
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
                            const cat = shiftCategories.find((c) => c.id === sc.categoryId);
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
                    })
              }
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
              onResolve={(id, approved, note) => shiftRequests.resolve(id, approved, note)}
              onCancel={(id) => {
                if (!currentEmpId) return;
                return shiftRequests.cancel(id, currentEmpId);
              }}
              onClose={() => setShowRequestBoard(false)}
              absenceTypeMap={absenceTypeObjectMap}
              assignmentNameMap={assignmentNameMap}
            />
          )}

          {/* ── Coverage Panel (slide-out) ── */}
          {showCoveragePanel && canViewCoveragePanel && (
            <CoveragePanel
              gaps={visibleCoverageGaps}
              focusAreas={focusAreas}
              shiftCategories={shiftCategories}
              activeFocusArea={activeFocusArea}
              publishedWindowState={publishedWindowState}
              onClose={() => setShowCoveragePanel(false)}
            />
          )}

          <PrintLegend assignments={assignments} shiftDisplayMode={org?.shiftDisplayMode} />

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
              absenceTypeIdForKey={absenceTypeIdForKey}
              absenceTypeMap={absenceTypeObjectMap}
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
                      color: "var(--dg-color-text-secondary)",
                    }}
                  >
                    {showOrganizationDiscardScope
                      ? `Published schedule stays live. Choose which drafts to discard for ${currentPublishWindow.label}. Drafts in other periods are left alone.`
                      : `Published schedule stays live. These drafts for ${currentPublishWindow.label} will be removed. Drafts in other periods are left alone.`}
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
              onConfirm={() => handleCancelChanges()}
              onCancel={closeDiscardConfirm}
              secondaryConfirmLabel={
                showOrganizationDiscardScope ? "Discard all drafts" : undefined
              }
              isSecondaryLoading={cancelingMode === "all"}
              secondaryConfirmDisabled={draftBreakdown.totalChanges === 0}
              onSecondaryConfirm={
                showOrganizationDiscardScope ? () => handleCancelChanges(true) : undefined
              }
            />
          )}

          {showSessionEndedDialog && (
            <ScheduleSessionEndedDialog onClose={() => setShowSessionEndedDialog(false)} />
          )}

          {showPublishConfirm && (
            <ConfirmDialog
              title="Publish Schedule?"
              message={
                <PublishChangeSummary
                  editorRows={publishEditorRows}
                  activeEditors={publishActiveEditors}
                  windowLabel={currentPublishWindow.label}
                  totalChanges={draftBreakdown.totalChanges}
                  coverageGapCount={allCoverageGaps.length}
                />
              }
              maxWidth={560}
              wrapActions
              confirmLabel="Publish"
              variant={allCoverageGaps.length > 0 ? "warning" : "info"}
              isLoading={isPublishing}
              onConfirm={() => {
                setShowPublishConfirm(false);
                return handlePublish();
              }}
              onCancel={() => setShowPublishConfirm(false)}
            />
          )}

          {showAutoFillConfirm && autoFillPreview && (
            <ConfirmDialog
              title="Auto Fill Shifts?"
              message={`This will fill ${autoFillPreview.count} empty schedule slot${autoFillPreview.count === 1 ? "" : "s"} for ${autoFillPreview.dateRange} using recurring templates. Existing visible shifts will not be overwritten.`}
              confirmLabel="Fill"
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
              confirmLabel="Delete"
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
                const { breakdown, sourceRange, targetRange, outcomes } = importPreview;
                const copyLine = `This will copy ${breakdown.imported} shift${
                  breakdown.imported === 1 ? "" : "s"
                } from ${sourceRange} into ${targetRange}.`;
                if (breakdown.totalSkipped === 0) return copyLine;
                const description = formatImportPreviousSkipDescription(
                  outcomes,
                  breakdown,
                  employeeNameById,
                );
                return `${copyLine} ${breakdown.totalSkipped} will be skipped: ${description}.`;
              })()}
              confirmLabel="Import"
              variant="info"
              isLoading={isImportingPrevious}
              onConfirm={handleImportPrevious}
              onCancel={cancelImportConfirm}
            />
          )}
          {showImportResults && importResults && (
            <ImportResultsModal
              sourceRange={importResults.sourceRange}
              targetRange={importResults.targetRange}
              outcomes={importResults.outcomes}
              breakdown={importResults.breakdown}
              nameByEmpId={employeeNameById}
              onClose={closeImportResults}
            />
          )}
          {showPublishHistory && canEditShifts && org && (
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
                // Bring the banner back with the overlay — it carries the
                // legend and the only control that turns the overlay off.
                resetPublishBanner();
              }}
              assignments={assignments}
              shiftCategories={shiftCategories}
              jobs={jobs}
              focusAreas={focusAreas}
              employees={employeeDirectory}
              absenceTypes={allAbsenceTypes}
            />
          )}
          {activeOperation && (
            <ScheduleOperationModal
              title={activeOperation.title}
              detail={activeOperation.detail}
              progress={activeOperation.progress}
            />
          )}
          <ScrollOverflowCue documentViewport />
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
