"use client";

import { useState } from "react";
import type { Employee } from "@/types";
import { Button } from "@/components/Button";
import { getEmployeeDisplayName } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";

export interface EmployeeStatusActionsProps {
  employee: Employee;
  canEdit: boolean;
  /** When true, this employee is the current user — destructive self-actions are hidden. */
  isSelf?: boolean;
  onDeactivate: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onRemove: (empId: string, note?: string) => void;
  variant: "panel" | "page";
  /** Stretches the active button to fill its container, for an equal-width row of actions. */
  fillWidth?: boolean;
}

type DeactivateOutcome = "inactive" | "remove";

export function EmployeeStatusActions({
  employee,
  canEdit,
  isSelf = false,
  onDeactivate,
  onActivate,
  onRemove,
  variant,
  fillWidth = false,
}: EmployeeStatusActionsProps) {
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [outcome, setOutcome] = useState<DeactivateOutcome>("inactive");
  const [note, setNote] = useState(employee.statusNote || "");
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);

  const isActive = employee.status === "active";
  const displayName = getEmployeeDisplayName(employee);
  // Management-only employees have an `employees` row but no focus areas —
  // they're not on the schedule grid (see ProfilePage's isOnSchedule).
  const isScheduled = employee.focusAreaIds.length > 0;

  function resetDeactivateForm() {
    setShowDeactivateConfirm(false);
    setOutcome("inactive");
  }

  // Self-action guard: you can't deactivate / remove / activate your own
  // record, so callers hide this whole section rather than show it with
  // nothing actionable inside.
  if (!canEdit || isSelf) return null;

  // ── Unified Deactivate confirmation ──
  // One modal asks Temporary vs Permanent. The primary button's verb + variant
  // flips with the radio so the confirm action always echoes the outcome.
  if (isActive && showDeactivateConfirm) {
    const isRemove = outcome === "remove";
    return (
      <ConfirmDialog
        title={`Deactivate ${displayName}?`}
        message={
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="deactivate-outcome"
                value="inactive"
                checked={!isRemove}
                onChange={() => setOutcome("inactive")}
                className="appearance-none aspect-square w-4 h-4 shrink-0 mt-0.5 rounded-full border-2 border-[var(--dg-color-border)] box-border cursor-pointer relative checked:border-[var(--dg-color-warning)] checked:before:absolute checked:before:inset-[2px] checked:before:rounded-full checked:before:bg-[var(--dg-color-warning)]"
              />
              <span>
                <span style={{ display: "block", fontWeight: 600 }}>Mark inactive</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--dg-color-text-muted)",
                  }}
                >
                  {isScheduled
                    ? "They'll be temporarily off the schedule. You can reactivate them anytime."
                    : "They'll temporarily lose management access. You can reactivate them anytime."}
                </span>
              </span>
            </label>
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="deactivate-outcome"
                value="remove"
                checked={isRemove}
                onChange={() => setOutcome("remove")}
                className="appearance-none aspect-square w-4 h-4 shrink-0 mt-0.5 rounded-full border-2 border-[var(--dg-color-border)] box-border cursor-pointer relative checked:border-[var(--dg-color-danger)] checked:before:absolute checked:before:inset-[2px] checked:before:rounded-full checked:before:bg-[var(--dg-color-danger)]"
              />
              <span>
                <span style={{ display: "block", fontWeight: 600 }}>Remove from staff</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--dg-color-text-muted)",
                  }}
                >
                  They&apos;ll lose access and won&apos;t appear in active staff. You can reactivate
                  them later.
                </span>
              </span>
            </label>
            <input
              className="dg-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                isRemove
                  ? "Reason (optional) - e.g. Left the company"
                  : "Reason (optional) - e.g. On leave until June"
              }
              style={{ fontSize: "var(--dg-fs-label)" }}
            />
          </div>
        }
        confirmLabel={isRemove ? "Remove" : "Mark inactive"}
        variant={isRemove ? "danger" : "warning"}
        onConfirm={() => {
          const trimmedNote = note.trim() || undefined;
          if (isRemove) {
            // Revoking any linked org membership happens server-side, atomically
            // with the status change (see /api/employees/status) — not as a
            // second client call, so the two can't diverge on partial failure.
            onRemove(employee.id, trimmedNote);
          } else {
            onDeactivate(employee.id, trimmedNote);
          }
          resetDeactivateForm();
        }}
        onCancel={resetDeactivateForm}
      />
    );
  }

  // ── Default state: action buttons ──
  const showDeactivate = isActive;
  const showActivate = employee.status === "inactive" || employee.status === "removed";
  const actionGroupStyle =
    variant === "page"
      ? { display: "flex", gap: 8, flexWrap: "wrap" as const }
      : { display: "flex", gap: 8 };

  return (
    <>
      {showActivate && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: showDeactivate ? 8 : 0,
          }}
        >
          <Button
            onClick={() => setShowActivateConfirm(true)}
            className={
              variant === "page" ? "dg-btn dg-btn-success" : "dg-btn dg-btn-ghost dg-btn-xs"
            }
            style={{
              // Inline success colors here would outrank the variant's :hover,
              // so the page button wears the class and only ghost tints inline.
              ...(variant === "page" ? null : { color: "var(--dg-color-success-text)" }),
              ...(fillWidth ? { flex: 1, width: "100%" } : null),
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Activate
          </Button>
        </div>
      )}
      {showActivateConfirm && (
        <ConfirmDialog
          title="Activate Staff Member?"
          message={`Activate ${displayName}? They will return to active staff lists.`}
          confirmLabel="Activate"
          variant="warning"
          onConfirm={() => {
            onActivate(employee.id);
            setShowActivateConfirm(false);
          }}
          onCancel={() => setShowActivateConfirm(false)}
        />
      )}
      {showDeactivate && (
        <div style={actionGroupStyle}>
          <Button
            onClick={() => setShowDeactivateConfirm(true)}
            className="dg-btn dg-btn-warning-filled"
            style={
              fillWidth
                ? { flex: 1, width: "100%" }
                : {
                    flex: variant === "page" ? "0 0 auto" : 1,
                    minWidth: variant === "page" ? 160 : undefined,
                  }
            }
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Deactivate
          </Button>
        </div>
      )}
    </>
  );
}
