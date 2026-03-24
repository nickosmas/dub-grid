"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Toolbar from "@/components/Toolbar";
import ScheduleGrid from "@/components/ScheduleGrid";
import MonthView from "@/components/MonthView";
import ShiftEditPanel from "@/components/ShiftEditPanel";
import PrintLegend from "@/components/PrintLegend";
import PrintOptionsModal, { PrintConfig } from "@/components/PrintOptionsModal";
import PrintScheduleView from "@/components/PrintScheduleView";
import DraftBanner from "@/components/DraftBanner";
import ShiftRequestBoard from "@/components/ShiftRequestBoard";
import CoveragePanel from "@/components/CoveragePanel";
import ShiftSwapModal from "@/components/ShiftSwapModal";

import { AnimatedDubGridLogo } from "@/components/Logo";
import { addDays, formatDate, formatDateKey, getWeekStart, getEmployeeDisplayName, iterateDateRange } from "@/lib/utils";
import { filterAndSortEmployees, isEmployeeQualified, getDisqualificationReasons, computeCoverageGaps, timesOverlap } from "@/lib/schedule-logic";
import type { TimeRange } from "@/lib/schedule-logic";
import * as db from "@/lib/db";
import { OptimisticLockError } from "@/lib/db";
import { computeDraftBreakdown } from "@/lib/draft-utils";
import { supabase } from "@/lib/supabase";
import { usePermissions, useOrganizationData, useEmployees, useCellLocks, useShiftRequests } from "@/hooks";
import { useAuth } from "@/components/AuthProvider";
import PresenceAvatars from "@/components/PresenceAvatars";
import { ProtectedRoute } from "@/components/RouteGuards";
import { toast } from "sonner";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import type { ShiftDragData } from "@/components/DraggableShift";
import type { CellDropData } from "@/components/DroppableCell";
import ShiftContextMenu from "@/components/ShiftContextMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import MobileDayView from "@/components/MobileDayView";
import { useMediaQuery, MOBILE, SMALL_DESKTOP } from "@/hooks";
import { useSetMobileSubNav, SubNavItem } from "@/components/MobileSubNavContext";
import {
  Employee,
  EditModalState,
  ShiftMap,
  ShiftCode,
  RecurringShift,
  SeriesFrequency,
  SeriesScope,
  DraftKind,
  PublishChange,
  PublishHistoryEntry,
} from "@/types";

function SchedulerContent() {
  const isMobile = useMediaQuery(MOBILE);
  const isSmallDesktop = useMediaQuery(SMALL_DESKTOP);
  const { user: authUser } = useAuth();
  const { canEditShifts, canEditNotes, canApplyRecurringSchedule, canManageShiftSeries, canPublishSchedule, canApproveShiftRequests, isSuperAdmin, isLoading: permsLoading, orgId } = usePermissions();
  const {
    org, focusAreas, shiftCodes, allShiftCodesRef, shiftCategories,
    indicatorTypes, certifications, orgRoles, shiftCodeMap,
    coverageRequirements,
    loading: orgLoading, loadError,
  } = useOrganizationData();
  // Use orgId from JWT (available immediately) so employee fetch starts
  // in parallel with org data instead of waiting for it.
  const {
    employees,
    loading: empLoading,
  } = useEmployees(orgId ?? org?.id ?? null);

  const today = useRef(new Date()).current;

  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStart(new Date()),
  );
  const [activeFocusArea, setActiveFocusArea] = useState<number | null>(null);
  const [shifts, setShifts] = useState<ShiftMap>({});
  // Ref always points to the latest shifts — used in setShift to read fresh version
  // numbers even when the useCallback closure captures a stale `shifts` object.
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;
  const [notes, setNotes] = useState<Record<string, { indicatorTypeId: number; status: 'published' | 'draft' | 'draft_deleted' }[]>>({});
  const [editPanel, setEditPanel] = useState<EditModalState | null>(null);
  const [preferredSpan, setPreferredSpan] = useState<1 | 2 | "month">(2);
  // Auto-downgrade 2-week to 1-week on narrow screens to prevent column squeeze
  const spanWeeks: 1 | 2 | "month" = isSmallDesktop && preferredSpan === 2 ? 1 : preferredSpan;
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [staffSearch, setStaffSearch] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [cancelingMode, setCancelingMode] = useState<null | 'mine' | 'all'>(null);
  const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [isApplyingRecurring, setIsApplyingRecurring] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [activePrintConfig, setActivePrintConfig] = useState<PrintConfig | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showAutoFillConfirm, setShowAutoFillConfirm] = useState(false);
  const [autoFillPreview, setAutoFillPreview] = useState<{ count: number; dateRange: string } | null>(null);
  const [showDiffOverlay, setShowDiffOverlay] = useState(false);
  const [pendingSeriesDelete, setPendingSeriesDelete] = useState<{ seriesId: string; shiftCount: number } | null>(null);
  const [publishHistory, setPublishHistory] = useState<PublishHistoryEntry | null>(null);
  const [showPublishDiff, setShowPublishDiff] = useState(false);
  const [isImportingPrevious, setIsImportingPrevious] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importPreview, setImportPreview] = useState<{ count: number; sourceRange: string; targetRange: string } | null>(null);

  // ── Coverage Panel ─────────────────────────────────────────────────────────
  const [showCoveragePanel, setShowCoveragePanel] = useState(false);

  // ── Shift Requests (pickup & swap) ────────────────────────────────────────
  const [showRequestBoard, setShowRequestBoard] = useState(false);
  const [swapModalState, setSwapModalState] = useState<{
    empId: string;
    empName: string;
    shiftDate: string;
    shiftLabel: string;
  } | null>(null);

  const currentEmpId = useMemo(
    () => authUser ? employees.find(e => e.userId === authUser.id)?.id ?? null : null,
    [employees, authUser],
  );

  const shiftRequests = useShiftRequests(
    orgId ?? org?.id ?? null,
    shiftCodeMap,
    currentEmpId,
    canApproveShiftRequests,
  );

  const draftBreakdown = useMemo(
    () => computeDraftBreakdown(shifts, notes),
    [shifts, notes],
  );

  const hasUnpublishedChanges = draftBreakdown.totalChanges > 0;

  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null);

  // Audit mode: toggle to show who created each shift under grid cells
  const [showAudit, setShowAudit] = useState(false);
  const profileNameCache = useRef<Map<string, string>>(new Map());
  const [auditInfo, setAuditInfo] = useState<{
    createdByName: string | null;
    updatedByName: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null>(null);

  // ── Drag & Drop state ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const [activeDrag, setActiveDrag] = useState<ShiftDragData | null>(null);

  // ── Clipboard state (copy-paste shifts) ───────────────────────────────────
  const [clipboard, setClipboard] = useState<{
    label: string;
    shiftCodeIds: number[];
  } | null>(null);
  const hoveredCellRef = useRef<{ empId: string; date: Date; focusAreaName: string } | null>(null);

  // ── Context menu state ────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
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

  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const draftChangedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for values used by the realtime channel — reading from refs avoids
  // tearing down & recreating the channel when these change.
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const canEditShiftsRef = useRef(canEditShifts);
  canEditShiftsRef.current = canEditShifts;

  // ── Shared refetch helper (eliminates 4x duplication) ──────────────────────
  const refetchScheduleData = useCallback(async () => {
    if (!org) return;
    const cMap = new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label]));
    const [shiftData, noteRows] = await Promise.all([
      db.fetchShifts(org.id, canEditShiftsRef.current, cMap),
      db.fetchScheduleNotes(org.id),
    ]);
    const noteMap: Record<string, { indicatorTypeId: number; status: 'published' | 'draft' | 'draft_deleted' }[]> = {};
    for (const note of noteRows) {
      const key = note.focusAreaId != null
        ? `${note.empId}_${note.date}_${note.focusAreaId}`
        : `${note.empId}_${note.date}`;
      if (!noteMap[key]) noteMap[key] = [];
      noteMap[key].push({ indicatorTypeId: note.indicatorTypeId, status: note.status });
    }
    setShifts(shiftData);
    setNotes(noteMap);
  }, [org]);

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

    async function fetchCurrentUser(): Promise<{ id: string; name: string } | null> {
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
        const codeMap = new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label]));

        // Critical fetches in parallel — unblock grid render ASAP
        const [shiftData, noteRows, recShifts, latestPublish] = await Promise.all([
          db.fetchShifts(orgId, canEditShifts, codeMap),
          db.fetchScheduleNotes(orgId),
          db.fetchRecurringShifts(orgId, undefined, codeMap),
          db.fetchLatestPublishHistory(orgId).catch(() => null),
        ]);

        const noteMap: Record<string, { indicatorTypeId: number; status: 'published' | 'draft' | 'draft_deleted' }[]> = {};
        for (const note of noteRows) {
          const key = note.focusAreaId != null
            ? `${note.empId}_${note.date}_${note.focusAreaId}`
            : `${note.empId}_${note.date}`;
          if (!noteMap[key]) noteMap[key] = [];
          noteMap[key].push({ indicatorTypeId: note.indicatorTypeId, status: note.status });
        }
        setShifts(shiftData);
        setNotes(noteMap);
        setRecurringShifts(recShifts);
        if (latestPublish) setPublishHistory(latestPublish);

        // Fetch current user in background — not needed for grid render
        fetchCurrentUser().then(info => { if (info) setCurrentUser(info); });
      } catch (err) {
        console.error("loadSchedule error:", err);
      } finally {
        setScheduleLoading(false);
      }
    }
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org]);

  // Resolve a user UUID to a display name via profiles table (cached).
  const resolveUserName = useCallback(async (userId: string | null | undefined): Promise<string | null> => {
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
  }, []);

  // Resolve audit metadata (created/updated by names) when the edit panel opens.
  useEffect(() => {
    if (!editPanel) { setAuditInfo(null); return; }
    const key = `${editPanel.empId}_${formatDateKey(editPanel.date)}`;
    const meta = shifts[key];
    if (!meta?.createdBy && !meta?.updatedBy) { setAuditInfo(null); return; }

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
    return () => { cancelled = true; };
  }, [editPanel, shifts, resolveUserName]);

  // Batch-fetch profile names for all shift creators when audit mode is toggled on.
  const [auditNames, setAuditNames] = useState<Map<string, string>>(new Map());
  const needsAuditNames = showAudit;
  useEffect(() => {
    if (!needsAuditNames) return;
    // Collect unique creator/updater UUIDs not yet in the cache
    const uncached = new Set<string>();
    for (const entry of Object.values(shifts)) {
      if (entry.createdBy && !profileNameCache.current.has(entry.createdBy)) uncached.add(entry.createdBy);
      if (entry.updatedBy && !profileNameCache.current.has(entry.updatedBy)) uncached.add(entry.updatedBy);
    }
    // Also collect updatedBy UUIDs from publish history changes (for deleted shifts whose rows are gone)
    if (publishHistory) {
      for (const change of publishHistory.changes) {
        if (change.updatedBy && !profileNameCache.current.has(change.updatedBy)) uncached.add(change.updatedBy);
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
        const { data } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", ids);
        if (cancelled) return;
        for (const row of data ?? []) {
          const first = row.first_name?.trim() || "";
          const last = row.last_name?.trim() || "";
          const name = [first, last].filter(Boolean).join(" ");
          if (name) profileNameCache.current.set(row.id, name);
        }
        // Cache fallback for deleted/missing profiles to avoid re-fetching
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
    return () => { cancelled = true; };
  }, [needsAuditNames, shifts, publishHistory]);

  // Build a lookup map from publish history changes for O(1) access
  const publishChangesMap = useMemo(() => {
    if (!publishHistory) return null;
    const map = new Map<string, PublishChange>();
    for (const change of publishHistory.changes) {
      map.set(`${change.empId}_${change.date}`, change);
    }
    return map;
  }, [publishHistory]);

  // Lookup function for grid cells: returns "F. LastName" for compact display.
  // Shows who last touched each cell (updatedBy, falling back to createdBy).
  // Also resolves from publish history changes for cells whose rows are gone after publish.
  const createdByNameForKey = useCallback(
    (empId: string, date: Date): string | null => {
      const key = `${empId}_${formatDateKey(date)}`;
      const entry = shifts[key];
      let userId: string | null = null;
      if (entry) {
        userId = (entry.updatedBy || entry.createdBy) || null;
      } else if (publishChangesMap) {
        // Shift row was deleted after publish — resolve from publish history
        const change = publishChangesMap.get(key);
        userId = change?.updatedBy || null;
      }
      if (!userId) return null;
      const fullName = auditNames.get(userId);
      if (!fullName) return null;
      const parts = fullName.split(" ").filter(Boolean);
      let compact: string;
      if (parts.length === 1) {
        compact = parts[0];
      } else {
        compact = `${parts[0][0]}. ${parts[parts.length - 1]}`;
      }
      // Cap at 14 chars to prevent overflow in narrow cells
      return compact.length > 14 ? compact.slice(0, 13) + "\u2026" : compact;
    },
    [shifts, auditNames, publishChangesMap],
  );

  const { lockCell, unlockCell, getCellLock, lockedCells, onlineUsers, syncPresence, handleLockBroadcast, handleUnlockBroadcast } = useCellLocks(realtimeChannelRef, currentUser, canEditShifts);

  // Refs for realtime callbacks — allows the channel effect to depend only on
  // [org] while still calling the latest versions of these functions.
  const syncPresenceRef = useRef(syncPresence);
  syncPresenceRef.current = syncPresence;
  const handleLockBroadcastRef = useRef(handleLockBroadcast);
  handleLockBroadcastRef.current = handleLockBroadcast;
  const handleUnlockBroadcastRef = useRef(handleUnlockBroadcast);
  handleUnlockBroadcastRef.current = handleUnlockBroadcast;
  const refetchScheduleDataRef = useRef(refetchScheduleData);
  refetchScheduleDataRef.current = refetchScheduleData;

  // Subscribe to real-time schedule broadcasts so other tabs/users see
  // published and draft changes immediately without a manual refresh.
  // Depends only on [org] — all callbacks read from refs so the channel
  // is never torn down due to permission/user/callback reference changes.
  useEffect(() => {
    if (!org) return;

    const channel = supabase
      .channel(`schedule:${org.id}`)
      .on('broadcast', { event: 'schedule_published' }, async () => {
        try {
          await refetchScheduleDataRef.current();
          const history = await db.fetchLatestPublishHistory(org.id);
          setPublishHistory(history);
        } catch (err) {
          console.error('Failed to sync schedule update:', err);
        }
      })
      .on('broadcast', { event: 'drafts_discarded' }, async () => {
        try {
          await refetchScheduleDataRef.current();
        } catch (err) {
          console.error('Failed to sync drafts discard:', err);
        }
      })
      .on('broadcast', { event: 'draft_changed' }, (msg: { payload?: Record<string, unknown> }) => {
        if (msg.payload?.senderId === currentUserRef.current?.id) return;

        const p = msg.payload;
        if (p?.shifts) {
          const shiftUpdates = p.shifts as Record<string, ShiftMap[string] | null>;
          setShifts(prev => {
            const next = { ...prev };
            for (const [key, value] of Object.entries(shiftUpdates)) {
              if (value === null) delete next[key];
              else next[key] = value;
            }
            return next;
          });
        }
        if (p?.notes) {
          const noteUpdates = p.notes as Record<string, { indicatorTypeId: number; status: 'published' | 'draft' | 'draft_deleted' }[]>;
          setNotes(prev => ({ ...prev, ...noteUpdates }));
        }
        if (draftChangedDebounceRef.current) clearTimeout(draftChangedDebounceRef.current);
        draftChangedDebounceRef.current = setTimeout(async () => {
          try {
            await refetchScheduleDataRef.current();
          } catch (err) {
            console.error('Failed to sync draft change:', err);
          }
        }, p?.shifts || p?.notes ? 2000 : 150);
      })
      .on('broadcast', { event: 'cell_locked' }, (msg: { payload?: { cellKey: string; userId: string; userName: string } }) => {
        if (msg.payload) handleLockBroadcastRef.current(msg.payload);
      })
      .on('broadcast', { event: 'cell_unlocked' }, (msg: { payload?: { userId: string } }) => {
        if (msg.payload) handleUnlockBroadcastRef.current(msg.payload);
      })
      .on('presence', { event: 'sync' }, () => syncPresenceRef.current())
      .on('presence', { event: 'join' }, () => syncPresenceRef.current())
      .on('presence', { event: 'leave' }, () => syncPresenceRef.current())
      .subscribe(async (status: string, err?: Error) => {
        if (status === 'SUBSCRIBED') {
          const user = currentUserRef.current;
          if (user && canEditShiftsRef.current) {
            await channel.track({ editingCell: null, userId: user.id, userName: user.name, canEdit: true });
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Channel error:', err?.message ?? 'unknown');
        }
      });

    realtimeChannelRef.current = channel;

    return () => {
      realtimeChannelRef.current = null;
      if (draftChangedDebounceRef.current) clearTimeout(draftChangedDebounceRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org]);

  // Track presence once currentUser and canEditShifts are both available.
  // Handles the case where the channel subscribes before user profile loads.
  useEffect(() => {
    const channel = realtimeChannelRef.current;
    if (!channel || !currentUser || !canEditShifts) return;
    if (channel.state !== 'joined') return;

    channel.track({
      editingCell: null,
      userId: currentUser.id,
      userName: currentUser.name,
      canEdit: true,
    });
  }, [currentUser, canEditShifts]);

  // Refetch when the tab regains focus — catches any missed broadcasts
  // (e.g. browser throttled WebSocket while tab was backgrounded).
  // Also re-tracks presence to recover from server-side expiry.
  useEffect(() => {
    if (!org) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const channel = realtimeChannelRef.current;

      // Re-track presence if the channel is healthy
      if (channel && channel.state === 'joined') {
        const user = currentUserRef.current;
        if (user && canEditShiftsRef.current) {
          channel.track({
            editingCell: null,
            userId: user.id,
            userName: user.name,
            canEdit: true,
          });
        }
      }

      // Always refetch to catch any missed broadcasts
      refetchScheduleDataRef.current().catch((err) => {
        console.error("Tab refetch failed:", err);
        toast.error("Failed to refresh schedule — try reloading the page");
      });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [org]);

  // Re-fetch with scheduler visibility once permissions resolve, so editors
  // see draft data even if the initial load ran before permissions were ready.
  // Skip if the initial load already used canEditShifts=true (no extra fetch needed).
  const [draftCheckComplete, setDraftCheckComplete] = useState(false);
  useEffect(() => {
    if (permsLoading || !org || scheduleLoading || draftCheckStarted.current) return;
    if (!canEditShifts || initialLoadUsedEditPerms.current) { setDraftCheckComplete(true); return; }
    draftCheckStarted.current = true;

    (async () => {
      try {
        const cMap = new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label]));
        const draftShifts = await db.fetchShifts(org.id, true, cMap);
        setShifts(draftShifts);
      } catch (err) {
        console.error("Draft check failed:", err);
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

  const monthStart = useMemo(
    () => new Date(weekStart.getFullYear(), weekStart.getMonth(), 1),
    [weekStart],
  );

  const filteredEmployees = useMemo(
    () => filterAndSortEmployees(employees, activeFocusArea),
    [employees, activeFocusArea],
  );

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

  const shiftForKey = useCallback(
    (empId: string, date: Date): string | null =>
      shifts[`${empId}_${formatDateKey(date)}`]?.label ?? null,
    [shifts],
  );

  const shiftCodeIdsForKey = useCallback(
    (empId: string, date: Date): number[] =>
      shifts[`${empId}_${formatDateKey(date)}`]?.shiftCodeIds ?? [],
    [shifts],
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
        const sc = shiftCodes.find(c => c.id === entry.shiftCodeIds[i]);
        if (sc?.categoryId != null) {
          const cat = shiftCategories.find(c => c.id === sc.categoryId);
          if (cat?.startTime && cat?.endTime) {
            ranges.push({ start: cat.startTime, end: cat.endTime });
          }
        }
      }
      return ranges;
    },
    [shifts, shiftCodes, shiftCategories],
  );

  // ── Coverage gaps ──────────────────────────────────────────────────────────
  const shiftCodeById = useMemo(() => {
    const map = new Map<number, ShiftCode>();
    for (const sc of shiftCodes) map.set(sc.id, sc);
    // Include archived codes from allShiftCodesRef for shift lookup
    for (const sc of allShiftCodesRef.current) {
      if (!map.has(sc.id)) map.set(sc.id, sc);
    }
    return map;
  }, [shiftCodes, allShiftCodesRef]);

  const coverageGaps = useMemo(() => {
    if (!coverageRequirements.length || !focusAreas.length) return [];

    const employeesByFocusArea = new Map<number, Employee[]>();
    for (const fa of focusAreas) {
      employeesByFocusArea.set(
        fa.id,
        employees.filter((e) => e.focusAreaIds.includes(fa.id)),
      );
    }

    const shiftCodeIdsByFocusArea = new Map<number, Set<number>>();
    for (const fa of focusAreas) {
      shiftCodeIdsByFocusArea.set(
        fa.id,
        new Set(shiftCodes.filter((sc) => sc.focusAreaId === fa.id).map((sc) => sc.id)),
      );
    }

    return computeCoverageGaps(
      focusAreas,
      shiftCategories,
      shiftCodes,
      coverageRequirements,
      dates,
      employeesByFocusArea,
      shiftCodeIdsForKey,
      shiftCodeById,
      shiftCodeIdsByFocusArea,
    );
  }, [coverageRequirements, focusAreas, employees, shiftCodes, shiftCategories, dates, shiftCodeIdsForKey, shiftCodeById]);

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
      return entry?.publishedLabel || null;
    },
    [shifts],
  );

  const publishedShiftCodeIdsForKey = useCallback(
    (empId: string, date: Date): number[] =>
      shifts[`${empId}_${formatDateKey(date)}`]?.publishedShiftCodeIds ?? [],
    [shifts],
  );


  const publishDiffKindForKey = useCallback(
    (empId: string, date: Date): PublishChange | null => {
      if (!showPublishDiff || !publishChangesMap) return null;
      return publishChangesMap.get(`${empId}_${formatDateKey(date)}`) ?? null;
    },
    [showPublishDiff, publishChangesMap],
  );

  const getCustomShiftTimes = useCallback(
    (empId: string, date: Date): { start: string; end: string; perPill?: { start: string; end: string }[] } | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry?.customStartTime && !entry?.customEndTime) return null;
      const rawStart = entry.customStartTime ?? "";
      const rawEnd = entry.customEndTime ?? "";
      const startParts = rawStart.split("|");
      const endParts = rawEnd.split("|");
      const start = startParts[0] || "";
      const end = endParts[0] || "";
      const maxLen = Math.max(startParts.length, endParts.length);
      const perPill = maxLen > 1
        ? Array.from({ length: maxLen }, (_, i) => ({ start: startParts[i] || "", end: endParts[i] || "" }))
        : undefined;
      if (!start && !end && !perPill) return null;
      return { start, end, perPill };
    },
    [shifts],
  );

  /** True if the shift's date is in the past, or it's today and the shift has already started. */
  const isShiftStarted = useCallback(
    (empId: string, date: Date): boolean => {
      const todayStr = formatDateKey(today);
      const dateStr = formatDateKey(date);
      if (dateStr < todayStr) return true;
      if (dateStr > todayStr) return false;
      // Today — check start time
      const entry = shifts[`${empId}_${dateStr}`];
      if (!entry || entry.shiftCodeIds.length === 0) return true;
      // Resolve earliest start time from custom times or shift code defaults
      let earliest: string | null = null;
      if (entry.customStartTime) {
        // customStartTime can be pipe-delimited for multi-pill shifts
        for (const t of entry.customStartTime.split("|")) {
          if (t && (!earliest || t < earliest)) earliest = t;
        }
      }
      if (!earliest) {
        for (const codeId of entry.shiftCodeIds) {
          const sc = shiftCodes.find(c => c.id === codeId);
          if (sc?.defaultStartTime && (!earliest || sc.defaultStartTime < earliest)) {
            earliest = sc.defaultStartTime;
          }
        }
      }
      if (!earliest) return true; // no start time defined — treat as started (safe default)
      const now = new Date();
      const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      return nowTime >= earliest;
    },
    [shifts, shiftCodes, today],
  );

  /** True if the shift has at least one categorized, non-off-day shift code (i.e. a real work shift). */
  const isRequestableShift = useCallback(
    (empId: string, date: Date): boolean => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry || entry.shiftCodeIds.length === 0) return false;
      return entry.shiftCodeIds.some(codeId => {
        const sc = shiftCodes.find(c => c.id === codeId);
        return sc != null && !sc.isOffDay && sc.categoryId != null;
      });
    },
    [shifts, shiftCodes],
  );

  const handleCustomTimeChange = useCallback(
    (start: string | null, end: string | null) => {
      if (!editPanel || !org?.id) return;
      const dateKey = formatDateKey(editPanel.date);
      const key = `${editPanel.empId}_${dateKey}`;
      setShifts((prev) => {
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { ...existing, customStartTime: start, customEndTime: end } };
      });
      db.upsertShiftTimes(editPanel.empId, dateKey, start, end, org.id).catch((err) => {
        toast.error("Failed to save shift times");
        console.error(err);
      });
    },
    [editPanel, org?.id],
  );

  const activeIndicatorIdsForKey = useCallback(
    (empId: string, date: Date, focusAreaId?: number): number[] => {
      const dateKey = formatDateKey(date);
      const key = focusAreaId != null ? `${empId}_${dateKey}_${focusAreaId}` : `${empId}_${dateKey}`;
      const noteList = notes[key] ?? [];
      // Only return notes that aren't marked as deleted in draft
      return noteList
        .filter(n => n.status !== 'draft_deleted')
        .map(n => n.indicatorTypeId);
    },
    [notes],
  );

  const broadcastDraftChanged = useCallback((payload?: Record<string, unknown>) => {
    const channel = realtimeChannelRef.current;
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: 'draft_changed',
      payload: { ...payload, senderId: currentUserRef.current?.id },
    }).then((status: string) => {
      if (status !== 'ok') console.warn('[Realtime] draft_changed send status:', status);
    });
  }, []);

  const setShift = useCallback(
    (empId: string, date: Date, label: string, shiftCodeIds: number[]) => {
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

      const handleConflict = async () => {
        toast.error("Shift was modified by another user — refreshing");
        const freshShifts = await db.fetchShifts(orgId, canEditShifts, shiftCodeMap);
        setShifts(freshShifts);
      };

      if (label === "OFF" || shiftCodeIds.length === 0) {
        const ex = shiftsRef.current[key];
        // Nothing to delete — cell is already empty
        if (!ex || (ex.shiftCodeIds.length === 0 && !ex.publishedShiftCodeIds?.length)) return;

        if (ex.publishedShiftCodeIds?.length) {
          // Published shift being deleted → mark as draft-deleted
          const deleteValue = {
            label: "OFF", shiftCodeIds: [] as number[], isDraft: true, isDelete: true,
            draftKind: 'deleted' as const,
            publishedShiftCodeIds: ex.publishedShiftCodeIds,
            publishedLabel: ex.publishedLabel ?? '',
            createdBy: ex.createdBy ?? null,
            updatedBy: currentUserRef.current?.id ?? null,
          };
          setShifts((prev) => ({ ...prev, [key]: deleteValue }));
          db.deleteShift(empId, dateKey).catch((err) => {
            toast.error("Failed to delete shift");
            console.error(err);
          });
          broadcastDraftChanged({ shifts: { [key]: deleteValue } });
        } else {
          // Never-published draft being cleared → remove from map entirely
          setShifts((prev) => { const next = { ...prev }; delete next[key]; return next; });
          db.deleteShift(empId, dateKey).catch((err) => {
            toast.error("Failed to delete shift");
            console.error(err);
          });
          broadcastDraftChanged({ shifts: { [key]: null } });
        }
      } else {
        // Filter out any stale/archived shift code IDs
        const validCodeIds = shiftCodeIds.filter((id) => shiftCodeMap.has(id));
        if (validCodeIds.length === 0) {
          toast.error("Selected shift code is no longer available");
          return;
        }
        if (validCodeIds.length < shiftCodeIds.length) {
          toast.warning("Some shift codes were removed (no longer available)");
        }
        const ex = shiftsRef.current[key];
        const hasPublished = ex?.publishedShiftCodeIds?.length ?? 0;
        const upsertValue = {
          label, shiftCodeIds: validCodeIds, isDraft: true,
          draftKind: (hasPublished ? 'modified' : 'new') as 'modified' | 'new',
          publishedShiftCodeIds: ex?.publishedShiftCodeIds ?? [],
          publishedLabel: ex?.publishedLabel ?? '',
        };
        setShifts((prev) => ({ ...prev, [key]: upsertValue }));
        db.upsertShift(empId, dateKey, validCodeIds, orgId, undefined, undefined, existingVersion).catch((err) => {
          if (err instanceof OptimisticLockError) {
            handleConflict();
          } else {
            toast.error("Failed to save shift");
            console.error(err);
          }
        });
        broadcastDraftChanged({ shifts: { [key]: upsertValue } });
      }
    },
    [org?.id, canEditShifts, shiftCodeMap, broadcastDraftChanged],
  );

  const getShiftStyle = useCallback(
    (type: string, focusAreaName?: string): ShiftCode => {
      const fa = focusAreaName ? focusAreas.find((w) => w.name === focusAreaName) : null;

      // 1. Code associated with this focus area → use the code's own colors
      if (fa) {
        const specific = shiftCodes.find(
          (t) => t.label === type && t.focusAreaId === fa.id,
        );
        if (specific) return specific;
      }
      // 2. Global code (no focus area associations)
      const general = shiftCodes.find(
        (t) => t.label === type && t.focusAreaId == null,
      );
      if (general) return general;
      // 3. Cross-area code — belongs to another focus area; use its own colors.
      const crossArea = shiftCodes.find((t) => t.label === type);
      if (crossArea) return crossArea;
      // 4. Fallback
      return {
        id: 0,
        orgId: "",
        label: type,
        name: type,
        color: "var(--color-bg)",
        border: "var(--color-border)",
        text:"var(--color-text-muted)",
        sortOrder: 999,
      } satisfies ShiftCode;
    },
    [shiftCodes, focusAreas],
  );

  // ── Event handlers ───────────────────────────────────────────────────────────

  const handleCellClick = useCallback(
    (emp: Employee, date: Date, focusAreaName?: string) => {
      const cellKey = `${emp.id}_${formatDateKey(date)}`;
      const lock = getCellLock(cellKey);
      if (lock) {
        toast.info(`Being edited by ${lock.userName}`);
        return;
      }
      lockCell(cellKey);
      const activeFaId = focusAreaName
        ? focusAreas.find((fa) => fa.name === focusAreaName)?.id ?? null
        : null;
      setEditPanel({
        empId: emp.id,
        empName: getEmployeeDisplayName(emp),
        date,
        empFocusAreaIds: emp.focusAreaIds,
        empCertificationId: emp.certificationId,
        activeFocusAreaId: activeFaId,
      });
    },
    [focusAreas, getCellLock, lockCell],
  );

  const handleShiftSelect = useCallback(
    async (label: string, shiftCodeIds: number[], seriesScope?: SeriesScope) => {
      if (!editPanel) return;
      const key = `${editPanel.empId}_${formatDateKey(editPanel.date)}`;
      const currentMeta = shifts[key];

      if (seriesScope === 'all' && currentMeta?.seriesId) {
        const isDelete = label === 'OFF' || shiftCodeIds.length === 0;

        if (isDelete) {
          // Count shifts in the series before showing confirmation
          const { count } = await supabase
            .from("shifts")
            .select("*", { count: "exact", head: true })
            .eq("series_id", currentMeta.seriesId);
          setPendingSeriesDelete({ seriesId: currentMeta.seriesId, shiftCount: count ?? 0 });
          return;
        }

        // Bulk-update all shifts in the series
        try {
          await db.updateSeriesAllShifts(currentMeta.seriesId, shiftCodeIds[0]);
          const prevShifts = shifts;
          const shiftData = await db.fetchShifts(org!.id, canEditShifts, shiftCodeMap);
          setShifts(shiftData);
          const shiftUpdates: Record<string, ShiftMap[string] | null> = {};
          for (const [k, v] of Object.entries(shiftData)) {
            if (!prevShifts[k] || JSON.stringify(prevShifts[k]) !== JSON.stringify(v)) {
              shiftUpdates[k] = v;
            }
          }
          if (Object.keys(shiftUpdates).length > 0) {
            broadcastDraftChanged({ shifts: shiftUpdates });
          }
          toast.success("Series updated");
        } catch (err) {
          toast.error("Failed to update series");
          console.error(err);
        }
      } else {
        setShift(editPanel.empId, editPanel.date, label, shiftCodeIds);
      }
    },
    [editPanel, shifts, org, canEditShifts, setShift, shiftCodeMap, broadcastDraftChanged],
  );

  const handleConfirmSeriesDelete = useCallback(async () => {
    if (!pendingSeriesDelete || !org) return;
    try {
      const prevShifts = shifts;
      const deletedCount = await db.deleteShiftSeries(pendingSeriesDelete.seriesId);
      const shiftData = await db.fetchShifts(org.id, canEditShifts, shiftCodeMap);
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
      toast.error("Failed to delete series");
      console.error(err);
    } finally {
      setPendingSeriesDelete(null);
      unlockCell();
      setEditPanel(null);
    }
  }, [pendingSeriesDelete, org, canEditShifts, shiftCodeMap, shifts, broadcastDraftChanged, unlockCell]);

  const handleRepeatConfirm = useCallback(
    async (
      frequency: SeriesFrequency,
      daysOfWeek: number[] | null,
      startDate: string,
      endDate: string | null,
      maxOccurrences: number | null,
    ) => {
      if (!editPanel || !org) return;
      const currentLabel = shiftForKey(editPanel.empId, editPanel.date);
      if (!currentLabel || currentLabel === 'OFF') return;
      const codeIds = shiftCodeIdsForKey(editPanel.empId, editPanel.date);
      if (!codeIds.length) return;
      try {
        await db.createShiftSeries(
          editPanel.empId,
          org.id,
          codeIds[0],
          currentLabel,
          frequency,
          daysOfWeek,
          startDate,
          endDate,
          maxOccurrences,
        );
        const prevShifts = shifts;
        const shiftData = await db.fetchShifts(org.id, canEditShifts, shiftCodeMap);
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
      } catch (err) {
        toast.error("Failed to create repeating shift");
        console.error(err);
      } finally {
        unlockCell();
        setEditPanel(null);
      }
    },
    [editPanel, org, canEditShifts, shiftCodeMap, shiftForKey, shiftCodeIdsForKey, unlockCell, shifts, broadcastDraftChanged],
  );

  // ── Qualification check for drag/paste ──────────────────────────────────
  const focusAreaNameMap = useMemo(
    () => new Map(focusAreas.map(fa => [fa.id, fa.name])),
    [focusAreas],
  );
  const certificationNameMap = useMemo(
    () => new Map(certifications.map(c => [c.id, c.name])),
    [certifications],
  );

  /** Returns null if qualified, or an error message string if not. */
  const checkQualification = useCallback(
    (empId: string, shiftCodeIds: number[]): string | null => {
      const emp = employees.find(e => e.id === empId);
      if (!emp) return null; // shouldn't happen, but don't block

      for (const codeId of shiftCodeIds) {
        const code = shiftCodes.find(sc => sc.id === codeId);
        if (!code) continue;
        if (!isEmployeeQualified(emp, code)) {
          const reasons = getDisqualificationReasons(emp, code, focusAreaNameMap, certificationNameMap);
          return `${getEmployeeDisplayName(emp)} cannot be assigned ${code.label}: ${reasons.join(", ")}`;
        }
      }
      return null;
    },
    [employees, shiftCodes, focusAreaNameMap, certificationNameMap],
  );

  // ── Drag & Drop handlers ──────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as ShiftDragData | undefined;
    if (data) setActiveDrag(data);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null);
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
    const disqualified = checkQualification(dropData.empId, dragData.shiftCodeIds);
    if (disqualified) {
      toast.error(disqualified);
      return;
    }

    // Atomic move via RPC — prevents duplication on partial failure
    const sourceEntry = shifts[sourceKey];

    // Optimistic UI update
    setShifts(prev => {
      const next = { ...prev };
      next[targetKey] = {
        label: dragData.label, shiftCodeIds: dragData.shiftCodeIds,
        isDraft: true, draftKind: 'new' as DraftKind,
        publishedShiftCodeIds: prev[targetKey]?.publishedShiftCodeIds ?? [],
        publishedLabel: prev[targetKey]?.publishedLabel ?? '',
      };
      if (sourceEntry?.publishedShiftCodeIds?.length) {
        next[sourceKey] = {
          label: "OFF", shiftCodeIds: [], isDraft: true, isDelete: true,
          draftKind: 'deleted' as DraftKind,
          publishedShiftCodeIds: sourceEntry.publishedShiftCodeIds,
          publishedLabel: sourceEntry.publishedLabel ?? '',
        };
      } else {
        delete next[sourceKey];
      }
      return next;
    });

    broadcastDraftChanged({
      shifts: {
        [targetKey]: { label: dragData.label, shiftCodeIds: dragData.shiftCodeIds, isDraft: true, draftKind: 'new' },
        [sourceKey]: sourceEntry?.publishedShiftCodeIds?.length
          ? { label: "OFF", shiftCodeIds: [], isDraft: true, draftKind: 'deleted' }
          : null,
      },
    });

    db.moveShift(
      org!.id,
      dragData.empId, dragData.dateKey,
      dropData.empId, dropData.dateKey,
      dragData.shiftCodeIds,
      sourceEntry?.version,
    ).then(() => {
      toast.success("Shift moved");
    }).catch(async (err) => {
      if (err instanceof OptimisticLockError) {
        toast.error("Shift was modified by another user — refreshing");
      } else {
        toast.error("Failed to move shift");
        console.error(err);
      }
      await refetchScheduleData();
    });
  }, [shifts, org, getCellLock, checkQualification, broadcastDraftChanged, refetchScheduleData]);

  // ── Copy-paste handlers ──────────────────────────────────────────────────
  const handleCopyShift = useCallback((empId: string, date: Date) => {
    const key = `${empId}_${formatDateKey(date)}`;
    const shift = shifts[key];
    if (!shift || shift.shiftCodeIds.length === 0) return;
    setClipboard({ label: shift.label, shiftCodeIds: shift.shiftCodeIds });
    toast.success("Shift copied");
  }, [shifts]);

  const handlePasteShift = useCallback((empId: string, date: Date) => {
    if (!clipboard) return;
    const cellKey = `${empId}_${formatDateKey(date)}`;
    const lock = getCellLock(cellKey);
    if (lock) {
      toast.info(`Cell is being edited by ${lock.userName}`);
      return;
    }

    // Check if target employee qualifies for the pasted shift
    const disqualified = checkQualification(empId, clipboard.shiftCodeIds);
    if (disqualified) {
      toast.error(disqualified);
      return;
    }

    setShift(empId, date, clipboard.label, clipboard.shiftCodeIds);
    toast.success("Shift pasted");
  }, [clipboard, setShift, getCellLock, checkQualification]);

  const handleClearShift = useCallback((empId: string, date: Date) => {
    const cellKey = `${empId}_${formatDateKey(date)}`;
    const lock = getCellLock(cellKey);
    if (lock) {
      toast.info(`Cell is being edited by ${lock.userName}`);
      return;
    }
    const emp = employees.find(e => e.id === empId);
    const empName = emp ? getEmployeeDisplayName(emp) : "";
    const label = shiftForKey(empId, date) ?? "";
    setPendingClearShift({ empId, date, empName, shiftLabel: label });
  }, [getCellLock, employees, shiftForKey]);

  // Context menu handlers
  const handleCellContextMenu = useCallback((e: React.MouseEvent, empId: string, date: Date, focusAreaName: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, empId, date, focusAreaName });
  }, []);

  const handleCellHover = useCallback((empId: string, date: Date, focusAreaName: string) => {
    hoveredCellRef.current = { empId, date, focusAreaName };
  }, []);

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
  const getAutoFillRange = useCallback((): { startDate: Date; endDate: Date } => {
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
    const freshRecurringShifts = await db.fetchRecurringShifts(org.id, undefined, shiftCodeMap);
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
        if (shifts[`${empId}_${dateKey}`]) continue;
        // Match RPC logic: filter by dayOfWeek, effectiveFrom/Until, most recent first
        const candidates = empShifts
          .filter(rs => rs.dayOfWeek === dayOfWeek)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
        const match = candidates.find(rs => {
          const from = rs.effectiveFrom;
          const until = rs.effectiveUntil;
          return from <= dateKey && (!until || until >= dateKey);
        });
        // Also verify the shift code is still active (not archived)
        if (match && shiftCodes.some(sc => sc.id === match.shiftCodeId)) count++;
      }
    }

    if (count === 0) {
      toast.info("No empty slots to fill for this date range");
      return;
    }

    const dateRange = `${formatDate(startDate)} – ${formatDate(endDate)}`;
    setAutoFillPreview({ count, dateRange });
    setShowAutoFillConfirm(true);
  }, [org, getAutoFillRange, shiftCodes, shifts]);

  // Actually apply recurring schedules (called after confirmation)
  const handleApplyRecurring = useCallback(async () => {
    if (!org) return;
    setShowAutoFillConfirm(false);
    setIsApplyingRecurring(true);
    try {
      const { startDate, endDate } = getAutoFillRange();

      // RPC reads fresh data from DB — no stale closures for recurringShifts/shifts
      const generated = await db.applyRecurringSchedules(org.id, startDate, endDate);

      if (generated.length > 0) {
        // Refetch to get accurate state (including from_recurring flags)
        await refetchScheduleData();
        toast.success(`Recurring schedule applied (${generated.length} shifts)`);
        broadcastDraftChanged({});
      } else {
        toast.info("No empty slots to fill");
      }
    } catch (err) {
      toast.error("Failed to apply recurring schedule");
      console.error(err);
    } finally {
      setIsApplyingRecurring(false);
      setAutoFillPreview(null);
    }
  }, [org, getAutoFillRange, refetchScheduleData, broadcastDraftChanged]);

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
          sourceShift.shiftCodeIds.length > 0 &&
          !sourceShift.isDelete &&
          !shifts[targetKey]
        ) {
          count++;
        }
      }
    }

    if (count === 0) {
      toast.info("No shifts to import — either the previous period is empty or all slots are already filled");
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
    setShowImportConfirm(false);
    setIsImportingPrevious(true);

    try {
      const days = spanWeeks * 7;
      const sourceStart = addDays(weekStart, -days);
      const shiftUpdates: Record<string, ShiftMap[string]> = {};
      const upsertPromises: Promise<void>[] = [];

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
            sourceShift.shiftCodeIds.length > 0 &&
            !sourceShift.isDelete &&
            !shifts[targetKey]
          ) {
            // Build optimistic state entry
            shiftUpdates[targetKey] = {
              label: sourceShift.label,
              shiftCodeIds: sourceShift.shiftCodeIds,
              isDraft: true,
              draftKind: 'new',
              publishedShiftCodeIds: [],
              publishedLabel: '',
            };

            // Queue DB upsert
            upsertPromises.push(
              db.upsertShift(
                emp.id,
                targetDateKey,
                sourceShift.shiftCodeIds,
                org.id,
                sourceShift.customStartTime,
                sourceShift.customEndTime,
              )
            );
          }
        }
      }

      // Apply optimistic state update immediately for responsive UI
      setShifts(prev => ({ ...prev, ...shiftUpdates }));
      broadcastDraftChanged({ shifts: shiftUpdates });

      const count = Object.keys(shiftUpdates).length;
      toast.success(`Imported ${count} shift${count !== 1 ? 's' : ''} from previous ${spanWeeks === 1 ? 'week' : '2 weeks'}`);

      // Persist to DB in background
      await Promise.all(upsertPromises);
      // Always refetch to reconcile — catches race conditions where another user
      // filled slots between preview and import
      await refetchScheduleData();
    } catch (err) {
      toast.error("Failed to save some imported shifts — refreshing");
      console.error(err);
      await refetchScheduleData();
    } finally {
      setIsImportingPrevious(false);
      setImportPreview(null);
    }
  }, [org, spanWeeks, weekStart, employees, shifts, broadcastDraftChanged, refetchScheduleData]);

  const handleNoteToggle = useCallback(
    async (indicatorTypeId: number, active: boolean, focusAreaId: number) => {
      if (!org || !editPanel) return;
      const dateKey = formatDateKey(editPanel.date);
      const key = `${editPanel.empId}_${dateKey}_${focusAreaId}`;

      const existing = notes[key] ?? [];
      const existingStatus = existing.find(n => n.indicatorTypeId === indicatorTypeId)?.status;

      let updated: { indicatorTypeId: number; status: 'published' | 'draft' | 'draft_deleted' }[];
      if (active) {
        if (existingStatus === 'draft_deleted') {
          updated = existing.map(n => n.indicatorTypeId === indicatorTypeId ? { ...n, status: 'published' as const } : n);
        } else {
          updated = [...existing.filter(n => n.indicatorTypeId !== indicatorTypeId), { indicatorTypeId, status: 'draft' as const }];
        }
      } else {
        if (existingStatus === 'published') {
          updated = existing.map(n => n.indicatorTypeId === indicatorTypeId ? { ...n, status: 'draft_deleted' as const } : n);
        } else {
          updated = existing.filter(n => n.indicatorTypeId !== indicatorTypeId);
        }
      }
      setNotes(prev => ({ ...prev, [key]: updated }));

      try {
        if (active) {
          await db.upsertScheduleNote(
            org.id,
            editPanel.empId,
            dateKey,
            indicatorTypeId,
            focusAreaId,
            existingStatus
          );
        } else {
          await db.deleteScheduleNote(
            editPanel.empId,
            dateKey,
            indicatorTypeId,
            focusAreaId,
            existingStatus
          );
        }
        broadcastDraftChanged({ notes: { [key]: updated } });
      } catch (error) {
        console.error(error);
        toast.error("Failed to save note");
        setNotes(prev => ({ ...prev, [key]: existing }));
      }
    },
    [editPanel, org, notes, broadcastDraftChanged],
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
      setWeekStart(prev => getWeekStart(prev));
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
        endDate = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0); // Last day of month
      } else {
        startDate = new Date(weekStart);
        endDate = addDays(weekStart, (spanWeeks * 7) - 1);
      }

      await db.publishSchedule(org.id, startDate, endDate);

      await refetchScheduleData();
      const latestPublish = await db.fetchLatestPublishHistory(org.id);
      setPublishHistory(latestPublish);
      setShowPublishDiff(false);
      unlockCell();
      setEditPanel(null);
      setShowDiffOverlay(false);
      toast.success("Schedule published");

      // Notify other tabs/users to refetch the published schedule
      realtimeChannelRef.current?.send({
        type: 'broadcast',
        event: 'schedule_published',
        payload: {},
      });
    } catch (err: any) {
      console.error('publish_schedule failed:', err?.message ?? err);
      toast.error("Failed to publish schedule");
    } finally {
      setIsPublishing(false);
    }
  }, [org, weekStart, monthStart, spanWeeks, refetchScheduleData]);

  const handleCancelChanges = useCallback(async (discardAll = false) => {
    const user = currentUserRef.current;
    if (!org || !user) return;
    setCancelingMode(discardAll ? 'all' : 'mine');
    try {
      await db.discardScheduleDrafts(org.id, discardAll ? undefined : user.id);

      await refetchScheduleDataRef.current();
      unlockCell();
      setEditPanel(null);
      setShowDiffOverlay(false);
      if (discardAll) {
        // Dedicated event for discard-all — triggers immediate refetch on all clients
        realtimeChannelRef.current?.send({
          type: 'broadcast',
          event: 'drafts_discarded',
          payload: {},
        });
      } else {
        broadcastDraftChanged();
      }
      toast.success(discardAll ? "All changes discarded" : "Your changes discarded");
    } catch (err: any) {
      toast.error("Failed to discard changes");
      console.error(err);
    } finally {
      setCancelingMode(null);
    }
  }, [org, broadcastDraftChanged, unlockCell]);

  // ── Loading / error states ───────────────────────────────────────────────────

  const isLoading = orgLoading || empLoading || scheduleLoading;

  if (orgLoading || (scheduleLoading && !org)) {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", zIndex: 50 }}>
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
          background: "linear-gradient(180deg, var(--color-bg-secondary) 0%, var(--color-surface) 100%)",
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
            marginBottom: 8
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>

        <div style={{ maxWidth: 400 }}>
          <h1 style={{ fontSize: "var(--dg-fs-section-title)", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 12, letterSpacing: "-0.02em" }}>
            Workspace Setup Required
          </h1>
          <p style={{ fontSize: "var(--dg-fs-title)", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 32 }}>
            Your account is active, but it looks like your workspace hasn't been initialized yet.
            Once your administrator completes the setup, you'll be able to access the schedule.
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
                transition: "opacity 150ms ease"
              }}
            >
              Check Again
            </button>
            <button
              onClick={() => window.location.href = "mailto:support@dubgrid.com"}
              style={{
                padding: "12px 24px",
                background: "var(--color-bg-secondary)",
                color: "var(--color-text-secondary)",
                border: "none",
                borderRadius: "8px",
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Contact Support
            </button>
          </div>
        </div>

        {/* Technical details accessible only via hover/inspect for developers */}
        <div style={{ marginTop: 40, opacity: 0.1, fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-faint)" }}>
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
      {isLoading && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", zIndex: 50 }}>
          <AnimatedDubGridLogo size={160} />
        </div>
      )}

      {!isLoading && (
        <>
          <div
            className="no-print"
            style={{
              position: "sticky",
              top: 56,
              zIndex: 99,
              background: "var(--color-bg)",
            }}
          >
            {canEditShifts && hasUnpublishedChanges && (
              <DraftBanner
                onPublish={() => setShowPublishConfirm(true)}
                onCancel={() => setShowDiscardConfirm(true)}
                isPublishing={isPublishing}
                isCanceling={cancelingMode !== null}
                breakdown={draftBreakdown}
                showDiff={showDiffOverlay}
                onToggleDiff={() => setShowDiffOverlay(v => !v)}
                canPublish={canPublishSchedule}
              />
            )}
            {!hasUnpublishedChanges && canEditShifts && publishHistory && publishHistory.changeCount > 0 && (
              <div className="dg-draft-banner no-print" style={{ background: "var(--color-info-bg)", borderColor: "var(--color-info-border)", color: "var(--color-info-text)" }}>
                <div className="dg-draft-banner-dot" style={{ background: "var(--color-primary)" }} />
                <span style={{ fontWeight: 600 }}>
                  Published {(() => {
                    const diff = Date.now() - new Date(publishHistory.publishedAt).getTime();
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
                  {publishHistory.changeCount} change{publishHistory.changeCount !== 1 ? "s" : ""}
                </span>
                <div className="dg-draft-banner-actions">
                  {isMobile ? (
                    <span style={{ fontSize: "var(--dg-fs-footnote)", opacity: 0.6, fontStyle: "italic" }}>
                      Use a larger screen to view details
                    </span>
                  ) : (
                    <button
                      onClick={() => setShowPublishDiff(v => !v)}
                      className="dg-btn dg-btn-secondary"
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        padding: "5px 12px",
                        background: showPublishDiff ? "var(--color-info-bg)" : undefined,
                        color: showPublishDiff ? "var(--color-accent-text)" : undefined,
                      }}
                    >
                      {showPublishDiff ? "Hide Changes" : "Show What Changed"}
                    </button>
                  )}
                </div>
              </div>
            )}
            <div style={{ padding: "12px 16px 0", borderBottom: "1px solid var(--color-border)" }}>
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
                canEditShifts={canEditShifts && canApplyRecurringSchedule}
                onApplyRecurring={handleAutoFillPreview}
                isApplyingRecurring={isApplyingRecurring}
                onImportPrevious={spanWeeks !== "month" ? handleImportPreviousPreview : undefined}
                isImportingPrevious={isImportingPrevious}
                onPrintOpen={() => setShowPrintOptions(true)}
                presenceSlot={canEditShifts ? <PresenceAvatars onlineUsers={onlineUsers} /> : null}
                showAudit={showAudit}
                onAuditToggle={canEditShifts && !isMobile ? () => setShowAudit(prev => !prev) : undefined}
                requestsBadgeCount={shiftRequests.badgeCount}
                onRequestsToggle={() => setShowRequestBoard(prev => !prev)}
                coverageGapCount={coverageGaps.length}
                onCoverageToggle={() => setShowCoveragePanel(prev => !prev)}
                hideTwoWeek={isSmallDesktop}
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
                isCellInteractive={canEditShifts || canEditNotes}
                activeIndicatorIdsForKey={activeIndicatorIdsForKey}
                activeFocusArea={activeFocusArea}
                draftKindForKey={draftKindForKey}
              />
            )}

            {/* Desktop/Tablet Grid */}
            {spanWeeks !== "month" && !isMobile && (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
              shiftCodes={shiftCodes}
              shiftCategories={shiftCategories}
              indicatorTypes={indicatorTypes}
              certifications={certifications}
              orgRoles={orgRoles}
              isCellInteractive={canEditShifts || canEditNotes}
              activeIndicatorIdsForKey={activeIndicatorIdsForKey}
              activeFocusArea={activeFocusArea}
              getCustomShiftTimes={getCustomShiftTimes}
              draftKindForKey={draftKindForKey}
              showDiffOverlay={showDiffOverlay}
              publishedLabelForKey={publishedLabelForKey}
              publishedShiftCodeIdsForKey={publishedShiftCodeIdsForKey}
              publishDiffForKey={publishDiffKindForKey}
              cellLocks={lockedCells}
              showAudit={showAudit}
              createdByNameForKey={createdByNameForKey}
              isDragging={!!activeDrag}
              onCellHover={handleCellHover}
              onCellContextMenu={handleCellContextMenu}
              coverageRequirements={coverageRequirements}
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
        )}

        {/* Context menu for copy/paste/requests */}
        {contextMenu && (canEditShifts || (currentEmpId && contextMenu.empId === currentEmpId)) && (
          <ShiftContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            hasShift={(() => {
              const key = `${contextMenu.empId}_${formatDateKey(contextMenu.date)}`;
              const s = shifts[key];
              return !!(s && s.shiftCodeIds.length > 0 && !s.isDelete);
            })()}
            hasClipboard={!!clipboard}
            canEdit={canEditShifts}
            canRequest={!!currentEmpId && contextMenu.empId === currentEmpId && !isShiftStarted(contextMenu.empId, contextMenu.date) && isRequestableShift(contextMenu.empId, contextMenu.date)}
            hasActiveRequest={shiftRequests.requests.some(
              r => r.requesterEmpId === contextMenu.empId
                && r.requesterShiftDate === formatDateKey(contextMenu.date)
                && (r.status === 'open' || r.status === 'pending_approval')
            )}
            onCopy={() => handleCopyShift(contextMenu.empId, contextMenu.date)}
            onPaste={() => handlePasteShift(contextMenu.empId, contextMenu.date)}
            onClear={() => handleClearShift(contextMenu.empId, contextMenu.date)}
            onMakeAvailable={() => {
              shiftRequests.create('pickup', contextMenu.empId, formatDateKey(contextMenu.date));
            }}
            onProposeSwap={() => {
              const label = shiftForKey(contextMenu.empId, contextMenu.date) ?? '';
              const emp = employees.find(e => e.id === contextMenu.empId);
              const empName = emp ? `${emp.firstName} ${emp.lastName}` : '';
              setSwapModalState({
                empId: contextMenu.empId,
                empName,
                shiftDate: formatDateKey(contextMenu.date),
                shiftLabel: label,
              });
            }}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Confirm dialog for context-menu shift removal */}
        {pendingClearShift && (
          <ConfirmDialog
            title="Remove Shift?"
            message={`Remove "${pendingClearShift.shiftLabel}" from ${pendingClearShift.empName} on ${formatDate(pendingClearShift.date)}?`}
            confirmLabel="Remove"
            variant="danger"
            onConfirm={() => {
              setShift(pendingClearShift.empId, pendingClearShift.date, "OFF", []);
              setPendingClearShift(null);
            }}
            onCancel={() => setPendingClearShift(null)}
          />
        )}

        {spanWeeks === "month" && (
          <MonthView
            monthStart={monthStart}
            filteredEmployees={filteredEmployees}
            shiftForKey={shiftForKey}
            shiftCodeIdsForKey={shiftCodeIdsForKey}
            getShiftStyle={getShiftStyle}
            today={today}
            focusAreas={focusAreas}
            shiftCodes={shiftCodes}
            shiftCategories={shiftCategories}
            activeFocusArea={activeFocusArea}
            draftKindForKey={draftKindForKey}
          />
        )}

      </div>

      {editPanel && (
        <ShiftEditPanel
          modal={editPanel}
          currentShift={shiftForKey(editPanel.empId, editPanel.date)}
          currentShiftCodeIds={shiftCodeIdsForKey(editPanel.empId, editPanel.date)}
          shiftCodes={shiftCodes}
          focusAreas={focusAreas}
          certifications={certifications}
          indicatorTypes={indicatorTypes}
          onSelect={handleShiftSelect}
          allowShiftEdits={canEditShifts}
          canEditNotes={canEditNotes}
          getActiveIndicatorIds={(focusAreaId) => activeIndicatorIdsForKey(editPanel.empId, editPanel.date, focusAreaId)}
          onNoteToggle={handleNoteToggle}
          onClose={() => { unlockCell(); setEditPanel(null); }}
          seriesId={shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]?.seriesId}
          onRepeatConfirm={canEditShifts && canManageShiftSeries ? handleRepeatConfirm : undefined}
          empId={editPanel.empId}
          customStartTime={shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]?.customStartTime}
          customEndTime={shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]?.customEndTime}
          onCustomTimeChange={canEditShifts ? handleCustomTimeChange : undefined}
          publishedShiftCodeIds={shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]?.publishedShiftCodeIds}
          draftKind={shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]?.draftKind}
          auditInfo={canEditShifts ? auditInfo : undefined}
          isOwnShift={!!currentEmpId && editPanel.empId === currentEmpId}
          hasActiveRequest={shiftRequests.requests.some(
            r => r.requesterEmpId === editPanel.empId
              && r.requesterShiftDate === formatDateKey(editPanel.date)
              && (r.status === 'open' || r.status === 'pending_approval')
          )}
          onMakeAvailable={currentEmpId && editPanel.empId === currentEmpId && !isShiftStarted(editPanel.empId, editPanel.date) && isRequestableShift(editPanel.empId, editPanel.date) ? () => {
            shiftRequests.create('pickup', editPanel.empId, formatDateKey(editPanel.date));
            setEditPanel(null);
            unlockCell();
          } : undefined}
          onProposeSwap={currentEmpId && editPanel.empId === currentEmpId && !isShiftStarted(editPanel.empId, editPanel.date) && isRequestableShift(editPanel.empId, editPanel.date) ? () => {
            const label = shiftForKey(editPanel.empId, editPanel.date) ?? '';
            setSwapModalState({
              empId: editPanel.empId,
              empName: editPanel.empName,
              shiftDate: formatDateKey(editPanel.date),
              shiftLabel: label,
            });
            setEditPanel(null);
            unlockCell();
          } : undefined}
        />
      )}

      {/* ── Shift Request Board (slide-out panel) ── */}
      {showRequestBoard && (
        <ShiftRequestBoard
          openPickups={shiftRequests.openPickups.filter(req => {
            if (!currentEmpId) return true;
            const dateObj = new Date(req.requesterShiftDate + "T00:00:00");
            const myRanges = getShiftTimeRanges(currentEmpId, dateObj);
            if (myRanges.length === 0) return true;
            const pickupRanges: TimeRange[] = [];
            for (const codeId of req.requesterShiftCodeIds) {
              const sc = shiftCodes.find(c => c.id === codeId);
              if (sc?.categoryId != null) {
                const cat = shiftCategories.find(c => c.id === sc.categoryId);
                if (cat?.startTime && cat?.endTime) {
                  pickupRanges.push({ start: cat.startTime, end: cat.endTime });
                }
              }
            }
            if (pickupRanges.length === 0) return true;
            return !timesOverlap(myRanges, pickupRanges);
          })}
          myRequests={shiftRequests.myRequests}
          pendingApproval={shiftRequests.pendingApproval}
          loading={shiftRequests.loading}
          currentEmpId={currentEmpId}
          canApprove={canApproveShiftRequests}
          onClaim={(id) => currentEmpId && shiftRequests.claim(id, currentEmpId)}
          onRespond={(id, accept) => currentEmpId && shiftRequests.respond(id, currentEmpId, accept)}
          onResolve={(id, approved, note) => shiftRequests.resolve(id, approved, note)}
          onCancel={(id) => currentEmpId && shiftRequests.cancel(id, currentEmpId)}
          onClose={() => setShowRequestBoard(false)}
        />
      )}

      {/* ── Coverage Panel (slide-out) ── */}
      {showCoveragePanel && (
        <CoveragePanel
          gaps={coverageGaps}
          focusAreas={focusAreas}
          shiftCategories={shiftCategories}
          activeFocusArea={activeFocusArea}
          onClose={() => setShowCoveragePanel(false)}
        />
      )}

      {/* ── Shift Swap Modal ── */}
      {swapModalState && (
        <ShiftSwapModal
          requesterEmpId={swapModalState.empId}
          requesterName={swapModalState.empName}
          shiftDate={swapModalState.shiftDate}
          shiftLabel={swapModalState.shiftLabel}
          employees={employees}
          shiftForKey={shiftForKey}
          isRequestableShift={isRequestableShift}
          getShiftTimeRanges={getShiftTimeRanges}
          onSubmit={(targetEmpId, targetShiftDate) => {
            shiftRequests.create('swap', swapModalState.empId, swapModalState.shiftDate, targetEmpId, targetShiftDate);
            setSwapModalState(null);
          }}
          onClose={() => setSwapModalState(null)}
        />
      )}

      <PrintLegend shiftCodes={shiftCodes} />

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
        />
      )}

      {showDiscardConfirm && (
        <ConfirmDialog
          title="Discard Changes?"
          message="Your unpublished changes will be lost. This cannot be undone."
          confirmLabel="Discard my edits"
          variant="danger"
          isLoading={cancelingMode === 'mine'}
          onConfirm={() => {
            setShowDiscardConfirm(false);
            handleCancelChanges();
          }}
          onCancel={() => setShowDiscardConfirm(false)}
          secondaryConfirmLabel={isSuperAdmin ? "Discard all edits" : undefined}
          isSecondaryLoading={cancelingMode === 'all'}
          onSecondaryConfirm={isSuperAdmin ? () => {
            setShowDiscardConfirm(false);
            handleCancelChanges(true);
          } : undefined}
        />
      )}

      {showPublishConfirm && (
        <ConfirmDialog
          title="Publish Schedule?"
          message="This will make all draft changes visible to everyone."
          confirmLabel="Publish"
          variant="info"
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
          message={`This will fill ${autoFillPreview.count} empty slot${autoFillPreview.count === 1 ? '' : 's'} for ${autoFillPreview.dateRange} using recurring shift templates. Existing shifts will not be overwritten.`}
          confirmLabel="Fill Shifts"
          variant="info"
          isLoading={isApplyingRecurring}
          onConfirm={handleApplyRecurring}
          onCancel={() => { setShowAutoFillConfirm(false); setAutoFillPreview(null); }}
        />
      )}

      {pendingSeriesDelete && (
        <ConfirmDialog
          title="Delete Shift Series?"
          message={`This will mark ${pendingSeriesDelete.shiftCount} shift${pendingSeriesDelete.shiftCount === 1 ? '' : 's'} for deletion. They will be permanently removed when you publish.`}
          confirmLabel="Delete Series"
          variant="danger"
          onConfirm={handleConfirmSeriesDelete}
          onCancel={() => { setPendingSeriesDelete(null); unlockCell(); setEditPanel(null); }}
        />
      )}

      {showImportConfirm && importPreview && (
        <ConfirmDialog
          title="Import Previous Schedule?"
          message={`This will copy ${importPreview.count} shift${importPreview.count !== 1 ? 's' : ''} from ${importPreview.sourceRange} into ${importPreview.targetRange}. Only empty slots will be filled — existing shifts will not be overwritten.`}
          confirmLabel="Import Shifts"
          variant="info"
          isLoading={isImportingPrevious}
          onConfirm={handleImportPrevious}
          onCancel={() => { setShowImportConfirm(false); setImportPreview(null); }}
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
      <SchedulerContent />
    </ProtectedRoute>
  );
}
