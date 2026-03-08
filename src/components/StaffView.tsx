"use client";

import { useState, useMemo, useCallback } from "react";
import { getInitials } from "@/lib/utils";
import { Employee, Wing } from "@/types";
import InlineEditEmployee from "@/components/EditEmployeePanel";

interface StaffViewProps {
  employees: Employee[];
  wings: Wing[];
  skillLevels: string[];
  roles: string[];
  onSave: (emp: Employee) => void;
  onDelete: (empId: string) => void;
  onAdd: () => void;
  activeWing?: string;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export default function StaffView({
  employees,
  wings,
  skillLevels,
  roles,
  onSave,
  onDelete,
  onAdd,
  activeWing = "All",
}: StaffViewProps) {
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "seniority" | "wing">("seniority");
  const [isReordering, setIsReordering] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<Employee[] | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const wingColorMap = useMemo(() => {
    const map: Record<string, { bg: string; text: string }> = {};
    for (const w of wings) map[w.name] = { bg: w.colorBg, text: w.colorText };
    return map;
  }, [wings]);

  const filteredByWing = useMemo(() => {
    if (activeWing === "All") return employees;
    return employees.filter(e => e.wings.includes(activeWing));
  }, [employees, activeWing]);

  const sorted = useMemo(
    () =>
      [...filteredByWing].sort((a, b) => {
        switch (sortBy) {
          case "name":
            return a.name.localeCompare(b.name);
          case "wing": {
            const wA = a.wings[0] ?? "";
            const wB = b.wings[0] ?? "";
            return wA !== wB ? wA.localeCompare(wB) : a.seniority - b.seniority;
          }
          default:
            return a.seniority - b.seniority;
        }
      }),
    [employees, sortBy],
  );

  // Base list: pendingOrder during reorder mode, otherwise sorted
  const baseList = isReordering && pendingOrder !== null ? pendingOrder : sorted;

  // Compute display order during an active drag
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isReordering && (
            <button
              onClick={onAdd}
              className="dg-btn dg-btn-primary"
              style={{ padding: "8px 16px" }}
            >
              + Add Staff Members
            </button>
          )}
          {sortBy === "seniority" && (
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
            <button
              onClick={handleSaveOrder}
              className="dg-btn dg-btn-primary"
              style={{ padding: "7px 14px" }}
            >
              Save
            </button>
          )}
          {isReordering && (
            <button
              onClick={handleCancelReorder}
              className="dg-btn"
              style={{ padding: "7px 14px" }}
            >
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
            {(["seniority", "name", "wing"] as const).map((option) => (
              <button
                key={option}
                onClick={() => { setSortBy(option); if (isReordering) handleCancelReorder(); }}
                className={`dg-segment-btn${sortBy === option ? " active" : ""}`}
                style={{ fontSize: 12 }}
              >
                {option === "seniority" ? "Seniority" : option === "name" ? "Name" : "Wings"}
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
            ? ["", "#", "Name", "Assigned Wings", "Skill Level", "Roles"]
            : ["#", "Name", "Assigned Wings", "Skill Level", "Roles", ""]
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
              {/* Row */}
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
                    : i % 2 === 0
                      ? "#fff"
                      : "var(--color-row-alt)",
                  cursor: isReordering ? "grab" : "pointer",
                  transition: "background 0.15s, opacity 0.15s",
                  opacity: isDragging ? 0.4 : 1,
                  borderLeft: isExpanded
                    ? "4px solid #2563EB"
                    : "4px solid transparent",
                  paddingLeft: "calc(20px - 4px)",
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded && !isReordering)
                    e.currentTarget.style.background = "var(--color-row-hover, rgba(0,0,0,0.02))";
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded && !isReordering)
                    e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "var(--color-row-alt)";
                }}
              >
                {/* Drag handle (reorder mode only) */}
                {isReordering && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-text-faint)",
                    }}
                  >
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

                {/* Position number */}
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--color-text-faint)",
                  }}
                >
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
                      {emp.fteWeight < 1 && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: "var(--color-border-light)",
                            color: "var(--color-text-muted)",
                            padding: "1px 4px",
                            borderRadius: 4,
                          }}
                        >
                          {emp.fteWeight}
                        </span>
                      )}
                    </div>
                    {(emp.email || emp.phone) && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-faint)",
                          marginTop: 1,
                        }}
                      >
                        {emp.email || emp.phone}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {emp.wings.map((wing) => {
                    const wc = wingColorMap[wing] ?? { bg: "#F1F5F9", text: "#475569" };
                    return (
                      <span
                        key={wing}
                        style={{
                          background: wc.bg,
                          color: wc.text,
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 20,
                          padding: "2px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {wing}
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
                    {emp.designation}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {emp.roles.length > 0 ? emp.roles.join(", ") : "—"}
                </div>

                {/* Expand chevron (normal mode only) */}
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

              {/* Inline edit panel */}
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
                    wings={wings}
                    skillLevels={skillLevels}
                    roles={roles}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onCancel={() => setExpandedEmpId(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
