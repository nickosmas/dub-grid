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
import { validateConfig } from "@/lib/supabase";
import {
  Employee,
  EditModalState,
  ShiftMap,
  ShiftType,
  Organization,
  Wing,
} from "@/types";

import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/RouteGuards";

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
  const router = useRouter();
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
  const [editPanel, setEditPanel] = useState<EditModalState | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("schedule");
  const [spanWeeks, setSpanWeeks] = useState<1 | 2 | "month">(2);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState("");

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
          setLoading(false);
        }

        const org = await db.fetchUserOrg();
        if (!org) {
          router.replace("/onboarding");
          return;
        }

        const [w, st, emps, shiftData] = await Promise.all([
          db.fetchWings(org.id),
          db.fetchShiftTypes(org.id),
          db.fetchEmployees(org.id),
          db.fetchShifts(org.id),
        ]);
        setOrganization(org);
        setWings(w);
        setShiftTypes(st);
        setEmployees(emps);
        setShifts(shiftData);
        writeScheduleCache({
          org,
          wings: w,
          shiftTypes: st,
          employees: emps,
          shifts: shiftData,
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
    (empId: number, date: Date): string | null =>
      shifts[`${empId}_${formatDateKey(date)}`] ?? null,
    [shifts],
  );

  const setShift = useCallback((empId: number, date: Date, type: string) => {
    const dateKey = formatDateKey(date);
    const key = `${empId}_${dateKey}`;
    if (type === "OFF") {
      setShifts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      db.deleteShift(empId, dateKey).catch(console.error);
    } else {
      setShifts((prev) => ({ ...prev, [key]: type }));
      db.upsertShift(empId, dateKey, type).catch(console.error);
    }
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

  const handleCellClick = useCallback((emp: Employee, date: Date) => {
    setEditPanel({
      empId: emp.id,
      empName: emp.name,
      date,
      empWings: emp.wings,
    });
  }, []);

  const handleShiftSelect = useCallback(
    (label: string) => {
      if (!editPanel) return;
      setShift(editPanel.empId, editPanel.date, label);
      setEditPanel(null);
    },
    [editPanel, setShift],
  );

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

  const handleDeleteEmployee = useCallback((empId: number) => {
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
      <div className="no-print">
        <Header
          viewMode={viewMode}
          onViewChange={setViewMode}
          orgName={organization?.name}
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
          />
        </div>

        {viewMode === "schedule" && spanWeeks !== "month" && (
          <ScheduleGrid
            filteredEmployees={filteredEmployees}
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
          />
        )}

        {viewMode === "schedule" && spanWeeks === "month" && (
          <MonthView
            monthStart={monthStart}
            filteredEmployees={filteredEmployees}
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
          />
        )}
      </div>

      {editPanel && (
        <ShiftEditPanel
          modal={editPanel}
          currentShift={shiftForKey(editPanel.empId, editPanel.date)}
          shiftTypes={shiftTypes}
          onSelect={handleShiftSelect}
          onClose={() => setEditPanel(null)}
        />
      )}

      {showAddModal && (
        <AddEmployeeModal
          wings={wings}
          onAdd={handleAddEmployee}
          onClose={() => setShowAddModal(false)}
        />
      )}

      <PrintLegend shiftTypes={shiftTypes} />
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
