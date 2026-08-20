"use client";

import { useEffect, useState } from "react";
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
import ConfirmDialog from "@/components/ConfirmDialog";
import { extractErrorMessage } from "@/lib/error-handling";
import { formatClientLabel } from "@/lib/client-facing";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { SelectableTag } from "@/components/ui/selectable-tag";
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
import { updateAppOnlyUser } from "@/features/organization/client";
import { AddManagementUserToScheduleModal } from "@/components/staff/AddManagementUserToScheduleModal";
import type { Department, Employee, FocusArea, NamedItem } from "@/types";
import type { User } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";

interface ProfilePanelProps {
  user: User | null;
  profile: SelfProfileRecord | null;
  employee: Employee | null;
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
          color: value ? "var(--color-text-primary)" : "var(--color-text-subtle)",
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
}: ProfilePanelProps) {
  const firstName = profile?.first_name?.trim() || null;
  const lastName = profile?.last_name?.trim() || null;

  const [isEditing, setIsEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

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
  const savedEmail = (user?.email ?? "").trim().toLowerCase();
  const editedEmail = editEmail.trim().toLowerCase();
  const hasNameChanges =
    canEditProfileDirectly &&
    (editFirstName.trim() !== savedFirstName || editLastName.trim() !== savedLastName);
  const hasEmailChanges = editedEmail !== "" && editedEmail !== savedEmail;
  const savedPhone = employee?.phone ?? "";

  const firstNameError =
    canEditProfileDirectly && isEditing ? getStaffNameError(editFirstName, "First name") : null;
  const lastNameError =
    canEditProfileDirectly && isEditing ? getStaffNameError(editLastName, "Last name") : null;
  const emailError = isEditing ? getRequiredStaffEmailError(editEmail) : null;
  const phoneError = employee && isEditing ? getOptionalUsPhoneError(editPhone) : null;
  const normalizedPhone =
    phoneError || !employee ? editPhone.trim() : normalizeOptionalUsPhone(editPhone);
  const hasPhoneChanges = normalizedPhone !== savedPhone;
  const hasAnyChanges = hasNameChanges || hasEmailChanges || hasPhoneChanges;
  const hasInvalidDraft =
    isEditing && Boolean(firstNameError || lastNameError || emailError || phoneError);

  const requestFirstNameError =
    requestFirstName.trim().length > 0 ? getStaffNameError(requestFirstName, "First name") : null;
  const requestLastNameError =
    requestLastName.trim().length > 0 ? getStaffNameError(requestLastName, "Last name") : null;
  const requestNoteError = getStaffNotesError(requestNote);

  const showDeletion = !isGridmaster && !canEditProfileDirectly;

  const managementDepartmentIds = employee?.departmentIds ?? [];
  const allManagementDepartments = departments.filter((d) => d.type === "management");
  const managementDepartments = allManagementDepartments.filter((d) =>
    managementDepartmentIds.includes(d.id),
  );
  const showManagementAccess = managementDepartmentIds.length > 0;

  const [isEditingAccess, setIsEditingAccess] = useState(false);
  const [editDeptIds, setEditDeptIds] = useState<number[]>([]);
  const [savingAccess, setSavingAccess] = useState(false);

  function startEditingAccess() {
    setEditDeptIds(managementDepartmentIds);
    setIsEditingAccess(true);
  }

  function cancelEditingAccess() {
    setIsEditingAccess(false);
  }

  function toggleAccessDepartment(departmentId: number) {
    setEditDeptIds((prev) =>
      prev.includes(departmentId)
        ? prev.filter((id) => id !== departmentId)
        : [...prev, departmentId],
    );
  }

  const accessHasChanges =
    editDeptIds.length !== managementDepartmentIds.length ||
    editDeptIds.some((id) => !managementDepartmentIds.includes(id));
  const accessWouldOrphan = !isOnSchedule && editDeptIds.length === 0;

  async function saveAccessChanges() {
    if (!orgId || !user || savingAccess || accessWouldOrphan) return;
    setSavingAccess(true);
    try {
      await updateAppOnlyUser(user.id, orgId, { departmentIds: editDeptIds });
      setEmployee((prev) => (prev ? { ...prev, departmentIds: editDeptIds } : prev));
      setIsEditingAccess(false);
      toast.success("Management access updated.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to update management access."));
    } finally {
      setSavingAccess(false);
    }
  }

  const [showAddToSchedule, setShowAddToSchedule] = useState(false);
  const canAddToSchedule =
    canManageScheduleEmployees && !isOnSchedule && showManagementAccess && !!employee?.userId;

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

  function startEditing() {
    setEditFirstName(savedFirstName);
    setEditLastName(savedLastName);
    setEditEmail(user?.email ?? "");
    setEditPhone(employee?.phone ?? "");
    setIsEditing(true);
  }

  function cancelEditing() {
    setEditFirstName(savedFirstName);
    setEditLastName(savedLastName);
    setEditEmail(user?.email ?? "");
    setEditPhone(employee?.phone ?? "");
  }

  function closeEditor() {
    cancelEditing();
    setIsEditing(false);
  }

  function requestSave() {
    if (saving || hasInvalidDraft) return;
    if (!hasAnyChanges) {
      setIsEditing(false);
      return;
    }
    setPendingConfirm("account-details");
  }

  async function saveAccount() {
    if (!user) return;
    setSaving(true);
    try {
      const nextEmail = normalizeRequiredStaffEmail(editEmail);
      const nextFirst = normalizeStaffName(editFirstName);
      const nextLast = normalizeStaffName(editLastName);
      const nextPhone = employee ? normalizeOptionalUsPhone(editPhone) : "";

      if (hasEmailChanges) await updateBrowserUserEmail(nextEmail);
      if (hasNameChanges) {
        const updated = await updateSelfProfileDetails({
          firstName: nextFirst,
          lastName: nextLast,
          orgId,
        });
        setProfile(updated.profile);
        if (updated.employee) setEmployee(updated.employee);
      }
      if (hasPhoneChanges && orgId && employee) {
        const updated = await updateSelfProfilePhone({
          orgId,
          phone: nextPhone,
          expectedVersion: employee.version,
        });
        setEmployee(updated.employee);
      }
      setIsEditing(false);
      if (hasEmailChanges) {
        toast.success("Confirmation sent to your new email address.");
      } else {
        toast.success("Account details updated.");
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to update account details."));
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
      toast.error(extractErrorMessage(err, "Failed to send name change request."));
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
      toast.error(extractErrorMessage(err, "Failed to request account deletion."));
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
      toast.error(extractErrorMessage(err, "Failed to cancel that request."));
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
          confirmPendingLabel: EDITOR_ACTION_LABELS.saving,
          variant: "info" as const,
          loading: saving,
        }
      : pendingConfirm === "name-change-request"
        ? {
            title: "Send request?",
            message: "Confirm that you want to send this name change request.",
            confirmLabel: "Confirm request",
            confirmPendingLabel: "Sending",
            variant: "info" as const,
            loading: submittingRequest,
          }
        : pendingConfirm === "account-deletion"
          ? {
              title: "Request account deletion?",
              message:
                "Confirm that you want to request account deletion. An admin will review and approve before your account is removed.",
              confirmLabel: "Request deletion",
              confirmPendingLabel: "Requesting",
              variant: "danger" as const,
              loading: requestingDeletion,
            }
          : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                Account details
              </div>
              <div className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                Name, email, and phone for this account.
              </div>
            </div>
            {!isEditing && (
              <button
                type="button"
                onClick={startEditing}
                className="dg-btn dg-btn-secondary dg-btn-sm"
              >
                Edit account details
              </button>
            )}
          </div>

          {isEditing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                requestSave();
              }}
              className="flex flex-col gap-5 rounded-[var(--dg-radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
            >
              {canEditProfileDirectly && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="dg-label">First name</label>
                    <input
                      aria-label="First name"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="dg-input"
                    />
                    {firstNameError && <p className="dg-form-error">{firstNameError}</p>}
                  </div>
                  <div>
                    <label className="dg-label">Last name</label>
                    <input
                      aria-label="Last name"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="dg-input"
                    />
                    {lastNameError && <p className="dg-form-error">{lastNameError}</p>}
                  </div>
                </div>
              )}
              <div>
                <label className="dg-label">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="dg-input"
                  autoFocus
                />
                {emailError && <p className="dg-form-error">{emailError}</p>}
              </div>
              {employee && (
                <div>
                  <label className="dg-label">Phone</label>
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    onBlur={() => {
                      if (!phoneError && editPhone.trim()) setEditPhone(normalizedPhone);
                    }}
                    placeholder="Phone"
                    className="dg-input"
                  />
                  {phoneError && <p className="dg-form-error">{phoneError}</p>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving || !hasAnyChanges || hasInvalidDraft}
                  className="dg-btn dg-btn-primary dg-btn-sm"
                >
                  <ButtonLoading
                    loading={saving}
                    loadingLabel={EDITOR_ACTION_LABELS.saving}
                    spinnerSize={14}
                    icon={<Check size={14} />}
                  >
                    Save changes
                  </ButtonLoading>
                </button>
                <button
                  type="button"
                  onClick={hasAnyChanges ? cancelEditing : closeEditor}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                >
                  <X size={14} />
                  {getEditorDismissLabel({ hasUnsavedChanges: hasAnyChanges })}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" value={firstName} />
                <Field label="Last name" value={lastName} />
              </div>
              <Field label="Email" value={user?.email} />
              {employee && <Field label="Phone" value={employee.phone} />}
            </div>
          )}
        </div>
      </SectionCard>

      {showManagementAccess && (
        <SectionCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                  Management access
                </div>
                <div className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                  Your organization role and management department assignment.
                </div>
              </div>
              {canManageManagementAccess && !isEditingAccess && (
                <button
                  type="button"
                  onClick={startEditingAccess}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                >
                  Edit management access
                </button>
              )}
            </div>

            <Field label="Role" value={ROLE_LABELS[role] ?? role} />

            {isEditingAccess ? (
              <div className="flex flex-col gap-3 rounded-[var(--dg-radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                <div>
                  <label className="dg-label">Management departments</label>
                  <div className="flex flex-wrap gap-1.5">
                    {allManagementDepartments.map((department) => (
                      <SelectableTag
                        key={department.id}
                        selected={editDeptIds.includes(department.id)}
                        onClick={() => toggleAccessDepartment(department.id)}
                      >
                        {department.name}
                      </SelectableTag>
                    ))}
                  </div>
                  {accessWouldOrphan && (
                    <p className="dg-form-error">
                      You must stay assigned to at least one management department.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveAccessChanges}
                    disabled={savingAccess || !accessHasChanges || accessWouldOrphan}
                    className="dg-btn dg-btn-primary dg-btn-sm"
                  >
                    <ButtonLoading
                      loading={savingAccess}
                      loadingLabel={EDITOR_ACTION_LABELS.saving}
                      spinnerSize={14}
                      icon={<Check size={14} />}
                    >
                      Save changes
                    </ButtonLoading>
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditingAccess}
                    disabled={savingAccess}
                    className="dg-btn dg-btn-secondary dg-btn-sm"
                  >
                    <X size={14} />
                    {getEditorDismissLabel({ hasUnsavedChanges: accessHasChanges })}
                  </button>
                </div>
              </div>
            ) : (
              <Field
                label="Management departments"
                value={
                  managementDepartments.length > 0
                    ? managementDepartments.map((d) => d.name).join(", ")
                    : null
                }
              />
            )}

            {canAddToSchedule && (
              <button
                type="button"
                onClick={() => setShowAddToSchedule(true)}
                className="dg-btn dg-btn-secondary dg-btn-sm self-start"
              >
                Add to Schedule
              </button>
            )}
          </div>
        </SectionCard>
      )}

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
              <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                Name change requests
              </div>
              <div className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                Ask an admin to update your name. Email and phone are managed in Account details.
              </div>
            </div>

            {pendingNameRequest && (
              <div className="rounded-[var(--dg-radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-3 text-[13px] text-[var(--color-warning-text)]">
                A name change request is pending admin review.
                <button
                  type="button"
                  onClick={() => void cancelRequest(pendingNameRequest)}
                  disabled={cancellingId === pendingNameRequest.id}
                  className="dg-btn dg-btn-secondary dg-btn-sm ml-3"
                >
                  <ButtonLoading
                    loading={cancellingId === pendingNameRequest.id}
                    loadingLabel="Cancelling"
                  >
                    Cancel request
                  </ButtonLoading>
                </button>
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
            <button
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
              <ButtonLoading loading={submittingRequest} loadingLabel="Sending Request">
                Request name change
              </ButtonLoading>
            </button>
            {loadingChangeRequests ? (
              <span
                aria-hidden
                className="dg-skeleton"
                style={{ display: "inline-block", width: 180, height: 12, borderRadius: 4 }}
              />
            ) : changeRequests.length > 0 ? (
              <p className="m-0 text-[13px] text-[var(--color-text-muted)]">
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
              borderTop: "1px solid var(--color-danger-bg)",
              paddingTop: 16,
            }}
          >
            <div>
              <div className="text-[14px] font-semibold" style={{ color: "var(--color-danger)" }}>
                Delete account
              </div>
              <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
                Request that an admin delete your account. This is irreversible.
              </p>
            </div>
            {pendingDeletion ? (
              <div className="rounded-[var(--dg-radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-3 text-[13px] text-[var(--color-warning-text)]">
                Account deletion request pending admin review.
                <button
                  type="button"
                  onClick={() => void cancelRequest(pendingDeletion)}
                  disabled={cancellingId === pendingDeletion.id}
                  className="dg-btn dg-btn-secondary dg-btn-sm ml-3"
                >
                  <ButtonLoading
                    loading={cancellingId === pendingDeletion.id}
                    loadingLabel="Cancelling"
                  >
                    Cancel request
                  </ButtonLoading>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPendingConfirm("account-deletion")}
                disabled={requestingDeletion || !orgId}
                className="dg-btn dg-btn-danger self-start"
              >
                <ButtonLoading
                  loading={requestingDeletion}
                  loadingLabel="Requesting"
                  spinnerSize={14}
                  icon={<Trash2 size={14} style={{ marginRight: 4 }} />}
                >
                  Request account deletion
                </ButtonLoading>
              </button>
            )}
          </div>
        </SectionCard>
      )}

      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          confirmPendingLabel={confirmation.confirmPendingLabel}
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
