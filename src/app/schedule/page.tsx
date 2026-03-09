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
import ShiftKeyPanel from "@/components/ShiftKeyPanel";
import DraftBanner from "@/components/DraftBanner";
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
        }

        const org = await db.fetchUserOrg();
        if (!org) {
          setLoadError("No organization found. Check your database setup.");
          return;
        }

        const [w, st, emps, shiftData, noteRows] = await Promise.all([
          db.fetchWings(org.id),
          db.fetchShiftTypes(org.id),
          db.fetchEmployees(org.id),
          db.fetchShifts(org.id, canEditSchedule),
          db.fetchScheduleNotes(org.id),
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
    (label: string) => {
      if (!editPanel) return;
      setShift(editPanel.empId, editPanel.date, label);
      setEditPanel(null);
    },
    [canEditSchedule, editPanel, setShift],
  );

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
      <div className="no-print">
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
      </div>

      {viewMode !== "settings" && <div style={{ padding: "16px 16px" }}>
        <div className="no-print">
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
          />
        </div>

        {viewMode === "schedule" && spanWeeks !== "month" && (
          <div style={{ display: "flex", alignItems: "stretch", gap: 16, width: "100%" }}>
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
            <div className="no-print" style={{ flex: 1, display: "flex" }}>
              <ShiftKeyPanel shiftTypes={shiftTypes} />
            </div>
          </div>
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
    </div>
  );
}

export default function SchedulerPage() {
  return <SchedulerContent />;
}
