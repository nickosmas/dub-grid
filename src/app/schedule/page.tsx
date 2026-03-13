"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Header, { ViewMode } from "@/components/Header";
import Toolbar from "@/components/Toolbar";
import ScheduleGrid from "@/components/ScheduleGrid";
import MonthView from "@/components/MonthView";
import StaffView from "@/components/StaffView";
import SettingsPage from "@/components/SettingsPage";
import ShiftEditPanel from "@/components/ShiftEditPanel";
import AddEmployeeModal from "@/components/AddEmployeeModal";
import PrintLegend from "@/components/PrintLegend";
import PrintOptionsModal, { PrintConfig } from "@/components/PrintOptionsModal";
import PrintScheduleView from "@/components/PrintScheduleView";
import DraftBanner from "@/components/DraftBanner";
import Modal from "@/components/Modal";
import RepeatModal from "@/components/RepeatModal";
import { addDays, formatDateKey, getWeekStart } from "@/lib/utils";
import { filterAndSortEmployees } from "@/lib/schedule-logic";
import * as db from "@/lib/db";
import type { DraftSession } from "@/lib/db";
import { validateConfig, supabase } from "@/lib/supabase";
import { handleApiError } from "@/lib/error-handling";
import { usePermissions } from "@/hooks";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  Employee,
  EditModalState,
  ShiftMap,
  ShiftCode,
  ShiftCategory,
  IndicatorType,
  Company,
  FocusArea,
  NoteType,
  RegularShift,
  SeriesFrequency,
  SeriesScope,
  NamedItem,
} from "@/types";

/** Compute the min/max date range of all draft changes from in-memory state. */
function getDraftDateRangeFromState(
  shifts: ShiftMap,
  notes: Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]>,
): { startDate: Date; endDate: Date } | null {
  const draftDates: string[] = [];
  for (const [key, shift] of Object.entries(shifts)) {
    if (shift.isDraft) {
      const m = key.match(/(\d{4}-\d{2}-\d{2})/);
      if (m) draftDates.push(m[1]);
    }
  }
  for (const [key, noteList] of Object.entries(notes)) {
    if (noteList.some(n => n.status !== 'published')) {
      const m = key.match(/(\d{4}-\d{2}-\d{2})/);
      if (m) draftDates.push(m[1]);
    }
  }
  if (draftDates.length === 0) return null;
  draftDates.sort();
  return {
    startDate: new Date(draftDates[0] + "T00:00:00"),
    endDate: new Date(draftDates[draftDates.length - 1] + "T00:00:00"),
  };
}

function SchedulerContent() {
  const { canEditShifts, canEditNotes, canManageCompany, isSuperAdmin, isGridmaster, isLoading: permsLoading } = usePermissions();
  const today = useRef(new Date()).current;

  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStart(new Date()),
  );
  const [activeFocusArea, setActiveFocusArea] = useState<number | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[]>([]);
  // Full set including archived codes — used to build the codeMap for historical label resolution
  const allShiftCodesRef = useRef<ShiftCode[]>([]);
  const [shiftCategories, setShiftCategories] = useState<ShiftCategory[]>([]);
  const [indicatorTypes, setIndicatorTypes] = useState<IndicatorType[]>([]);
  const [certifications, setCertifications] = useState<NamedItem[]>([]);
  const [companyRoles, setCompanyRoles] = useState<NamedItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [benchedEmployees, setBenchedEmployees] = useState<Employee[]>([]);
  const [terminatedEmployees, setTerminatedEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [notes, setNotes] = useState<Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]>>({});
  const [editPanel, setEditPanel] = useState<EditModalState | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("schedule");
  const [spanWeeks, setSpanWeeks] = useState<1 | 2 | "month">(2);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [regularShifts, setRegularShifts] = useState<RegularShift[]>([]);
  const [isApplyingRegular, setIsApplyingRegular] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [activePrintConfig, setActivePrintConfig] = useState<PrintConfig | null>(null);
  const [repeatModalState, setRepeatModalState] = useState<{
    label: string; date: Date; empId: string; empName: string;
  } | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSession, setDraftSession] = useState<DraftSession | null>(null);
  const [showDraftRecoveryBanner, setShowDraftRecoveryBanner] = useState(false);
  const [showDraftConfirmModal, setShowDraftConfirmModal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  const hasUnpublishedChanges = useMemo(() => {
    return (
      Object.values(shifts).some(shift => shift.isDraft) ||
      Object.values(notes).some(noteList => noteList.some(n => n.status !== 'published'))
    );
  }, [shifts, notes]);

  const draftChangeCount = useMemo(() => {
    let count = 0;
    for (const shift of Object.values(shifts)) {
      if (shift.isDraft) count++;
    }
    return count;
  }, [shifts]);

  /** True when the schedule has both published and draft shifts (a mixed state). */
  const hasPublishedShifts = useMemo(() => {
    return Object.values(shifts).some(shift => !shift.isDraft && shift.label !== "OFF");
  }, [shifts]);

  // Role-based view modes: settings requires admin+, staff requires scheduler+
  const availableViewModes: ViewMode[] = useMemo(() => {
    const modes: ViewMode[] = ["schedule"];
    if (canEditShifts) modes.push("staff");
    if (canManageCompany || isSuperAdmin || isGridmaster) modes.push("settings");
    return modes;
  }, [canEditShifts, canManageCompany, isSuperAdmin, isGridmaster]);

  const employeesRef = useRef<Employee[]>([]);
  employeesRef.current = employees;
  const benchedRef = useRef<Employee[]>([]);
  benchedRef.current = benchedEmployees;
  const terminatedRef = useRef<Employee[]>([]);
  terminatedRef.current = terminatedEmployees;
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        validateConfig();

        const org = await db.fetchUserCompany();
        if (!org) {
          setLoadError("No company found. Check your database setup.");
          return;
        }

        // Fetch reference data first so we can build the code map for shift fetches.
        // Shift codes are fetched with includeArchived=true so the codeMap resolves
        // historical labels; the UI receives active-only via filtering.
        const [w, allCodes, cats, indicators, certs, roles] = await Promise.all([
          db.fetchFocusAreas(org.id),
          db.fetchShiftCodes(org.id, true),
          db.fetchShiftCategories(org.id),
          db.fetchIndicatorTypes(org.id),
          db.fetchCertifications(org.id),
          db.fetchCompanyRoles(org.id),
        ]);
        const activeCodes = allCodes.filter(sc => !sc.archivedAt);
        const codeMap = new Map(allCodes.map(sc => [sc.id, sc.label]));
        const [emps, benched, terminated, shiftData, noteRows, regShifts] = await Promise.all([
          db.fetchEmployees(org.id, ["active"]),
          db.fetchEmployees(org.id, ["benched"]),
          db.fetchEmployees(org.id, ["terminated"]),
          db.fetchShifts(org.id, canEditShifts, codeMap),
          db.fetchScheduleNotes(org.id),
          db.fetchRegularShifts(org.id, undefined, codeMap),
        ]);
        const noteMap: Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]> = {};
        for (const note of noteRows) {
          const key = note.focusAreaId != null
            ? `${note.empId}_${note.date}_${note.focusAreaId}`
            : `${note.empId}_${note.date}`;
          if (!noteMap[key]) noteMap[key] = [];
          noteMap[key].push({ type: note.noteType, status: note.status });
        }
        setCompany(org);
        setFocusAreas(w);
        allShiftCodesRef.current = allCodes;
        setShiftCodes(activeCodes);
        setShiftCategories(cats);
        setIndicatorTypes(indicators);
        setCertifications(certs);
        setCompanyRoles(roles);
        setEmployees(emps);
        setBenchedEmployees(benched);
        setTerminatedEmployees(terminated);
        setShifts(shiftData);
        setNotes(noteMap);
        setRegularShifts(regShifts);
      } catch (err) {
        console.error(err);
        handleApiError(err);
        setLoadError(
          err instanceof Error ? err.message : "Failed to load data",
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Warn users before navigating away with unsaved draft changes.
  useEffect(() => {
    if (!isEditMode || !hasUnpublishedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isEditMode, hasUnpublishedChanges]);

  // Subscribe to real-time schedule broadcasts so other tabs/users see
  // published changes immediately without a manual refresh.
  useEffect(() => {
    if (!company) return;

    const channel = supabase
      .channel(`schedule:${company.id}`)
      .on('broadcast', { event: 'schedule_published' }, async () => {
        try {
          const cMap = new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label]));
          const [shiftData, noteRows] = await Promise.all([
            db.fetchShifts(company.id, canEditShifts, cMap),
            db.fetchScheduleNotes(company.id),
          ]);
          const noteMap: Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]> = {};
          for (const note of noteRows) {
            const key = note.focusAreaId != null
              ? `${note.empId}_${note.date}_${note.focusAreaId}`
              : `${note.empId}_${note.date}`;
            if (!noteMap[key]) noteMap[key] = [];
            noteMap[key].push({ type: note.noteType, status: note.status });
          }
          setShifts(shiftData);
          setNotes(noteMap);
        } catch (err) {
          console.error('Failed to sync schedule update:', err);
        }
      })
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      realtimeChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [company, canEditShifts]);

  // Draft recovery: detect saved or orphaned drafts on initial load.
  const draftCheckStarted = useRef(false);
  const [draftCheckComplete, setDraftCheckComplete] = useState(false);
  useEffect(() => {
    if (permsLoading || !company || loading || draftCheckStarted.current) return;
    if (!canEditShifts) { setDraftCheckComplete(true); return; }
    draftCheckStarted.current = true;

    (async () => {
      try {
        const session = await db.getDraftSession(company.id);
        if (session) {
          // Re-fetch shifts with scheduler visibility so draft data is loaded.
          // The initial load may have run before permissions resolved, fetching
          // published-only data.
          const cMap = new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label]));
          const draftShifts = await db.fetchShifts(company.id, true, cMap);
          setShifts(draftShifts);
          setDraftSession(session);
          setShowDraftRecoveryBanner(true);
          setDraftCheckComplete(true);
          return;
        }

        // No saved session — check for orphaned drafts and auto-discard
        const hasDrafts =
          Object.values(shifts).some(s => s.isDraft) ||
          Object.values(notes).some(nl => nl.some(n => n.status !== "published"));

        if (hasDrafts) {
          const range = getDraftDateRangeFromState(shifts, notes);
          if (range) {
            await db.discardScheduleDrafts(company.id, range.startDate, range.endDate);
            const cMap = new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label]));
            const [freshShifts, freshNotes] = await Promise.all([
              db.fetchShifts(company.id, true, cMap),
              db.fetchScheduleNotes(company.id),
            ]);
            const noteMap: Record<string, { type: NoteType; status: "published" | "draft" | "draft_deleted" }[]> = {};
            for (const note of freshNotes) {
              const key = note.focusAreaId != null
                ? `${note.empId}_${note.date}_${note.focusAreaId}`
                : `${note.empId}_${note.date}`;
              if (!noteMap[key]) noteMap[key] = [];
              noteMap[key].push({ type: note.noteType, status: note.status });
            }
            setShifts(freshShifts);
            setNotes(noteMap);
          }
        }
      } catch (err) {
        console.error("Draft recovery check failed:", err);
      } finally {
        setDraftCheckComplete(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permsLoading, company, loading, canEditShifts]);

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

  const staffEmployees = useMemo(
    () =>
      employees
        .filter((e) => e.focusAreaIds.length > 0)
        .sort((a, b) => a.seniority - b.seniority),
    [employees],
  );

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

  const isDraftForKey = useCallback(
    (empId: string, date: Date): boolean =>
      (draftCheckComplete || isEditMode) && (shifts[`${empId}_${formatDateKey(date)}`]?.isDraft ?? false),
    [shifts, draftCheckComplete, isEditMode],
  );

  const getCustomShiftTimes = useCallback(
    (empId: string, date: Date): { start: string; end: string } | null => {
      const entry = shifts[`${empId}_${formatDateKey(date)}`];
      if (!entry?.customStartTime && !entry?.customEndTime) return null;
      return { start: entry.customStartTime ?? "", end: entry.customEndTime ?? "" };
    },
    [shifts],
  );

  const handleCustomTimeChange = useCallback(
    (start: string | null, end: string | null) => {
      if (!editPanel || !company?.id) return;
      const dateKey = formatDateKey(editPanel.date);
      const key = `${editPanel.empId}_${dateKey}`;
      setShifts((prev) => {
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { ...existing, customStartTime: start, customEndTime: end } };
      });
      db.upsertShiftTimes(editPanel.empId, dateKey, start, end, company.id).catch((err) => {
        toast.error("Failed to save shift times");
        console.error(err);
      });
    },
    [editPanel, company?.id],
  );

  const noteTypesForKey = useCallback(
    (empId: string, date: Date, focusAreaId?: number): NoteType[] => {
      const dateKey = formatDateKey(date);
      const key = focusAreaId != null ? `${empId}_${dateKey}_${focusAreaId}` : `${empId}_${dateKey}`;
      const noteList = notes[key] ?? [];
      // Only return notes that aren't marked as deleted in draft
      return noteList
        .filter(n => n.status !== 'draft_deleted')
        .map(n => n.type);
    },
    [notes],
  );

  const setShift = useCallback(
    (empId: string, date: Date, label: string, shiftCodeIds: number[]) => {
      const companyId = company?.id;
      if (!companyId) {
        console.error("Cannot modify shifts before company is loaded");
        return;
      }

      const dateKey = formatDateKey(date);
      const key = `${empId}_${dateKey}`;
      if (label === "OFF" || shiftCodeIds.length === 0) {
        setShifts((prev) => {
          const next = { ...prev };
          next[key] = { label: "OFF", shiftCodeIds: [], isDraft: true, isDelete: true };
          return next;
        });
        db.deleteShift(empId, dateKey).catch((err) => {
          toast.error("Failed to delete shift");
          console.error(err);
        });
      } else {
        setShifts((prev) => ({ ...prev, [key]: { label, shiftCodeIds, isDraft: true } }));
        db.upsertShift(empId, dateKey, shiftCodeIds, companyId).catch((err) => {
          toast.error("Failed to save shift");
          console.error(err);
        });
      }
    },
    [company?.id],
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
        companyId: "",
        label: type,
        name: type,
        color: "#F8FAFC",
        border: "#CBD5E1",
        text: "#64748B",
        sortOrder: 999,
      } satisfies ShiftCode;
    },
    [shiftCodes, focusAreas],
  );

  // ── Event handlers ───────────────────────────────────────────────────────────

  const handleCellClick = useCallback(
    (emp: Employee, date: Date, focusAreaName?: string) => {
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
    [canEditNotes, focusAreas],
  );

  /** Build a code map from ALL codes (including archived) for resolving IDs → labels. */
  const shiftCodeMap = useMemo(
    () => new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label])),
    // Re-derive when the active set changes (which implies allShiftCodesRef was updated too)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shiftCodes],
  );

  const handleShiftSelect = useCallback(
    async (label: string, shiftCodeIds: number[], seriesScope?: SeriesScope) => {
      if (!editPanel) return;
      const key = `${editPanel.empId}_${formatDateKey(editPanel.date)}`;
      const currentMeta = shifts[key];

      if (seriesScope === 'all' && currentMeta?.seriesId) {
        // Bulk-update all shifts in the series (series are single-shift)
        try {
          await db.updateSeriesAllShifts(currentMeta.seriesId, shiftCodeIds[0]);
          const shiftData = await db.fetchShifts(company!.id, canEditShifts, shiftCodeMap);
          setShifts(shiftData);
          toast.success("Series updated");
        } catch (err) {
          toast.error("Failed to update series");
          console.error(err);
        }
      } else {
        setShift(editPanel.empId, editPanel.date, label, shiftCodeIds);
      }
    },
    [editPanel, shifts, company, canEditShifts, setShift, shiftCodeMap],
  );

  const handleMakeRepeating = useCallback(() => {
    if (!editPanel) return;
    const currentLabel = shiftForKey(editPanel.empId, editPanel.date);
    if (!currentLabel || currentLabel === 'OFF') return;
    setRepeatModalState({
      label: currentLabel,
      date: editPanel.date,
      empId: editPanel.empId,
      empName: editPanel.empName,
    });
  }, [editPanel, shiftForKey]);

  const handleRepeatConfirm = useCallback(
    async (
      frequency: SeriesFrequency,
      daysOfWeek: number[] | null,
      startDate: string,
      endDate: string | null,
      maxOccurrences: number | null,
    ) => {
      if (!repeatModalState || !company) return;
      const sc = shiftCodes.find(s => s.label === repeatModalState.label);
      if (!sc) return;
      try {
        await db.createShiftSeries(
          repeatModalState.empId,
          company.id,
          sc.id,
          repeatModalState.label,
          frequency,
          daysOfWeek,
          startDate,
          endDate,
          maxOccurrences,
        );
        const shiftData = await db.fetchShifts(company.id, canEditShifts, shiftCodeMap);
        setShifts(shiftData);
        toast.success("Repeating shift created");
      } catch (err) {
        toast.error("Failed to create repeating shift");
        console.error(err);
      } finally {
        setRepeatModalState(null);
        setEditPanel(null);
      }
    },
    [repeatModalState, company, canEditShifts, shiftCodes, shiftCodeMap],
  );

  const handleApplyRegular = useCallback(async () => {
    if (!company) return;
    setIsApplyingRegular(true);
    try {
      let startDate: Date;
      let endDate: Date;
      if (spanWeeks === "month") {
        startDate = new Date(monthStart);
        endDate = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      } else {
        startDate = new Date(weekStart);
        endDate = addDays(weekStart, spanWeeks * 7 - 1);
      }

      // Always fetch fresh regular shifts so we pick up any recently saved templates
      const freshRegularShifts = await db.fetchRegularShifts(company.id, undefined, shiftCodeMap);
      setRegularShifts(freshRegularShifts);

      const generated = await db.applyRegularSchedules(
        company.id,
        startDate,
        endDate,
        freshRegularShifts,
        shifts,
      );

      if (generated.length > 0) {
        setShifts(prev => {
          const next = { ...prev };
          for (const { empId, date, label } of generated) {
            // Look up the shift code ID from the label
            const sc = shiftCodes.find(s => s.label === label);
            next[`${empId}_${date}`] = { label, shiftCodeIds: sc ? [sc.id] : [], isDraft: true, fromRegular: true };
          }
          return next;
        });
        toast.success(`Regular schedule applied (${generated.length} shifts)`);
      }
    } catch (err) {
      toast.error("Failed to apply regular schedule");
      console.error(err);
    } finally {
      setIsApplyingRegular(false);
    }
  }, [company, spanWeeks, monthStart, weekStart, regularShifts, shifts]);

  const handleNoteToggle = useCallback(
    async (noteType: NoteType, active: boolean, focusAreaId: number) => {
      if (!company || !editPanel) return;
      const dateKey = formatDateKey(editPanel.date);
      const key = `${editPanel.empId}_${dateKey}_${focusAreaId}`;

      let existingStatus: 'published' | 'draft' | 'draft_deleted' | undefined;
      setNotes((prev) => {
        const existing = prev[key] ?? [];
        existingStatus = existing.find(n => n.type === noteType)?.status;
        
        let updated: { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[];
        if (active) {
          // "Adding" or "Restoring"
          if (existingStatus === 'draft_deleted') {
            updated = existing.map(n => n.type === noteType ? { ...n, status: 'published' as const } : n);
          } else {
            updated = [...existing.filter(n => n.type !== noteType), { type: noteType, status: 'draft' as const }];
          }
        } else {
          // "Deleting" or "Canceling draft"
          if (existingStatus === 'published') {
            updated = existing.map(n => n.type === noteType ? { ...n, status: 'draft_deleted' as const } : n);
          } else {
            updated = existing.filter(n => n.type !== noteType);
          }
        }
        return { ...prev, [key]: updated };
      });

      try {
        if (active) {
          await db.upsertScheduleNote(
            company.id,
            editPanel.empId,
            dateKey,
            noteType,
            focusAreaId,
            existingStatus
          );
        } else {
          await db.deleteScheduleNote(
            editPanel.empId,
            dateKey,
            noteType,
            focusAreaId,
            existingStatus
          );
        }
      } catch (error) {
        console.error(error);
      }
    },
    [editPanel, company],
  );

  useEffect(() => {
    if (!availableViewModes.includes(viewMode)) {
      setViewMode("schedule");
    }
  }, [availableViewModes, viewMode]);

  const handleAddEmployee = useCallback(
    async (dataList: Omit<Employee, "id" | "seniority">[]) => {
      if (!company) return;
      try {
        const added: Employee[] = [];
        for (const data of dataList) {
          const maxSen = Math.max(
            ...employeesRef.current.map((e) => e.seniority),
            ...added.map((e) => e.seniority),
            0,
          );
          const newEmp = await db.insertEmployee(
            { ...data, seniority: maxSen + 1 },
            company.id,
          );
          added.push(newEmp);
        }
        setEmployees((prev) => [...prev, ...added]);
        setShowAddModal(false);
        toast.success(added.length === 1 ? "Employee added" : `${added.length} employees added`);
      } catch (err) {
        toast.error("Failed to add employee");
        console.error(err);
      }
    },
    [company],
  );

  const handleSaveEmployee = useCallback(
    async (emp: Employee) => {
      if (!company) return;
      setEmployees((prev) => prev.map((e) => (e.id === emp.id ? emp : e)));
      try {
        await db.updateEmployee(emp, company.id);
        toast.success("Employee saved");
      } catch (err) {
        toast.error("Failed to save employee");
        console.error(err);
      }
    },
    [company],
  );

  const handleDeleteEmployee = useCallback(async (empId: string) => {
    // Move to terminated list from whichever list they're in
    const now = new Date().toISOString();
    const activeEmp = employeesRef.current.find((e) => e.id === empId);
    const benchedEmp = benchedRef.current.find((e) => e.id === empId);
    const emp = activeEmp ?? benchedEmp;
    if (emp) {
      setTerminatedEmployees((t) => [...t, { ...emp, status: "terminated", statusChangedAt: now }]);
    }
    if (activeEmp) setEmployees((prev) => prev.filter((e) => e.id !== empId));
    if (benchedEmp) setBenchedEmployees((prev) => prev.filter((e) => e.id !== empId));
    try {
      await db.deleteEmployee(empId);
      toast.success("Employee terminated");
    } catch (err) {
      toast.error("Failed to terminate employee");
      console.error(err);
    }
  }, []);

  const handleBenchEmployee = useCallback(async (empId: string, note?: string) => {
    const emp = employeesRef.current.find((e) => e.id === empId);
    if (emp) {
      const benched: Employee = { ...emp, status: "benched", statusNote: note ?? "", statusChangedAt: new Date().toISOString() };
      setBenchedEmployees((b) => [...b, benched]);
      setEmployees((prev) => prev.filter((e) => e.id !== empId));
    }
    try {
      await db.benchEmployee(empId, note);
      toast.success("Employee benched");
    } catch (err) {
      toast.error("Failed to bench employee");
      console.error(err);
    }
  }, []);

  const handleActivateEmployee = useCallback(async (empId: string) => {
    const now = new Date().toISOString();
    const benchedEmp = benchedRef.current.find((e) => e.id === empId);
    const terminatedEmp = terminatedRef.current.find((e) => e.id === empId);
    const emp = benchedEmp ?? terminatedEmp;
    if (emp) {
      setEmployees((a) => [...a, { ...emp, status: "active", statusNote: "", statusChangedAt: now }]);
    }
    if (benchedEmp) setBenchedEmployees((prev) => prev.filter((e) => e.id !== empId));
    if (terminatedEmp) setTerminatedEmployees((prev) => prev.filter((e) => e.id !== empId));
    try {
      await db.activateEmployee(empId);
      toast.success("Employee activated");
    } catch (err) {
      toast.error("Failed to activate employee");
      console.error(err);
    }
  }, []);

  const handleShiftCodesChange = useCallback((codes: ShiftCode[]) => {
    // codes from Settings are active-only; merge with existing archived codes
    const archivedCodes = allShiftCodesRef.current.filter(sc => sc.archivedAt);
    allShiftCodesRef.current = [...codes, ...archivedCodes];
    setShiftCodes(codes);
  }, []);

  // With FK references, cascade renames are no longer needed — just update
  // the reference data in state + cache without re-fetching employees.
  const handleCertificationsChange = useCallback(async (items: NamedItem[]) => {
    setCertifications(items);
    // Certification renames/deletions may affect shift_codes.required_certification_ids
    // — re-fetch shift codes (including archived for codeMap) to reflect updates.
    if (company) {
      try {
        const allCodes = await db.fetchShiftCodes(company.id, true);
        const activeCodes = allCodes.filter(sc => !sc.archivedAt);
        allShiftCodesRef.current = allCodes;
        setShiftCodes(activeCodes);
      } catch (err) {
        console.error("re-fetch shift codes after cert change:", err);
      }
    }
  }, [company]);

  const handleCompanyRolesChange = useCallback((items: NamedItem[]) => {
    setCompanyRoles(items);
  }, []);

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
    if (!company) return;
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

      await db.publishSchedule(company.id, startDate, endDate);

      const [shiftData, noteRows] = await Promise.all([
        db.fetchShifts(company.id, canEditShifts, shiftCodeMap),
        db.fetchScheduleNotes(company.id),
      ]);
      const noteMap: Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]> = {};
      for (const note of noteRows) {
        const key = note.focusAreaId != null
          ? `${note.empId}_${note.date}_${note.focusAreaId}`
          : `${note.empId}_${note.date}`;
        if (!noteMap[key]) noteMap[key] = [];
        noteMap[key].push({ type: note.noteType, status: note.status });
      }
      setShifts(shiftData);
      setNotes(noteMap);
      await db.deleteDraftSession(company.id).catch(console.error);
      setDraftSession(null);
      setShowDraftRecoveryBanner(false);
      setIsEditMode(false);
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
  }, [company, weekStart, monthStart, spanWeeks, canEditShifts, setIsPublishing]);

  const handleCancelChanges = useCallback(async () => {
    if (!company) return;
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

      await db.discardScheduleDrafts(company.id, startDate, endDate);

      const [shiftData, noteRows] = await Promise.all([
        db.fetchShifts(company.id, canEditShifts, shiftCodeMap),
        db.fetchScheduleNotes(company.id),
      ]);
      const noteMap: Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]> = {};
      for (const note of noteRows) {
        const key = note.focusAreaId != null
          ? `${note.empId}_${note.date}_${note.focusAreaId}`
          : `${note.empId}_${note.date}`;
        if (!noteMap[key]) noteMap[key] = [];
        noteMap[key].push({ type: note.noteType, status: note.status });
      }
      setShifts(shiftData);
      setNotes(noteMap);
      await db.deleteDraftSession(company.id).catch(console.error);
      setDraftSession(null);
      setShowDraftRecoveryBanner(false);
      setIsEditMode(false);
      toast.success("Changes discarded");
    } catch (err: any) {
      toast.error("Failed to discard changes");
      console.error(err);
    } finally {
      setIsCanceling(false);
    }
  }, [company, weekStart, monthStart, spanWeeks, canEditShifts, shiftCodeMap]);

  const handleSaveDraft = useCallback(async () => {
    if (!company) return;
    setIsSavingDraft(true);
    try {
      const range = getDraftDateRangeFromState(shifts, notes);
      if (!range) {
        setIsEditMode(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      await db.saveDraftSession(company.id, userId, range.startDate, range.endDate);
      const startDate = formatDateKey(range.startDate);
      const endDate = formatDateKey(range.endDate);
      setDraftSession({ id: "", companyId: company.id, savedBy: userId, startDate, endDate, savedAt: new Date().toISOString() });
      setShowDraftRecoveryBanner(true);
      setIsEditMode(false);
      toast.success("Draft saved");
    } catch (err) {
      toast.error("Failed to save draft");
      console.error("Failed to save draft session:", err);
    } finally {
      setIsSavingDraft(false);
    }
  }, [company, shifts, notes]);

  const handleResumeDraft = useCallback(() => {
    setIsEditMode(true);
    setShowDraftRecoveryBanner(false);
  }, []);

  const handleRecoveryPublish = useCallback(async () => {
    if (!company || !draftSession) return;
    setIsPublishing(true);
    try {
      const start = new Date(draftSession.startDate + "T00:00:00");
      const end = new Date(draftSession.endDate + "T00:00:00");
      await db.publishSchedule(company.id, start, end);
      await db.deleteDraftSession(company.id);

      const cMap = new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label]));
      const [freshShifts, freshNotes] = await Promise.all([
        db.fetchShifts(company.id, canEditShifts, cMap),
        db.fetchScheduleNotes(company.id),
      ]);
      const noteMap: Record<string, { type: NoteType; status: "published" | "draft" | "draft_deleted" }[]> = {};
      for (const note of freshNotes) {
        const key = note.focusAreaId != null
          ? `${note.empId}_${note.date}_${note.focusAreaId}`
          : `${note.empId}_${note.date}`;
        if (!noteMap[key]) noteMap[key] = [];
        noteMap[key].push({ type: note.noteType, status: note.status });
      }
      setShifts(freshShifts);
      setNotes(noteMap);
      setDraftSession(null);
      setShowDraftRecoveryBanner(false);
      toast.success("Schedule published");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to publish schedule");
    } finally {
      setIsPublishing(false);
    }
  }, [company, draftSession, canEditShifts]);

  const handleRecoveryDiscard = useCallback(async () => {
    if (!company || !draftSession) return;
    setIsCanceling(true);
    try {
      const start = new Date(draftSession.startDate + "T00:00:00");
      const end = new Date(draftSession.endDate + "T00:00:00");
      await db.discardScheduleDrafts(company.id, start, end);
      await db.deleteDraftSession(company.id);

      const cMap = new Map(allShiftCodesRef.current.map(sc => [sc.id, sc.label]));
      const [freshShifts, freshNotes] = await Promise.all([
        db.fetchShifts(company.id, canEditShifts, cMap),
        db.fetchScheduleNotes(company.id),
      ]);
      const noteMap: Record<string, { type: NoteType; status: "published" | "draft" | "draft_deleted" }[]> = {};
      for (const note of freshNotes) {
        const key = note.focusAreaId != null
          ? `${note.empId}_${note.date}_${note.focusAreaId}`
          : `${note.empId}_${note.date}`;
        if (!noteMap[key]) noteMap[key] = [];
        noteMap[key].push({ type: note.noteType, status: note.status });
      }
      setShifts(freshShifts);
      setNotes(noteMap);
      setDraftSession(null);
      setShowDraftRecoveryBanner(false);
      toast.success("Changes discarded");
    } catch (err) {
      toast.error("Failed to discard changes");
      console.error(err);
    } finally {
      setIsCanceling(false);
    }
  }, [company, draftSession, canEditShifts]);

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
          gap: 12,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          color: "var(--color-text-secondary)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: "#EF4444" }}>
          Failed to connect to Supabase
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--color-text-muted)",
            maxWidth: 480,
            textAlign: "center",
          }}
        >
          {loadError}
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-faint)" }}>
          Ensure <code>.env.local</code> contains valid{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </div>
      </div>
    );
  }

  // ── Full-screen loading ─────────────────────────────────────────────────────

  if (loading || !draftCheckComplete) {
    const sz = 144, cl = sz / 4, gp = cl * 0.18, rx = cl * 0.22;
    // Each cell gets a unique duration AND delay so they never sync up.
    const cells: { dur: number; delay: number }[] = [
      { dur: 0.82, delay: 0.00 }, { dur: 0.94, delay: 0.38 }, { dur: 0.76, delay: 0.16 }, { dur: 1.00, delay: 0.62 },
      { dur: 0.88, delay: 0.28 }, { dur: 0.72, delay: 0.54 }, { dur: 0.98, delay: 0.06 }, { dur: 0.84, delay: 0.44 },
      { dur: 0.74, delay: 0.70 }, { dur: 0.92, delay: 0.22 }, { dur: 0.86, delay: 0.58 }, { dur: 0.78, delay: 0.12 },
      { dur: 0.96, delay: 0.34 }, { dur: 0.80, delay: 0.66 }, { dur: 0.90, delay: 0.48 }, { dur: 0.70, delay: 0.26 },
    ];
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", background: "var(--color-bg)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}>
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} fill="none">
          {[0,1,2,3].map(row =>
            [0,1,2,3].map(col => {
              const c = cells[row * 4 + col];
              return (
                <rect key={`${row}-${col}`} x={col*cl+gp} y={row*cl+gp}
                  width={cl-gp*2} height={cl-gp*2} rx={rx} fill="#1B3A2D">
                  <animate attributeName="opacity" values="0.12;0.95;0.12"
                    dur={`${c.dur}s`} begin={`${c.delay}s`} repeatCount="indefinite" />
                </rect>
              );
            })
          )}
        </svg>
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
        <Header
          viewMode={viewMode}
          onViewChange={setViewMode}
          orgName={company?.name}
          availableViewModes={availableViewModes}
        />
        {isEditMode && canEditShifts && viewMode === "schedule" && (
          <DraftBanner
            onPublish={() => setShowPublishConfirm(true)}
            onCancel={hasUnpublishedChanges ? () => setShowDiscardConfirm(true) : handleCancelChanges}
            onSaveDraft={handleSaveDraft}
            isPublishing={isPublishing}
            isCanceling={isCanceling}
            isSavingDraft={isSavingDraft}
            hasChanges={hasUnpublishedChanges}
            changeCount={draftChangeCount}
          />
        )}
        {showDraftRecoveryBanner && draftSession && !isEditMode && viewMode === "schedule" && (() => {
          const fmtDate = (iso: string) => {
            const [y, m, d] = iso.split("-");
            return `${parseInt(m)}/${parseInt(d)}/${y}`;
          };
          return (
            <div
              className="dg-draft-banner no-print"
              style={{ background: "#EFF6FF", borderColor: "#93C5FD", color: "#1E40AF" }}
            >
              <div className="dg-draft-banner-dot" style={{ background: "#3B82F6" }} />
              <span style={{ fontWeight: 600 }}>
                Unpublished draft
              </span>
              <span style={{ opacity: 0.7, marginLeft: 4 }}>
                {fmtDate(draftSession.startDate)} to {fmtDate(draftSession.endDate)} — changes are saved but not yet visible to staff
              </span>
              <div className="dg-draft-banner-actions">
                <button
                  onClick={handleResumeDraft}
                  className="dg-btn dg-btn-primary"
                  style={{ fontSize: 12, padding: "5px 12px" }}
                >
                  Continue Editing
                </button>
              </div>
            </div>
          );
        })()}
        {viewMode === "schedule" && (
          <div style={{ padding: "12px 16px 0", borderBottom: "1px solid var(--color-border)" }}>
            <Toolbar
              viewMode={viewMode}
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
              canEditShifts={canEditShifts}
              isEditMode={isEditMode}
              onToggleEditMode={() => {
                if (isEditMode && hasUnpublishedChanges) {
                  setShowDraftConfirmModal(true);
                } else {
                  if (showDraftRecoveryBanner) setShowDraftRecoveryBanner(false);
                  setIsEditMode((v) => !v);
                }
              }}
              onApplyRegular={handleApplyRegular}
              isApplyingRegular={isApplyingRegular}
              onPrintOpen={() => setShowPrintOptions(true)}
              hasSavedDraft={showDraftRecoveryBanner && draftSession != null && !isEditMode}
              hasMixedSchedule={showDraftRecoveryBanner && draftSession != null && !isEditMode && hasPublishedShifts}
            />
          </div>
        )}
      </div>

      {viewMode === "schedule" && <div style={{ padding: "16px 16px" }}>

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
              isDraftForKey={isDraftForKey}
              getShiftStyle={getShiftStyle}
              handleCellClick={handleCellClick}
              today={today}
              highlightEmpIds={highlightEmpIds}
              focusAreas={focusAreas}
              shiftCodes={shiftCodes}
              shiftCategories={shiftCategories}
              indicatorTypes={indicatorTypes}
              certifications={certifications}
              companyRoles={companyRoles}
              isCellInteractive={isEditMode && canEditNotes}
              noteTypesForKey={noteTypesForKey}
              activeFocusArea={activeFocusArea}
              isEditMode={isEditMode}
              getCustomShiftTimes={getCustomShiftTimes}
            />
          </div>
        )}

        {viewMode === "schedule" && spanWeeks === "month" && (
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
          />
        )}

      </div>}

      {viewMode === "staff" && (
        <StaffView
          employees={staffEmployees}
          benchedEmployees={benchedEmployees}
          terminatedEmployees={terminatedEmployees}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={companyRoles}
          onSave={handleSaveEmployee}
          onDelete={handleDeleteEmployee}
          onBench={handleBenchEmployee}
          onActivate={handleActivateEmployee}
          onAdd={() => setShowAddModal(true)}
          companyId={company?.id ?? ""}
          shiftCodes={shiftCodes}
          shiftCodeMap={shiftCodeMap}
          canEditShifts={canEditShifts}
          focusAreaLabel={company?.focusAreaLabel}
          certificationLabel={company?.certificationLabel}
          roleLabel={company?.roleLabel}
        />
      )}

      {viewMode === "settings" && company && (
        <SettingsPage
          company={company}
          focusAreas={focusAreas}
          shiftCodes={shiftCodes}
          shiftCategories={shiftCategories}
          indicatorTypes={indicatorTypes}
          certifications={certifications}
          companyRoles={companyRoles}
          onCompanySave={setCompany}
          onFocusAreasChange={setFocusAreas}
          onShiftCodesChange={handleShiftCodesChange}
          onShiftCategoriesChange={setShiftCategories}
          onIndicatorTypesChange={setIndicatorTypes}
          onCertificationsChange={handleCertificationsChange}
          onCompanyRolesChange={handleCompanyRolesChange}
          canManageCompany={canManageCompany}
        />
      )}

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
          getNoteTypes={(focusAreaId) => noteTypesForKey(editPanel.empId, editPanel.date, focusAreaId)}
          onNoteToggle={handleNoteToggle}
          onClose={() => setEditPanel(null)}
          seriesId={shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]?.seriesId}
          onMakeRepeating={canEditShifts ? handleMakeRepeating : undefined}
          customStartTime={shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]?.customStartTime}
          customEndTime={shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]?.customEndTime}
          onCustomTimeChange={canEditShifts ? handleCustomTimeChange : undefined}
        />
      )}

      {repeatModalState && (
        <RepeatModal
          empName={repeatModalState.empName}
          shiftLabel={repeatModalState.label}
          startDate={repeatModalState.date}
          shiftCodes={shiftCodes}
          onConfirm={handleRepeatConfirm}
          onClose={() => setRepeatModalState(null)}
        />
      )}

      {showAddModal && (
        <AddEmployeeModal
          focusAreas={focusAreas}
          certifications={certifications}
          roles={companyRoles}
          onAdd={handleAddEmployee}
          onClose={() => setShowAddModal(false)}
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
          focusAreaLabel={company?.focusAreaLabel}
        />
      )}

      {activePrintConfig && (
        <PrintScheduleView
          orgName={company?.name}
          weekStart={spanWeeks === "month" ? monthStart : weekStart}
          config={activePrintConfig}
          employees={employees}
          allEmployees={employees}
          focusAreas={focusAreas}
          shiftCodes={shiftCodes}
          shiftCategories={shiftCategories}
          certifications={certifications}
          companyRoles={companyRoles}
          shiftForKey={shiftForKey}
          shiftCodeIdsForKey={shiftCodeIdsForKey}
          getShiftStyle={getShiftStyle}
          onClose={() => setActivePrintConfig(null)}
          focusAreaLabel={company?.focusAreaLabel}
        />
      )}

      {showDraftConfirmModal && (
        <Modal title="Unsaved Changes" onClose={() => setShowDraftConfirmModal(false)}>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 20 }}>
            You have unpublished changes. What would you like to do?
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              className="dg-btn dg-btn-ghost"
              onClick={() => setShowDraftConfirmModal(false)}
              style={{ fontSize: 13, padding: "7px 14px" }}
            >
              Cancel
            </button>
            <button
              className="dg-btn dg-btn-secondary"
              onClick={async () => {
                setShowDraftConfirmModal(false);
                await handleCancelChanges();
              }}
              style={{ fontSize: 13, padding: "7px 14px", color: "#DC2626" }}
            >
              Discard Changes
            </button>
            <button
              className="dg-btn dg-btn-primary"
              onClick={async () => {
                setShowDraftConfirmModal(false);
                await handleSaveDraft();
              }}
              style={{ fontSize: 13, padding: "7px 14px" }}
            >
              Save Draft
            </button>
          </div>
        </Modal>
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
    </div>
  );
}

export default function SchedulerPage() {
  return <SchedulerContent />;
}
