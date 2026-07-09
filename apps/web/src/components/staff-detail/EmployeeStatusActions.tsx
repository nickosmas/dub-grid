"use client";

import { useState } from "react";
import type { Employee, Invitation } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
import { SELF_ACTION_FORBIDDEN_MESSAGE } from "@dubgrid/domain";
import { ButtonLoading } from "@/components/ButtonSpinner";
import ConfirmDialog from "@/components/ConfirmDialog";

export interface EmployeeStatusActionsProps {
  employee: Employee;
  canEdit: boolean;
  /** When true, this employee is the current user — destructive self-actions are hidden. */
  isSelf?: boolean;
  pendingInvitation?: Invitation;
  onDeactivate: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onRemove: (empId: string, note?: string) => void;
  onRevokeAccess?: (userId: string) => void;
  onInvite?: (emp: Employee) => void;
  onRevoke?: (invitationId: string) => Promise<boolean> | boolean | void;
  variant: "panel" | "page";
}

type DeactivateOutcome = "inactive" | "remove";

export function EmployeeStatusActions({
  employee,
  canEdit,
  isSelf = false,
  pendingInvitation,
  onDeactivate,
  onActivate,
  onRemove,
  onRevokeAccess,
  onInvite,
  onRevoke,
  variant,
}: EmployeeStatusActionsProps) {
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [outcome, setOutcome] = useState<DeactivateOutcome>("inactive");
  const [note, setNote] = useState(employee.statusNote || "");
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const [pendingInvitationAction, setPendingInvitationAction] = useState<
    "reinvite" | "revoke" | null
  >(null);
  const [revoking, setRevoking] = useState(false);

  const isActive = employee.status === "active";
  const displayName = getEmployeeDisplayName(employee);
  // Management-only employees have an `employees` row but no focus areas —
  // they're not on the schedule grid (see ProfilePage's isOnSchedule).
  const isScheduled = employee.focusAreaIds.length > 0;

  async function handleConfirmInvitationAction() {
    if (!pendingInvitation || !pendingInvitationAction) return;

    if (onRevoke) {
      setRevoking(true);
      try {
        const result = await onRevoke(pendingInvitation.id);
        if (result === false) return;
      } finally {
        setRevoking(false);
      }
    }

    if (pendingInvitationAction === "reinvite" && onInvite) {
      onInvite(employee);
    }
    setPendingInvitationAction(null);
  }

  function resetDeactivateForm() {
    setShowDeactivateConfirm(false);
    setOutcome("inactive");
  }

  if (!canEdit) return null;

  // Self-action guard: you can't deactivate / remove / activate your own record.
  if (isSelf) {
    return (
      <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", margin: 0 }}>
        {SELF_ACTION_FORBIDDEN_MESSAGE}
      </p>
    );
  }

  // ── Invitation section (panel variant only) ──
  const invitationSection =
    variant === "panel" && pendingInvitation && onInvite ? (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 0",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
          Invitation pending
        </span>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button
            disabled={revoking}
            onClick={() => setPendingInvitationAction("reinvite")}
            className="dg-btn dg-btn-ghost dg-btn-xs"
            style={{ color: "var(--color-link)" }}
          >
            <ButtonLoading loading={revoking} spinnerSize={12}>
              Reinvite
            </ButtonLoading>
          </button>
          {onRevoke && (
            <button
              disabled={revoking}
              onClick={() => setPendingInvitationAction("revoke")}
              className="dg-btn dg-btn-ghost dg-btn-xs"
              style={{ color: "var(--color-danger)" }}
            >
              <ButtonLoading loading={revoking} spinnerSize={12}>
                Revoke
              </ButtonLoading>
            </button>
          )}
        </div>
      </div>
    ) : null;

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
                className="appearance-none aspect-square w-4 h-4 shrink-0 mt-0.5 rounded-full border-2 border-[var(--color-border)] box-border cursor-pointer relative checked:border-[var(--color-warning)] checked:before:absolute checked:before:inset-[2px] checked:before:rounded-full checked:before:bg-[var(--color-warning)]"
              />
              <span>
                <span style={{ display: "block", fontWeight: 600 }}>Mark inactive</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--color-text-muted)",
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
                className="appearance-none aspect-square w-4 h-4 shrink-0 mt-0.5 rounded-full border-2 border-[var(--color-border)] box-border cursor-pointer relative checked:border-[var(--color-danger)] checked:before:absolute checked:before:inset-[2px] checked:before:rounded-full checked:before:bg-[var(--color-danger)]"
              />
              <span>
                <span style={{ display: "block", fontWeight: 600 }}>Remove from staff</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  They&apos;ll lose access and won&apos;t appear in active staff. This can&apos;t be undone.
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
        confirmLabel={isRemove ? "Remove" : "Mark Inactive"}
        variant={isRemove ? "danger" : "warning"}
        onConfirm={() => {
          const trimmedNote = note.trim() || undefined;
          if (isRemove) {
            onRemove(employee.id, trimmedNote);
            if (employee.userId && onRevokeAccess) {
              onRevokeAccess(employee.userId);
            }
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
      {invitationSection}
      {showActivate && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: showDeactivate ? 8 : 0,
          }}
        >
          <button
            onClick={() => setShowActivateConfirm(true)}
            className={
              variant === "page"
                ? "dg-btn dg-btn-secondary dg-btn-sm"
                : "dg-btn dg-btn-ghost dg-btn-xs"
            }
            style={
              variant === "page"
                ? {
                    color: "var(--color-success)",
                    borderColor: "var(--color-success-border)",
                    background: "var(--color-success-bg)",
                  }
                : { color: "var(--color-success)" }
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
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Activate
          </button>
        </div>
      )}
      {showActivateConfirm && (
        <ConfirmDialog
          title="Activate Staff Member?"
          message={`Activate ${displayName}? They will return to active staff lists and scheduling.`}
          confirmLabel="Activate"
          variant="warning"
          onConfirm={() => {
            onActivate(employee.id);
            setShowActivateConfirm(false);
          }}
          onCancel={() => setShowActivateConfirm(false)}
        />
      )}
      {pendingInvitationAction && pendingInvitation && (
        <ConfirmDialog
          title={
            pendingInvitationAction === "reinvite" ? "Reissue Invitation?" : "Revoke Invitation?"
          }
          message={
            pendingInvitationAction === "reinvite"
              ? `Revoke the existing invitation for ${pendingInvitation.email} and create a new one?`
              : `Revoke the pending invitation for ${pendingInvitation.email}? The current invite link will stop working.`
          }
          confirmLabel={
            pendingInvitationAction === "reinvite" ? "Reissue Invitation" : "Revoke Invitation"
          }
          variant={pendingInvitationAction === "reinvite" ? "warning" : "danger"}
          isLoading={revoking}
          onConfirm={() => {
            void handleConfirmInvitationAction();
          }}
          onCancel={() => {
            if (!revoking) setPendingInvitationAction(null);
          }}
        />
      )}
      {showDeactivate && (
        <div style={actionGroupStyle}>
          <button
            onClick={() => setShowDeactivateConfirm(true)}
            className="dg-btn dg-btn-warning-filled"
            style={{
              flex: variant === "page" ? "0 0 auto" : 1,
              minWidth: variant === "page" ? 160 : undefined,
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Deactivate
          </button>
        </div>
      )}
    </>
  );
}
