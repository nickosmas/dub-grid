"use client";

import { useState } from "react";
import type { Employee } from "@/types";
import { Button } from "@/components/Button";
import { getEmployeeDisplayName } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  canMarkInactive,
  describeStatusAction,
  statusUndoAction,
  type StatusAction,
} from "@dubgrid/domain";

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

type ConfirmingAction = Exclude<StatusAction, "restore" | "markActive"> | "undo";

const NOTE_PLACEHOLDERS: Record<"markAway" | "archive", string> = {
  markAway: "Reason (optional) - e.g. Family leave",
  archive: "Reason (optional) - e.g. Left the company",
};

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
  // Away only takes someone off the schedule, so a management-only person can
  // only be archived.
  const canBeAway = canMarkInactive(employee.focusAreaIds);
  const [confirming, setConfirming] = useState<ConfirmingAction | null>(null);
  const [note, setNote] = useState(employee.statusNote || "");
  // The confirmation unmounts while a step-up prompt shows, which drops its
  // own latch, so the pending state lives here to survive the round trip.
  const [pending, setPending] = useState(false);

  const displayName = getEmployeeDisplayName(employee);
  const undoAction = statusUndoAction(employee.status);

  async function runPending(action: () => unknown) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  function closeConfirm() {
    setConfirming(null);
    setNote(employee.statusNote || "");
  }

  // Self-action guard: you can't change your own status, so callers hide this
  // whole section rather than show it with nothing actionable inside.
  if (!canEdit || isSelf) return null;

  const confirmation = (() => {
    if (!confirming || stepUpOpen) return null;
    if (confirming === "undo") {
      if (!undoAction) return null;
      const copy = describeStatusAction(undoAction, displayName);
      return (
        <ConfirmDialog
          isLoading={pending}
          title={copy.title}
          message={copy.message || undefined}
          summary={{ points: copy.points }}
          confirmLabel={copy.label}
          variant="warning"
          onConfirm={async () => {
            await runPending(() => onActivate(employee.id));
            closeConfirm();
          }}
          onCancel={closeConfirm}
        />
      );
    }
    const copy = describeStatusAction(confirming, displayName);
    const isArchive = confirming === "archive";
    return (
      <ConfirmDialog
        isLoading={pending}
        title={copy.title}
        message={
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {copy.message ? <span>{copy.message}</span> : null}
            <input
              className="dg-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={NOTE_PLACEHOLDERS[confirming]}
              aria-label="Reason (optional)"
              style={{ fontSize: "var(--dg-fs-label)", width: "100%" }}
            />
          </div>
        }
        summary={{ points: copy.points }}
        confirmLabel={copy.label}
        variant={isArchive ? "danger" : "warning"}
        onConfirm={async () => {
          const trimmedNote = note.trim() || undefined;
          // Revoking any linked org membership happens server-side, atomically
          // with the status change (see /api/employees/status), not as a
          // second client call, so the two can't diverge on partial failure.
          await runPending(() =>
            isArchive ? onRemove(employee.id, trimmedNote) : onDeactivate(employee.id, trimmedNote),
          );
          closeConfirm();
        }}
        onCancel={closeConfirm}
      />
    );
  })();

  const buttonStyle = fillWidth
    ? { flex: 1, width: "100%", minWidth: 0 }
    : variant === "page"
      ? { flex: "0 0 auto", minWidth: 140 }
      : { flex: 1, minWidth: 0 };
  const groupStyle = fillWidth
    ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }
    : { display: "flex", gap: 8, flexWrap: variant === "page" ? ("wrap" as const) : undefined };

  if (undoAction) {
    const copy = describeStatusAction(undoAction, displayName);
    return (
      <>
        <Button
          onClick={() => setConfirming("undo")}
          className={variant === "page" ? "dg-btn dg-btn-success" : "dg-btn dg-btn-ghost dg-btn-xs"}
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
          {copy.label}
        </Button>
        {confirmation}
      </>
    );
  }

  return (
    <>
      <div style={groupStyle}>
        {canBeAway && (
          <Button
            onClick={() => setConfirming("markAway")}
            className="dg-btn dg-btn-warning-filled"
            style={buttonStyle}
          >
            {describeStatusAction("markAway", displayName).label}
          </Button>
        )}
        <Button
          onClick={() => setConfirming("archive")}
          className="dg-btn dg-btn-secondary"
          style={{
            ...buttonStyle,
            // Alone, Archive spans both columns rather than sitting half-width.
            ...(fillWidth && !canBeAway ? { gridColumn: "1 / -1" } : null),
          }}
        >
          {describeStatusAction("archive", displayName).label}
        </Button>
      </div>
      {confirmation}
    </>
  );
}
