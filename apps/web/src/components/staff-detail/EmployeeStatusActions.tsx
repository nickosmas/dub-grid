"use client";

import { useState } from "react";
import type { Employee } from "@/types";
import { Button } from "@/components/Button";
import { getEmployeeDisplayName } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";
import { canMarkInactive } from "@dubgrid/domain";

export interface EmployeeStatusActionsProps {
  employee: Employee;
  canEdit: boolean;
  /** When true, this employee is the current user — destructive self-actions are hidden. */
  isSelf?: boolean;
  onDeactivate: (empId: string, note?: string) => void | Promise<unknown>;
  onActivate: (empId: string) => void | Promise<unknown>;
  onRemove: (empId: string, note?: string) => void | Promise<unknown>;
  variant: "panel" | "page";
  /** Stretches the active button to fill its container, for an equal-width row of actions. */
  fillWidth?: boolean;
  /** Hides the confirmation while a step-up prompt asks for fresh proof. */
  stepUpOpen?: boolean;
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
  stepUpOpen = false,
}: EmployeeStatusActionsProps) {
  // Inactive only takes someone off the schedule, so a management-only person
  // can only be removed.
  const canBeInactive = canMarkInactive(employee.focusAreaIds);
  const defaultOutcome: DeactivateOutcome = canBeInactive ? "inactive" : "remove";
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [outcome, setOutcome] = useState<DeactivateOutcome>(defaultOutcome);
  const [note, setNote] = useState(employee.statusNote || "");
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  // The confirmation unmounts while a step-up prompt shows, which drops its
  // own latch, so the pending state lives here to survive the round trip.
  const [pending, setPending] = useState(false);

  const isActive = employee.status === "active";
  const displayName = getEmployeeDisplayName(employee);

  async function runPending(action: () => unknown) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  function resetDeactivateForm() {
    setShowDeactivateConfirm(false);
    setOutcome(defaultOutcome);
  }

  // Self-action guard: you can't deactivate / remove / activate your own
  // record, so callers hide this whole section rather than show it with
  // nothing actionable inside.
  if (!canEdit || isSelf) return null;

  // ── Unified Deactivate confirmation ──
  // One modal asks Temporary vs Permanent. The primary button's verb + variant
  // flips with the radio so the confirm action always echoes the outcome.
  if (isActive && showDeactivateConfirm) {
    if (stepUpOpen) return null;
    const isRemove = outcome === "remove";
    return (
      <ConfirmDialog
        isLoading={pending}
        title={`Deactivate ${displayName}?`}
        message={
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {canBeInactive && (
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
                    They&apos;ll be off the schedule and keep their access. You can reactivate them
                    anytime.
                  </span>
                </span>
              </label>
            )}
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
        onConfirm={async () => {
          const trimmedNote = note.trim() || undefined;
          // Revoking any linked org membership happens server-side, atomically
          // with the status change (see /api/employees/status) — not as a
          // second client call, so the two can't diverge on partial failure.
          await runPending(() =>
            isRemove ? onRemove(employee.id, trimmedNote) : onDeactivate(employee.id, trimmedNote),
          );
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
      {showActivateConfirm && !stepUpOpen && (
        <ConfirmDialog
          isLoading={pending}
          title="Activate Staff Member?"
          message={`Activate ${displayName}? They will return to active staff lists.`}
          confirmLabel="Activate"
          variant="warning"
          onConfirm={async () => {
            await runPending(() => onActivate(employee.id));
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
