"use client";
import type { PlannedChange, SuspensionDates } from "@/features/employees/client";
import { ChevronRight } from "lucide-react";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSlideoverClose, useSlideoverEscape } from "@/hooks/useSlideoverClose";
import { Button } from "@/components/Button";
import { useTheme } from "next-themes";
import Link from "next/link";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import type { AdminPermissions, OrganizationRole } from "@/types";
import { AbsenceType, Employee, FocusArea, NamedItem, Invitation } from "@/types";
import type { StepUpRun } from "@/hooks/useStepUpAction";
import { canOffboardAtTier, isSelfAction } from "@dubgrid/domain";
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
import { StaffPanelFooter } from "./StaffPanelFooter";
import {
  EmployeeStatusActions,
  StatusCardActions,
} from "@/components/staff-detail/EmployeeStatusActions";
import { EmployeeStatusCard } from "@/components/staff-detail/EmployeeStatusCard";
import { InvitationCard } from "@/components/staff-detail/InvitationCard";
import type { PersonAccountState } from "@/lib/person-account-state";
import { StatusMarkIcon } from "@/components/staff-detail/StatusMarkIcon";
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
  /** Whether they can sign in, and if not where their invitation stands, for the invite card. */
  accountState?: PersonAccountState | null;
  onSave: (emp: Employee) => boolean | Promise<boolean>;
  /** Called instead of `onSave` when the admin confirms changing the email
   *  while a pending invitation exists — see EditEmployeePanel. */
  onSaveWithReinvite?: (
    updatedEmployee: Employee,
    oldInvitation: Invitation,
    runStepUp: StepUpRun,
  ) => boolean | Promise<boolean>;
  onRemove: (empId: string, note?: string, lastDay?: string) => void | Promise<boolean>;
  onDeactivate: (
    empId: string,
    note?: string,
    returnDate?: string | null,
    absenceTypeId?: number | null,
    startDate?: string | null,
  ) => void | Promise<boolean>;
  /** Sets, moves or clears (null) an Away person's return date and the absence their days hold. */
  onSetReturnDate?: (
    empId: string,
    returnDate: string | null,
    absenceTypeId?: number | null,
  ) => void | Promise<unknown>;
  /** Live absence types, offered for an Away person's days. */
  absenceTypes?: readonly AbsenceType[];
  /** Restores or marks them active now, or with `startDate` (51l) restores them on that day. */
  onActivate: (empId: string, startDate?: string) => void | Promise<unknown>;
  /** Gives a suspended person their access back (51c). */
  onReinstate?: (empId: string) => void | Promise<unknown>;
  /** Suspends someone's access (51c). */
  onSuspend?: (empId: string, dates?: SuspensionDates) => void | Promise<unknown>;
  /** Sets, moves or clears (null) a suspended person's end date (51g3). */
  onSetSuspendedUntil?: (empId: string, until: string | null) => void | Promise<unknown>;
  /** Moves or changes a planned Away, or cancels it (null) (51g1). */
  onSetPlannedChange?: (empId: string, plan: PlannedChange | null) => void | Promise<unknown>;
  statusStepUpOpen?: boolean;
  onClose: () => void;
  onInvite?: (emp: Employee) => void;
  /** Org access tier, matching the directory table's Access column. */
  orgRole?: OrganizationRole | null;
  onRoleChange?: (newRole: OrganizationRole, accessToken?: string) => Promise<void>;
  /** The permission set behind an admin's `orgRole`, for the on-panel launcher. */
  adminPermissions?: AdminPermissions | null;
  onPermissionsChange?: (permissions: AdminPermissions, accessToken?: string) => Promise<void>;
  canManageManagementAccess?: boolean;
  hasManagementAccess?: boolean;
  hasPendingManagementInvite?: boolean;
  onManageManagementAccess?: (emp: Employee) => void;
  onRevoke?: (invitationId: string) => Promise<boolean> | boolean | void;
  onResend?: (invitationId: string) => Promise<boolean> | boolean | void;
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
  accountState = null,
  onSave,
  onSaveWithReinvite,
  onRemove,
  onDeactivate,
  onSetReturnDate,
  absenceTypes,
  onActivate,
  onReinstate,
  onSuspend,
  onSetSuspendedUntil,
  onSetPlannedChange,
  statusStepUpOpen = false,
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
  onResend,
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
  const invitationState =
    canManageEmployees &&
    employee.status !== "removed" &&
    accountState &&
    accountState.kind !== "linked"
      ? accountState
      : null;
  const showManagementAccessAction = Boolean(
    canManageManagementAccess && onManageManagementAccess && employee.status !== "removed",
  );
  const showSendInviteAction = showInviteActions && !pendingInvitation;
  const showEmploymentStatusActions = canManageEmployees && !isSelf;
  const showPermissionsAction = Boolean(onPermissionsChange && orgRole === "admin");
  const showPersonActionFooter = showPermissionsAction || showManagementAccessAction;
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

  const canOffboard = canOffboardAtTier(
    { isSuperAdmin: Boolean(canManageManagementAccess), isGridmaster: false },
    orgRole,
  );
  const statusActions = (label: string) => (
    <EmployeeStatusActions
      employee={employee}
      canEdit={canManageEmployees}
      isSelf={false}
      canOffboard={canOffboard}
      onDeactivate={onDeactivate}
      onSetReturnDate={onSetReturnDate}
      absenceTypes={absenceTypes}
      onActivate={onActivate}
      onReinstate={onReinstate}
      onSuspend={onSuspend}
      onSetSuspendedUntil={onSetSuspendedUntil}
      onSetPlannedChange={onSetPlannedChange}
      onRemove={onRemove}
      stepUpOpen={statusStepUpOpen}
      variant="card"
      label={label}
      focus="plan"
    />
  );
  const cardActions = (
    <StatusCardActions
      employee={employee}
      canEdit={canManageEmployees}
      isSelf={false}
      canOffboard={canOffboard}
      onDeactivate={onDeactivate}
      onSetReturnDate={onSetReturnDate}
      absenceTypes={absenceTypes}
      onActivate={onActivate}
      onReinstate={onReinstate}
      onSuspend={onSuspend}
      onSetSuspendedUntil={onSetSuspendedUntil}
      onSetPlannedChange={onSetPlannedChange}
      onRemove={onRemove}
      stepUpOpen={statusStepUpOpen}
    />
  );

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
          <CloseButton
            size="lg"
            className="staff-detail-header__close"
            onClick={handleRequestClose}
            aria-label="Close detail panel"
          />

          {/* Profile card area */}
          <div className="staff-detail-header__profile">
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
                <span className="dg-overlay-title staff-detail-header__name">
                  {getEmployeeDisplayName(employee)}
                </span>
                <StatusMarkIcon person={employee} size={14} />
                <AccessInsignia orgRole={orgRole} size="lg" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                {employee.email && (
                  <span
                    style={{
                      fontSize: "var(--dg-fs-body-sm)",
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
                      fontSize: "var(--dg-fs-body-sm)",
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
            ) : null}
          </div>
        </div>

        {/* Editable body - nothing commits until the owning editor saves. */}
        <div
          ref={scrollRef}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 20 }}
        >
          <div style={{ padding: "16px 20px 0" }}>
            <EmployeeStatusCard
              employee={employee}
              absenceTypes={absenceTypes}
              action={showEmploymentStatusActions ? cardActions : undefined}
              planAction={showEmploymentStatusActions ? statusActions("Edit plan") : undefined}
            />
            {invitationState ? (
              <div style={{ marginTop: 12 }}>
                <InvitationCard
                  state={invitationState}
                  onInvite={showSendInviteAction && onInvite ? () => onInvite(employee) : undefined}
                  onResend={onResend}
                  onRevoke={onRevoke}
                  disabledReason={
                    isInSandbox ? "Invitations aren't available in sandbox mode." : undefined
                  }
                />
              </div>
            ) : null}
          </div>
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
            onSaveCompleted={closePanel}
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
                {/* Permissions belong to the person, not to the management-access
                popup: that popup edits departments and nothing else, on every
                surface, so it is the same popup wherever it opens from. Role
                already lives in the header's inline select, so this renders
                only the permissions launcher. */}
                {(showPermissionsAction || showManagementAccessAction) && (
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
                          ? "Edit management access"
                          : "Add to Management"}
                      </Button>
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
