"use client";

import { useState, useMemo, useCallback } from "react";
import type { Employee } from "@/types";
import Modal from "@/components/Modal";
import { timesOverlap } from "@/lib/schedule-logic";
import type { TimeRange } from "@/lib/schedule-logic";

/* ── Helpers ─────────────────────────────────────────────────────────── */

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

/* ── Types ───────────────────────────────────────────────────────────── */

interface ShiftSwapModalProps {
  requesterEmpId: string;
  requesterName: string;
  shiftDate: string;
  shiftLabel: string;
  employees: Employee[];
  shiftForKey: (empId: string, date: Date) => string | null;
  isRequestableShift: (empId: string, date: Date) => boolean;
  /** Returns time ranges (from shift categories) for an employee's shift on a given date */
  getShiftTimeRanges: (empId: string, date: Date) => TimeRange[];
  onSubmit: (targetEmpId: string, targetShiftDate: string) => void;
  onClose: () => void;
}

/* ── Component ───────────────────────────────────────────────────────── */

export default function ShiftSwapModal({
  requesterEmpId,
  requesterName,
  shiftDate,
  shiftLabel,
  employees,
  shiftForKey,
  isRequestableShift,
  getShiftTimeRanges,
  onSubmit,
  onClose,
}: ShiftSwapModalProps) {
  const [viewDate, setViewDate] = useState(shiftDate);
  const [selectedTarget, setSelectedTarget] = useState<{
    empId: string;
    name: string;
    shiftLabel: string;
  } | null>(null);

  const canGoPrev = viewDate > todayIso();

  const goDay = useCallback((delta: 1 | -1) => {
    setViewDate((d) => addDays(d, delta));
    setSelectedTarget(null);
  }, []);

  /**
   * Check if swapping with a target would create a time overlap for either party.
   * Uses shift category start/end times to detect conflicts across focus areas.
   */
  const hasTimeConflict = useCallback(
    (targetEmpId: string): boolean => {
      const viewDateObj = new Date(viewDate + "T00:00:00");
      const shiftDateObj = new Date(shiftDate + "T00:00:00");

      if (viewDate === shiftDate) {
        // Same-day swap: block if both shifts cover the same time slot
        const requesterTimes = getShiftTimeRanges(requesterEmpId, shiftDateObj);
        const targetTimes = getShiftTimeRanges(targetEmpId, viewDateObj);
        return timesOverlap(requesterTimes, targetTimes);
      }

      // Cross-day: requester gets target's shift on viewDate — check vs requester's existing on viewDate
      const requesterExisting = getShiftTimeRanges(requesterEmpId, viewDateObj);
      if (requesterExisting.length > 0) {
        const incoming = getShiftTimeRanges(targetEmpId, viewDateObj);
        if (timesOverlap(requesterExisting, incoming)) return true;
      }

      // Target gets requester's shift on shiftDate — check vs target's existing on shiftDate
      const targetExisting = getShiftTimeRanges(targetEmpId, shiftDateObj);
      if (targetExisting.length > 0) {
        const incoming = getShiftTimeRanges(requesterEmpId, shiftDateObj);
        if (timesOverlap(targetExisting, incoming)) return true;
      }

      return false;
    },
    [viewDate, shiftDate, requesterEmpId, getShiftTimeRanges],
  );

  /** Employees who have a requestable shift on the viewed date with no time conflicts */
  const eligibleEmployees = useMemo(() => {
    const viewDateObj = new Date(viewDate + "T00:00:00");
    return employees.filter(
      (emp) =>
        emp.id !== requesterEmpId &&
        !emp.archivedAt &&
        emp.status === "active" &&
        isRequestableShift(emp.id, viewDateObj) &&
        !hasTimeConflict(emp.id),
    );
  }, [employees, requesterEmpId, viewDate, isRequestableShift, hasTimeConflict]);

  function handleSelectEmployee(emp: Employee) {
    const dateObj = new Date(viewDate + "T00:00:00");
    const label = shiftForKey(emp.id, dateObj) ?? "";
    setSelectedTarget({
      empId: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      shiftLabel: label,
    });
  }

  function handleSubmit() {
    if (!selectedTarget) return;
    onSubmit(selectedTarget.empId, viewDate);
  }

  return (
    <Modal title="Propose a Swap" onClose={onClose} style={{ maxWidth: 480, width: "100%" }}>
      {/* Requester shift info */}
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          backgroundColor: "var(--color-bg-secondary)",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginBottom: 2 }}>
          Your shift
        </div>
        <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
          {shiftLabel}
          <span style={{ fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 8 }}>
            {shiftDate}
          </span>
        </div>
      </div>

      {/* ── Confirmation view ── */}
      {selectedTarget ? (
        <div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "14px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              marginBottom: 16,
            }}
          >
            <div>
              <span style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>You give</span>
              <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                {shiftLabel}
                <span
                  style={{ fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 8 }}
                >
                  on {shiftDate}
                </span>
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>You get</span>
              <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                {selectedTarget.shiftLabel}
                <span
                  style={{ fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 8 }}
                >
                  on {viewDate}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                from {selectedTarget.name}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="dg-btn dg-btn-ghost" onClick={() => setSelectedTarget(null)}>
              Back
            </button>
            <button className="dg-btn dg-btn-primary" onClick={handleSubmit}>
              Submit Swap Request
            </button>
          </div>
        </div>
      ) : (
        /* ── Day view with eligible employees ── */
        <div>
          {/* Day navigation header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              onClick={() => goDay(-1)}
              disabled={!canGoPrev}
              title="Previous day"
              style={{
                background: "none",
                border: "none",
                cursor: canGoPrev ? "pointer" : "not-allowed",
                padding: "4px 8px",
                fontSize: 18,
                color: canGoPrev ? "var(--color-text-secondary)" : "var(--color-text-faint)",
                borderRadius: 6,
                fontFamily: "inherit",
                opacity: canGoPrev ? 1 : 0.4,
              }}
            >
              ‹
            </button>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {formatDisplayDate(viewDate)}
            </span>
            <button
              type="button"
              onClick={() => goDay(1)}
              title="Next day"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                fontSize: 18,
                color: "var(--color-text-secondary)",
                borderRadius: 6,
                fontFamily: "inherit",
              }}
            >
              ›
            </button>
          </div>

          {/* Eligible employee list */}
          <div
            style={{
              maxHeight: 300,
              overflowY: "auto",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            {eligibleEmployees.length === 0 ? (
              <div
                style={{
                  padding: "24px 14px",
                  textAlign: "center",
                  color: "var(--color-text-muted)",
                  fontSize: 13,
                }}
              >
                No eligible employees on this date
                <div style={{ fontSize: 12, marginTop: 4, color: "var(--color-text-faint)" }}>
                  Try navigating to another day
                </div>
              </div>
            ) : (
              eligibleEmployees.map((emp, idx) => {
                const dateObj = new Date(viewDate + "T00:00:00");
                const label = shiftForKey(emp.id, dateObj);
                return (
                  <button
                    key={emp.id}
                    onClick={() => handleSelectEmployee(emp)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      background: "none",
                      border: "none",
                      borderBottom:
                        idx < eligibleEmployees.length - 1
                          ? "1px solid var(--color-border)"
                          : "none",
                      cursor: "pointer",
                      color: "var(--color-text-primary)",
                      fontSize: 14,
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--color-surface-overlay)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "none";
                    }}
                  >
                    <span>{emp.firstName} {emp.lastName}</span>
                    {label && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--color-text-secondary)",
                          marginLeft: 8,
                        }}
                      >
                        {label}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="dg-btn dg-btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
