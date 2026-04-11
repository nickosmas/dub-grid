"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Employee, FocusArea, NamedItem, Invitation } from "@/types";
import { getInitials, getEmployeeDisplayName } from "@/lib/utils";
import InlineEditEmployee from "@/components/EditEmployeePanel";
import { EmployeeStatusActions } from "@/components/staff-detail/EmployeeStatusActions";

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface StaffDetailPanelProps {
  employee: Employee;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  roleLabel: string;
  focusAreaLabel: string;
  certificationLabel: string;
  departments?: NamedItem[];
  departmentLabel?: string;
  canManageEmployees: boolean;
  orgId?: string;
  pendingInviteByEmployeeId: Map<string, Invitation>;
  onSave: (emp: Employee) => void;
  onDelete: (empId: string) => void;
  onBench: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onClose: () => void;
  onInvite?: (emp: Employee) => void;
  onRevoke?: (invitationId: string) => Promise<boolean> | boolean | void;
  onRevokeAccess?: (userId: string) => void;
}

export function StaffDetailPanel({
  employee,
  focusAreas,
  certifications,
  roles,
  roleLabel,
  focusAreaLabel,
  certificationLabel,
  departments,
  departmentLabel,
  canManageEmployees,
  orgId,
  pendingInviteByEmployeeId,
  onSave,
  onDelete,
  onBench,
  onActivate,
  onClose,
  onInvite,
  onRevoke,
  onRevokeAccess,
}: StaffDetailPanelProps) {
  const hue = hashCode(employee.id) % 360;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onCloseRef.current();
    }, 200);
  }, []);

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // Reset scroll when switching employees
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [employee.id]);

  const statusConfig = {
    active: { bg: "var(--color-success-bg)", text: "var(--color-success-text)", dot: "var(--color-success)" },
    benched: { bg: "var(--color-warning-bg)", text: "var(--color-warning-text)", dot: "var(--color-warning)" },
    terminated: { bg: "var(--color-danger-bg)", text: "var(--color-danger-text)", dot: "var(--color-danger)" },
  }[employee.status];

  return createPortal(
    <>
      <div className={`staff-detail-overlay${closing ? " closing" : ""}`} onClick={handleClose} />
      <div className={`staff-detail-pane${closing ? " closing" : ""}`}>
        {/* Panel header */}
        <div className="staff-detail-header">
          <button className="staff-detail-close" onClick={handleClose} aria-label="Close detail panel">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Profile card area */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", paddingTop: 4 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: `hsl(${hue}, 65%, 94%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--dg-fs-body)",
                fontWeight: 800,
                color: `hsl(${hue}, 60%, 38%)`,
                flexShrink: 0,
                border: `2px solid hsl(${hue}, 55%, 86%)`,
              }}
            >
              {getInitials(getEmployeeDisplayName(employee))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: "var(--dg-fs-body)", color: "var(--color-text-primary)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {getEmployeeDisplayName(employee)}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "var(--dg-fs-footnote)",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 20,
                    background: statusConfig.bg,
                    color: statusConfig.text,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusConfig.dot, flexShrink: 0 }} />
                  {employee.status.charAt(0).toUpperCase() + employee.status.slice(1)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                {employee.email && (
                  <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {employee.email}
                  </span>
                )}
                {employee.phone && (
                  <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-faint)", flexShrink: 0 }}>
                    {employee.phone}
                  </span>
                )}
              </div>
              <Link
                href={`/people/${employee.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 4,
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 600,
                  color: "var(--color-link)",
                  textDecoration: "none",
                }}
              >
                View full profile
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Edit form */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
          <InlineEditEmployee
            employee={employee}
            focusAreas={focusAreas}
            certifications={certifications}
            roles={roles}
            roleLabel={roleLabel}
            focusAreaLabel={focusAreaLabel}
            certificationLabel={certificationLabel}
            departments={departments}
            departmentLabel={departmentLabel}
            onSave={onSave}
            onDelete={onDelete}
            onBench={(empId, note) => onBench(empId, note)}
            onActivate={(empId) => onActivate(empId)}
            onCancel={handleClose}
            onInvite={canManageEmployees && orgId ? onInvite : undefined}
            pendingInvitation={canManageEmployees ? pendingInviteByEmployeeId.get(employee.id) : undefined}
            onRevoke={canManageEmployees ? onRevoke : undefined}
            onRevokeAccess={canManageEmployees ? onRevokeAccess : undefined}
          />
        </div>

        {/* Sticky bottom status actions */}
        <div style={{ flexShrink: 0, padding: "12px 24px", borderTop: "1px solid var(--color-border-light)" }}>
          <EmployeeStatusActions
            employee={employee}
            canEdit={employee.status === "active" || employee.status === "benched"}
            pendingInvitation={canManageEmployees ? pendingInviteByEmployeeId.get(employee.id) : undefined}
            onBench={onBench}
            onActivate={onActivate}
            onTerminate={onDelete}
            onRevokeAccess={canManageEmployees ? onRevokeAccess : undefined}
            onInvite={canManageEmployees && orgId ? onInvite : undefined}
            onRevoke={canManageEmployees ? onRevoke : undefined}
            variant="panel"
          />
        </div>
      </div>
    </>,
    document.body
  );
}
