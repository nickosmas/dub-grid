"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOptionalUsPhoneError,
  getRequiredStaffEmailError,
  getStaffNameError,
  getStaffNotesError,
  normalizeOptionalUsPhone,
  normalizeRequiredStaffEmail,
  normalizeStaffName,
  normalizeStaffNotes,
} from "@dubgrid/contracts";
import { toast } from "sonner";
import { Check, Trash2, X } from "lucide-react";

import { SectionCard } from "@/components/settings/shared";
import { Form } from "@/components/Form";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import { extractErrorMessage } from "@/lib/error-handling";
import { formatClientLabel } from "@/lib/client-facing";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import {
  cancelOwnProfileChangeRequest,
  createOwnProfileChangeRequest,
  fetchOwnProfileChangeRequests,
  updateBrowserUserEmail,
  updateSelfProfileDetails,
  updateSelfProfilePhone,
  type ProfileChangeRequest,
  type ProfileRequestedChanges,
  type SelfProfileRecord,
} from "@/features/account/client";
import {
  fetchOrganizationUsers,
  updateOrganizationMembershipGuarded,
} from "@/features/organization/client";
import { EmployeeProfileConflictError, updateEmployee } from "@/features/employees/client";
import { AddManagementUserToScheduleModal } from "@/components/staff/AddManagementUserToScheduleModal";
import { PersonProfileHeader } from "@/components/staff/PersonProfileHeader";
import { MemberAccessControls } from "@/components/staff/MemberAccessControls";
import { EmployeeManagementAccessEditor } from "@/components/staff/EmployeeManagementAccessModal";
import EditEmployeePanel, { type EditEmployeePanelHandle } from "@/components/EditEmployeePanel";
import type {
  AdminPermissions,
  Department,
  DirectoryPerson,
  Employee,
  FocusArea,
  NamedItem,
  OrganizationRole,
  OrganizationUser,
} from "@/types";
import type { User } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";

interface ProfilePanelProps {
  user: User | null;
  profile: SelfProfileRecord | null;
  employee: Employee | null;
  /** Management department IDs from the caller's org membership — distinct
   *  from `employee.departmentIds`, which is scheduled departments. */
  managementDepartmentIds: number[];
  orgId: string | null;
  canEditProfileDirectly: boolean;
  isGridmaster: boolean;
  /** Effective permission role (e.g. "user" / "admin" / "super_admin" / "gridmaster"). */
  role: string;
  departments: Department[];
  isOnSchedule: boolean;
  /** True for super_admin/gridmaster — the same gate the People directory
   *  panels use before letting anyone edit a person's management access. */
  canManageManagementAccess: boolean;
  /** True when the viewer can manage employees — the same gate the People
   *  directory panels use before showing "Add to Schedule". */
  canManageScheduleEmployees: boolean;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  focusAreaLabel?: string;
  certificationLabel?: string;
  roleLabel?: string;
  setProfile: Dispatch<SetStateAction<SelfProfileRecord | null>>;
  setEmployee: Dispatch<SetStateAction<Employee | null>>;
  /** Refreshes the whole self-profile query after the management-access modal
   *  saves - the shared editor doesn't hand back the new department list. */
  refetchProfile: () => Promise<unknown>;
}

const ROLE_LABELS: Record<string, string> = {
  gridmaster: "Gridmaster",
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

type PendingConfirm = "account-details" | "name-change-request" | "account-deletion" | null;

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="dg-label" style={{ marginBottom: 0 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "var(--dg-fs-body-sm)",
          color: value ? "var(--dg-color-text-primary)" : "var(--dg-color-text-subtle)",
        }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

export function ProfilePanel({
  user,
  profile,
  employee,
  managementDepartmentIds,
  orgId,
  canEditProfileDirectly,
  isGridmaster,
  role,
  departments,
  isOnSchedule,
  canManageManagementAccess,
  canManageScheduleEmployees,
  focusAreas,
  certifications,
  roles,
  focusAreaLabel,
  certificationLabel,
  roleLabel,
  setProfile,
  setEmployee,
  refetchProfile,
}: ProfilePanelProps) {
  const firstName = profile?.first_name?.trim() || null;
  const lastName = profile?.last_name?.trim() || null;
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    [employee?.firstName, employee?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "";

  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null);
  const [workHasChanges, setWorkHasChanges] = useState(false);
  const [workSaveBlocked, setWorkSaveBlocked] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const workEditorRef = useRef<EditEmployeePanelHandle>(null);
  const seededIdentityRef = useRef<string | null>(null);
  const accountDraftTouchedRef = useRef(false);

  const [changeRequests, setChangeRequests] = useState<ProfileChangeRequest[]>([]);
  const [loadingChangeRequests, setLoadingChangeRequests] = useState(false);
  const [requestFirstName, setRequestFirstName] = useState("");
  const [requestLastName, setRequestLastName] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const savedFirstName = firstName ?? "";
  const savedLastName = lastName ?? "";
  const savedEmail = (requestedEmail ?? user?.email ?? "").trim().toLowerCase();
  const editedEmail = editEmail.trim().toLowerCase();
  const hasNameChanges =
    canEditProfileDirectly &&
    (editFirstName.trim() !== savedFirstName || editLastName.trim() !== savedLastName);
  const hasEmailChanges = editedEmail !== "" && editedEmail !== savedEmail;
  const savedPhone = employee?.phone ?? "";

  const firstNameError = canEditProfileDirectly
    ? getStaffNameError(editFirstName, "First name")
    : null;
  const lastNameError = canEditProfileDirectly
    ? getStaffNameError(editLastName, "Last name")
    : null;
  const emailError = getRequiredStaffEmailError(editEmail);
  const phoneError = employee ? getOptionalUsPhoneError(editPhone) : null;
  const normalizedPhone =
    phoneError || !employee ? editPhone.trim() : normalizeOptionalUsPhone(editPhone);
  const hasPhoneChanges = normalizedPhone !== savedPhone;
  const hasAnyChanges = hasNameChanges || hasEmailChanges || hasPhoneChanges || workHasChanges;
  const hasInvalidDraft = Boolean(
    firstNameError || lastNameError || emailError || phoneError || workSaveBlocked,
  );

  useEffect(() => {
    const seedKey = `${user?.id ?? "anonymous"}:${employee?.id ?? "no-employee"}`;
    if (!user) return;
    if (
      seededIdentityRef.current === seedKey &&
      (accountDraftTouchedRef.current || workHasChanges)
    ) {
      return;
    }
    seededIdentityRef.current = seedKey;
    setEditFirstName(savedFirstName);
    setEditLastName(savedLastName);
    setEditEmail(user.email ?? "");
    setEditPhone(employee?.phone ?? "");
  }, [employee?.id, employee?.phone, savedFirstName, savedLastName, user, workHasChanges]);

  const requestFirstNameError =
    requestFirstName.trim().length > 0 ? getStaffNameError(requestFirstName, "First name") : null;
  const requestLastNameError =
    requestLastName.trim().length > 0 ? getStaffNameError(requestLastName, "Last name") : null;
  const requestNoteError = getStaffNotesError(requestNote);

  const showDeletion = !isGridmaster && !canEditProfileDirectly;

  const allManagementDepartments = departments.filter((d) => d.type === "management");
  const managementDepartments = allManagementDepartments.filter((d) =>
    managementDepartmentIds.includes(d.id),
  );
  const showManagementAccess = managementDepartmentIds.length > 0;

  // Same shape as the People directory panels: management access opens in a
  // popup backed by the shared EmployeeManagementAccessEditor, not an inline
  // department-toggle form of its own.
  const [isEditingManagementAccess, setIsEditingManagementAccess] = useState(false);
  const [managementAccessDirty, setManagementAccessDirty] = useState(false);
  const closeManagementAccessEditor = useCallback(() => {
    setManagementAccessDirty(false);
    setIsEditingManagementAccess(false);
  }, []);
  const {
    requestClose: requestManagementAccessClose,
    unsavedChangesDialog: managementAccessUnsavedChangesDialog,
  } = useUnsavedChangesPrompt({
    hasUnsavedChanges: managementAccessDirty,
    onDiscard: closeManagementAccessEditor,
  });

  const selfOrgRole: OrganizationRole | null =
    role === "user" || role === "admin" || role === "super_admin" ? role : null;

  // MemberAccessControls' permissions launcher (unlike its role picker) isn't
  // self-gated, so an admin really can open it from their own profile - fetch
  // the real membership record so that path has accurate initialPermissions
  // and a working expectedUpdatedAt instead of silently no-op'ing on save.
  const [selfMembership, setSelfMembership] = useState<OrganizationUser | null>(null);
  useEffect(() => {
    if (!canManageManagementAccess || !orgId || !user) {
      setSelfMembership(null);
      return;
    }
    let cancelled = false;
    fetchOrganizationUsers(orgId)
      .then((users) => {
        if (!cancelled) setSelfMembership(users.find((u) => u.id === user.id) ?? null);
      })
      .catch(() => {
        if (!cancelled) setSelfMembership(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canManageManagementAccess, orgId, user]);

  const selfDirectoryPerson: DirectoryPerson | null =
    employee && user
      ? {
          personId: employee.id,
          source: "employee",
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber ?? null,
          userId: user.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          phone: employee.phone,
          employeeStatus: employee.status,
          orgRole: selfOrgRole,
          hasAppAccess: true,
          focusAreaIds: employee.focusAreaIds,
          certificationId: employee.certificationId,
          roleIds: employee.roleIds,
          seniority: employee.seniority,
          lastSignInAt: selfMembership?.lastSignInAt ?? null,
          invitationStatus: null,
          scheduledDepartmentIds: employee.departmentIds,
          scheduledDeptAdminIds: employee.deptAdminIds,
          managementDepartmentIds,
          managementDeptAdminIds: [],
          departmentIds: managementDepartmentIds,
          deptAdminIds: [],
          isManagementUser: showManagementAccess,
          membershipUpdatedAt: selfMembership?.updatedAt ?? null,
          adminPermissions: selfMembership?.adminPermissions ?? null,
        }
      : null;

  const handleRoleChange = useCallback(
    // Unreachable through this page's UI - MemberAccessControls renders the
    // disabled, explained dropdown for isSelf and never calls this. Kept for
    // parity with the People panels and as defense in depth.
    async (newRole: OrganizationRole) => {
      if (!orgId || !user || !selfMembership?.updatedAt) return;
      const updated = await updateOrganizationMembershipGuarded({
        orgId,
        userId: user.id,
        expectedUpdatedAt: selfMembership.updatedAt,
        orgRole: newRole,
      });
      setSelfMembership(updated);
    },
    [orgId, user, selfMembership],
  );

  const handlePermissionsChange = useCallback(
    async (perms: AdminPermissions) => {
      if (!orgId || !user || !selfMembership?.updatedAt) return;
      const updated = await updateOrganizationMembershipGuarded({
        orgId,
        userId: user.id,
        expectedUpdatedAt: selfMembership.updatedAt,
        adminPermissions: perms,
      });
      setSelfMembership(updated);
    },
    [orgId, user, selfMembership],
  );

  const [showAddToSchedule, setShowAddToSchedule] = useState(false);
  const canAddToSchedule =
    canManageScheduleEmployees && !isOnSchedule && showManagementAccess && !!employee?.userId;

  async function saveWorkDetails(updatedEmployee: Employee): Promise<Employee> {
    if (!orgId || !employee) {
      throw new Error("This account is not linked to an organization staff profile.");
    }
    const previousEmployee = employee;
    const mergedEmployee = {
      ...updatedEmployee,
      firstName: canEditProfileDirectly
        ? normalizeStaffName(editFirstName)
        : updatedEmployee.firstName,
      lastName: canEditProfileDirectly
        ? normalizeStaffName(editLastName)
        : updatedEmployee.lastName,
      phone: normalizeOptionalUsPhone(editPhone),
    };
    const savedEmployee = await updateEmployee(mergedEmployee, orgId, previousEmployee.version);
    setEmployee(savedEmployee);
    if (canEditProfileDirectly) {
      setProfile((current) =>
        current
          ? {
              ...current,
              first_name: savedEmployee.firstName,
              last_name: savedEmployee.lastName,
            }
          : current,
      );
    }
    return savedEmployee;
  }

  useEffect(() => {
    // Both the name-change request UI and the account-deletion section need
    // to read change_requests. Fetch once for both.
    const needsRequests = !canEditProfileDirectly || showDeletion;
    if (!orgId || !needsRequests) {
      setChangeRequests([]);
      return;
    }
    let cancelled = false;
    setLoadingChangeRequests(true);
    fetchOwnProfileChangeRequests(orgId)
      .then((result) => {
        if (!cancelled) setChangeRequests(result.requests);
      })
      .catch(() => {
        if (!cancelled) setChangeRequests([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingChangeRequests(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canEditProfileDirectly, orgId, showDeletion]);

  const pendingRequests = changeRequests.filter((r) => r.status === "pending");
  const pendingNameRequest = pendingRequests.find((r) => r.type === "profile_update");
  const pendingDeletion = pendingRequests.find((r) => r.type === "account_deletion");

  function cancelEditing() {
    accountDraftTouchedRef.current = false;
    setEditFirstName(savedFirstName);
    setEditLastName(savedLastName);
    setEditEmail(user?.email ?? "");
    setEditPhone(employee?.phone ?? "");
    workEditorRef.current?.requestDismiss();
  }

  function requestSave() {
    if (saving || hasInvalidDraft) return;
    if (!hasAnyChanges) return;
    setPendingConfirm("account-details");
  }

  async function saveAccount() {
    if (!user) return;
    setSaving(true);
    let profileSaved = false;
    try {
      const nextEmail = normalizeRequiredStaffEmail(editEmail);
      const nextFirst = normalizeStaffName(editFirstName);
      const nextLast = normalizeStaffName(editLastName);
      const nextPhone = employee ? normalizeOptionalUsPhone(editPhone) : "";

      if (canEditProfileDirectly && employee && orgId) {
        if (workHasChanges) {
          const workSaved = await workEditorRef.current?.save();
          if (!workSaved) return;
        } else if (hasNameChanges || hasPhoneChanges) {
          await saveWorkDetails(employee);
        }
        profileSaved = hasNameChanges || hasPhoneChanges || workHasChanges;
      } else if (hasNameChanges) {
        const updated = await updateSelfProfileDetails({
          firstName: nextFirst,
          lastName: nextLast,
          orgId,
        });
        setProfile(updated.profile);
        if (updated.employee) setEmployee(updated.employee);
        profileSaved = true;
      }
      if (!canEditProfileDirectly && hasPhoneChanges && orgId && employee) {
        const updated = await updateSelfProfilePhone({
          orgId,
          phone: nextPhone,
          expectedVersion: employee.version,
        });
        setEmployee(updated.employee);
        profileSaved = true;
      }
      if (hasEmailChanges) {
        try {
          await updateBrowserUserEmail(nextEmail);
          setRequestedEmail(nextEmail);
        } catch (err) {
          toast.error(
            profileSaved
              ? "Your profile was saved, but we couldn't start the email change. Try the email again."
              : extractErrorMessage(err, "We couldn't update your email. Try again."),
          );
          return;
        }
      }
      accountDraftTouchedRef.current = false;
      setEditFirstName(nextFirst);
      setEditLastName(nextLast);
      setEditEmail(nextEmail);
      if (employee) setEditPhone(nextPhone);
      toast.success(
        hasEmailChanges
          ? profileSaved
            ? "Profile updated. Confirmation sent to your new email address."
            : "Confirmation sent to your new email address."
          : "Profile updated.",
      );
    } catch (err) {
      if (err instanceof EmployeeProfileConflictError) {
        setEmployee(err.latestEmployee);
        toast.error(
          "Your staff profile changed elsewhere. Review the latest values and try again.",
        );
        return;
      }
      toast.error(extractErrorMessage(err, "We couldn't update your profile. Try again."));
    } finally {
      setSaving(false);
    }
  }

  function requestNameChange() {
    if (!orgId || submittingRequest || pendingNameRequest) return;
    if (requestFirstNameError || requestLastNameError || requestNoteError) {
      toast.error(
        requestFirstNameError ?? requestLastNameError ?? requestNoteError ?? "Invalid input.",
      );
      return;
    }
    const requested: ProfileRequestedChanges = {};
    if (requestFirstName.trim() && requestFirstName.trim() !== (firstName ?? "")) {
      requested.firstName = normalizeStaffName(requestFirstName);
    }
    if (requestLastName.trim() && requestLastName.trim() !== (lastName ?? "")) {
      requested.lastName = normalizeStaffName(requestLastName);
    }
    if (Object.keys(requested).length === 0) {
      toast.error("Enter at least one name change to request.");
      return;
    }
    setPendingConfirm("name-change-request");
  }

  async function sendNameChangeRequest() {
    if (!orgId) return;
    setSubmittingRequest(true);
    try {
      const requested: ProfileRequestedChanges = {};
      if (requestFirstName.trim() && requestFirstName.trim() !== (firstName ?? "")) {
        requested.firstName = normalizeStaffName(requestFirstName);
      }
      if (requestLastName.trim() && requestLastName.trim() !== (lastName ?? "")) {
        requested.lastName = normalizeStaffName(requestLastName);
      }
      const result = await createOwnProfileChangeRequest({
        orgId,
        type: "profile_update",
        requestedChanges: requested,
        requestNote: normalizeStaffNotes(requestNote),
      });
      setChangeRequests((cur) => [result.request, ...cur]);
      setRequestFirstName("");
      setRequestLastName("");
      setRequestNote("");
      toast.success("Name change request sent.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "We couldn't send name change request. Try again."));
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function sendDeletionRequest() {
    if (!orgId) return;
    setRequestingDeletion(true);
    try {
      const result = await createOwnProfileChangeRequest({
        orgId,
        type: "account_deletion",
        requestNote: "Account deletion requested from self profile.",
      });
      setChangeRequests((cur) => [result.request, ...cur]);
      toast.success("Account deletion request sent.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "We couldn't request account deletion. Try again."));
    } finally {
      setRequestingDeletion(false);
    }
  }

  async function cancelRequest(request: ProfileChangeRequest) {
    if (cancellingId) return;
    setCancellingId(request.id);
    try {
      const result = await cancelOwnProfileChangeRequest(request.id);
      setChangeRequests((cur) => cur.map((r) => (r.id === result.request.id ? result.request : r)));
      toast.success(
        request.type === "account_deletion"
          ? "Account deletion request cancelled."
          : "Name change request cancelled.",
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "We couldn't cancel that request. Try again."));
    } finally {
      setCancellingId(null);
    }
  }

  function confirmPending() {
    const action = pendingConfirm;
    if (!action) return;
    setPendingConfirm(null);
    if (action === "account-details") void saveAccount();
    if (action === "name-change-request") void sendNameChangeRequest();
    if (action === "account-deletion") void sendDeletionRequest();
  }

  const confirmation =
    pendingConfirm === "account-details"
      ? {
          title: "Save changes?",
          message: "Confirm that you want to save these account and contact changes.",
          confirmLabel: "Confirm save",
          variant: "info" as const,
          loading: saving,
        }
      : pendingConfirm === "name-change-request"
        ? {
            title: "Send request?",
            message: "Confirm that you want to send this name change request.",
            confirmLabel: "Confirm request",
            variant: "info" as const,
            loading: submittingRequest,
          }
        : pendingConfirm === "account-deletion"
          ? {
              title: "Request account deletion?",
              message:
                "Confirm that you want to request account deletion. An admin will review and approve before your account is removed.",
              confirmLabel: "Request deletion",
              variant: "danger" as const,
              loading: requestingDeletion,
            }
          : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PersonProfileHeader
        avatarSeed={user?.id ?? employee?.id ?? ""}
        name={displayName}
        orgRole={selfOrgRole}
        email={user?.email ?? employee?.email}
        phone={employee?.phone}
        employmentType={employee?.employmentType}
        employeeNumber={employee?.employeeNumber}
      />

      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                Profile details
              </div>
              <div className="mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
                Account and contact information. Changes stay editable on this page.
              </div>
            </div>
          </div>

          <Form
            onSubmit={(e) => {
              e.preventDefault();
              requestSave();
            }}
            className="flex flex-col gap-5"
          >
            {canEditProfileDirectly && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="dg-label">First name</label>
                  <input
                    aria-label="First name"
                    value={editFirstName}
                    onChange={(e) => {
                      accountDraftTouchedRef.current = true;
                      setEditFirstName(e.target.value);
                    }}
                    className="dg-input"
                  />
                  {firstNameError && <p className="dg-form-error">{firstNameError}</p>}
                </div>
                <div>
                  <label className="dg-label">Last name</label>
                  <input
                    aria-label="Last name"
                    value={editLastName}
                    onChange={(e) => {
                      accountDraftTouchedRef.current = true;
                      setEditLastName(e.target.value);
                    }}
                    className="dg-input"
                  />
                  {lastNameError && <p className="dg-form-error">{lastNameError}</p>}
                </div>
              </div>
            )}
            <div>
              <label className="dg-label">Email</label>
              <input
                aria-label="Email"
                type="email"
                value={editEmail}
                onChange={(e) => {
                  accountDraftTouchedRef.current = true;
                  setEditEmail(e.target.value);
                }}
                className="dg-input"
              />
              {emailError && <p className="dg-form-error">{emailError}</p>}
            </div>
            {employee && (
              <div>
                <label className="dg-label">Phone</label>
                <input
                  aria-label="Phone"
                  value={editPhone}
                  onChange={(e) => {
                    accountDraftTouchedRef.current = true;
                    setEditPhone(e.target.value);
                  }}
                  onBlur={() => {
                    if (!phoneError && editPhone.trim()) setEditPhone(normalizedPhone);
                  }}
                  placeholder="Phone"
                  className="dg-input"
                />
                {phoneError && <p className="dg-form-error">{phoneError}</p>}
              </div>
            )}
          </Form>
        </div>
      </SectionCard>

      {canEditProfileDirectly && employee && (
        <SectionCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                  Work details
                </div>
                <div className="mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
                  Employment type, {(focusAreaLabel ?? "focus areas").toLowerCase()},{" "}
                  {(certificationLabel ?? "certification").toLowerCase()}, and{" "}
                  {(roleLabel ?? "roles").toLowerCase()} for this account.
                </div>
              </div>
            </div>
            <EditEmployeePanel
              flushHorizontal
              ref={workEditorRef}
              employee={employee}
              focusAreas={focusAreas}
              certifications={certifications}
              certificationLabel={certificationLabel}
              roles={roles}
              roleLabel={roleLabel}
              focusAreaLabel={focusAreaLabel}
              isManagementUser={showManagementAccess}
              hideIdentityFields
              hideActions
              persistent
              onDirtyChange={setWorkHasChanges}
              onSaveBlockedChange={setWorkSaveBlocked}
              onSave={async (updatedEmployee) => {
                await saveWorkDetails(updatedEmployee);
              }}
              onCancel={() => undefined}
            />
          </div>
        </SectionCard>
      )}

      <SectionCard>
        <div className="flex flex-wrap justify-end gap-2">
          {hasAnyChanges && (
            <Button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="dg-btn dg-btn-secondary dg-btn-sm"
            >
              <X size={14} />
              {EDITOR_ACTION_LABELS.discard}
            </Button>
          )}
          <Button
            type="button"
            onClick={requestSave}
            disabled={saving || !hasAnyChanges || hasInvalidDraft}
            className="dg-btn dg-btn-primary dg-btn-sm"
          >
            <ButtonLoading loading={saving} spinnerSize={14} icon={<Check size={14} />}>
              Save changes
            </ButtonLoading>
          </Button>
        </div>
      </SectionCard>

      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
              Access
            </div>
            <div className="mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
              Your organization role and the permissions it carries.
            </div>
          </div>
          {canManageManagementAccess && selfOrgRole ? (
            <MemberAccessControls
              orgRole={selfOrgRole}
              adminPermissions={selfMembership?.adminPermissions}
              onRoleChange={handleRoleChange}
              onPermissionsChange={handlePermissionsChange}
              isSelf
            />
          ) : (
            <Field label="Role" value={ROLE_LABELS[role] ?? role} />
          )}
        </div>
      </SectionCard>

      {/* Department assignment only applies to management involvement, so a
       *  self-viewer with neither existing departments nor the permission to
       *  start (canManageManagementAccess) never sees this card at all - the
       *  same "not part of management" story the People panels tell. */}
      {(canManageManagementAccess || showManagementAccess) && (
        <SectionCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                  Management departments
                </div>
                <div className="mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
                  Management department assignment.
                </div>
              </div>
              {canManageManagementAccess && employee && (
                <Button
                  type="button"
                  onClick={() => setIsEditingManagementAccess(true)}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                >
                  {showManagementAccess ? "Edit management access" : "Add to Management"}
                </Button>
              )}
            </div>

            <Field
              label="Departments"
              value={
                managementDepartments.length > 0
                  ? managementDepartments.map((d) => d.name).join(", ")
                  : null
              }
            />

            {canAddToSchedule && (
              <Button
                type="button"
                onClick={() => setShowAddToSchedule(true)}
                className="dg-btn dg-btn-secondary dg-btn-sm self-start"
              >
                Add to Schedule
              </Button>
            )}
          </div>
        </SectionCard>
      )}

      {isEditingManagementAccess && orgId && employee && (
        <Modal
          title={showManagementAccess ? "Edit management access" : "Add to management"}
          onClose={closeManagementAccessEditor}
          onRequestClose={requestManagementAccessClose}
          style={{ maxWidth: 560, width: "100%" }}
        >
          <EmployeeManagementAccessEditor
            employee={employee}
            orgId={orgId}
            orgName="your organization"
            managementDepartments={allManagementDepartments}
            directoryPerson={selfDirectoryPerson}
            onDirtyChange={setManagementAccessDirty}
            onClose={closeManagementAccessEditor}
            onCompleted={async (updatedEmployee) => {
              if (updatedEmployee) setEmployee(updatedEmployee);
              await refetchProfile();
            }}
          />
        </Modal>
      )}
      {managementAccessUnsavedChangesDialog}

      {showAddToSchedule && employee && orgId && (
        <AddManagementUserToScheduleModal
          orgId={orgId}
          person={employee}
          employee={employee}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={roles}
          focusAreaLabel={focusAreaLabel}
          certificationLabel={certificationLabel}
          roleLabel={roleLabel}
          onClose={() => setShowAddToSchedule(false)}
          onAdded={(updated) => {
            setEmployee(updated);
            setShowAddToSchedule(false);
          }}
        />
      )}

      {!canEditProfileDirectly && (
        <SectionCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                Name change requests
              </div>
              <div className="mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
                Ask an admin to update your name. Email and phone are managed in Account details.
              </div>
            </div>

            {pendingNameRequest && (
              <div className="rounded-[var(--dg-radius-md)] border border-[var(--dg-color-warning-border)] bg-[var(--dg-color-warning-bg)] p-3 text-[13px] text-[var(--dg-color-warning-text)]">
                A name change request is pending admin review.
                <Button
                  type="button"
                  onClick={() => cancelRequest(pendingNameRequest)}
                  disabled={cancellingId === pendingNameRequest.id}
                  className="dg-btn dg-btn-secondary dg-btn-sm ml-3"
                >
                  <ButtonLoading loading={cancellingId === pendingNameRequest.id}>
                    Cancel request
                  </ButtonLoading>
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <input
                  aria-label="Requested first name"
                  className="dg-input"
                  disabled={!!pendingNameRequest}
                  placeholder="Requested first name"
                  value={requestFirstName}
                  onChange={(e) => setRequestFirstName(e.target.value)}
                />
                {requestFirstNameError && <p className="dg-form-error">{requestFirstNameError}</p>}
              </div>
              <div>
                <input
                  aria-label="Requested last name"
                  className="dg-input"
                  disabled={!!pendingNameRequest}
                  placeholder="Requested last name"
                  value={requestLastName}
                  onChange={(e) => setRequestLastName(e.target.value)}
                />
                {requestLastNameError && <p className="dg-form-error">{requestLastNameError}</p>}
              </div>
            </div>
            <textarea
              aria-label="Request note"
              className="dg-input"
              disabled={!!pendingNameRequest}
              placeholder="Note for admins"
              rows={3}
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
            />
            {requestNoteError && <p className="dg-form-error">{requestNoteError}</p>}
            <Button
              type="button"
              disabled={
                submittingRequest ||
                !!pendingNameRequest ||
                !orgId ||
                Boolean(requestFirstNameError) ||
                Boolean(requestLastNameError) ||
                Boolean(requestNoteError)
              }
              onClick={requestNameChange}
              className="dg-btn dg-btn-secondary dg-btn-sm self-start"
            >
              <ButtonLoading loading={submittingRequest}>Request name change</ButtonLoading>
            </Button>
            {loadingChangeRequests ? (
              <span
                aria-hidden
                className="dg-skeleton"
                style={{ display: "inline-block", width: 180, height: 12, borderRadius: 4 }}
              />
            ) : changeRequests.length > 0 ? (
              <p className="m-0 text-[13px] text-[var(--dg-color-text-muted)]">
                Latest request: {formatClientLabel(changeRequests[0].status)}
              </p>
            ) : null}
          </div>
        </SectionCard>
      )}

      {showDeletion && (
        <SectionCard>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              borderTop: "1px solid var(--dg-color-danger-bg)",
              paddingTop: 16,
            }}
          >
            <div>
              <div
                className="text-[14px] font-semibold"
                style={{ color: "var(--dg-color-danger)" }}
              >
                Delete account
              </div>
              <p className="mb-0 mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
                Request that an admin delete your account. This is irreversible.
              </p>
            </div>
            {pendingDeletion ? (
              <div className="rounded-[var(--dg-radius-md)] border border-[var(--dg-color-warning-border)] bg-[var(--dg-color-warning-bg)] p-3 text-[13px] text-[var(--dg-color-warning-text)]">
                Account deletion request pending admin review.
                <Button
                  type="button"
                  onClick={() => cancelRequest(pendingDeletion)}
                  disabled={cancellingId === pendingDeletion.id}
                  className="dg-btn dg-btn-secondary dg-btn-sm ml-3"
                >
                  <ButtonLoading loading={cancellingId === pendingDeletion.id}>
                    Cancel request
                  </ButtonLoading>
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                onClick={() => setPendingConfirm("account-deletion")}
                disabled={requestingDeletion || !orgId}
                className="dg-btn dg-btn-danger self-start"
              >
                <ButtonLoading
                  loading={requestingDeletion}
                  spinnerSize={14}
                  icon={<Trash2 size={14} style={{ marginRight: 4 }} />}
                >
                  Request account deletion
                </ButtonLoading>
              </Button>
            )}
          </div>
        </SectionCard>
      )}

      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          variant={confirmation.variant}
          isLoading={confirmation.loading}
          onConfirm={confirmPending}
          onCancel={() => {
            if (!confirmation.loading) setPendingConfirm(null);
          }}
        />
      )}
    </div>
  );
}
