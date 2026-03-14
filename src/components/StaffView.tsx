"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { getInitials, getCertAbbr, getRoleAbbrs } from "@/lib/utils";
import { borderColor } from "@/lib/colors";
import { Employee, FocusArea, ShiftCode, RegularShift, NamedItem } from "@/types";
import InlineEditEmployee from "@/components/EditEmployeePanel";
import * as db from "@/lib/db";
import { DayPicker } from "@/components/RegularSchedulePanel";
import { toast } from "sonner";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type StaffSection = "members" | "regular-schedule" | "focus-areas" | "certifications" | "roles";

interface StaffViewProps {
  employees: Employee[];
  benchedEmployees?: Employee[];
  terminatedEmployees?: Employee[];
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  onSave: (emp: Employee) => void;
  onDelete: (empId: string) => void;
  onBench: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onAdd: () => void;
  onRegularSchedule?: (emp: Employee) => void;
  orgId?: string;
  shiftCodes?: ShiftCode[];
  /** Full code map (including archived) for resolving historical labels. */
  shiftCodeMap?: Map<number, string>;
  canEditShifts?: boolean;
  focusAreaLabel?: string;
  certificationLabel?: string;
  roleLabel?: string;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Sidebar link (mirrors SettingsPage) ───────────────────────────────────────
function SidebarLink({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 12px",
        background: active
          ? "var(--color-surface-overlay)"
          : hovered
          ? "var(--color-border-light)"
          : "transparent",
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active
          ? "var(--color-text-primary)"
          : hovered
          ? "var(--color-text-primary)"
          : "var(--color-text-secondary)",
        textAlign: "left",
        fontFamily: "inherit",
        transition: "background 120ms ease, color 120ms ease",
        position: "relative",
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: "20%",
            height: "60%",
            width: 3,
            borderRadius: 2,
            background: "var(--color-accent-gradient)",
          }}
        />
      )}
      <span
        style={{
          color: active
            ? "var(--color-text-secondary)"
            : "var(--color-text-muted)",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

// ── Employee avatar chip (used in Focus Areas & Roles sections) ───────────────
function EmpChip({ emp }: { emp: Employee }) {
  const hue = hashCode(emp.id) % 360;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "var(--color-border-light)",
        borderRadius: 20,
        padding: "4px 10px 4px 4px",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: `hsl(${hue}, 55%, 88%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 700,
          color: `hsl(${hue}, 55%, 35%)`,
          flexShrink: 0,
        }}
      >
        {getInitials(emp.name)}
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          whiteSpace: "nowrap",
        }}
      >
        {emp.name}
      </span>
    </div>
  );
}

// ── Members section (the existing staff table) ────────────────────────────────
type EmployeeTab = "active" | "benched" | "terminated";

function MembersSection({
  employees,
  benchedEmployees,
  terminatedEmployees,
  focusAreas,
  certifications,
  roles,
  onSave,
  onDelete,
  onBench,
  onActivate,
  onAdd,
  focusAreaLabel,
  certificationLabel,
  roleLabel,
}: {
  employees: Employee[];
  benchedEmployees: Employee[];
  terminatedEmployees: Employee[];
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  onSave: (emp: Employee) => void;
  onDelete: (empId: string) => void;
  onBench: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onAdd: () => void;
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
}) {
  const [activeTab, setActiveTab] = useState<EmployeeTab>("active");
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "seniority" | "focusArea">("seniority");
  const [isReordering, setIsReordering] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<Employee[] | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const currentList = activeTab === "active" ? employees : activeTab === "benched" ? benchedEmployees : terminatedEmployees;

  const sorted = useMemo(
    () =>
      [...currentList].sort((a, b) => {
        switch (sortBy) {
          case "name":
            return a.name.localeCompare(b.name);
          case "focusArea": {
            const faA = focusAreas.find(f => f.id === a.focusAreaIds[0])?.name ?? "";
            const faB = focusAreas.find(f => f.id === b.focusAreaIds[0])?.name ?? "";
            return faA !== faB ? faA.localeCompare(faB) : a.seniority - b.seniority;
          }
          default:
            return a.seniority - b.seniority;
        }
      }),
    [currentList, sortBy, focusAreas],
  );

  const baseList = isReordering && pendingOrder !== null ? pendingOrder : sorted;

  const displayList = useMemo(() => {
    if (!isReordering || draggedIdx === null || dragOverIdx === null) return baseList;
    const list = [...baseList];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    return list;
  }, [baseList, draggedIdx, dragOverIdx, isReordering]);

  const handleEnterReorder = useCallback(() => {
    setIsReordering(true);
    setPendingOrder([...sorted]);
    setExpandedEmpId(null);
  }, [sorted]);

  const handleSaveOrder = useCallback(() => {
    if (!pendingOrder) return;
    pendingOrder.forEach((emp, i) => {
      if (emp.seniority !== i + 1) {
        onSave({ ...emp, seniority: i + 1 });
      }
    });
    setIsReordering(false);
    setPendingOrder(null);
  }, [pendingOrder, onSave]);

  const handleCancelReorder = useCallback(() => {
    setIsReordering(false);
    setPendingOrder(null);
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, []);

  const handleDragStart = useCallback((idx: number) => {
    setDraggedIdx(idx);
    setDragOverIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback(() => {
    if (draggedIdx === null || dragOverIdx === null || !pendingOrder) return;
    const list = [...pendingOrder];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    setPendingOrder(list);
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, [draggedIdx, dragOverIdx, pendingOrder]);

  const handleDragEnd = useCallback(() => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, []);

  const handleSave = useCallback(
    (emp: Employee) => {
      onSave(emp);
      setExpandedEmpId(null);
    },
    [onSave],
  );

  const handleDelete = useCallback(
    (empId: string) => {
      onDelete(empId);
      setExpandedEmpId(null);
    },
    [onDelete],
  );

  const isDirty = useMemo(() => {
    if (!isReordering || !pendingOrder) return false;
    return pendingOrder.some((emp, i) => emp.id !== sorted[i]?.id);
  }, [isReordering, pendingOrder, sorted]);

  const gridCols = isReordering
    ? "36px 40px 1fr 220px 120px 160px"
    : "48px 1fr 220px 120px 160px 28px";

  const tabItems: { key: EmployeeTab; label: string; count: number; color: string }[] = [
    { key: "active", label: "Active", count: employees.length, color: "#059669" },
    { key: "benched", label: "Benched", count: benchedEmployees.length, color: "#D97706" },
    { key: "terminated", label: "Terminated", count: terminatedEmployees.length, color: "#DC2626" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--color-border)" }}>
        {tabItems.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setExpandedEmpId(null); if (isReordering) handleCancelReorder(); }}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? tab.color : "var(--color-text-muted)",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: -1,
                transition: "color 120ms ease, border-color 120ms ease",
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: isActive ? `${tab.color}15` : "var(--color-border-light)",
                  color: isActive ? tab.color : "var(--color-text-faint)",
                  borderRadius: 10,
                  padding: "1px 7px",
                  minWidth: 20,
                  textAlign: "center",
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isReordering && activeTab === "active" && (
            <button
              onClick={onAdd}
              className="dg-btn dg-btn-primary"
              style={{ padding: "8px 16px" }}
            >
              + Add Staff Members
            </button>
          )}
          {activeTab === "active" && sortBy === "seniority" && (
            <button
              onClick={isReordering ? undefined : handleEnterReorder}
              className={`dg-btn${isReordering ? " active" : ""}`}
              style={{ padding: "7px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="7 15 12 20 17 15" />
                <polyline points="7 9 12 4 17 9" />
              </svg>
              Edit order
            </button>
          )}
          {isReordering && isDirty && (
            <button onClick={handleSaveOrder} className="dg-btn dg-btn-primary" style={{ padding: "7px 14px" }}>
              Save
            </button>
          )}
          {isReordering && (
            <button onClick={handleCancelReorder} className="dg-btn" style={{ padding: "7px 14px" }}>
              Cancel
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--color-text-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Sort by
          </label>
          <div className="dg-segment">
            {(["seniority", "name", "focusArea"] as const).map((option) => (
              <button
                key={option}
                onClick={() => { setSortBy(option); if (isReordering) handleCancelReorder(); }}
                className={`dg-segment-btn${sortBy === option ? " active" : ""}`}
                style={{ fontSize: 12 }}
              >
                {option === "seniority" ? "Seniority" : option === "name" ? "Name" : focusAreaLabel}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: isReordering ? "1.5px solid #2563EB" : "1px solid var(--color-border)",
          overflow: "hidden",
          boxShadow: isReordering ? "0 0 0 3px rgba(37,99,235,0.1)" : "0 1px 4px rgba(0,0,0,0.04)",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            padding: "10px 20px",
            borderBottom: "1px solid var(--color-border-light)",
            background: isReordering ? "#EFF6FF" : undefined,
          }}
        >
          {(isReordering
            ? ["", "#", "Name", `Assigned ${focusAreaLabel}`, certificationLabel, "Roles"]
            : ["#", "Name", `Assigned ${focusAreaLabel}`, certificationLabel, "Roles", ""]
          ).map((h, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-text-subtle)",
                letterSpacing: "0.06em",
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Employee rows */}
        {displayList.map((emp, i) => {
          const isExpanded = !isReordering && emp.id === expandedEmpId;
          const isDragging = isReordering && draggedIdx !== null && baseList[draggedIdx]?.id === emp.id;
          const isDropTarget = isReordering && dragOverIdx === i && draggedIdx !== null && draggedIdx !== i;
          return (
            <div key={emp.id}>
              <div
                draggable={isReordering}
                onDragStart={isReordering ? () => handleDragStart(i) : undefined}
                onDragOver={isReordering ? (e) => handleDragOver(e, i) : undefined}
                onDrop={isReordering ? handleDrop : undefined}
                onDragEnd={isReordering ? handleDragEnd : undefined}
                onClick={!isReordering ? () => setExpandedEmpId(isExpanded ? null : emp.id) : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  padding: "12px 20px",
                  borderTop: isDropTarget
                    ? "2px solid #2563EB"
                    : i === 0
                      ? "none"
                      : "1px solid var(--color-border-light)",
                  alignItems: "center",
                  background: isExpanded
                    ? "#EFF6FF"
                    : "#fff",
                  cursor: isReordering ? "grab" : "pointer",
                  transition: "background 0.15s, opacity 0.15s",
                  opacity: isDragging ? 0.4 : 1,
                  borderLeft: isExpanded ? "4px solid #2563EB" : "4px solid transparent",
                  paddingLeft: "calc(20px - 4px)",
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded && !isReordering)
                    e.currentTarget.style.background = "var(--color-row-hover, rgba(0,0,0,0.02))";
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded && !isReordering)
                    e.currentTarget.style.background = "#fff";
                }}
              >
                {isReordering && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-faint)" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <rect x="3" y="2" width="2" height="2" rx="1"/>
                      <rect x="9" y="2" width="2" height="2" rx="1"/>
                      <rect x="3" y="6" width="2" height="2" rx="1"/>
                      <rect x="9" y="6" width="2" height="2" rx="1"/>
                      <rect x="3" y="10" width="2" height="2" rx="1"/>
                      <rect x="9" y="10" width="2" height="2" rx="1"/>
                    </svg>
                  </div>
                )}

                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-faint)" }}>
                  {i + 1}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: `hsl(${hashCode(emp.id) % 360}, 55%, 88%)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: `hsl(${hashCode(emp.id) % 360}, 55%, 35%)`,
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(emp.name)}
                  </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--color-text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {emp.name}
                    </div>
                    {(emp.email || emp.phone) && (
                      <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 1 }}>
                        {emp.email || emp.phone}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {emp.focusAreaIds.map((faId) => {
                    const fa = focusAreas.find(f => f.id === faId);
                    if (!fa) return null;
                    const fc = { bg: fa.colorBg, text: fa.colorText };
                    return (
                      <span
                        key={faId}
                        style={{
                          background: fc.bg,
                          color: fc.text,
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 20,
                          padding: "2px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fa.name}
                      </span>
                    );
                  })}
                </div>

                <div>
                  <span
                    style={{
                      background: "var(--color-border-light)",
                      color: "var(--color-text-muted)",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 20,
                      padding: "3px 9px",
                    }}
                  >
                    {getCertAbbr(emp.certificationId, certifications)}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {emp.roleIds.length > 0 ? getRoleAbbrs(emp.roleIds, roles).join(", ") : "—"}
                </div>

                {!isReordering && (
                  <div
                    style={{
                      color: "var(--color-text-faint)",
                      fontSize: 16,
                      lineHeight: 1,
                      transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "transform 0.15s",
                      userSelect: "none",
                    }}
                  >
                    ▾
                  </div>
                )}
              </div>

              {isExpanded && (
                <div
                  style={{
                    borderTop: "1px solid var(--color-border-light)",
                    borderLeft: "4px solid #2563EB",
                    background: "#FAFBFF",
                  }}
                >
                  <InlineEditEmployee
                    employee={emp}
                    focusAreas={focusAreas}
                    certifications={certifications}
                    roles={roles}
                    roleLabel={roleLabel}
                    focusAreaLabel={focusAreaLabel}
                    certificationLabel={certificationLabel}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onBench={(empId, note) => { onBench(empId, note); setExpandedEmpId(null); }}
                    onActivate={(empId) => { onActivate(empId); setExpandedEmpId(null); }}
                    onCancel={() => setExpandedEmpId(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state for non-active tabs */}
      {currentList.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "40px 20px",
          color: "var(--color-text-faint)",
          fontSize: 13,
        }}>
          {activeTab === "active" ? "No active employees" : activeTab === "benched" ? "No benched employees" : "No terminated employees"}
        </div>
      )}
    </div>
  );
}

// ── Regular Schedule section ──────────────────────────────────────────────────
function RegularScheduleSection({
  employees,
  orgId,
  shiftCodes,
  shiftCodeMap,
  canEdit,
  focusAreas,
  certifications,
}: {
  employees: Employee[];
  orgId: string;
  shiftCodes: ShiftCode[];
  shiftCodeMap: Map<number, string>;
  canEdit: boolean;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
}) {
  const [allSchedules, setAllSchedules] = useState<Record<string, Record<number, string>>>({});
  const [allRegularShifts, setAllRegularShifts] = useState<Record<string, RegularShift[]>>({});
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [editSchedule, setEditSchedule] = useState<Record<number, string>>({});
  const [openDayIndex, setOpenDayIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    employees.forEach((emp) => {
      db.fetchRegularShifts(orgId, emp.id, shiftCodeMap)
        .then((rows) => {
          const map: Record<number, string> = {};
          for (const rs of rows) {
            if (!(rs.dayOfWeek in map)) map[rs.dayOfWeek] = rs.shiftLabel;
          }
          setAllSchedules((prev) => ({ ...prev, [emp.id]: map }));
          setAllRegularShifts((prev) => ({ ...prev, [emp.id]: rows }));
        })
        .finally(() => {
          setLoadedIds((prev) => new Set([...prev, emp.id]));
        });
    });
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  function getTodayKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function handleExpand(emp: Employee) {
    if (!canEdit) return;
    if (expandedEmpId === emp.id) {
      setExpandedEmpId(null);
      setEditSchedule({});
      setOpenDayIndex(null);
      setError(null);
    } else {
      setExpandedEmpId(emp.id);
      setEditSchedule({ ...(allSchedules[emp.id] ?? {}) });
      setOpenDayIndex(null);
      setError(null);
    }
  }

  async function handleSave(empId: string) {
    setSaving(true);
    setError(null);
    const todayKey = getTodayKey();
    const existing = allRegularShifts[empId] ?? [];
    try {
      for (let day = 0; day < 7; day++) {
        const newLabel = editSchedule[day];
        const dayExisting = existing.filter((rs) => rs.dayOfWeek === day);
        if (newLabel) {
          const sc = shiftCodes.find(s => s.label === newLabel);
          if (!sc) continue;
          await db.upsertRegularShift(empId, orgId, day, sc.id, todayKey);
        } else {
          for (const rs of dayExisting) {
            await db.deleteRegularShift(empId, rs.dayOfWeek, rs.effectiveFrom);
          }
        }
      }
      setAllSchedules((prev) => ({ ...prev, [empId]: { ...editSchedule } }));
      setExpandedEmpId(null);
      setEditSchedule({});
      toast.success("Regular schedule saved");
    } catch (err: any) {
      toast.error("Failed to save regular schedule");
      setError(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
          Recurring Shifts
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
          Set recurring shift patterns for each staff member. These patterns can be applied automatically to any week.
        </p>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
          overflow: "visible",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        {employees.map((emp, i) => {
          const isExpanded = expandedEmpId === emp.id;
          const loaded = loadedIds.has(emp.id);
          const schedule = allSchedules[emp.id] ?? {};
          const isFirst = i === 0;
          const isLast = i === employees.length - 1;
          const qualifiedShiftCodes = shiftCodes.filter((st) => {
            const certOk = !st.requiredCertificationIds?.length || (emp.certificationId != null && st.requiredCertificationIds.includes(emp.certificationId));
            const areaOk = !st.focusAreaId || emp.focusAreaIds.includes(st.focusAreaId);
            return certOk && areaOk;
          });

          return (
            <div
              key={emp.id}
              style={{
                borderTop: isFirst ? "none" : "1px solid var(--color-border-light)",
              }}
            >
              {/* Row */}
              <div
                onClick={canEdit ? () => handleExpand(emp) : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "12px 20px",
                  background: isExpanded ? "#EFF6FF" : "#fff",
                  cursor: canEdit ? "pointer" : "default",
                  borderLeft: isExpanded ? "4px solid #2563EB" : "4px solid transparent",
                  paddingLeft: "calc(20px - 4px)",
                  transition: "background 0.12s",
                  borderRadius: isFirst
                    ? (isExpanded ? "12px 12px 0 0" : isLast ? "12px" : "12px 12px 0 0")
                    : isLast && !isExpanded
                    ? "0 0 12px 12px"
                    : 0,
                }}
                onMouseEnter={(e) => {
                  if (canEdit && !isExpanded)
                    e.currentTarget.style.background = "var(--color-row-hover, rgba(0,0,0,0.02))";
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded)
                    e.currentTarget.style.background = "#fff";
                }}
              >
                {/* Avatar + name */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, width: 200, flexShrink: 0 }}>
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: `hsl(${hashCode(emp.id) % 360}, 55%, 88%)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700,
                      color: `hsl(${hashCode(emp.id) % 360}, 55%, 35%)`,
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(emp.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {emp.name}
                    </div>
                    {emp.certificationId != null && (
                      <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 1 }}>
                        {getCertAbbr(emp.certificationId, certifications)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Shift preview pills — always visible */}
                <div style={{ flex: 1, display: "flex", gap: 5, alignItems: "center", justifyContent: "center" }}>
                  {DAY_NAMES.map((day, dayIdx) => {
                    const label = schedule[dayIdx] ?? "";
                    const st = shiftCodes.find((s) => s.label === label);
                    return (
                      <div key={dayIdx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {day}
                        </div>
                        <div
                          style={{
                            width: 34, height: 26,
                            background: st ? st.color : "#F8FAFC",
                            border: st ? `1px solid ${borderColor(st.text)}` : "1px solid rgba(0,0,0,0.15)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: st ? st.text : "#64748B",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {loaded ? (st ? st.label : "—") : "·"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Chevron */}
                {canEdit && (
                  <div
                    style={{
                      color: "var(--color-text-faint)", fontSize: 16, lineHeight: 1,
                      transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "transform 0.15s",
                      flexShrink: 0,
                    }}
                  >
                    ▾
                  </div>
                )}
              </div>

              {/* Expanded edit area */}
              {isExpanded && (
                <div
                  style={{
                    borderTop: "1px solid var(--color-border-light)",
                    borderLeft: "4px solid #2563EB",
                    background: "#FAFBFF",
                    padding: "16px 20px 20px",
                    borderRadius: isLast ? "0 0 12px 12px" : 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10, fontWeight: 700, color: "var(--color-text-subtle)",
                      textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12,
                    }}
                  >
                    Weekly Template
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 400 }}>
                    {DAY_NAMES.map((dayName, dayIndex) => (
                      <DayPicker
                        key={dayIndex}
                        dayName={dayName}
                        currentLabel={editSchedule[dayIndex] ?? ""}
                        shiftCodes={qualifiedShiftCodes}
                        focusAreas={focusAreas}
                        open={openDayIndex === dayIndex}
                        onOpen={() => setOpenDayIndex(dayIndex)}
                        onClose={() => setOpenDayIndex(null)}
                        onSelect={(label) =>
                          setEditSchedule((prev) => ({ ...prev, [dayIndex]: label }))
                        }
                      />
                    ))}
                  </div>
                  {error && (
                    <div
                      style={{
                        marginTop: 12, padding: "8px 12px",
                        background: "#FEF2F2", border: "1px solid #FECACA",
                        borderRadius: 8, fontSize: 12, color: "#DC2626",
                      }}
                    >
                      {error}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button
                      onClick={() => handleSave(emp.id)}
                      disabled={saving}
                      className="dg-btn dg-btn-primary"
                      style={{ padding: "8px 20px" }}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => { setExpandedEmpId(null); setEditSchedule({}); setError(null); }}
                      className="dg-btn"
                      style={{ padding: "8px 14px" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Focus Areas section ───────────────────────────────────────────────────────
function FocusAreasSection({
  employees,
  focusAreas,
  focusAreaLabel,
}: {
  employees: Employee[];
  focusAreas: FocusArea[];
  focusAreaLabel: string;
}) {
  const grouped = useMemo(() => {
    return focusAreas.map((focusArea) => ({
      focusArea,
      members: employees.filter((e) => e.focusAreaIds.includes(focusArea.id))
        .sort((a, b) => a.seniority - b.seniority),
    }));
  }, [employees, focusAreas]);

  const unassigned = useMemo(
    () => employees.filter((e) => e.focusAreaIds.length === 0).sort((a, b) => a.seniority - b.seniority),
    [employees],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
          {focusAreaLabel}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
          Staff members grouped by their assigned {focusAreaLabel.toLowerCase()}. Edit assignments from the Members tab.
        </p>
      </div>

      {grouped.map(({ focusArea, members }) => (
        <div
          key={focusArea.id}
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--color-border-light)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                background: focusArea.colorBg,
                color: focusArea.colorText,
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 20,
                padding: "3px 10px",
              }}
            >
              {focusArea.name}
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {members.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-faint)", fontStyle: "italic" }}>
                No staff assigned to this {focusAreaLabel.replace(/s$/, "").toLowerCase()}.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {members.map((emp) => (
                  <EmpChip key={emp.id} emp={emp} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: 13, color: "var(--color-text-muted)" }}>
            Unassigned
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {unassigned.map((emp) => <EmpChip key={emp.id} emp={emp} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Read-only Named Items Section (shared by Certifications & Roles) ─────────
function NamedItemsSection({
  employees,
  items,
  label,
  singularLabel,
  getEmployeeValues,
  pillStyle,
}: {
  employees: Employee[];
  items: NamedItem[];
  label: string;
  singularLabel: string;
  getEmployeeValues: (emp: Employee) => number[];
  pillStyle?: { bg: string; text: string };
}) {
  const grouped = useMemo(() => {
    return items.map((item) => ({
      item,
      members: employees.filter((e) => getEmployeeValues(e).includes(item.id))
        .sort((a, b) => a.seniority - b.seniority),
    }));
  }, [employees, items, getEmployeeValues]);

  const unassigned = useMemo(
    () => employees.filter((e) => getEmployeeValues(e).length === 0).sort((a, b) => a.seniority - b.seniority),
    [employees, getEmployeeValues],
  );

  const defaultPill = pillStyle ?? { bg: "var(--color-dark)", text: "#fff" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
          {label}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
          Staff members grouped by their assigned {label.toLowerCase()}. Edit assignments from the Members tab.
        </p>
      </div>

      {grouped.map(({ item, members }) => (
        <div
          key={item.name}
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--color-border-light)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                background: defaultPill.bg,
                color: defaultPill.text,
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 20,
                padding: "3px 10px",
              }}
            >
              {item.abbr}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {item.name !== item.abbr ? item.name : ""}
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {members.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-faint)", fontStyle: "italic" }}>
                No staff with this {singularLabel.toLowerCase()}.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {members.map((emp) => (
                  <EmpChip key={emp.id} emp={emp} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: 13, color: "var(--color-text-muted)" }}>
            Unassigned
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {unassigned.map((emp) => <EmpChip key={emp.id} emp={emp} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function StaffView({
  employees,
  benchedEmployees = [],
  terminatedEmployees = [],
  focusAreas,
  certifications,
  roles,
  onSave,
  onDelete,
  onBench,
  onActivate,
  onAdd,
  onRegularSchedule,
  orgId,
  shiftCodes,
  shiftCodeMap,
  canEditShifts,
  focusAreaLabel = "Focus Areas",
  certificationLabel = "Certifications",
  roleLabel = "Roles",
}: StaffViewProps) {
  const [activeSection, setActiveSection] = useState<StaffSection>("members");

  const iconUsers = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  const iconCalendar = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  const iconGrid = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
  const iconTag = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
  const iconCert = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;

  const links: { id: StaffSection; label: string; icon: React.ReactNode }[] = [
    { id: "members", label: "Members", icon: iconUsers },
    ...(orgId ? [{ id: "regular-schedule" as StaffSection, label: "Recurring Shifts", icon: iconCalendar }] : []),
    { id: "focus-areas", label: focusAreaLabel, icon: iconGrid },
    { id: "certifications", label: certificationLabel, icon: iconCert },
    { id: "roles", label: roleLabel, icon: iconTag },
  ];

  const getCertValues = useCallback((emp: Employee) => emp.certificationId != null ? [emp.certificationId] : [], []);
  const getRoleValues = useCallback((emp: Employee) => emp.roleIds, []);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          height: "100%",
          borderRight: "1px solid var(--color-border)",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          padding: "32px 12px",
          gap: 2,
          overflowY: "auto",
        }}
      >
        {links.map((link) => (
          <SidebarLink
            key={link.id}
            label={link.label}
            icon={link.icon}
            active={activeSection === link.id}
            onClick={() => setActiveSection(link.id)}
          />
        ))}
      </aside>

      {/* Content */}
      <div style={{ flex: 1, height: "100%", overflowY: "auto", padding: "32px 40px" }}>
        {activeSection === "members" && (
          <MembersSection
            employees={employees}
            benchedEmployees={benchedEmployees}
            terminatedEmployees={terminatedEmployees}
            focusAreas={focusAreas}
            certifications={certifications}
            roles={roles}
            onSave={onSave}
            onDelete={onDelete}
            onBench={onBench}
            onActivate={onActivate}
            onAdd={onAdd}
            focusAreaLabel={focusAreaLabel}
            certificationLabel={certificationLabel}
            roleLabel={roleLabel}
          />
        )}

        {activeSection === "regular-schedule" && orgId && (
          <RegularScheduleSection
            employees={employees}
            orgId={orgId}
            shiftCodes={shiftCodes ?? []}
            shiftCodeMap={shiftCodeMap ?? new Map()}
            canEdit={canEditShifts ?? false}
            focusAreas={focusAreas}
            certifications={certifications}
          />
        )}

        {activeSection === "focus-areas" && (
          <FocusAreasSection
            employees={employees}
            focusAreas={focusAreas}
            focusAreaLabel={focusAreaLabel}
          />
        )}

        {activeSection === "certifications" && (
          <NamedItemsSection
            employees={employees}
            items={certifications}
            label={certificationLabel}
            singularLabel={certificationLabel.replace(/s$/, "")}
            getEmployeeValues={getCertValues}
            pillStyle={{ bg: "var(--color-border-light)", text: "var(--color-text-muted)" }}
          />
        )}

        {activeSection === "roles" && (
          <NamedItemsSection
            employees={employees}
            items={roles}
            label={roleLabel}
            singularLabel={roleLabel.replace(/s$/, "")}
            getEmployeeValues={getRoleValues}
          />
        )}
      </div>
    </div>
  );
}
