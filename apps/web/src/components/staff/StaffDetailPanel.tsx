"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Employee,
  FocusArea,
  NamedItem,
  Invitation,
  OrganizationRole,
  AdminPermissions,
} from "@/types";
import { isSelfAction } from "@dubgrid/domain";
import { useAuth } from "@/components/AuthProvider";
import { getInitials, getEmployeeDisplayName } from "@/lib/utils";
import { getEmployeeProfileHref, isCurrentUsersEmployee } from "@/lib/profile-links";
import InlineEditEmployee, { type EditEmployeePanelHandle } from "@/components/EditEmployeePanel";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { ButtonLoading } from "@/components/ButtonSpinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { MemberAccessControls } from "./MemberAccessControls";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { EmployeeStatusActions } from "@/components/staff-detail/EmployeeStatusActions";
import { getAvatarTone } from "@dubgrid/design-tokens";

function statusTone(status: Employee["status"]): StatusPillTone {
  if (status === "inactive") return "warning";
  if (status === "removed") return "danger";
  return "success";
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
  onRemove: (empId: string, note?: string) => void;
  onDeactivate: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onClose: () => void;
  onInvite?: (emp: Employee) => void;
  canManageManagementAccess?: boolean;
  hasManagementAccess?: boolean;
  hasPendingManagementInvite?: boolean;
  onManageManagementAccess?: (emp: Employee) => void;
  onRevoke?: (invitationId: string) => Promise<boolean> | boolean | void;
  orgRole?: OrganizationRole | null;
  adminPermissions?: AdminPermissions | null;
  onRoleChange?: (newRole: OrganizationRole) => Promise<void>;
  onPermissionsChange?: (perms: AdminPermissions) => Promise<void>;
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
  onRemove,
  onDeactivate,
  onActivate,
  onClose,
  onInvite,
  canManageManagementAccess,
  hasManagementAccess,
  hasPendingManagementInvite,
  onManageManagementAccess,
  onRevoke,
  orgRole,
  adminPermissions,
  onRoleChange,
  onPermissionsChange,
}: StaffDetailPanelProps) {
  const { user: currentUser } = useAuth();
  const { resolvedTheme } = useTheme();
  const isSelf = isSelfAction(currentUser?.id, employee.userId);
  const avatarTone = getAvatarTone(employee.id, resolvedTheme === "dark");
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditEmployeePanelHandle>(null);
  const [closing, setClosing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [revokingInvite, setRevokingInvite] = useState(false);
  const [pendingInvitationAction, setPendingInvitationAction] = useState<
    "reinvite" | "revoke" | null
  >(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const pendingInvitation = canManageEmployees
    ? pendingInviteByEmployeeId.get(employee.id)
    : undefined;
  const canEditEmployee = employee.status === "active" || employee.status === "inactive";
  const showInviteActions =
    canEditEmployee &&
    canManageEmployees &&
    !employee.userId &&
    Boolean(employee.email) &&
    Boolean(pendingInvitation || (orgId && onInvite));
  const showManagementAccessAction = Boolean(
    canManageManagementAccess && onManageManagementAccess && employee.status !== "removed",
  );
  const showAccountAccessActions = showInviteActions || showManagementAccessAction;
  const profileHref = getEmployeeProfileHref(employee.id, employee.userId, currentUser?.id ?? null);
  // Only staff managers can open the full /people/[id] page (mirrors the
  // table's name-link gate); the self link just goes to /profile.
  const showProfileLink =
    canManageEmployees || isCurrentUsersEmployee(employee.userId, currentUser?.id ?? null);

  const closePanel = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onCloseRef.current();
    }, 200);
  }, []);
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges,
    onDiscard: closePanel,
  });

  const handleRequestClose = useCallback(() => {
    if (requestClose()) {
      closePanel();
    }
  }, [closePanel, requestClose]);

  const handleConfirmInvitationAction = async () => {
    if (!pendingInvitation || !pendingInvitationAction) return;

    if (onRevoke) {
      setRevokingInvite(true);
      try {
        const result = await onRevoke(pendingInvitation.id);
        if (result === false) return;
      } finally {
        setRevokingInvite(false);
      }
    }

    if (pendingInvitationAction === "reinvite" && onInvite) {
      onInvite(employee);
    }

    setPendingInvitationAction(null);
  };

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleRequestClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleRequestClose]);

  // Reset scroll when switching employees
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [employee.id]);

  useEffect(() => {
    setHasUnsavedChanges(false);
  }, [employee.id]);

  const statusLabel = employee.status.charAt(0).toUpperCase() + employee.status.slice(1);

  return createPortal(
    <>
      <div
        className={`staff-detail-overlay${closing ? " closing" : ""}`}
        onClick={handleRequestClose}
      />
      <div className={`staff-detail-pane${closing ? " closing" : ""}`}>
        {/* Panel header */}
        <div className="staff-detail-header">
          <button
            className="staff-detail-close"
            onClick={handleRequestClose}
            aria-label="Close detail panel"
          >
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
          <div
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", paddingTop: 4 }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: avatarTone.backgroundColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--dg-fs-body)",
                fontWeight: 800,
                color: avatarTone.textColor,
                flexShrink: 0,
                border: `2px solid ${avatarTone.borderColor}`,
              }}
            >
              {getInitials(getEmployeeDisplayName(employee))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "var(--dg-fs-body)",
                    color: "var(--color-text-primary)",
                    letterSpacing: "-0.01em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {getEmployeeDisplayName(employee)}
                </span>
                <StatusPill
                  tone={statusTone(employee.status)}
                  className="shrink-0"
                  aria-label={`Status: ${statusLabel}`}
                >
                  {statusLabel}
                </StatusPill>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                {employee.email && (
                  <span
                    style={{
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--color-text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {employee.email}
                  </span>
                )}
                {employee.phone && (
                  <span
                    style={{
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--color-text-faint)",
                      flexShrink: 0,
                    }}
                  >
                    {employee.phone}
                  </span>
                )}
              </div>
              {showProfileLink && (
                <Link
                  href={profileHref}
                  onClick={(event) => {
                    // Close the panel as part of this click instead of
                    // leaving it for the route swap to yank away — same
                    // unsaved-changes guard as the X button/Escape.
                    if (hasUnsavedChanges) {
                      event.preventDefault();
                      handleRequestClose();
                      return;
                    }
                    closePanel();
                  }}
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
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </Link>
              )}
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
            ref={editorRef}
            hideActions
            onSave={onSave}
            onCancel={closePanel}
            onDirtyChange={setHasUnsavedChanges}
          />
          {showAccountAccessActions && (
            <div
              style={{
                padding: "0 24px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  color: "var(--color-text-subtle)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Account access
              </div>
              {pendingInvitation ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    background: "var(--color-warning-bg)",
                    border: "1px solid var(--color-warning-border)",
                    borderRadius: "var(--dg-radius-lg)",
                    padding: "10px 14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-warning-text)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flexShrink: 0 }}
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-caption)",
                          fontWeight: 600,
                          color: "var(--color-warning-text)",
                        }}
                      >
                        Invitation pending
                      </div>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--color-warning-text)",
                          marginTop: 1,
                        }}
                      >
                        Sent to {pendingInvitation.email}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {onInvite && (
                      <button
                        disabled={revokingInvite}
                        onClick={() => setPendingInvitationAction("reinvite")}
                        className="dg-btn dg-btn-ghost dg-btn-xs"
                        style={{
                          color: "var(--color-link)",
                        }}
                      >
                        <ButtonLoading loading={revokingInvite} spinnerSize={12}>
                          Reinvite
                        </ButtonLoading>
                      </button>
                    )}
                    {onRevoke && (
                      <button
                        disabled={revokingInvite}
                        onClick={() => setPendingInvitationAction("revoke")}
                        className="dg-btn dg-btn-ghost dg-btn-xs"
                        style={{
                          color: "var(--color-danger)",
                        }}
                      >
                        <ButtonLoading loading={revokingInvite} spinnerSize={12}>
                          Revoke
                        </ButtonLoading>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                showInviteActions &&
                onInvite && (
                  <button
                    onClick={() => onInvite(employee)}
                    className="dg-btn dg-btn-secondary"
                    style={{
                      width: "100%",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    Send Invitation
                  </button>
                )
              )}
              {showManagementAccessAction && onManageManagementAccess && (
                <button
                  onClick={() => onManageManagementAccess(employee)}
                  className="dg-btn dg-btn-secondary"
                  style={{ width: "100%" }}
                >
                  {hasManagementAccess || hasPendingManagementInvite
                    ? "Edit Management Access"
                    : "Add to Management"}
                </button>
              )}
              <MemberAccessControls
                orgRole={orgRole}
                adminPermissions={adminPermissions}
                onRoleChange={onRoleChange}
                onPermissionsChange={onPermissionsChange}
                isSelf={isSelf}
              />
            </div>
          )}
          {canManageEmployees && (
            <div
              style={{
                padding: "0 24px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  color: "var(--color-text-subtle)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Staff status
              </div>
              <EmployeeStatusActions
                employee={employee}
                canEdit={canManageEmployees}
                isSelf={isSelf}
                onDeactivate={onDeactivate}
                onActivate={onActivate}
                onRemove={onRemove}
                variant="panel"
              />
            </div>
          )}
        </div>

        {/* Sticky bottom actions */}
        <div
          style={{
            flexShrink: 0,
            padding: "16px 24px",
            borderTop: "1px solid var(--color-border-light)",
          }}
        >
          {canEditEmployee ? (
            <EditorActionRow
              secondaryAction={
                <button
                  onClick={() => editorRef.current?.requestDismiss()}
                  className="dg-btn dg-btn-secondary"
                >
                  {getEditorDismissLabel({ hasUnsavedChanges })}
                </button>
              }
              primaryAction={
                <button
                  onClick={() => editorRef.current?.save()}
                  disabled={!hasUnsavedChanges}
                  className="dg-btn dg-btn-primary"
                >
                  {EDITOR_ACTION_LABELS.save}
                </button>
              }
            />
          ) : (
            <EditorActionRow
              secondaryAction={
                <button onClick={handleRequestClose} className="dg-btn dg-btn-secondary">
                  {EDITOR_ACTION_LABELS.close}
                </button>
              }
            />
          )}
        </div>
      </div>
      {unsavedChangesDialog}
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
          isLoading={revokingInvite}
          onConfirm={() => {
            void handleConfirmInvitationAction();
          }}
          onCancel={() => {
            if (!revokingInvite) setPendingInvitationAction(null);
          }}
        />
      )}
    </>,
    document.body,
  );
}
