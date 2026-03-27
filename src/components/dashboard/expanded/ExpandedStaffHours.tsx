import { useState, useMemo } from "react";
import type { EmployeeHours } from "@/lib/dashboard-stats";
import type { Employee, FocusArea } from "@/types";
import Modal from "@/components/Modal";

type SortMode = "hours" | "name" | "ot";

interface ExpandedStaffHoursProps {
  currentHours: EmployeeHours[];
  prevHours: EmployeeHours[];
  employees: Employee[];
  focusAreas: FocusArea[];
  otThreshold?: number;
  onClose: () => void;
}

export default function ExpandedStaffHours({
  currentHours,
  prevHours,
  employees,
  focusAreas,
  otThreshold = 40,
  onClose,
}: ExpandedStaffHoursProps) {
  const [sort, setSort] = useState<SortMode>("hours");
  const [faFilter, setFaFilter] = useState<"all" | number>("all");

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const faMap = useMemo(() => new Map(focusAreas.map((fa) => [fa.id, fa])), [focusAreas]);
  const prevMap = useMemo(() => new Map(prevHours.map((h) => [h.empId, h])), [prevHours]);

  const sorted = useMemo(() => {
    let list = currentHours.filter((h) => h.totalHours > 0);

    // Focus area filter
    if (faFilter !== "all") {
      list = list.filter((h) => {
        const emp = empMap.get(h.empId);
        return emp?.focusAreaIds.includes(faFilter);
      });
    }

    // Sort
    if (sort === "hours") {
      list = [...list].sort((a, b) => {
        if (a.isOvertime !== b.isOvertime) return a.isOvertime ? -1 : 1;
        return b.totalHours - a.totalHours;
      });
    } else if (sort === "name") {
      list = [...list].sort((a, b) => {
        const ea = empMap.get(a.empId);
        const eb = empMap.get(b.empId);
        const na = ea ? `${ea.lastName} ${ea.firstName}` : "";
        const nb = eb ? `${eb.lastName} ${eb.firstName}` : "";
        return na.localeCompare(nb);
      });
    } else if (sort === "ot") {
      list = [...list].filter((h) => h.isOvertime).sort((a, b) => b.overtimeHours - a.overtimeHours);
    }

    return list;
  }, [currentHours, sort, faFilter, empMap]);

  const otCount = currentHours.filter((h) => h.isOvertime).length;

  return (
    <Modal title="Staff hours" onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Controls row */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {/* Sort buttons */}
          <div style={{ display: "flex", gap: 4 }}>
            {([["hours", "By hours"], ["name", "By name"], ["ot", "OT only"]] as const).map(([key, label]) => {
              const active = sort === key;
              return (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: "1px solid",
                    borderColor: active ? "var(--color-primary, #005F02)" : "var(--color-border)",
                    background: active ? "var(--color-primary, #005F02)" : "transparent",
                    color: active ? "#fff" : "var(--color-text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <select
            value={faFilter === "all" ? "all" : String(faFilter)}
            onChange={(e) => setFaFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            style={selectStyle}
          >
            <option value="all">All sections</option>
            {focusAreas.map((fa) => (
              <option key={fa.id} value={fa.id}>{fa.name}</option>
            ))}
          </select>

          <span style={{ fontSize: 11, color: "var(--color-text-subtle)", marginLeft: "auto" }}>
            {sorted.length} staff &middot; {otCount} OT &middot; {otThreshold}h limit
          </span>
        </div>

        {/* Staff list */}
        <div style={{ maxHeight: "60vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {sorted.length === 0 ? (
            <div style={emptyStyle}>No staff matching filters</div>
          ) : (
            sorted.map((h) => {
              const emp = empMap.get(h.empId);
              if (!emp) return null;
              const faId = emp.focusAreaIds[0];
              const fa = faId != null ? faMap.get(faId) : undefined;
              const initials = `${emp.firstName.charAt(0)}${emp.lastName.charAt(0)}`;
              const prev = prevMap.get(h.empId);
              const delta = prev ? h.totalHours - prev.totalHours : 0;

              return (
                <div
                  key={h.empId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 6px",
                    borderBottom: "1px solid var(--color-border-light, #E2E8F0)",
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                      background: h.isOvertime ? "#FEF2F2" : "var(--color-bg-secondary, #F1F5F9)",
                      color: h.isOvertime ? "#DC2626" : "var(--color-text-secondary)",
                    }}
                  >
                    {initials}
                  </div>

                  {/* Name + focus area */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {emp.firstName} {emp.lastName}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                      {fa?.name ?? ""}
                    </div>
                  </div>

                  {/* Week delta */}
                  {delta !== 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: delta > 0 ? "#DC2626" : "#2D6B3A",
                      }}
                    >
                      {delta > 0 ? "+" : ""}{delta}h
                    </span>
                  )}

                  {/* Hours */}
                  <div style={{ textAlign: "right", minWidth: 50 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: h.isOvertime ? "#DC2626" : "var(--color-text-primary)",
                      }}
                    >
                      {h.totalHours}h
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: h.isOvertime ? "#DC2626" : "var(--color-text-subtle)",
                      }}
                    >
                      {h.isOvertime ? `+${h.overtimeHours}h OT` : `of ${otThreshold}h`}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}

const modalStyle = { maxWidth: 700, width: "90vw" };

const selectStyle = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  cursor: "pointer" as const,
};

const emptyStyle = {
  fontSize: 13,
  color: "var(--color-text-subtle)",
  textAlign: "center" as const,
  padding: "32px 0",
};
