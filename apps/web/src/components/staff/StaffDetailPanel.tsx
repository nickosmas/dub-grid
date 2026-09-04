"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { Button } from "@/components/Button";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { OrganizationRole } from "@/types";
import { Employee, FocusArea, NamedItem, Invitation } from "@/types";
import { isSelfAction } from "@dubgrid/domain";
import { useAuth } from "@/components/AuthProvider";
import { getInitials, getEmployeeDisplayName } from "@/lib/utils";
import { getEmployeeProfileHref, isCurrentUsersEmployee } from "@/lib/profile-links";
import InlineEditEmployee, { type EditEmployeePanelHandle } from "@/components/EditEmployeePanel";
import { CloseButton } from "@/components/ui/CloseButton";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { InlineRoleSelect } from "./InlineRoleSelect";
import { PendingInvitationBanner } from "./PendingInvitationBanner";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { EmployeeStatusActions } from "@/components/staff-detail/EmployeeStatusActions";
import { getAvatarTone, resolveAvatarSeed } from "@dubgrid/design-tokens";
import { useIsInSandbox } from "@/hooks";

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
  /** Called instead of `onSave` when the admin confirms changing the email
   *  while a pending invitation exists — see EditEmployeePanel. */
  onSaveWithReinvite?: (
    updatedEmployee: Employee,
    oldInvitation: Invitation,
  ) => void | Promise<void>;
  onRemove: (empId: string, note?: string) => void;
  onDeactivate: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onClose: () => void;
  onInvite?: (emp: Employee) => void;
  /** Org access tier, matching the directory table's Access column. */
  orgRole?: OrganizationRole | null;
  onRoleChange?: (newRole: OrganizationRole) => Promise<void>;
  canManageManagementAccess?: boolean;
  hasManagementAccess?: boolean;
  hasPendingManagementInvite?: boolean;
  onManageManagementAccess?: (emp: Employee) => void;
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
  departments,
  departmentLabel,
  canManageEmployees,
  orgId,
  pendingInviteByEmployeeId,
  onSave,
  onSaveWithReinvite,
  onRemove,
  onDeactivate,
  onActivate,
  onClose,
  onInvite,
  orgRole,
  onRoleChange,
  canManageManagementAccess,
  hasManagementAccess,
  hasPendingManagementInvite,
  onManageManagementAccess,
  onRevoke,
}: StaffDetailPanelProps) {
  const { user: currentUser } = useAuth();
  const { resolvedTheme } = useTheme();
  const isInSandbox = useIsInSandbox();
  const isSelf = isSelfAction(currentUser?.id, employee.userId);
  const avatarTone = getAvatarTone(resolveAvatarSeed(employee), resolvedTheme === "dark");
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditEmployeePanelHandle>(null);
  const [open, setOpen] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditorSaveBlocked, setIsEditorSaveBlocked] = useState(false);
  const onCloseRef = useLatestRef(onClose);
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
  const showSendInviteAction = showInviteActions && !pendingInvitation;
  const showEmploymentStatusActions = canManageEmployees && !isSelf;
  // Access, management access, and the status action read as one row of things
  // you do to this person, so they sit side by side rather than stacked. The
  // access slot is always present: "no app access" is itself the answer for
  // someone with no login, and a missing control reads as a broken row.
  const profileHref = getEmployeeProfileHref(employee.id, employee.userId, currentUser?.id ?? null);
  // Only staff managers can open the full /people/[id] page (mirrors the
  // table's name-link gate); the self link just goes to /profile.
  const showProfileLink =
    canManageEmployees || isCurrentUsersEmployee(employee.userId, currentUser?.id ?? null);

  const closePanel = useCallback(() => {
    setOpen(false);
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

  const handleReinvite =
    onInvite && pendingInvitation
      ? async () => {
          if (onRevoke) {
            const result = await onRevoke(pendingInvitation.id);
            if (result === false) return;
          }
          onInvite(employee);
        }
      : undefined;

  // Reset scroll when switching employees
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [employee.id]);

  useEffect(() => {
    setHasUnsavedChanges(false);
    setIsEditorSaveBlocked(false);
    setOpen(true);
  }, [employee.id]);

  const statusLabel = employee.status.charAt(0).toUpperCase() + employee.status.slice(1);

  const handleFooterDismiss = useCallback(() => {
    if (!canEditEmployee) {
      handleRequestClose();
      return;
    }
    if (hasUnsavedChanges) {
      editorRef.current?.requestDismiss();
    } else {
      handleRequestClose();
    }
  }, [canEditEmployee, hasUnsavedChanges, handleRequestClose]);

  const handleFooterSave = useCallback(() => {
    editorRef.current?.save();
  }, []);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleRequestClose();
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onCloseRef.current();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 overflow-hidden bg-[var(--dg-color-surface)] shadow-[var(--shadow-panel)] data-[side=right]:inset-y-auto data-[side=right]:top-3 data-[side=right]:right-3 data-[side=right]:bottom-3 data-[side=right]:h-auto data-[side=right]:w-[min(560px,calc(100vw-24px))] data-[side=right]:rounded-[var(--dg-radius-lg)] data-[side=right]:border data-[side=right]:border-[var(--dg-color-border)] data-[side=right]:sm:max-w-none max-[767px]:data-[side=right]:inset-0 max-[767px]:data-[side=right]:h-full max-[767px]:data-[side=right]:w-full max-[767px]:data-[side=right]:rounded-none max-[767px]:data-[side=right]:border-0 max-[767px]:data-[side=right]:shadow-none"
      >
        {/* Panel header */}
        <div className="staff-detail-header">
          <div className="flex w-full items-center justify-end gap-2">
            <CloseButton size="md" onClick={handleRequestClose} aria-label="Close detail panel" />
          </div>

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
                fontWeight: 600,
                color: avatarTone.textColor,
                flexShrink: 0,
                border: `1px solid ${avatarTone.borderColor}`,
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
                    color: "var(--dg-color-text-primary)",
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
                      color: "var(--dg-color-text-muted)",
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
                      color: "var(--dg-color-text-faint)",
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
                    color: "var(--dg-color-link)",
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
            {orgRole ? (
              <div className="shrink-0">
                <InlineRoleSelect
                  orgRole={orgRole}
                  onChange={onRoleChange}
                  isSelf={isSelf}
                  pendingInvitationEmail={pendingInvitation?.email}
                />
              </div>
            ) : (
              <span className="shrink-0 text-[13px] font-medium text-[var(--dg-color-text-muted)]">
                No app access
              </span>
            )}
          </div>
        </div>

        {/* Editable body - nothing commits until the owning editor saves. */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
          <InlineEditEmployee
            employee={employee}
            orgId={orgId}
            focusAreas={focusAreas}
            certifications={certifications}
            roles={roles}
            roleLabel={roleLabel}
            focusAreaLabel={focusAreaLabel}
            certificationLabel={certificationLabel}
            departments={departments}
            departmentLabel={departmentLabel}
            isManagementUser={hasManagementAccess}
            ref={editorRef}
            hideActions
            onSave={onSave}
            onCancel={handleRequestClose}
            onDirtyChange={setHasUnsavedChanges}
            onSaveBlockedChange={setIsEditorSaveBlocked}
            pendingInvitation={pendingInvitation}
            onSaveWithReinvite={onSaveWithReinvite}
          />
          <div
            style={{
              padding: "16px 24px 20px",
              borderTop: "1px solid var(--dg-color-border-light)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {pendingInvitation && onRevoke && (
              <PendingInvitationBanner
                pendingInvitation={pendingInvitation}
                onReinvite={handleReinvite}
                onRevoke={onRevoke}
                isInSandbox={isInSandbox}
              />
            )}
            {(showSendInviteAction ||
              showManagementAccessAction ||
              showEmploymentStatusActions) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {showSendInviteAction && onInvite && (
                  <Button
                    onClick={() => onInvite(employee)}
                    disabled={isInSandbox}
                    className="dg-btn dg-btn-secondary flex-1 basis-[150px]"
                    title={
                      isInSandbox
                        ? "Sending invitations isn't available in sandbox mode."
                        : undefined
                    }
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
                  </Button>
                )}
                {showManagementAccessAction && onManageManagementAccess && (
                  <Button
                    onClick={() => onManageManagementAccess(employee)}
                    className="dg-btn dg-btn-secondary flex-1 basis-[150px]"
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
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    {hasManagementAccess || hasPendingManagementInvite
                      ? "Edit Management Access"
                      : "Add to Management"}
                  </Button>
                )}
                {showEmploymentStatusActions && (
                  <div className="flex-1 basis-[150px]">
                    <EmployeeStatusActions
                      employee={employee}
                      canEdit={canManageEmployees}
                      isSelf={false}
                      onDeactivate={onDeactivate}
                      onActivate={onActivate}
                      onRemove={onRemove}
                      variant="page"
                      fillWidth
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            flexShrink: 0,
            padding: "16px 24px",
            borderTop: "1px solid var(--dg-color-border-light)",
          }}
        >
          <EditorActionRow
            secondaryAction={
              <Button onClick={handleFooterDismiss} className="dg-btn dg-btn-secondary">
                {canEditEmployee
                  ? getEditorDismissLabel({ hasUnsavedChanges })
                  : EDITOR_ACTION_LABELS.close}
              </Button>
            }
            primaryAction={
              canEditEmployee ? (
                <Button
                  onClick={handleFooterSave}
                  disabled={!hasUnsavedChanges || isEditorSaveBlocked}
                  className="dg-btn dg-btn-primary"
                >
                  {EDITOR_ACTION_LABELS.save}
                </Button>
              ) : undefined
            }
          />
        </div>
      </SheetContent>
      {unsavedChangesDialog}
    </Sheet>
  );
}
