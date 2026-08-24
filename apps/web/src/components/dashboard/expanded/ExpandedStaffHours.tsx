import { useState, useMemo } from "react";
import Link from "next/link";
import type { EmployeeHours } from "@/lib/dashboard-stats";
import { Button } from "@/components/Button";
import { getAvatarInitials } from "@/lib/utils";
import type { Employee, FocusArea } from "@/types";
import Modal from "@/components/Modal";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";

type SortMode = "hours" | "name" | "ot";

interface ExpandedStaffHoursProps {
  currentHours: EmployeeHours[];
  prevHours: EmployeeHours[];
  employees: Employee[];
  focusAreas: FocusArea[];
  /** Whether rows link to the full /people/[id] details page. Mirrors the
   * People table: only staff managers can navigate. */
  canNavigateToDetailsPage: boolean;
  otThreshold?: number;
  onClose: () => void;
}

export default function ExpandedStaffHours({
  currentHours,
  prevHours,
  employees,
  focusAreas,
  canNavigateToDetailsPage,
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
      list = [...list]
        .filter((h) => h.isOvertime)
        .sort((a, b) => b.overtimeHours - a.overtimeHours);
    }

    return list;
  }, [currentHours, sort, faFilter, empMap]);

  const otCount = currentHours.filter((h) => h.isOvertime).length;

  return (
    <Modal title="Staff hours" onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Controls row */}
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            padding: 16,
            borderRadius: "var(--dg-radius-md)",
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* Sort buttons */}
          <div style={{ display: "flex", gap: 4 }}>
            {(
              [
                ["hours", "By hours"],
                ["name", "By name"],
                ["ot", "OT only"],
              ] as const
            ).map(([key, label]) => {
              const active = sort === key;
              return (
                <Button
                  key={key}
                  onClick={() => setSort(key)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: "1px solid",
                    borderColor: active ? "var(--color-brand)" : "var(--color-border)",
                    background: active ? "var(--color-brand)" : "transparent",
                    color: active ? "#fff" : "var(--color-text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </div>

          <CustomSelect
            value={faFilter === "all" ? "all" : String(faFilter)}
            options={[
              { value: "all", label: "All sections" },
              ...focusAreas.map((fa) => ({ value: String(fa.id), label: fa.name })),
            ]}
            onChange={(val) => setFaFilter(val === "all" ? "all" : Number(val))}
            fontSize="var(--dg-fs-label)"
          />

          <span style={{ fontSize: 11, color: "var(--color-text-subtle)", marginLeft: "auto" }}>
            {sorted.length} staff &middot; {otCount} OT &middot; {otThreshold}h limit
          </span>
        </div>

        {/* Staff list */}
        <div
          style={{ maxHeight: "60vh", overflowY: "auto", display: "flex", flexDirection: "column" }}
        >
          {sorted.length === 0 ? (
            <EmptyState size="compact" heading="No staff matching filters" />
          ) : (
            sorted.map((h) => {
              const emp = empMap.get(h.empId);
              if (!emp) return null;
              const faId = emp.focusAreaIds[0];
              const fa = faId != null ? faMap.get(faId) : undefined;
              const initials = getAvatarInitials(`${emp.firstName} ${emp.lastName}`);
              const prev = prevMap.get(h.empId);
              const delta = prev ? h.totalHours - prev.totalHours : 0;

              const row = (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--dg-radius-md)",
                    background: "var(--color-bg)",
                    marginBottom: 8,
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "var(--dg-radius-md)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                      background: h.isOvertime
                        ? "var(--color-danger-bg)"
                        : "var(--color-bg-secondary)",
                      color: h.isOvertime ? "var(--color-danger)" : "var(--color-text-secondary)",
                    }}
                  >
                    {initials}
                  </div>

                  {/* Name + focus area */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                      }}
                    >
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
                        color: delta > 0 ? "var(--color-danger)" : "var(--color-success)",
                      }}
                    >
                      {delta > 0 ? "+" : ""}
                      {Math.round(delta * 10) / 10}h
                    </span>
                  )}

                  {/* Hours */}
                  <div style={{ textAlign: "right", minWidth: 50 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: h.isOvertime ? "var(--color-danger)" : "var(--color-text-primary)",
                      }}
                    >
                      {h.totalHours}h
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: h.isOvertime ? "var(--color-danger)" : "var(--color-text-subtle)",
                      }}
                    >
                      {h.isOvertime ? `+${h.overtimeHours}h OT` : `of ${otThreshold}h`}
                    </div>
                  </div>
                </div>
              );

              return canNavigateToDetailsPage ? (
                <Link
                  key={h.empId}
                  href={`/people/${emp.id}`}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  {row}
                </Link>
              ) : (
                <div key={h.empId}>{row}</div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}

const modalStyle = { maxWidth: 700, width: "90vw" };
