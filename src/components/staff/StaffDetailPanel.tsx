"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Employee, FocusArea, NamedItem, Invitation } from "@/types";
import { getInitials, getEmployeeDisplayName } from "@/lib/utils";
import InlineEditEmployee from "@/components/EditEmployeePanel";

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
}

export function StaffDetailPanel({
  employee,
  focusAreas,
  certifications,
  roles,
  roleLabel,
  focusAreaLabel,
  certificationLabel,
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
}: StaffDetailPanelProps) {
  const router = useRouter();
  const hue = hashCode(employee.id) % 360;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  return (
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", paddingTop: 4 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: `hsl(${hue}, 65%, 94%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--dg-fs-heading)",
                fontWeight: 800,
                color: `hsl(${hue}, 60%, 38%)`,
                flexShrink: 0,
                border: `2px solid hsl(${hue}, 55%, 86%)`,
                boxShadow: `0 0 0 4px hsl(${hue}, 50%, 96%)`,
              }}
            >
              {getInitials(getEmployeeDisplayName(employee))}
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: "var(--dg-fs-title)", color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
                {getEmployeeDisplayName(employee)}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  marginTop: 6,
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: statusConfig.bg,
                  color: statusConfig.text,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusConfig.dot, flexShrink: 0 }} />
                {employee.status.charAt(0).toUpperCase() + employee.status.slice(1)}
              </div>
            </div>
            {(employee.email || employee.phone) && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                {employee.email && (
                  <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", letterSpacing: "-0.01em" }}>
                    {employee.email}
                  </span>
                )}
                {employee.phone && (
                  <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>
                    {employee.phone}
                  </span>
                )}
              </div>
            )}
            <Link
              href={`/staff/${employee.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                marginTop: 12,
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                color: "var(--color-link)",
                textDecoration: "none",
                padding: "4px 12px",
                borderRadius: 20,
                background: "var(--color-info-bg)",
                border: "1px solid var(--color-info-border)",
                cursor: "pointer",
                transition: "opacity 150ms ease",
              }}
            >
              View full profile
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </Link>
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
            onSave={onSave}
            onDelete={onDelete}
            onBench={(empId, note) => onBench(empId, note)}
            onActivate={(empId) => onActivate(empId)}
            onCancel={handleClose}
            onInvite={canManageEmployees && orgId ? onInvite : undefined}
            pendingInvitation={canManageEmployees ? pendingInviteByEmployeeId.get(employee.id) : undefined}
            onRevoke={canManageEmployees ? onRevoke : undefined}
          />
        </div>
      </div>
    </>
  );
}
