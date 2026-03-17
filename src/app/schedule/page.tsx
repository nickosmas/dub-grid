"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Header from "@/components/Header";
import Toolbar from "@/components/Toolbar";
import ScheduleGrid from "@/components/ScheduleGrid";
import MonthView from "@/components/MonthView";
import ShiftEditPanel from "@/components/ShiftEditPanel";
import PrintLegend from "@/components/PrintLegend";
import PrintOptionsModal, { PrintConfig } from "@/components/PrintOptionsModal";
import PrintScheduleView from "@/components/PrintScheduleView";
import DraftBanner from "@/components/DraftBanner";

import ProgressBar from "@/components/ProgressBar";
import { usePageTransition } from "@/components/PageTransition";
import { addDays, formatDate, formatDateKey, getWeekStart } from "@/lib/utils";
import { filterAndSortEmployees } from "@/lib/schedule-logic";
import * as db from "@/lib/db";
import { OptimisticLockError } from "@/lib/db";
import { computeDraftBreakdown } from "@/lib/draft-utils";
import { supabase } from "@/lib/supabase";
import { usePermissions, useOrganizationData, useEmployees, useCellLocks } from "@/hooks";
import PresenceAvatars from "@/components/PresenceAvatars";
import { ProtectedRoute } from "@/components/RouteGuards";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
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
  const { canEditShifts, canEditNotes, canApplyRecurringSchedule, canManageShiftSeries, canPublishSchedule, isLoading: permsLoading } = usePermissions();
  const {
    org, focusAreas, shiftCodes, allShiftCodesRef, shiftCategories,
    indicatorTypes, certifications, orgRoles, shiftCodeMap,
    loading: orgLoading, loadError,
  } = useOrganizationData();
  const {
    employees,
    loading: empLoading,
  } = useEmployees(org?.id ?? null);

  const today = useRef(new Date()).current;

  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStart(new Date()),
  );
  const [activeFocusArea, setActiveFocusArea] = useState<number | null>(null);
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [notes, setNotes] = useState<Record<string, { indicatorTypeId: number; status: 'published' | 'draft' | 'draft_deleted' }[]>>({});
  const [editPanel, setEditPanel] = useState<EditModalState | null>(null);
  const [spanWeeks, setSpanWeeks] = useState<1 | 2 | "month">(2);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [staffSearch, setStaffSearch] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
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

  const draftBreakdown = useMemo(
    () => computeDraftBreakdown(shifts, notes),
    [shifts, notes],
  );

  const hasUnpublishedChanges = draftBreakdown.totalChanges > 0;

  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null);

  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const skipNextBroadcastRef = useRef(false);
  const draftChangedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load schedule-specific data (shifts, notes, recurring, publish history) once org data is ready.
  const scheduleLoadStarted = useRef(false);
  useEffect(() => {
    if (orgLoading || !org || scheduleLoadStarted.current) return;
    scheduleLoadStarted.current = true;
    const orgId = org.id;

    async function fetchCurrentUser(): Promise<{ id: string; name: string } | null> {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return null;
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();
        const first = profile?.first_name?.trim() || "";
        const last = profile?.last_name?.trim() || "";
        const full = [first, last].filter(Boolean).join(" ");
        const name = full || user.email?.split("@")[0] || "Unknown";
        return { id: user.id, name };
      } catch {
        return null;
      }
    }

    async function loadSchedule() {
      try {
        const codeMap = new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label]));

        // All 5 fetches are independent — run in parallel
        const [shiftData, noteRows, recShifts, latestPublish, userInfo] = await Promise.all([
          db.fetchShifts(orgId, canEditShifts, codeMap),
          db.fetchScheduleNotes(orgId),
          db.fetchRecurringShifts(orgId, undefined, codeMap),
          db.fetchLatestPublishHistory(orgId).catch(() => null),
          fetchCurrentUser(),
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
        if (userInfo) setCurrentUser(userInfo);
      } catch (err) {
        console.error("loadSchedule error:", err);
      } finally {
        setScheduleLoading(false);
      }
    }
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org]);

  const { lockCell, unlockCell, getCellLock, lockedCells, onlineUsers, syncPresence } = useCellLocks(realtimeChannelRef, currentUser);

  // Subscribe to real-time schedule broadcasts so other tabs/users see
  // published and draft changes immediately without a manual refresh.
  useEffect(() => {
    if (!org) return;

    const refetchScheduleData = async () => {
      const cMap = new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label]));
      const [shiftData, noteRows] = await Promise.all([
        db.fetchShifts(org.id, canEditShifts, cMap),
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
    };

    const channel = supabase
      .channel(`schedule:${org.id}`)
      .on('broadcast', { event: 'schedule_published' }, async () => {
        try {
          await refetchScheduleData();
          const history = await db.fetchLatestPublishHistory(org.id);
          setPublishHistory(history);
        } catch (err) {
          console.error('Failed to sync schedule update:', err);
        }
      })
      .on('broadcast', { event: 'draft_changed' }, () => {
        // Skip if we sent this broadcast ourselves
        if (skipNextBroadcastRef.current) {
          skipNextBroadcastRef.current = false;
          return;
        }
        // Debounce rapid changes (500ms)
        if (draftChangedDebounceRef.current) clearTimeout(draftChangedDebounceRef.current);
        draftChangedDebounceRef.current = setTimeout(async () => {
          try {
            await refetchScheduleData();
          } catch (err) {
            console.error('Failed to sync draft change:', err);
          }
        }, 500);
      })
      .on('presence', { event: 'sync' }, syncPresence)
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED' && currentUser) {
          await channel.track({ editingCell: null, userId: currentUser.id, userName: currentUser.name });
        }
      });

    realtimeChannelRef.current = channel;

    return () => {
      realtimeChannelRef.current = null;
      if (draftChangedDebounceRef.current) clearTimeout(draftChangedDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [org, canEditShifts, currentUser, syncPresence]);

  // Re-fetch with scheduler visibility once permissions resolve, so editors
  // see draft data even if the initial load ran before permissions were ready.
  const draftCheckStarted = useRef(false);
  const [draftCheckComplete, setDraftCheckComplete] = useState(false);
  useEffect(() => {
    if (permsLoading || !org || scheduleLoading || draftCheckStarted.current) return;
    if (!canEditShifts) { setDraftCheckComplete(true); return; }
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

  const visibleScheduleEmployees = useMemo(() => {
    return filteredEmployees;
  }, [filteredEmployees]);

  const highlightEmpIds = useMemo(() => {
    if (!staffSearch.trim()) return undefined;
    const q = staffSearch.toLowerCase();
    return new Set(
      filteredEmployees
        .filter((e) => e.name.toLowerCase().includes(q))
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

  // Build a lookup map from publish history changes for O(1) access
  const publishChangesMap = useMemo(() => {
    if (!publishHistory) return null;
    const map = new Map<string, PublishChange>();
    for (const change of publishHistory.changes) {
      map.set(`${change.empId}_${change.date}`, change);
    }
    return map;
  }, [publishHistory]);

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

  const broadcastDraftChanged = useCallback(() => {
    skipNextBroadcastRef.current = true;
    realtimeChannelRef.current?.send({
      type: 'broadcast',
      event: 'draft_changed',
      payload: {},
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
      const existing = shifts[key];
      const existingVersion = existing?.version;

      const handleConflict = async () => {
        toast.error("Shift was modified by another user — refreshing");
        const freshShifts = await db.fetchShifts(orgId, canEditShifts, shiftCodeMap);
        setShifts(freshShifts);
      };

      if (label === "OFF" || shiftCodeIds.length === 0) {
        setShifts((prev) => {
          const next = { ...prev };
          const ex = prev[key];
          next[key] = {
            label: "OFF", shiftCodeIds: [], isDraft: true, isDelete: true,
            draftKind: ex?.publishedShiftCodeIds?.length ? 'deleted' : 'new',
            publishedShiftCodeIds: ex?.publishedShiftCodeIds ?? [],
            publishedLabel: ex?.publishedLabel ?? '',
          };
          return next;
        });
        db.deleteShift(empId, dateKey).catch((err) => {
          toast.error("Failed to delete shift");
          console.error(err);
        });
        broadcastDraftChanged();
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
        setShifts((prev) => {
          const ex = prev[key];
          const hasPublished = ex?.publishedShiftCodeIds?.length ?? 0;
          return {
            ...prev,
            [key]: {
              label, shiftCodeIds: validCodeIds, isDraft: true,
              draftKind: hasPublished ? 'modified' : 'new',
              publishedShiftCodeIds: ex?.publishedShiftCodeIds ?? [],
              publishedLabel: ex?.publishedLabel ?? '',
            },
          };
        });
        db.upsertShift(empId, dateKey, validCodeIds, orgId, undefined, undefined, existingVersion).catch((err) => {
          if (err instanceof OptimisticLockError) {
            handleConflict();
          } else {
            toast.error("Failed to save shift");
            console.error(err);
          }
        });
        broadcastDraftChanged();
      }
    },
    [org?.id, shifts, canEditShifts, shiftCodeMap, broadcastDraftChanged],
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
        color: "#F8FAFC",
        border: "#CBD5E1",
        text:"#475569",
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
        empName: emp.name,
        date,
        empFocusAreaIds: emp.focusAreaIds,
        empCertificationId: emp.certificationId,
        activeFocusAreaId: activeFaId,
      });
    },
    [canEditNotes, focusAreas, getCellLock, lockCell],
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
          const shiftData = await db.fetchShifts(org!.id, canEditShifts, shiftCodeMap);
          setShifts(shiftData);
          broadcastDraftChanged();
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
      const deletedCount = await db.deleteShiftSeries(pendingSeriesDelete.seriesId);
      const shiftData = await db.fetchShifts(org.id, canEditShifts, shiftCodeMap);
      setShifts(shiftData);
      broadcastDraftChanged();
      toast.success(`Series deleted (${deletedCount} shifts marked for removal on publish)`);
    } catch (err) {
      toast.error("Failed to delete series");
      console.error(err);
    } finally {
      setPendingSeriesDelete(null);
      unlockCell();
      setEditPanel(null);
    }
  }, [pendingSeriesDelete, org, canEditShifts, shiftCodeMap, broadcastDraftChanged, unlockCell]);

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
        const shiftData = await db.fetchShifts(org.id, canEditShifts, shiftCodeMap);
        setShifts(shiftData);
        toast.success("Repeating shift created");
      } catch (err) {
        toast.error("Failed to create repeating shift");
        console.error(err);
      } finally {
        unlockCell();
        setEditPanel(null);
      }
    },
    [editPanel, org, canEditShifts, shiftCodeMap, shiftForKey, shiftCodeIdsForKey, unlockCell],
  );

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

    // Count empty slots that would be filled (same logic as applyRecurringSchedules but client-side only)
    const byEmp: Record<string, RecurringShift[]> = {};
    for (const rs of freshRecurringShifts) {
      if (!byEmp[rs.empId]) byEmp[rs.empId] = [];
      byEmp[rs.empId].push(rs);
    }

    let count = 0;
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;
      const dayOfWeek = current.getDay();

      for (const [empId, empShifts] of Object.entries(byEmp)) {
        if (shifts[`${empId}_${dateKey}`]) continue;
        const candidates = empShifts.filter(rs => rs.dayOfWeek === dayOfWeek);
        if (candidates.length > 0) count++;
      }
      current.setDate(current.getDate() + 1);
    }

    if (count === 0) {
      toast.info("No empty slots to fill for this date range");
      return;
    }

    const dateRange = `${formatDate(startDate)} – ${formatDate(endDate)}`;
    setAutoFillPreview({ count, dateRange });
    setShowAutoFillConfirm(true);
  }, [org, getAutoFillRange, shiftCodeMap, shifts]);

  // Actually apply recurring schedules (called after confirmation)
  const handleApplyRecurring = useCallback(async () => {
    if (!org) return;
    setShowAutoFillConfirm(false);
    setIsApplyingRecurring(true);
    try {
      const { startDate, endDate } = getAutoFillRange();

      const generated = await db.applyRecurringSchedules(
        org.id,
        startDate,
        endDate,
        recurringShifts,
        shifts,
      );

      if (generated.length > 0) {
        setShifts(prev => {
          const next = { ...prev };
          for (const { empId, date, label, shiftCodeId } of generated) {
            next[`${empId}_${date}`] = {
              label, shiftCodeIds: [shiftCodeId], isDraft: true, fromRecurring: true,
              draftKind: 'new', publishedShiftCodeIds: [], publishedLabel: '',
            };
          }
          return next;
        });
        toast.success(`Recurring schedule applied (${generated.length} shifts)`);
        broadcastDraftChanged();
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
  }, [org, getAutoFillRange, recurringShifts, shifts, broadcastDraftChanged]);

  const handleNoteToggle = useCallback(
    async (indicatorTypeId: number, active: boolean, focusAreaId: number) => {
      if (!org || !editPanel) return;
      const dateKey = formatDateKey(editPanel.date);
      const key = `${editPanel.empId}_${dateKey}_${focusAreaId}`;

      let existingStatus: 'published' | 'draft' | 'draft_deleted' | undefined;
      setNotes((prev) => {
        const existing = prev[key] ?? [];
        existingStatus = existing.find(n => n.indicatorTypeId === indicatorTypeId)?.status;

        let updated: { indicatorTypeId: number; status: 'published' | 'draft' | 'draft_deleted' }[];
        if (active) {
          // "Adding" or "Restoring"
          if (existingStatus === 'draft_deleted') {
            updated = existing.map(n => n.indicatorTypeId === indicatorTypeId ? { ...n, status: 'published' as const } : n);
          } else {
            updated = [...existing.filter(n => n.indicatorTypeId !== indicatorTypeId), { indicatorTypeId, status: 'draft' as const }];
          }
        } else {
          // "Deleting" or "Canceling draft"
          if (existingStatus === 'published') {
            updated = existing.map(n => n.indicatorTypeId === indicatorTypeId ? { ...n, status: 'draft_deleted' as const } : n);
          } else {
            updated = existing.filter(n => n.indicatorTypeId !== indicatorTypeId);
          }
        }
        return { ...prev, [key]: updated };
      });

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
        broadcastDraftChanged();
      } catch (error) {
        console.error(error);
      }
    },
    [editPanel, org, broadcastDraftChanged],
  );

  const handlePrev = useCallback(() => {
    if (spanWeeks === "month") {
      setWeekStart(
        (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
      );
    } else {
      setWeekStart((prev) => addDays(prev, -(spanWeeks * 7)));
    }
  }, [spanWeeks]);

  const handleNext = useCallback(() => {
    if (spanWeeks === "month") {
      setWeekStart(
        (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
      );
    } else {
      setWeekStart((prev) => addDays(prev, spanWeeks * 7));
    }
  }, [spanWeeks]);

  const handleToday = useCallback(
    () => setWeekStart(getWeekStart(today)),
    [today],
  );

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

      const [shiftData, noteRows] = await Promise.all([
        db.fetchShifts(org.id, canEditShifts, shiftCodeMap),
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
  }, [org, weekStart, monthStart, spanWeeks, canEditShifts, setIsPublishing]);

  const handleCancelChanges = useCallback(async () => {
    if (!org) return;
    setIsCanceling(true);
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

      await db.discardScheduleDrafts(org.id, startDate, endDate);

      const [shiftData, noteRows] = await Promise.all([
        db.fetchShifts(org.id, canEditShifts, shiftCodeMap),
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
      unlockCell();
      setEditPanel(null);
      setShowDiffOverlay(false);
      toast.success("Changes discarded");
    } catch (err: any) {
      toast.error("Failed to discard changes");
      console.error(err);
    } finally {
      setIsCanceling(false);
    }
  }, [org, weekStart, monthStart, spanWeeks, canEditShifts, shiftCodeMap]);

  // ── Loading / error states ───────────────────────────────────────────────────

  if (loadError) {
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
          background: "linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "#FEF2F2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>

        <div style={{ maxWidth: 400 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", marginBottom: 12, letterSpacing: "-0.02em" }}>
            Workspace Setup Required
          </h1>
          <p style={{ fontSize: 16, color: "#475569", lineHeight: 1.6, marginBottom: 32 }}>
            Your account is active, but it looks like your workspace hasn't been initialized yet.
            Once your administrator completes the setup, you'll be able to access the schedule.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 24px",
                background: "#1B3A2D",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                transition: "opacity 0.2s"
              }}
            >
              Check Again
            </button>
            <button
              onClick={() => window.location.href = "mailto:support@dubgrid.com"}
              style={{
                padding: "12px 24px",
                background: "#F1F5F9",
                color: "#475569",
                border: "none",
                borderRadius: "8px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Contact Support
            </button>
          </div>
        </div>

        {/* Technical details accessible only via hover/inspect for developers */}
        <div style={{ marginTop: 40, opacity: 0.1, fontSize: 11, color: "var(--color-text-faint)" }}>
           System status: {loadError}
        </div>
      </div>
    );
  }

  const { setPageReady } = usePageTransition();
  const isLoading = orgLoading || empLoading || scheduleLoading || !draftCheckComplete;

  useEffect(() => {
    if (!isLoading) setPageReady();
  }, [isLoading, setPageReady]);

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
      <ProgressBar loading={isLoading} />
      <div
        className="no-print"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "var(--color-bg)",
          boxShadow: "var(--shadow-raised)",
        }}
      >
        <Header orgName={org?.name} />
      </div>

      {!isLoading && (
        <>
          <div
            className="no-print"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 99,
            }}
          >
            {canEditShifts && hasUnpublishedChanges && (
              <DraftBanner
                onPublish={() => setShowPublishConfirm(true)}
                onCancel={() => setShowDiscardConfirm(true)}
                isPublishing={isPublishing}
                isCanceling={isCanceling}
                breakdown={draftBreakdown}
                showDiff={showDiffOverlay}
                onToggleDiff={() => setShowDiffOverlay(v => !v)}
                canPublish={canPublishSchedule}
              />
            )}
            {!hasUnpublishedChanges && canEditShifts && publishHistory && publishHistory.changeCount > 0 && (
              <div className="dg-draft-banner no-print" style={{ background: "#EEF2FF", borderColor: "#A5B4FC", color: "#3730A3" }}>
                <div className="dg-draft-banner-dot" style={{ background: "#6366F1" }} />
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
                  <button
                    onClick={() => setShowPublishDiff(v => !v)}
                    className="dg-btn dg-btn-secondary"
                    style={{
                      fontSize: 12,
                      padding: "5px 12px",
                      background: showPublishDiff ? "#E0E7FF" : undefined,
                      color: showPublishDiff ? "#4338CA" : undefined,
                    }}
                  >
                    {showPublishDiff ? "Hide Changes" : "Show What Changed"}
                  </button>
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
                onSpanChange={setSpanWeeks}
                onFocusAreaChange={setActiveFocusArea}
                onStaffSearchChange={setStaffSearch}
                canEditShifts={canEditShifts && canApplyRecurringSchedule}
                onApplyRecurring={handleAutoFillPreview}
                isApplyingRecurring={isApplyingRecurring}
                onPrintOpen={() => setShowPrintOptions(true)}
                presenceSlot={<PresenceAvatars onlineUsers={onlineUsers} />}
              />
            </div>
          </div>

          <div style={{ padding: "16px 16px" }}>

            {spanWeeks !== "month" && (
          <div>
            <ScheduleGrid
              filteredEmployees={visibleScheduleEmployees}
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
              isCellInteractive={canEditNotes}
              activeIndicatorIdsForKey={activeIndicatorIdsForKey}
              activeFocusArea={activeFocusArea}
              getCustomShiftTimes={getCustomShiftTimes}
              draftKindForKey={draftKindForKey}
              showDiffOverlay={showDiffOverlay}
              publishedLabelForKey={publishedLabelForKey}
              publishedShiftCodeIdsForKey={publishedShiftCodeIdsForKey}
              publishDiffForKey={publishDiffKindForKey}
              cellLocks={lockedCells}
            />
          </div>
        )}

        {spanWeeks === "month" && (
          <MonthView
            monthStart={monthStart}
            filteredEmployees={visibleScheduleEmployees}
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
          message="All unpublished changes will be lost. This cannot be undone."
          confirmLabel="Discard"
          variant="danger"
          isLoading={isCanceling}
          onConfirm={async () => {
            await handleCancelChanges();
            setShowDiscardConfirm(false);
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}

      {showPublishConfirm && (
        <ConfirmDialog
          title="Publish Schedule?"
          message="This will make all draft changes visible to everyone."
          confirmLabel="Publish"
          variant="info"
          isLoading={isPublishing}
          onConfirm={async () => {
            await handlePublish();
            setShowPublishConfirm(false);
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
