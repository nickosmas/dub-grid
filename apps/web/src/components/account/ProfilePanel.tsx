"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
import { Clock } from "lucide-react";

import { Form } from "@/components/Form";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import { extractErrorMessage } from "@/lib/error-handling";
import { formatClientLabel } from "@/lib/client-facing";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { UnsavedChangesBar } from "@/components/ui/UnsavedChangesBar";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import {
  cancelOwnProfileChangeRequest,
  createOwnProfileChangeRequest,
  fetchOwnProfileChangeRequests,
  requireCredentialAssurance,
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
import { Banner } from "@/components/ui/Banner";
import { changedElsewhereMessage, ADMINISTRATIVE_TEAM_LABELS } from "@dubgrid/domain";

interface ProfilePanelProps {
  user: User | null;
  profile: SelfProfileRecord | null;
  employee: Employee | null;
  /** Management department IDs from the caller's org membership — distinct
   *  from `employee.departmentIds`, which is scheduled departments. */
  managementDepartmentIds: number[];
  /** False for a caller with no membership in `orgId`, such as a gridmaster
   *  viewing an organization through impersonation. */
  isOrgMember: boolean;
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
   *  directory panels use before showing "Add to schedule". */
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
  /** Where the Unsaved changes bar goes, so it can stay in view over the whole tab. */
  saveBarSlot?: HTMLElement | null;
}

const ROLE_LABELS: Record<string, string> = {
  gridmaster: "Gridmaster",
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

type PendingConfirm = "account-details" | "name-change-request" | null;

function AccountCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="dg-card">
      <div className="dg-card-header">
        <h2 className="dg-card-title">{title}</h2>
        {action}
      </div>
      <div className="dg-card-body">{children}</div>
    </section>
  );
}

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
        {value || "-"}
      </span>
    </div>
  );
}

export function ProfilePanel({
  user,
  profile,
  employee,
  managementDepartmentIds,
  isOrgMember,
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
  saveBarSlot,
}: ProfilePanelProps) {
  const stepUp = useStepUpAction();
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
  const [requestFirstName, setRequestFirstName] = useState("");
  const [requestLastName, setRequestLastName] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestingNameChange, setRequestingNameChange] = useState(false);
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
    async (newRole: OrganizationRole, accessToken?: string) => {
      if (!orgId || !user || !selfMembership?.updatedAt) return;
      const updated = await updateOrganizationMembershipGuarded(
        {
          orgId,
          userId: user.id,
          expectedUpdatedAt: selfMembership.updatedAt,
          orgRole: newRole,
        },
        accessToken,
      );
      setSelfMembership(updated);
    },
    [orgId, user, selfMembership],
  );

  const handlePermissionsChange = useCallback(
    async (perms: AdminPermissions, accessToken?: string) => {
      if (!orgId || !user || !selfMembership?.updatedAt) return;
      const updated = await updateOrganizationMembershipGuarded(
        {
          orgId,
          userId: user.id,
          expectedUpdatedAt: selfMembership.updatedAt,
          adminPermissions: perms,
        },
        accessToken,
      );
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
    // Change requests are org-scoped and the route refuses a non-member, so
    // there is nothing to ask for without a membership.
    const needsRequests = isOrgMember && !canEditProfileDirectly;
    if (!orgId || !needsRequests) {
      setChangeRequests([]);
      return;
    }
    let cancelled = false;
    fetchOwnProfileChangeRequests(orgId)
      .then((result) => {
        if (!cancelled) setChangeRequests(result.requests);
      })
      .catch(() => {
        if (!cancelled) setChangeRequests([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canEditProfileDirectly, isOrgMember, orgId]);

  const pendingRequests = changeRequests.filter((r) => r.status === "pending");
  const pendingNameRequest = pendingRequests.find((r) => r.type === "profile_update");

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

      const persistDraft = async (): Promise<boolean> => {
        if (canEditProfileDirectly && employee && orgId) {
          if (workHasChanges) {
            const workSaved = await workEditorRef.current?.save();
            if (!workSaved) return false;
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
            return false;
          }
        }
        return true;
      };

      let draftPersisted = false;
      if (hasEmailChanges) {
        const completed = await stepUp.run(async (accessToken) => {
          // Do not persist names, phone, or work details until the server has
          // selected and accepted the account's current assurance method.
          await requireCredentialAssurance(accessToken);
          draftPersisted = await persistDraft();
        });
        if (!completed) return;
      } else {
        draftPersisted = await persistDraft();
      }
      if (!draftPersisted) return;
      accountDraftTouchedRef.current = false;
      setEditFirstName(nextFirst);
      setEditLastName(nextLast);
      setEditEmail(nextEmail);
      if (employee) setEditPhone(nextPhone);
      toast.success(
        hasEmailChanges
          ? profileSaved
            ? "Profile updated. We emailed a link to your current address and your new one. Your email changes once you confirm both."
            : "We emailed a link to your current address and your new one. Your email changes once you confirm both."
          : "Profile updated.",
      );
      setPendingConfirm(null);
    } catch (err) {
      if (err instanceof EmployeeProfileConflictError) {
        setEmployee(err.latestEmployee);
        toast.error(changedElsewhereMessage("your profile"));
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
      setRequestingNameChange(false);
      toast.success("Name change request sent.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "We couldn't send name change request. Try again."));
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function cancelRequest(request: ProfileChangeRequest) {
    if (cancellingId) return;
    setCancellingId(request.id);
    try {
      const result = await cancelOwnProfileChangeRequest(request.id);
      setChangeRequests((cur) => cur.map((r) => (r.id === result.request.id ? result.request : r)));
      toast.success("Name change request canceled.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "We couldn't cancel that request. Try again."));
    } finally {
      setCancellingId(null);
    }
  }

  function confirmPending() {
    const action = pendingConfirm;
    if (!action) return;
    if (action === "account-details") {
      void saveAccount();
      return;
    }
    setPendingConfirm(null);
    if (action === "name-change-request") void sendNameChangeRequest();
  }

  const confirmation =
    pendingConfirm === "account-details"
      ? {
          title: "Save your account and contact changes?",
          message: undefined,
          confirmLabel: "Save",
          variant: "info" as const,
          loading: saving,
        }
      : pendingConfirm === "name-change-request"
        ? {
            title: "Send your name change request?",
            message: undefined,
            confirmLabel: "Confirm request",
            variant: "info" as const,
            loading: submittingRequest,
          }
        : null;

  const saveBarNode = hasAnyChanges ? (
    <UnsavedChangesBar
      saveDisabled={hasInvalidDraft}
      saving={saving}
      onDiscard={cancelEditing}
      onSave={requestSave}
    />
  ) : null;
  const saveBar = saveBarSlot && saveBarNode ? createPortal(saveBarNode, saveBarSlot) : saveBarNode;

  return (
    <>
      <AccountCard title="Your details">
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            requestSave();
          }}
          className="flex flex-col gap-4"
        >
          {canEditProfileDirectly ? (
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
          ) : (
            <div>
              <span className="dg-label">Name</span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] text-[var(--dg-color-text-primary)]">
                  {displayName}
                </span>
                {pendingNameRequest ? null : (
                  <Button
                    type="button"
                    onClick={() => setRequestingNameChange(true)}
                    disabled={!orgId}
                    className="dg-btn dg-btn-secondary dg-btn-sm"
                  >
                    Request a name change
                  </Button>
                )}
              </div>
              {pendingNameRequest ? (
                <div className="mt-2">
                  <Banner
                    tone="warning"
                    icon={Clock}
                    action={
                      <Button
                        type="button"
                        onClick={() => cancelRequest(pendingNameRequest)}
                        disabled={cancellingId === pendingNameRequest.id}
                        className="dg-btn dg-btn-secondary dg-btn-sm"
                      >
                        <ButtonLoading loading={cancellingId === pendingNameRequest.id}>
                          Cancel request
                        </ButtonLoading>
                      </Button>
                    }
                  >
                    Your name change is waiting for an admin.
                  </Banner>
                </div>
              ) : null}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
        </Form>
      </AccountCard>

      {canEditProfileDirectly && employee && (
        <AccountCard title="Work">
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
        </AccountCard>
      )}

      <AccountCard title="Access">
        {isGridmaster ? (
          <Field label="Platform role" value="Gridmaster" />
        ) : canManageManagementAccess && selfOrgRole ? (
          <MemberAccessControls
            orgRole={selfOrgRole}
            adminPermissions={selfMembership?.adminPermissions}
            onRoleChange={handleRoleChange}
            onPermissionsChange={handlePermissionsChange}
            isSelf
            labels={{ focusAreaLabel, certificationLabel, roleLabel }}
          />
        ) : (
          <Field label="Access role" value={ROLE_LABELS[role] ?? role} />
        )}
      </AccountCard>

      {/* Department assignment only applies to management involvement, so a
       *  self-viewer with neither existing departments nor the permission to
       *  start (canManageManagementAccess) never sees this card at all - the
       *  same "not part of management" story the People panels tell. */}
      {!isGridmaster && (canManageManagementAccess || showManagementAccess) && (
        <AccountCard
          title={ADMINISTRATIVE_TEAM_LABELS.plural}
          action={
            canManageManagementAccess && employee ? (
              <Button
                type="button"
                onClick={() => setIsEditingManagementAccess(true)}
                className="dg-btn dg-btn-secondary dg-btn-sm"
              >
                {showManagementAccess
                  ? "Edit administrative teams"
                  : "Add to an administrative team"}
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
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
                Add to schedule
              </Button>
            )}
          </div>
        </AccountCard>
      )}

      {isEditingManagementAccess && orgId && employee && (
        <EmployeeManagementAccessEditor
          employee={employee}
          orgId={orgId}
          managementDepartments={allManagementDepartments}
          directoryPerson={selfDirectoryPerson}
          onDirtyChange={setManagementAccessDirty}
          onClose={closeManagementAccessEditor}
          onCompleted={async (updatedEmployee) => {
            if (updatedEmployee) setEmployee(updatedEmployee);
            await refetchProfile();
          }}
          frame={(fields, actions) => (
            <Modal
              title={
                showManagementAccess ? "Edit administrative teams" : "Add to an administrative team"
              }
              onClose={closeManagementAccessEditor}
              onRequestClose={requestManagementAccessClose}
              className="dg-modal--tight-header"
              style={{ maxWidth: 560, width: "100%" }}
              footer={actions}
            >
              {fields}
            </Modal>
          )}
        />
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

      {requestingNameChange && !pendingNameRequest ? (
        <Modal
          title="Request a name change"
          onClose={() => setRequestingNameChange(false)}
          className="dg-modal--tight-header"
          style={{ maxWidth: 480, width: "100%" }}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setRequestingNameChange(false)}
                className="dg-btn dg-btn-secondary"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  submittingRequest ||
                  !orgId ||
                  Boolean(requestFirstNameError) ||
                  Boolean(requestLastNameError) ||
                  Boolean(requestNoteError)
                }
                onClick={requestNameChange}
                className="dg-btn dg-btn-primary"
              >
                <ButtonLoading loading={submittingRequest}>Send request</ButtonLoading>
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="dg-label" htmlFor="profile-requested-first-name">
                  First name
                </label>
                <input
                  id="profile-requested-first-name"
                  className="dg-input"
                  value={requestFirstName}
                  onChange={(e) => setRequestFirstName(e.target.value)}
                />
                {requestFirstNameError && <p className="dg-form-error">{requestFirstNameError}</p>}
              </div>
              <div>
                <label className="dg-label" htmlFor="profile-requested-last-name">
                  Last name
                </label>
                <input
                  id="profile-requested-last-name"
                  className="dg-input"
                  value={requestLastName}
                  onChange={(e) => setRequestLastName(e.target.value)}
                />
                {requestLastNameError && <p className="dg-form-error">{requestLastNameError}</p>}
              </div>
            </div>
            <div>
              <label className="dg-label" htmlFor="profile-request-note">
                Note for admins
              </label>
              <textarea
                id="profile-request-note"
                className="dg-input"
                rows={3}
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
              />
              {requestNoteError && <p className="dg-form-error">{requestNoteError}</p>}
            </div>
          </div>
        </Modal>
      ) : null}

      {saveBar}

      {confirmation && !stepUp.dialog && (
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
      {stepUp.dialog}
    </>
  );
}
