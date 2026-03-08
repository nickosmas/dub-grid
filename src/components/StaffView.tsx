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
}: StaffViewProps) {
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "seniority" | "wing">(
    "seniority",
  );

  const wingColorMap = useMemo(() => {
    const map: Record<string, { bg: string; text: string }> = {};
    for (const w of wings) map[w.name] = { bg: w.colorBg, text: w.colorText };
    return map;
  }, [wings]);

  const sorted = useMemo(
    () =>
      [...employees].sort((a, b) => {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={onAdd}
          style={{
            background: "var(--color-accent-gradient)",
            border: "none",
            color: "#fff",
            borderRadius: 8,
            padding: "7px 16px",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          + Add Employee
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-muted)",
            }}
          >
            Sort by:
          </label>
          <div
            style={{
              display: "flex",
              background: "#fff",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}
          >
            {(["seniority", "name", "wing"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setSortBy(option)}
                style={{
                  background: sortBy === option ? "var(--color-dark)" : "none",
                  border: "none",
                  color: sortBy === option ? "#fff" : "var(--color-text-muted)",
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRight:
                    option !== "wing"
                      ? "1px solid var(--color-border)"
                      : "none",
                }}
              >
                {option === "seniority"
                  ? "Seniority"
                  : option === "name"
                    ? "Name"
                    : "Assigned Wings"}
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
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "48px 1fr 220px 120px 160px 28px",
            padding: "10px 20px",
            borderBottom: "1px solid var(--color-border-light)",
          }}
        >
          {["#", "Name", "Assigned Wings", "Skill Level", "Roles", ""].map(
            (h, i) => (
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
            ),
          )}
        </div>

        {/* Employee rows */}
        {sorted.map((emp, i) => {
          const isExpanded = emp.id === expandedEmpId;
          return (
            <div key={emp.id}>
              {/* Row */}
              <div
                onClick={() => setExpandedEmpId(isExpanded ? null : emp.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 1fr 220px 120px 160px 28px",
                  padding: "12px 20px",
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--color-border-light)",
                  alignItems: "center",
                  background: isExpanded
                    ? "#EFF6FF"
                    : i % 2 === 0
                      ? "#fff"
                      : "var(--color-row-alt)",
                  cursor: "pointer",
                  transition: "background 0.15s",
                  borderLeft: isExpanded
                    ? "4px solid #2563EB"
                    : "4px solid transparent",
                  paddingLeft: "calc(20px - 4px)",
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded)
                    e.currentTarget.style.background =
                      "var(--color-row-hover, rgba(0,0,0,0.02))";
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded)
                    e.currentTarget.style.background =
                      i % 2 === 0 ? "#fff" : "var(--color-row-alt)";
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--color-text-faint)",
                  }}
                >
                  {emp.seniority}
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
                    const wc = wingColorMap[wing] ?? {
                      bg: "#F1F5F9",
                      text: "#475569",
                    };
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
