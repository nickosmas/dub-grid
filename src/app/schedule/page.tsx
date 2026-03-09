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
import ShiftKeyPanel from "@/components/ShiftKeyPanel";
import DraftBanner from "@/components/DraftBanner";
import RegularSchedulePanel from "@/components/RegularSchedulePanel";
import RepeatModal from "@/components/RepeatModal";
import { addDays, formatDateKey, getWeekStart } from "@/lib/utils";
import { filterAndSortEmployees } from "@/lib/schedule-logic";
import * as db from "@/lib/db";
import { validateConfig } from "@/lib/supabase";
import { handleApiError } from "@/lib/error-handling";
import { usePermissions } from "@/hooks";
import {
  Employee,
  EditModalState,
  ShiftMap,
  ShiftType,
  Organization,
  Wing,
  NoteType,
  RegularShift,
  SeriesFrequency,
  SeriesScope,
} from "@/types";

// Cache all schedule data in sessionStorage so tab refreshes are instant.
// sessionStorage is per-tab: cleared when the tab closes, so stale data from
// another session or device is never carried over across sessions.
const SCHEDULE_CACHE_KEY = "dg_schedule_cache";

type ScheduleCache = {
  org: Organization;
  wings: Wing[];
  shiftTypes: ShiftType[];
  employees: Employee[];
  shifts: ShiftMap;
  notes: Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]>;
};

function readScheduleCache(): ScheduleCache | null {
  try {
    const raw = sessionStorage.getItem(SCHEDULE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ScheduleCache) : null;
  } catch {
    return null;
  }
}

function writeScheduleCache(data: ScheduleCache): void {
  try {
    sessionStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

function SchedulerContent() {
  const { canEditSchedule, canAddNotes, canManageOrg } = usePermissions();
  const today = useRef(new Date()).current;

  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStart(new Date()),
  );
  const [activeWing, setActiveWing] = useState("All");
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [wings, setWings] = useState<Wing[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
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
  const [regularScheduleEmp, setRegularScheduleEmp] = useState<Employee | null>(null);
  const [isApplyingRegular, setIsApplyingRegular] = useState(false);
  const staffToolbarRef = useRef<HTMLDivElement>(null);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [activePrintConfig, setActivePrintConfig] = useState<PrintConfig | null>(null);
  const [repeatModalState, setRepeatModalState] = useState<{
    label: string; date: Date; empId: string; empName: string;
  } | null>(null);

  const hasUnpublishedChanges = useMemo(() => {
    return (
      Object.values(shifts).some(shift => shift.isDraft) ||
      Object.values(notes).some(noteList => noteList.some(n => n.status !== 'published'))
    );
  }, [shifts, notes]);

  // Role-based view modes: settings requires admin+, staff requires scheduler+
  const availableViewModes: ViewMode[] = useMemo(() => {
    const modes: ViewMode[] = ["schedule", "settings"];
    if (canEditSchedule) modes.push("staff");
    return modes;
  }, [canEditSchedule]);

  const employeesRef = useRef<Employee[]>([]);
  employeesRef.current = employees;

  useEffect(() => {
    async function load() {
      try {
        validateConfig();

        // Populate from cache immediately so the schedule renders without delay.
        // Fresh data loads in the background and updates state when ready.
        const cached = readScheduleCache();
        if (cached) {
          setOrganization(cached.org);
          setWings(cached.wings);
          setShiftTypes(cached.shiftTypes);
          setEmployees(cached.employees);
          setShifts(cached.shifts);
          setNotes(cached.notes ?? {});
          setLoading(false);
        }

        const org = await db.fetchUserOrg();
        if (!org) {
          setLoadError("No organization found. Check your database setup.");
          return;
        }

        const [w, st, emps, shiftData, noteRows, regShifts] = await Promise.all([
          db.fetchWings(org.id),
          db.fetchShiftTypes(org.id),
          db.fetchEmployees(org.id),
          db.fetchShifts(org.id, canEditSchedule),
          db.fetchScheduleNotes(org.id),
          db.fetchRegularShifts(org.id),
        ]);
        const noteMap: Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]> = {};
        for (const note of noteRows) {
          const key = note.wingName 
            ? `${note.empId}_${note.date}_${note.wingName}`
            : `${note.empId}_${note.date}`;
          if (!noteMap[key]) noteMap[key] = [];
          noteMap[key].push({ type: note.noteType, status: note.status });
        }
        setOrganization(org);
        setWings(w);
        setShiftTypes(st);
        setEmployees(emps);
        setShifts(shiftData);
        setNotes(noteMap);
        setRegularShifts(regShifts);
        writeScheduleCache({
          org,
          wings: w,
          shiftTypes: st,
          employees: emps,
          shifts: shiftData,
          notes: noteMap,
        });
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
    () => filterAndSortEmployees(employees, activeWing),
    [employees, activeWing],
  );

  const visibleScheduleEmployees = useMemo(() => {
    return filteredEmployees;
  }, [filteredEmployees]);

  const staffEmployees = useMemo(
    () =>
      employees
        .filter((e) => e.wings.length > 0)
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

  const noteTypesForKey = useCallback(
    (empId: string, date: Date, wingName?: string): NoteType[] => {
      const dateKey = formatDateKey(date);
      const key = wingName ? `${empId}_${dateKey}_${wingName}` : `${empId}_${dateKey}`;
      const noteList = notes[key] ?? [];
      // Only return notes that aren't marked as deleted in draft
      return noteList
        .filter(n => n.status !== 'draft_deleted')
        .map(n => n.type);
    },
    [notes],
  );

  const setShift = useCallback(
    (empId: string, date: Date, type: string) => {
      const orgId = organization?.id;
      if (!orgId) {
        console.error("Cannot modify shifts before organization is loaded");
        return;
      }

      const dateKey = formatDateKey(date);
      const key = `${empId}_${dateKey}`;
      if (type === "OFF") {
        setShifts((prev) => {
          const next = { ...prev };
          // If we are deleting a shift, it's now a draft deletion 
          next[key] = { label: "OFF", isDraft: true };
          return next;
        });
        db.deleteShift(empId, dateKey, orgId).catch(console.error);
      } else {
        setShifts((prev) => ({ ...prev, [key]: { label: type, isDraft: true } }));
        db.upsertShift(empId, dateKey, type, orgId).catch(console.error);
      }
    },
    [organization?.id],
  );

  const getShiftStyle = useCallback(
    (type: string): ShiftType =>
      shiftTypes.find((t) => t.label === type) ??
      ({
        id: 0,
        orgId: "",
        label: type,
        name: type,
        color: "#F8FAFC",
        border: "#CBD5E1",
        text: "#64748B",
        sortOrder: 999,
      } satisfies ShiftType),
    [shiftTypes],
  );

  // ── Event handlers ───────────────────────────────────────────────────────────

  const handleCellClick = useCallback(
    (emp: Employee, date: Date) => {
      setEditPanel({
        empId: emp.id,
        empName: emp.name,
        date,
        empWings: emp.wings,
        empDesignation: emp.designation,
      });
    },
    [canAddNotes],
  );

  const handleShiftSelect = useCallback(
    async (label: string, seriesScope?: SeriesScope) => {
      if (!editPanel) return;
      const key = `${editPanel.empId}_${formatDateKey(editPanel.date)}`;
      const currentMeta = shifts[key];

      if (seriesScope === 'all' && currentMeta?.seriesId) {
        // Bulk-update all shifts in the series
        try {
          await db.updateSeriesAllShifts(currentMeta.seriesId, label);
          const shiftData = await db.fetchShifts(organization!.id, canEditSchedule);
          setShifts(shiftData);
        } catch (err) {
          console.error(err);
        }
      } else {
        setShift(editPanel.empId, editPanel.date, label);
      }
      setEditPanel(null);
    },
    [editPanel, shifts, organization, canEditSchedule, setShift],
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
      if (!repeatModalState || !organization) return;
      try {
        await db.createShiftSeries(
          repeatModalState.empId,
          organization.id,
          repeatModalState.label,
          frequency,
          daysOfWeek,
          startDate,
          endDate,
          maxOccurrences,
        );
        const shiftData = await db.fetchShifts(organization.id, canEditSchedule);
        setShifts(shiftData);
      } catch (err) {
        console.error(err);
      } finally {
        setRepeatModalState(null);
        setEditPanel(null);
      }
    },
    [repeatModalState, organization, canEditSchedule],
  );

  const handleApplyRegular = useCallback(async () => {
    if (!organization) return;
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
      const freshRegularShifts = await db.fetchRegularShifts(organization.id);
      setRegularShifts(freshRegularShifts);

      const generated = await db.applyRegularSchedules(
        organization.id,
        startDate,
        endDate,
        freshRegularShifts,
        shifts,
      );

      if (generated.length > 0) {
        setShifts(prev => {
          const next = { ...prev };
          for (const { empId, date, label } of generated) {
            next[`${empId}_${date}`] = { label, isDraft: true, fromRegular: true };
          }
          return next;
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsApplyingRegular(false);
    }
  }, [organization, spanWeeks, monthStart, weekStart, regularShifts, shifts]);

  const handleNoteToggle = useCallback(
    async (noteType: NoteType, active: boolean, wingName: string) => {
      if (!organization || !editPanel) return;
      const dateKey = formatDateKey(editPanel.date);
      const key = `${editPanel.empId}_${dateKey}_${wingName}`;

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
            organization.id,
            editPanel.empId,
            dateKey,
            noteType,
            wingName,
            existingStatus
          );
        } else {
          await db.deleteScheduleNote(
            editPanel.empId, 
            dateKey, 
            noteType, 
            wingName,
            existingStatus
          );
        }
      } catch (error) {
        console.error(error);
      }
    },
    [editPanel, organization],
  );

  useEffect(() => {
    if (!availableViewModes.includes(viewMode)) {
      setViewMode("schedule");
    }
  }, [availableViewModes, viewMode]);

  const handleAddEmployee = useCallback(
    async (dataList: Omit<Employee, "id" | "seniority">[]) => {
      if (!organization) return;
      const added: Employee[] = [];
      for (const data of dataList) {
        const maxSen = Math.max(
          ...employeesRef.current.map((e) => e.seniority),
          ...added.map((e) => e.seniority),
          0,
        );
        const newEmp = await db.insertEmployee(
          { ...data, seniority: maxSen + 1 },
          organization.id,
        );
        added.push(newEmp);
      }
      setEmployees((prev) => [...prev, ...added]);
      setShowAddModal(false);
    },
    [organization],
  );

  const handleSaveEmployee = useCallback(
    (emp: Employee) => {
      if (!organization) return;
      setEmployees((prev) => prev.map((e) => (e.id === emp.id ? emp : e)));
      db.updateEmployee(emp, organization.id).catch(console.error);
    },
    [organization],
  );

  const handleDeleteEmployee = useCallback((empId: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== empId));
    db.deleteEmployee(empId).catch(console.error);
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
    if (!organization) return;
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

      await db.publishSchedule(organization.id, startDate, endDate);

      const [shiftData, noteRows] = await Promise.all([
        db.fetchShifts(organization.id, canEditSchedule),
        db.fetchScheduleNotes(organization.id),
      ]);
      const noteMap: Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]> = {};
      for (const note of noteRows) {
        const key = note.wingName 
          ? `${note.empId}_${note.date}_${note.wingName}`
          : `${note.empId}_${note.date}`;
        if (!noteMap[key]) noteMap[key] = [];
        noteMap[key].push({ type: note.noteType, status: note.status });
      }
      const cached = readScheduleCache();
      if (cached) {
        writeScheduleCache({
          ...cached,
          shifts: shiftData,
          notes: noteMap,
        });
      }
      setIsEditMode(false);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsPublishing(false);
    }
  }, [organization, weekStart, monthStart, spanWeeks, canEditSchedule, setIsPublishing]);

  const handleCancelChanges = useCallback(async () => {
    if (!organization) return;
    // No drafts — just exit edit mode without hitting the DB
    if (!hasUnpublishedChanges) {
      setIsEditMode(false);
      return;
    }
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

      await db.discardScheduleDrafts(organization.id, startDate, endDate);

      const [shiftData, noteRows] = await Promise.all([
        db.fetchShifts(organization.id, canEditSchedule),
        db.fetchScheduleNotes(organization.id),
      ]);
      const noteMap: Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]> = {};
      for (const note of noteRows) {
        const key = note.wingName 
          ? `${note.empId}_${note.date}_${note.wingName}`
          : `${note.empId}_${note.date}`;
        if (!noteMap[key]) noteMap[key] = [];
        noteMap[key].push({ type: note.noteType, status: note.status });
      }
      setShifts(shiftData);
      setNotes(noteMap);

      const cached = readScheduleCache();
      if (cached) {
        writeScheduleCache({
          ...cached,
          shifts: shiftData,
          notes: noteMap,
        });
      }
      setIsEditMode(false);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsCanceling(false);
    }
  }, [organization, weekStart, monthStart, spanWeeks, canEditSchedule, setIsCanceling]);

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

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          color: "var(--color-text-subtle)",
          fontSize: 14,
        }}
      >
        Loading schedule…
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
          orgName={organization?.name}
          availableViewModes={availableViewModes}
        />
        {isEditMode && canEditSchedule && viewMode === "schedule" && (
          <DraftBanner
            onPublish={handlePublish}
            onCancel={handleCancelChanges}
            isPublishing={isPublishing}
            isCanceling={isCanceling}
            hasChanges={hasUnpublishedChanges}
          />
        )}
        {viewMode !== "settings" && (
          <div style={{ padding: "12px 16px 0", borderBottom: "1px solid var(--color-border)" }}>
            {viewMode === "schedule" && (
              <Toolbar
                viewMode={viewMode}
                weekStart={weekStart}
                spanWeeks={spanWeeks}
                activeWing={activeWing}
                staffSearch={staffSearch}
                wings={wings}
                onPrev={handlePrev}
                onNext={handleNext}
                onToday={handleToday}
                onSpanChange={setSpanWeeks}
                onWingChange={setActiveWing}
                onStaffSearchChange={setStaffSearch}
                canEditSchedule={canEditSchedule}
                isEditMode={isEditMode}
                onToggleEditMode={() => setIsEditMode((v) => !v)}
                onApplyRegular={handleApplyRegular}
                isApplyingRegular={isApplyingRegular}
                onPrintOpen={() => setShowPrintOptions(true)}
              />
            )}
            {viewMode === "staff" && <div ref={staffToolbarRef} style={{ paddingBottom: 12 }} />}
          </div>
        )}
      </div>

      {viewMode !== "settings" && <div style={{ padding: "16px 16px" }}>

        {viewMode === "schedule" && spanWeeks !== "month" && (
          <div style={{ marginRight: 276 }}>
            <ScheduleGrid
              filteredEmployees={visibleScheduleEmployees}
              allEmployees={employees}
              week1={week1}
              week2={week2}
              spanWeeks={spanWeeks}
              shiftForKey={shiftForKey}
              getShiftStyle={getShiftStyle}
              handleCellClick={handleCellClick}
              today={today}
              highlightEmpIds={highlightEmpIds}
              wings={wings}
              shiftTypes={shiftTypes}
              isCellInteractive={isEditMode && canAddNotes}
              noteTypesForKey={noteTypesForKey}
              activeWing={activeWing}
              isEditMode={isEditMode}
            />
          </div>
        )}
        {viewMode === "schedule" && spanWeeks !== "month" && (
          <ShiftKeyPanel shiftTypes={shiftTypes} />
        )}

        {viewMode === "schedule" && spanWeeks === "month" && (
          <MonthView
            monthStart={monthStart}
            filteredEmployees={visibleScheduleEmployees}
            shiftForKey={shiftForKey}
            getShiftStyle={getShiftStyle}
            today={today}
            wings={wings}
            activeWing={activeWing}
          />
        )}

        {viewMode === "staff" && (
          <StaffView
            employees={staffEmployees}
            wings={wings}
            skillLevels={organization?.skillLevels ?? []}
            roles={organization?.roles ?? []}
            onSave={handleSaveEmployee}
            onDelete={handleDeleteEmployee}
            onAdd={() => setShowAddModal(true)}
            activeWing={activeWing}
            onRegularSchedule={canEditSchedule ? setRegularScheduleEmp : undefined}
            toolbarSlot={staffToolbarRef}
          />
        )}
      </div>}

      {viewMode === "settings" && organization && (
        <SettingsPage
          organization={organization}
          wings={wings}
          shiftTypes={shiftTypes}
          onOrgSave={setOrganization}
          onWingsChange={setWings}
          onShiftTypesChange={setShiftTypes}
          canManageOrg={canManageOrg}
        />
      )}

      {editPanel && (
        <ShiftEditPanel
          modal={editPanel}
          currentShift={shiftForKey(editPanel.empId, editPanel.date)}
          shiftTypes={shiftTypes}
          onSelect={handleShiftSelect}
          allowShiftEdits={canEditSchedule}
          canEditNotes={canAddNotes}
          getNoteTypes={(wingName) => noteTypesForKey(editPanel.empId, editPanel.date, wingName)}
          onNoteToggle={handleNoteToggle}
          onClose={() => setEditPanel(null)}
          seriesId={shifts[`${editPanel.empId}_${formatDateKey(editPanel.date)}`]?.seriesId}
          onMakeRepeating={canEditSchedule ? handleMakeRepeating : undefined}
        />
      )}

      {regularScheduleEmp && organization && (
        <RegularSchedulePanel
          employee={regularScheduleEmp}
          orgId={organization.id}
          shiftTypes={shiftTypes}
          onClose={() => setRegularScheduleEmp(null)}
        />
      )}

      {repeatModalState && (
        <RepeatModal
          empName={repeatModalState.empName}
          shiftLabel={repeatModalState.label}
          startDate={repeatModalState.date}
          shiftTypes={shiftTypes}
          onConfirm={handleRepeatConfirm}
          onClose={() => setRepeatModalState(null)}
        />
      )}

      {showAddModal && (
        <AddEmployeeModal
          wings={wings}
          skillLevels={organization?.skillLevels ?? []}
          roles={organization?.roles ?? []}
          onAdd={handleAddEmployee}
          onClose={() => setShowAddModal(false)}
        />
      )}

      <PrintLegend shiftTypes={shiftTypes} />

      {showPrintOptions && (
        <PrintOptionsModal
          wings={wings}
          currentSpanWeeks={spanWeeks}
          onPrint={(config) => {
            setShowPrintOptions(false);
            setActivePrintConfig(config);
          }}
          onClose={() => setShowPrintOptions(false)}
        />
      )}

      {activePrintConfig && (
        <PrintScheduleView
          orgName={organization?.name}
          weekStart={spanWeeks === "month" ? monthStart : weekStart}
          config={activePrintConfig}
          employees={employees}
          allEmployees={employees}
          wings={wings}
          shiftTypes={shiftTypes}
          shiftForKey={shiftForKey}
          getShiftStyle={getShiftStyle}
          onClose={() => setActivePrintConfig(null)}
        />
      )}
    </div>
  );
}

export default function SchedulerPage() {
  return <SchedulerContent />;
}
