"use client";
import { ChevronRight } from "lucide-react";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSlideoverClose, useSlideoverEscape } from "@/hooks/useSlideoverClose";
import { Button } from "@/components/Button";
import { useTheme } from "next-themes";
import Link from "next/link";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import type { AdminPermissions, OrganizationRole } from "@/types";
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
import { MemberAccessControls } from "./MemberAccessControls";
import { AccessInsignia } from "./AccessInsignia";
import { PendingInvitationBanner } from "./PendingInvitationBanner";
import { StaffPanelFooter } from "./StaffPanelFooter";
import { EmployeeStatusActions } from "@/components/staff-detail/EmployeeStatusActions";
import { getAvatarTypography, getAvatarTone, resolveAvatarSeed } from "@dubgrid/design-tokens";
import { useIsInSandbox } from "@/hooks";

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
  /** The permission set behind an admin's `orgRole`, for the on-panel launcher. */
  adminPermissions?: AdminPermissions | null;
  onPermissionsChange?: (permissions: AdminPermissions) => Promise<void>;
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
  adminPermissions,
  onPermissionsChange,
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditorSaveBlocked, setIsEditorSaveBlocked] = useState(false);
  const { closing, close: closePanel } = useSlideoverClose(onClose, { escape: false });
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
  const showPendingInvitationActions = Boolean(pendingInvitation && onRevoke);
  const showPermissionsAction = Boolean(onPermissionsChange && orgRole === "admin");
  const showPersonActionFooter =
    showPendingInvitationActions ||
    showPermissionsAction ||
    showSendInviteAction ||
    showManagementAccessAction ||
    showEmploymentStatusActions;
  // Person actions are a single, predictable two-column grid. The final action
  // spans both columns when the count is odd, so buttons remain symmetrical
  // whether an organization exposes one, two, three, or more actions.
  const profileHref = getEmployeeProfileHref(employee.id, employee.userId, currentUser?.id ?? null);
  // Only staff managers can open the full /people/[id] page (mirrors the
  // table's name-link gate); the self link just goes to /profile.
  const showProfileLink =
    canManageEmployees || isCurrentUsersEmployee(employee.userId, currentUser?.id ?? null);

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

  useSlideoverEscape(handleRequestClose);

  useEffect(() => {
    setHasUnsavedChanges(false);
    setIsEditorSaveBlocked(false);
  }, [employee.id]);

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

  // Returns the save promise so the footer button latches on it. The editor's
  // own inline Save passes its handler straight through and always spun; this
  // one dropped the promise, so the same operation had two different buttons.
  const handleFooterSave = useCallback(() => editorRef.current?.save(), []);

  return createPortal(
    <>
      <div
        className={`dg-panel-overlay${closing ? " closing" : ""}`}
        onClick={handleRequestClose}
      />
      <div
        className={`dg-panel dg-panel--wide${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Staff detail"
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
                ...getAvatarTypography(44),
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: avatarTone.backgroundColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
                <AccessInsignia orgRole={orgRole} size="md" />
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
                  <ChevronRight size={10} strokeWidth={2.5} />
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
        <div
          ref={scrollRef}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 20 }}
        >
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
        </div>

        <StaffPanelFooter
          actions={
            showPersonActionFooter ? (
              <div className="flex flex-col gap-3">
                {pendingInvitation && onRevoke && (
                  <PendingInvitationBanner
                    pendingInvitation={pendingInvitation}
                    onReinvite={handleReinvite}
                    onRevoke={onRevoke}
                    isInSandbox={isInSandbox}
                  />
                )}
                {/* Permissions belong to the person, not to the management-access
                popup: that popup edits departments and nothing else, on every
                surface, so it is the same popup wherever it opens from. Role
                already lives in the header's inline select, so this renders
                only the permissions launcher. */}
                {(showPermissionsAction ||
                  showSendInviteAction ||
                  showManagementAccessAction ||
                  showEmploymentStatusActions) && (
                  <div
                    data-slot="staff-person-actions"
                    className="grid grid-cols-2 items-stretch gap-2 [&>:last-child:nth-child(odd)]:col-span-2"
                  >
                    {showPermissionsAction && (
                      <MemberAccessControls
                        orgRole={orgRole}
                        adminPermissions={adminPermissions}
                        onPermissionsChange={onPermissionsChange}
                        labels={{ focusAreaLabel, certificationLabel, roleLabel }}
                        permissionActionClassName="w-full"
                      />
                    )}
                    {showSendInviteAction && onInvite && (
                      <Button
                        onClick={() => onInvite(employee)}
                        disabled={isInSandbox}
                        className="dg-btn dg-btn-secondary w-full"
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
                        className="dg-btn dg-btn-secondary w-full"
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
                      <div className="w-full">
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
            ) : undefined
          }
          editorActions={
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
          }
        />
        <ScrollOverflowCue />
      </div>
      {unsavedChangesDialog}
    </>,
    document.body,
  );
}
