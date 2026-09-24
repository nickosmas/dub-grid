"use client";
import { ChevronRight, Clock } from "lucide-react";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSlideoverClose, useSlideoverEscape } from "@/hooks/useSlideoverClose";
import { Button } from "@/components/Button";
import { useTheme } from "next-themes";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AdminPermissions, DirectoryPerson, NamedItem, OrganizationRole } from "@/types";
import { getInitials, formatRelativeTime, getDirectoryPersonAvatarSeed } from "@/lib/utils";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { validatePhone, validateRequired } from "@/components/FormField";
import {
  getOptionalStaffEmailError,
  normalizeOptionalStaffEmail,
  normalizeOptionalUsPhone,
  normalizeStaffName,
} from "@dubgrid/contracts";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { MaybeHint } from "@/components/ui/hint";
import { SelectableTag } from "@/components/ui/selectable-tag";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { MemberAccessControls } from "./MemberAccessControls";
import { InlineRoleSelect } from "./InlineRoleSelect";
import { AccessInsignia } from "./AccessInsignia";
import { StaffPanelFooter } from "./StaffPanelFooter";
import { getAvatarTypography, getAvatarTone } from "@dubgrid/design-tokens";
import { hasSavedScheduleAssignment } from "./capability-state";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: "var(--dg-color-brand-bg)", text: "var(--dg-color-brand)" },
  admin: { bg: "var(--dg-color-brand-bg)", text: "var(--dg-color-brand)" },
  user: { bg: "var(--dg-color-border-light)", text: "var(--dg-color-text-muted)" },
};

interface ManagementStaffDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  managementDepartmentIds: number[];
}

function normalizeManagementStaffDraft(draft: ManagementStaffDraft): ManagementStaffDraft {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    managementDepartmentIds: [...draft.managementDepartmentIds],
  };
}

function getManagementStaffDraft(person: DirectoryPerson): ManagementStaffDraft {
  return normalizeManagementStaffDraft({
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: person.phone,
    managementDepartmentIds: person.managementDepartmentIds,
  });
}

interface ManagementStaffPanelProps {
  person: DirectoryPerson;
  /** The real employees.email column value (not person.email, which falls
   *  back to a linked auth user's or a pending invitation's email when the
   *  contact email is blank). Null when there's no employees row yet (a
   *  pure pending invitation). employees.email is the single source of
   *  truth for this person's email once set, so the field is read-only
   *  whenever this is non-blank. */
  contactEmail: string | null;
  departments: NamedItem[];
  /** Label for management departments on the access roster. */
  departmentLabel: string;
  canManageScheduleEmployees: boolean;
  canManageManagementAccess: boolean;
  onClose: () => void;
  onSave: (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    managementDepartmentIds: number[];
  }) => Promise<boolean>;
  /** Resolves false when the revoke did not go ahead, so the panel stays open. */
  onRevokeInvitation?: (invitationId: string) => Promise<boolean | void>;
  onResendInvitation?: (invitationId: string) => Promise<void>;
  /** Change the linked member's org role. Provided only when the viewer may
   *  manage access and the person has an editable membership. */
  onRoleChange?: (newRole: OrganizationRole) => Promise<void>;
  /** Save the admin member's permission matrix. Provided only when the viewer
   *  may manage access and the person has an editable membership. */
  onPermissionsChange?: (perms: AdminPermissions) => Promise<void>;
  onAddToSchedule?: (person: DirectoryPerson) => void;
  /** True when this panel's subject is the current user — destructive
   *  self-actions (role change, status, remove from management) are hidden. */
  isSelf?: boolean;
}

export function ManagementStaffPanel({
  person,
  contactEmail,
  departments,
  departmentLabel,
  canManageScheduleEmployees,
  canManageManagementAccess,
  onClose,
  onSave,
  onRevokeInvitation,
  onResendInvitation,
  onRoleChange,
  onPermissionsChange,
  onAddToSchedule,
  isSelf = false,
}: ManagementStaffPanelProps) {
  const { resolvedTheme } = useTheme();
  const { closing, close: closePanel } = useSlideoverClose(onClose, { escape: false });

  // employees.email (when present) is the single source of truth — it
  // overrides person.email, which falls back to a linked auth user's or a
  // pending invitation's email when the contact email is blank and would
  // otherwise show a value here that isn't actually this person's contact
  // email on file.
  const effectiveEmail = contactEmail ?? person.email;
  const emailReadOnly = !!contactEmail;

  const [firstName, setFirstName] = useState(person.firstName);
  const [lastName, setLastName] = useState(person.lastName);
  const [email, setEmail] = useState(effectiveEmail);
  const [phone, setPhone] = useState(person.phone);
  const [deptIds, setDeptIds] = useState<number[]>(person.managementDepartmentIds);
  const [savedDraft, setSavedDraft] = useState<ManagementStaffDraft>(() => ({
    ...getManagementStaffDraft(person),
    email: effectiveEmail.trim(),
  }));
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [resending, setResending] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const personDraft = useMemo(
    () =>
      normalizeManagementStaffDraft({
        firstName: person.firstName,
        lastName: person.lastName,
        email: effectiveEmail,
        phone: person.phone,
        managementDepartmentIds: person.managementDepartmentIds,
      }),
    [
      person.firstName,
      person.lastName,
      effectiveEmail,
      person.phone,
      person.managementDepartmentIds,
    ],
  );

  // Reset form when person changes
  useEffect(() => {
    setFirstName(personDraft.firstName);
    setLastName(personDraft.lastName);
    setEmail(personDraft.email);
    setPhone(personDraft.phone);
    setDeptIds([...personDraft.managementDepartmentIds]);
    setSavedDraft(personDraft);
    setTouched({});
  }, [person.personId, personDraft]);

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const currentDraft = normalizeManagementStaffDraft({
    firstName,
    lastName,
    email,
    phone,
    managementDepartmentIds: deptIds,
  });
  const hasChanges =
    currentDraft.firstName !== savedDraft.firstName ||
    currentDraft.lastName !== savedDraft.lastName ||
    currentDraft.email !== savedDraft.email ||
    currentDraft.phone !== savedDraft.phone ||
    JSON.stringify(currentDraft.managementDepartmentIds) !==
      JSON.stringify(savedDraft.managementDepartmentIds);
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: hasChanges,
    onDiscard: closePanel,
  });
  const handleRequestClose = useCallback(() => {
    if (requestClose()) {
      closePanel();
    }
  }, [closePanel, requestClose]);

  const discardChanges = useCallback(() => {
    setFirstName(savedDraft.firstName);
    setLastName(savedDraft.lastName);
    setEmail(savedDraft.email);
    setPhone(savedDraft.phone);
    setDeptIds([...savedDraft.managementDepartmentIds]);
    setTouched({});
  }, [savedDraft]);

  const handleDismissClick = useCallback(() => {
    if (hasChanges) {
      discardChanges();
    } else {
      closePanel();
    }
  }, [closePanel, discardChanges, hasChanges]);

  const dismissLabel = getEditorDismissLabel({ hasUnsavedChanges: hasChanges });

  useSlideoverEscape(handleRequestClose);
  const isPending = person.invitationStatus !== null && !person.hasAppAccess;
  // Sign-in activity is admin telemetry: staff managers and access managers
  // see it, view-only members don't (the directory API redacts it for them
  // anyway; hiding the block avoids a misleading "Never signed in").
  const showLastActive = canManageManagementAccess || canManageScheduleEmployees;
  // `isEmployee` here means "this person already shows up on the schedule
  // grid and edits their identity from the on-schedule profile." It's NOT
  // "has an employees row" — every org member has one of those now (Flow B
  // + seed backfill), so we'd lock management-only users out of their own
  // first/last/dept editing if we keyed off `source === "employee"`. The
  // schedule grid + the People page roster both gate on focusAreaIds, so
  // use that as the source of truth here too.
  const isEmployee = hasSavedScheduleAssignment(person);
  const isOnSchedule = isEmployee;
  const isExpired = person.invitationStatus === "expired";
  // Every org member gets an `employees` row now (Flow B + seed backfill), so
  // this is null only for the rare pending invite that hasn't backfilled yet.
  // Only staff managers can open the full /people/[id] page (mirrors the
  // People table's name-link gate); the self link just goes to /profile.
  const profileHref = person.employeeId
    ? isSelf
      ? "/profile"
      : canManageScheduleEmployees
        ? `/people/${person.employeeId}`
        : null
    : null;
  const showAddToScheduleAction = Boolean(
    canManageScheduleEmployees &&
    !isOnSchedule &&
    person.isManagementUser &&
    person.userId &&
    onAddToSchedule,
  );
  const showResendInvitationAction = Boolean(
    canManageManagementAccess && isPending && !isExpired && onResendInvitation,
  );
  const showRevokeInvitationAction = Boolean(
    canManageManagementAccess && isPending && onRevokeInvitation,
  );
  const showPersonActionFooter =
    showAddToScheduleAction || showResendInvitationAction || showRevokeInvitationAction;
  const fieldErrors = useMemo(
    () => ({
      firstName:
        !isEmployee && touched.firstName ? validateRequired(firstName, "First name") : null,
      lastName: !isEmployee && touched.lastName ? validateRequired(lastName, "Last name") : null,
      // Email is optional everywhere now (so admins can schedule before
      // onboarding). Only complain about formatting when a value is present
      // and the field is actually editable (a locked contact email is
      // already valid by construction).
      email:
        !emailReadOnly && touched.email && email.trim() ? getOptionalStaffEmailError(email) : null,
      phone: touched.phone ? validatePhone(phone) : null,
      managementDepartmentIds:
        !isEmployee && touched.managementDepartmentIds && deptIds.length === 0
          ? "People who are not on the schedule must stay assigned to at least one management department."
          : null,
    }),
    [deptIds.length, email, emailReadOnly, firstName, isEmployee, lastName, phone, touched],
  );

  const toggleDepartment = useCallback(
    (departmentId: number) => {
      markTouched("managementDepartmentIds");
      setDeptIds((prev) =>
        prev.includes(departmentId)
          ? prev.filter((id) => id !== departmentId)
          : [...prev, departmentId],
      );
    },
    [markTouched],
  );

  const handleSave = async () => {
    if (
      !isEmployee &&
      (validateRequired(firstName, "First name") || validateRequired(lastName, "Last name"))
    ) {
      setTouched((prev) => ({
        ...prev,
        firstName: true,
        lastName: true,
      }));
      return;
    }
    if (validatePhone(phone)) {
      setTouched((prev) => ({
        ...prev,
        phone: true,
      }));
      return;
    }
    if (!emailReadOnly && email.trim() && getOptionalStaffEmailError(email)) {
      setTouched((prev) => ({
        ...prev,
        email: true,
      }));
      return;
    }
    const nextDraft = {
      firstName: normalizeStaffName(firstName),
      lastName: normalizeStaffName(lastName),
      email: normalizeOptionalStaffEmail(email),
      phone: normalizeOptionalUsPhone(phone),
      managementDepartmentIds: deptIds,
    };
    if (!isEmployee && (!nextDraft.firstName || !nextDraft.lastName)) {
      setTouched((prev) => ({
        ...prev,
        firstName: true,
        lastName: true,
      }));
      return;
    }
    if (!isEmployee && nextDraft.managementDepartmentIds.length === 0) {
      setTouched((prev) => ({
        ...prev,
        managementDepartmentIds: true,
      }));
      return;
    }
    setSaving(true);
    try {
      const saved = await onSave(nextDraft);
      if (!saved) return;
      setFirstName(nextDraft.firstName);
      setLastName(nextDraft.lastName);
      setEmail(nextDraft.email);
      setPhone(nextDraft.phone);
      setDeptIds([...nextDraft.managementDepartmentIds]);
      setSavedDraft(nextDraft);
      closePanel();
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!isPending || !onRevokeInvitation) return;
    setRevoking(true);
    try {
      // person.personId is "inv:<uuid>" — extract the uuid
      const revoked = await onRevokeInvitation(person.personId.replace("inv:", ""));
      if (revoked !== false) closePanel();
    } finally {
      setRevoking(false);
    }
  };

  const handleResend = async () => {
    if (!onResendInvitation) return;
    setResending(true);
    try {
      await onResendInvitation(person.personId.replace("inv:", ""));
    } finally {
      setResending(false);
    }
  };

  const personDepts = person.managementDepartmentIds
    .map((id) => departments.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => d != null);
  const displayName =
    person.firstName || person.lastName
      ? `${person.firstName} ${person.lastName}`.trim()
      : person.email;
  const initials = getInitials(displayName);
  const avatarTone = getAvatarTone(getDirectoryPersonAvatarSeed(person), resolvedTheme === "dark");

  // Only the invitation states earn a pill. Active/Inactive read as noise on a
  // page about one person, but an invitation nobody has accepted (or one that
  // has expired) is not something the rest of the panel says anywhere.
  const statusConfig = !isPending
    ? null
    : isExpired
      ? {
          bg: "var(--dg-color-danger-bg)",
          text: "var(--dg-color-danger-text)",
          dot: "var(--dg-color-danger)",
          label: "Expired",
        }
      : {
          bg: "var(--dg-color-warning-bg)",
          text: "var(--dg-color-warning-text)",
          dot: "var(--dg-color-warning)",
          label: "Pending",
        };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "var(--dg-type-field-title-size)",
    fontWeight: "var(--dg-type-field-title-weight)",
    color: "var(--dg-type-field-title-color)",
    letterSpacing: "var(--dg-type-field-title-letter-spacing)",
    lineHeight: "var(--dg-type-field-title-line-height)",
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--dg-color-border)",
    borderRadius: "var(--dg-btn-radius)",
    fontSize: "var(--dg-fs-body-sm)",
    color: "var(--dg-color-text-primary)",
    background: "var(--dg-color-surface)",
    outline: "none",
  };

  // Role + permission controls, the same ones StaffDetailPanel renders for
  // on-schedule staff. Self-gates on the callbacks, which the parent passes
  // only to managers.
  const showBodyAccessControl = Boolean(onPermissionsChange && person.orgRole === "admin");
  const accessControls = (
    <MemberAccessControls
      orgRole={person.orgRole}
      adminPermissions={person.adminPermissions}
      onPermissionsChange={onPermissionsChange}
      labelStyle={labelStyle}
      isSelf={isSelf}
      showRole={false}
    />
  );

  return createPortal(
    <>
      <div
        className={`dg-panel-overlay${closing ? " closing" : ""}`}
        onClick={handleRequestClose}
      />
      <div
        className={`dg-panel dg-panel--x-wide${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Management staff detail"
      >
        {/* Header */}
        <div className="staff-detail-header">
          <CloseButton
            size="md"
            className="self-end"
            onClick={handleRequestClose}
            aria-label="Close"
          />

          {/* Profile card */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              paddingTop: 4,
            }}
          >
            <div
              style={{
                ...getAvatarTypography(44),
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: isPending ? "var(--dg-color-surface)" : avatarTone.backgroundColor,
                color: isPending ? "var(--dg-color-text-muted)" : avatarTone.textColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                border: isPending
                  ? "1px solid var(--dg-color-border-light)"
                  : `1px solid ${avatarTone.borderColor}`,
              }}
            >
              {initials}
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
                  {displayName}
                </span>
                <AccessInsignia orgRole={person.orgRole} size="md" />
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {isOnSchedule && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px",
                        borderRadius: 20,
                        fontSize: "var(--dg-fs-footnote)",
                        fontWeight: 600,
                        background: "var(--dg-color-today-bg)",
                        color: "var(--dg-color-today-text)",
                      }}
                    >
                      On Schedule
                    </span>
                  )}
                  {statusConfig && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px",
                        borderRadius: 20,
                        fontSize: "var(--dg-fs-footnote)",
                        fontWeight: 600,
                        background: statusConfig.bg,
                        color: statusConfig.text,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: statusConfig.dot,
                          flexShrink: 0,
                        }}
                      />
                      {statusConfig.label}
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  color: "var(--dg-color-text-muted)",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {person.email}
              </div>
              {profileHref && (
                <Link
                  href={profileHref}
                  onClick={(event) => {
                    // Close the panel as part of this click instead of
                    // leaving it for the route swap to yank away — same
                    // unsaved-changes guard as the X button/Escape.
                    if (hasChanges) {
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
            {onRoleChange && person.orgRole ? (
              <div data-slot="management-header-access" style={{ flexShrink: 0 }}>
                <InlineRoleSelect
                  orgRole={person.orgRole}
                  onChange={onRoleChange}
                  isSelf={isSelf}
                  pendingInvitationEmail={isPending ? effectiveEmail : undefined}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* On-schedule people never reach this panel: MembersSection routes
              them to StaffDetailPanel/StaffReadOnlyDetailPanel instead, so
              every field is editable from whichever list they're opened
              from. This panel only ever handles management-only members and
              pending invites. */}
          {canManageManagementAccess && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label style={labelStyle}>
                    First name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                  </label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onBlur={() => markTouched("firstName")}
                    style={
                      fieldErrors.firstName
                        ? { ...inputStyle, borderColor: "var(--dg-color-danger)" }
                        : inputStyle
                    }
                  />
                  {fieldErrors.firstName && (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        color: "var(--dg-color-danger)",
                        marginTop: 4,
                      }}
                      role="alert"
                    >
                      {fieldErrors.firstName}
                    </div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>
                    Last name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                  </label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    onBlur={() => markTouched("lastName")}
                    style={
                      fieldErrors.lastName
                        ? { ...inputStyle, borderColor: "var(--dg-color-danger)" }
                        : inputStyle
                    }
                  />
                  {fieldErrors.lastName && (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        color: "var(--dg-color-danger)",
                        marginTop: 4,
                      }}
                      role="alert"
                    >
                      {fieldErrors.lastName}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Email{" "}
                  <span style={{ fontWeight: 400, color: "var(--dg-color-text-muted)" }}>
                    (optional)
                  </span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  placeholder="name@example.com"
                  disabled={emailReadOnly}
                  style={
                    fieldErrors.email
                      ? { ...inputStyle, borderColor: "var(--dg-color-danger)" }
                      : inputStyle
                  }
                />
                {emailReadOnly && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--dg-color-text-muted)",
                    }}
                  >
                    This is their contact email from Staff details. Change it there to update it.
                  </div>
                )}
                {fieldErrors.email && (
                  <div
                    style={{
                      color: "var(--dg-color-danger)",
                      fontSize: "var(--dg-fs-footnote)",
                      marginTop: 4,
                    }}
                    role="alert"
                  >
                    {fieldErrors.email}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => {
                    markTouched("phone");
                    if (!validatePhone(phone)) {
                      setPhone(normalizeOptionalUsPhone(phone));
                    }
                  }}
                  placeholder="Optional"
                  style={
                    fieldErrors.phone
                      ? { ...inputStyle, borderColor: "var(--dg-color-danger)" }
                      : inputStyle
                  }
                />
                {fieldErrors.phone && (
                  <div
                    style={{
                      color: "var(--dg-color-danger)",
                      fontSize: "var(--dg-fs-footnote)",
                      marginTop: 4,
                    }}
                    role="alert"
                  >
                    {fieldErrors.phone}
                  </div>
                )}
              </div>

              {departments.length > 0 && (
                <div>
                  <label style={labelStyle}>{departmentLabel}</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {departments.map((department) => (
                      <SelectableTag
                        key={department.id}
                        selected={deptIds.includes(department.id)}
                        onClick={() => toggleDepartment(department.id)}
                        padding="5px 12px"
                      >
                        {department.name}
                      </SelectableTag>
                    ))}
                  </div>
                  {fieldErrors.managementDepartmentIds && (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        color: "var(--dg-color-danger)",
                        marginTop: 4,
                      }}
                      role="alert"
                    >
                      {fieldErrors.managementDepartmentIds}
                    </div>
                  )}
                </div>
              )}

              {showBodyAccessControl && (
                <div data-slot="management-body-access">{accessControls}</div>
              )}
            </>
          )}

          {/* Read-only for non-admins */}
          {!canManageManagementAccess && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Contact section */}
              <div>
                <div className="dg-type-content-group-heading" style={{ marginBottom: 8 }}>
                  Contact
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <a
                    href={`mailto:${person.email}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      background: "var(--dg-color-bg-secondary)",
                      borderRadius: "var(--dg-radius-sm)",
                      textDecoration: "none",
                      color: "var(--dg-color-text-secondary)",
                      fontSize: "var(--dg-fs-body-sm)",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        color: "var(--dg-color-text-secondary)",
                        flexShrink: 0,
                      }}
                    >
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    {person.email}
                  </a>
                  {person.phone && (
                    <a
                      href={`tel:${person.phone}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        background: "var(--dg-color-bg-secondary)",
                        borderRadius: "var(--dg-radius-sm)",
                        textDecoration: "none",
                        color: "var(--dg-color-text-secondary)",
                        fontSize: "var(--dg-fs-body-sm)",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          color: "var(--dg-color-text-secondary)",
                          flexShrink: 0,
                        }}
                      >
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      {person.phone}
                    </a>
                  )}
                </div>
              </div>

              {/* Details section */}
              {(person.orgRole ||
                personDepts.length > 0 ||
                (showLastActive && !isPending && person.lastSignInAt !== null)) && (
                <div>
                  <div className="dg-type-content-group-heading" style={{ marginBottom: 10 }}>
                    Details
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    {person.orgRole && (
                      <div>
                        <div
                          style={{
                            fontSize: "var(--dg-type-field-title-size)",
                            fontWeight: "var(--dg-type-field-title-weight)",
                            color: "var(--dg-type-field-title-color)",
                            letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                            lineHeight: "var(--dg-type-field-title-line-height)",
                            marginBottom: 4,
                          }}
                        >
                          Role
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "3px 10px",
                            borderRadius: 999,
                            fontSize: "var(--dg-fs-caption)",
                            fontWeight: 600,
                            background:
                              ROLE_COLORS[person.orgRole]?.bg ?? "var(--dg-color-border-light)",
                            color:
                              ROLE_COLORS[person.orgRole]?.text ?? "var(--dg-color-text-muted)",
                          }}
                        >
                          {ROLE_LABELS[person.orgRole] ?? person.orgRole}
                        </span>
                      </div>
                    )}

                    {personDepts.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: "var(--dg-type-field-title-size)",
                            fontWeight: "var(--dg-type-field-title-weight)",
                            color: "var(--dg-type-field-title-color)",
                            letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                            lineHeight: "var(--dg-type-field-title-line-height)",
                            marginBottom: 4,
                          }}
                        >
                          {departmentLabel}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {personDepts.map((d) => (
                            <span
                              key={d.id}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: "var(--dg-color-bg-secondary)",
                                fontSize: "var(--dg-fs-caption)",
                                fontWeight: 500,
                                color: "var(--dg-color-text-secondary)",
                              }}
                            >
                              {d.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {showLastActive && !isPending && (
                      <div>
                        <div
                          style={{
                            fontSize: "var(--dg-type-field-title-size)",
                            fontWeight: "var(--dg-type-field-title-weight)",
                            color: "var(--dg-type-field-title-color)",
                            textTransform: "none" as const,
                            letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                            marginBottom: 4,
                          }}
                        >
                          Last Active
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: "var(--dg-fs-body-sm)",
                            color: "var(--dg-color-text-secondary)",
                          }}
                        >
                          <Clock
                            size={14}
                            style={{
                              color: "var(--dg-color-text-faint)",
                              flexShrink: 0,
                            }}
                          />
                          <MaybeHint
                            content={
                              person.lastSignInAt
                                ? new Date(person.lastSignInAt).toLocaleString()
                                : undefined
                            }
                            side="bottom"
                          >
                            <span>
                              {person.lastSignInAt
                                ? formatRelativeTime(person.lastSignInAt)
                                : "Never signed in"}
                            </span>
                          </MaybeHint>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <StaffPanelFooter
          actions={
            showPersonActionFooter ? (
              <div className="flex flex-col gap-2.5">
                {/* Add to Schedule — show for any linked management user who
                    isn't already on the schedule grid. The old `source ===
                    "user_only"` check fell apart once every member got an
                    employees row (Flow B + seed backfill); now we gate on the
                    same "appears on schedule" signal used everywhere else
                    (focusAreaIds). */}
                {showAddToScheduleAction && onAddToSchedule && (
                  <Button
                    onClick={() => onAddToSchedule(person)}
                    className="dg-btn dg-btn-secondary"
                    style={{ width: "100%" }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Add to Schedule
                  </Button>
                )}

                {showResendInvitationAction && (
                  <Button
                    onClick={handleResend}
                    disabled={resending}
                    className="dg-btn dg-btn-secondary"
                    style={{ width: "100%" }}
                  >
                    <ButtonLoading loading={resending} spinnerSize={14}>
                      Resend Invitation
                    </ButtonLoading>
                  </Button>
                )}

                {showRevokeInvitationAction && (
                  <Button
                    onClick={handleRevoke}
                    disabled={revoking}
                    className="dg-btn dg-btn-ghost"
                    style={{ width: "100%", color: "var(--dg-color-danger)" }}
                  >
                    <ButtonLoading loading={revoking} spinnerSize={14}>
                      Revoke Invitation
                    </ButtonLoading>
                  </Button>
                )}
              </div>
            ) : undefined
          }
          editorActions={
            canManageManagementAccess ? (
              <EditorActionRow
                secondaryAction={
                  <Button
                    onClick={handleDismissClick}
                    disabled={saving}
                    className="dg-btn dg-btn-secondary"
                  >
                    {dismissLabel}
                  </Button>
                }
                primaryAction={
                  <Button
                    onClick={handleSave}
                    disabled={
                      saving ||
                      !hasChanges ||
                      !currentDraft.firstName ||
                      !currentDraft.lastName ||
                      currentDraft.managementDepartmentIds.length === 0
                    }
                    className="dg-btn dg-btn-primary"
                  >
                    <ButtonLoading loading={saving} spinnerSize={16}>
                      {EDITOR_ACTION_LABELS.save}
                    </ButtonLoading>
                  </Button>
                }
              />
            ) : undefined
          }
        />

        {unsavedChangesDialog}
        <ScrollOverflowCue />
      </div>
    </>,
    document.body,
  );
}
