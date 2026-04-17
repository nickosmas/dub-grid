"use client";

import { useState } from "react";
import type { Employee, Invitation } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
import { ButtonLoading } from "@/components/ButtonSpinner";

export interface EmployeeStatusActionsProps {
  employee: Employee;
  canEdit: boolean;
  pendingInvitation?: Invitation;
  onBench: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onTerminate: (empId: string) => void;
  onRevokeAccess?: (userId: string) => void;
  onInvite?: (emp: Employee) => void;
  onRevoke?: (invitationId: string) => Promise<boolean> | boolean | void;
  variant: "panel" | "page";
}

export function EmployeeStatusActions({
  employee,
  canEdit,
  pendingInvitation,
  onBench,
  onActivate,
  onTerminate,
  onRevokeAccess,
  onInvite,
  onRevoke,
  variant,
}: EmployeeStatusActionsProps) {
  const [showBenchConfirm, setShowBenchConfirm] = useState(false);
  const [benchNote, setBenchNote] = useState(employee.statusNote || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [alsoRevokeAccess, setAlsoRevokeAccess] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const isActive = employee.status === "active";
  const displayName = getEmployeeDisplayName(employee);

  if (!canEdit) return null;

  // ── Invitation section (panel variant only) ──
  const invitationSection = variant === "panel" && pendingInvitation && onInvite ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexWrap: "wrap" }}>
      <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
        Invitation pending
      </span>
      <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
        <button
          disabled={revoking}
          onClick={async () => {
            if (onRevoke) {
              setRevoking(true);
              try {
                const result = await onRevoke(pendingInvitation.id);
                if (result === false) return;
              } finally {
                setRevoking(false);
              }
            }
            onInvite(employee);
          }}
          className="dg-btn dg-btn-ghost dg-btn-xs"
          style={{ color: "var(--color-link)" }}
        >
          <ButtonLoading loading={revoking} spinnerSize={12}>Reinvite</ButtonLoading>
        </button>
        {onRevoke && (
          <button
            disabled={revoking}
            onClick={async () => {
              setRevoking(true);
              try {
                await onRevoke(pendingInvitation.id);
              } finally {
                setRevoking(false);
              }
            }}
            className="dg-btn dg-btn-ghost dg-btn-xs"
            style={{ color: "var(--color-danger)" }}
          >
            <ButtonLoading loading={revoking} spinnerSize={12}>Revoke</ButtonLoading>
          </button>
        )}
      </div>
    </div>
  ) : null;

  // ── Bench confirmation ──
  if (isActive && showBenchConfirm) {
    return (
      <>
        {invitationSection}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--color-warning-bg)", padding: "14px 16px", borderRadius: "var(--dg-radius-lg)", border: "1px solid var(--color-warning-border)" }}>
          <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-warning-text)", lineHeight: 1.4 }}>
            Bench {displayName}? They will be hidden from active scheduling and shift requests. Existing and future shift data will be preserved, so review upcoming assignments manually.
          </span>
          <input
            className="dg-input"
            value={benchNote}
            onChange={(e) => setBenchNote(e.target.value)}
            placeholder="Reason (optional) — e.g. 'On leave until June'"
            style={{ fontSize: "var(--dg-fs-label)" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { onBench(employee.id, benchNote.trim() || undefined); }}
              className="dg-btn dg-btn-warning-filled"
            >
              Confirm Bench
            </button>
            <button
              onClick={() => setShowBenchConfirm(false)}
              className="dg-btn dg-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Terminate confirmation ──
  if (employee.status !== "terminated" && showDeleteConfirm) {
    return (
      <>
        {invitationSection}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--color-danger-bg)", padding: "14px 16px", borderRadius: "var(--dg-radius-lg)", border: "1px solid var(--color-danger-border)" }}>
          <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-danger-text)", lineHeight: 1.4 }}>
            Terminate {displayName}? They will be archived from active staff lists and scheduling. Historical and future shift data will be preserved, so review upcoming assignments manually.
          </span>
          {employee.userId && onRevokeAccess && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--dg-fs-label)", fontWeight: 500, color: "var(--color-danger-text)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={alsoRevokeAccess}
                onChange={(e) => setAlsoRevokeAccess(e.target.checked)}
                className="accent-[var(--color-danger)] w-3.5 h-3.5"
              />
              Also revoke app access
            </label>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                onTerminate(employee.id);
                if (alsoRevokeAccess && employee.userId && onRevokeAccess) {
                  onRevokeAccess(employee.userId);
                }
              }}
              className="dg-btn dg-btn-danger-filled"
            >
              Confirm Termination
            </button>
            <button
              onClick={() => { setShowDeleteConfirm(false); setAlsoRevokeAccess(false); }}
              className="dg-btn dg-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Default state: action buttons ──
  const showBench = isActive;
  const showTerminate = employee.status !== "terminated";
  const showActivate = employee.status === "benched" || employee.status === "terminated";
  const hasDangerActions = showBench || showTerminate;
  const actionGroupStyle = variant === "page"
    ? { display: "flex", gap: 8, flexWrap: "wrap" as const }
    : { display: "flex", gap: 8 };

  return (
    <>
      {invitationSection}
      {showActivate && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: hasDangerActions ? 8 : 0 }}>
          <button
            onClick={() => onActivate(employee.id)}
            className={variant === "page" ? "dg-btn dg-btn-secondary dg-btn-sm" : "dg-btn dg-btn-ghost dg-btn-xs"}
            style={variant === "page"
              ? {
                  color: "var(--color-success)",
                  borderColor: "var(--color-success-border)",
                  background: "var(--color-success-bg)",
                }
              : { color: "var(--color-success)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Activate
          </button>
        </div>
      )}
      {hasDangerActions && (
        <div style={actionGroupStyle}>
          {showBench && (
            <button
              onClick={() => setShowBenchConfirm(true)}
              className="dg-btn dg-btn-warning-filled"
              style={{
                flex: variant === "page" ? "0 0 auto" : 1,
                minWidth: variant === "page" ? 132 : undefined,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Bench
            </button>
          )}
          {showTerminate && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="dg-btn dg-btn-danger-filled"
              style={{
                flex: variant === "page" ? "0 0 auto" : 1,
                minWidth: variant === "page" ? 132 : undefined,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Terminate
            </button>
          )}
        </div>
      )}
    </>
  );
}
