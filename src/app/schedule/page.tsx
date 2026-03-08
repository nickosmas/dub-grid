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
import { addDays, formatDateKey, getWeekStart } from "@/lib/utils";
import { filterAndSortEmployees } from "@/lib/schedule-logic";
import * as db from "@/lib/db";
import { validateConfig, supabase } from "@/lib/supabase";
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
  notes: Record<string, NoteType[]>;
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
  const { isLoading: permissionsLoading, canEditSchedule, canAddNotes, canManageOrg } = usePermissions();
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
  const [notes, setNotes] = useState<Record<string, NoteType[]>>({});
  const [editPanel, setEditPanel] = useState<EditModalState | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("schedule");
  const [spanWeeks, setSpanWeeks] = useState<1 | 2 | "month">(2);
  const [loading, setLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [hasDrafts, setHasDrafts] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState("");

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

        const [w, st, emps, shiftData, noteRows] = await Promise.all([
          db.fetchWings(org.id),
          db.fetchShiftTypes(org.id),
          db.fetchEmployees(org.id),
          db.fetchShifts(org.id, canEditSchedule), // Schedulers see drafts
          db.fetchScheduleNotes(org.id),
        ]);
        const noteMap: Record<string, NoteType[]> = {};
        for (const note of noteRows) {
          const key = `${note.empId}_${note.date}`;
          if (!noteMap[key]) noteMap[key] = [];
          noteMap[key].push(note.noteType);
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
        setLoadError(
          err instanceof Error ? err.message : "Failed to load data",
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [canEditSchedule]);

  // ── Realtime subscriptions ────────────────────────────────────────────────────
  // Subscribe to DB changes so all open tabs/devices stay in sync automatically.

  const orgIdRef = useRef<string | null>(null);
  orgIdRef.current = organization?.id ?? null;

  const canEditRef = useRef(false);
  canEditRef.current = canEditSchedule;

  useEffect(() => {
    const channel = supabase
      .channel("schedule-realtime")

      // ── Shifts ──────────────────────────────────────────────────────────────
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, (payload: any) => {
        const orgId = orgIdRef.current;
        if (!orgId) return;

        const isScheduler = canEditRef.current;

        if (payload.eventType === "DELETE") {
          const old = payload.old as { emp_id: string; date: string };
          const key = `${old.emp_id}_${old.date}`;
          setShifts((prev) => { const next = { ...prev }; delete next[key]; return next; });
          return;
        }

        const row = payload.new as { emp_id: string; date: string; draft_label: string | null; published_label: string | null; org_id: string | null };
        if (row.org_id !== orgId) return;

        const effectiveLabel = isScheduler
          ? (row.draft_label ?? row.published_label)
          : row.published_label;

        const key = `${row.emp_id}_${row.date}`;
        if (effectiveLabel && effectiveLabel !== "OFF") {
          setShifts((prev) => ({ ...prev, [key]: effectiveLabel }));
        } else {
          setShifts((prev) => { const next = { ...prev }; delete next[key]; return next; });
        }
      })

      // ── Schedule Notes ───────────────────────────────────────────────────────
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_notes" }, (payload: any) => {
        const orgId = orgIdRef.current;
        if (!orgId) return;

        if (payload.eventType === "DELETE") {
          const old = payload.old as { emp_id: string; date: string; note_type: NoteType };
          const key = `${old.emp_id}_${old.date}`;
          setNotes((prev) => ({
            ...prev,
            [key]: (prev[key] ?? []).filter((t) => t !== old.note_type),
          }));
          return;
        }

        const row = payload.new as { emp_id: string; date: string; note_type: NoteType; org_id: string };
        if (row.org_id !== orgId) return;
        const key = `${row.emp_id}_${row.date}`;
        setNotes((prev) => ({
          ...prev,
          [key]: [...new Set([...(prev[key] ?? []), row.note_type])],
        }));
      })

      // ── Employees ────────────────────────────────────────────────────────────
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, (payload: any) => {
        const orgId = orgIdRef.current;
        if (!orgId) return;

        if (payload.eventType === "DELETE") {
          const old = payload.old as { id: string };
          setEmployees((prev) => prev.filter((e) => e.id !== old.id));
          return;
        }

        const row = payload.new as db.DbEmployee;
        if (row.org_id !== orgId) return;
        const emp = db.rowToEmployee(row);
        setEmployees((prev) => {
          const idx = prev.findIndex((e) => e.id === emp.id);
          return idx >= 0 ? prev.map((e) => (e.id === emp.id ? emp : e)) : [...prev, emp];
        });
      })

      // ── Wings ────────────────────────────────────────────────────────────────
      .on("postgres_changes", { event: "*", schema: "public", table: "wings" }, (payload: any) => {
        const orgId = orgIdRef.current;
        if (!orgId) return;

        if (payload.eventType === "DELETE") {
          const old = payload.old as { id: number };
          setWings((prev) => prev.filter((w) => w.id !== old.id));
          return;
        }

        const row = payload.new as db.DbWing;
        if (row.org_id !== orgId) return;
        const wing = db.rowToWing(row);
        setWings((prev) => {
          const idx = prev.findIndex((w) => w.id === wing.id);
          return idx >= 0 ? prev.map((w) => (w.id === wing.id ? wing : w)) : [...prev, wing];
        });
      })

      // ── Shift Types ──────────────────────────────────────────────────────────
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_types" }, (payload: any) => {
        const orgId = orgIdRef.current;
        if (!orgId) return;

        if (payload.eventType === "DELETE") {
          const old = payload.old as { id: number };
          setShiftTypes((prev) => prev.filter((st) => st.id !== old.id));
          return;
        }

        const row = payload.new as db.DbShiftType;
        if (row.org_id !== orgId) return;
        const st = db.rowToShiftType(row);
        setShiftTypes((prev) => {
          const idx = prev.findIndex((s) => s.id === st.id);
          return idx >= 0 ? prev.map((s) => (s.id === st.id ? st : s)) : [...prev, st];
        });
      })

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Runs once; refs keep closures fresh.


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
      shifts[`${empId}_${formatDateKey(date)}`] ?? null,
    [shifts],
  );

  const noteTypesForKey = useCallback(
    (empId: string, date: Date): NoteType[] =>
      notes[`${empId}_${formatDateKey(date)}`] ?? [],
    [notes],
  );

  const organizationRef = useRef<Organization | null>(null);
  organizationRef.current = organization;

  const setShift = useCallback((empId: string, date: Date, type: string) => {
    const dateKey = formatDateKey(date);
    const key = `${empId}_${dateKey}`;
    const orgId = organizationRef.current?.id;
    if (!orgId) return;
    if (type === "OFF") {
      setShifts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      db.deleteShift(empId, dateKey, orgId).catch(console.error); // Saves draft as 'OFF'
    } else {
      setShifts((prev) => ({ ...prev, [key]: type }));
      db.upsertShift(empId, dateKey, type, orgId).catch(console.error); // Saves draft_label
    }
    setHasDrafts(true);
  }, []);

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
    async (noteType: NoteType, active: boolean) => {
      if (!organization || !editPanel) return;
      const dateKey = formatDateKey(editPanel.date);
      const key = `${editPanel.empId}_${dateKey}`;

      setNotes((prev) => {
        const existing = prev[key] ?? [];
        const updated = active
          ? [...new Set([...existing, noteType])]
          : existing.filter((t) => t !== noteType);
        return { ...prev, [key]: updated };
      });

      try {
        if (active) {
          await db.upsertScheduleNote(organization.id, editPanel.empId, dateKey, noteType);
        } else {
          await db.deleteScheduleNote(editPanel.empId, dateKey, noteType);
        }
        setHasDrafts(true);
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
    async (data: Omit<Employee, "id" | "seniority">) => {
      if (!organization) return;
      const maxSen = Math.max(
        ...employeesRef.current.map((e) => e.seniority),
        0,
      );
      const newEmp = await db.insertEmployee(
        { ...data, seniority: maxSen + 1 },
        organization.id,
      );
      setEmployees((prev) => [...prev, newEmp]);
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
      // Calculate current view's date range
      const startDate = spanWeeks === "month" ? monthStart : weekStart;
      let endDate: Date;
      if (spanWeeks === "month") {
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      } else {
        endDate = addDays(startDate, spanWeeks * 7 - 1);
      }

      await db.publishSchedule(organization.id, startDate, endDate);
      
      // We can also re-fetch shifts from the current view optionally, 
      // but if the user is an admin they're already seeing effective state.
      // However, making a refetch is safe to verify.
      const updatedShifts = await db.fetchShifts(organization.id, canEditSchedule);
      setShifts(updatedShifts);
      setHasDrafts(false);
      alert(`Schedule published for ${formatDateKey(startDate)} to ${formatDateKey(endDate)}`);
    } catch (err) {
      console.error(err);
      alert("Failed to publish schedule. Please check permissions or try again.");
    } finally {
      setIsPublishing(false);
    }
  }, [organization, spanWeeks, monthStart, weekStart, canEditSchedule]);

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

  // If permissions are still loading, don't show the skeleton grid since it might
  // briefly initialize with the wrong fallback viewModes (like 'schedule' only)
  // which causes the tabs to jump.
  if (loading || permissionsLoading) {
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
      </div>

      <div style={{ padding: "16px 16px" }}>
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
            onPublish={hasDrafts ? handlePublish : undefined}
            isPublishing={isPublishing}
          />
        </div>

        {viewMode === "schedule" && spanWeeks !== "month" && (
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
            isCellInteractive={canAddNotes}
            noteTypesForKey={noteTypesForKey}
            activeWing={activeWing}
          />
        )}

        {viewMode === "schedule" && spanWeeks === "month" && (
          <MonthView
            monthStart={monthStart}
            filteredEmployees={visibleScheduleEmployees}
            shiftForKey={shiftForKey}
            getShiftStyle={getShiftStyle}
            today={today}
            wings={wings}
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
          />
        )}

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
      </div>

      {editPanel && (
        <ShiftEditPanel
          modal={editPanel}
          currentShift={shiftForKey(editPanel.empId, editPanel.date)}
          shiftTypes={shiftTypes}
          onSelect={handleShiftSelect}
          allowShiftEdits={canEditSchedule}
          canEditNotes={canAddNotes}
          noteTypes={noteTypesForKey(editPanel.empId, editPanel.date)}
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
