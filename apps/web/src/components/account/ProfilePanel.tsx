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
import { Check, X } from "lucide-react";

import { SectionCard } from "@/components/settings/shared";
import ConfirmDialog from "@/components/ConfirmDialog";
import { extractErrorMessage } from "@/lib/error-handling";
import { formatClientLabel } from "@/lib/client-facing";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";
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
import type { Employee } from "@/types";
import type { User } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";

interface ProfilePanelProps {
  user: User | null;
  profile: SelfProfileRecord | null;
  employee: Employee | null;
  orgId: string | null;
  canEditProfileDirectly: boolean;
  setProfile: Dispatch<SetStateAction<SelfProfileRecord | null>>;
  setEmployee: Dispatch<SetStateAction<Employee | null>>;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="dg-label" style={{ marginBottom: 0 }}>{label}</span>
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
  const [pendingConfirm, setPendingConfirm] = useState<
    "account-details" | "name-change-request" | null
  >(null);

  const [changeRequests, setChangeRequests] = useState<ProfileChangeRequest[]>([]);
  const [loadingChangeRequests, setLoadingChangeRequests] = useState(false);
  const [requestFirstName, setRequestFirstName] = useState("");
  const [requestLastName, setRequestLastName] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
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

  useEffect(() => {
    if (!orgId || canEditProfileDirectly) {
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
  }, [canEditProfileDirectly, orgId]);

  const pendingRequests = changeRequests.filter((r) => r.status === "pending");
  const pendingNameRequest = pendingRequests.find((r) => r.type === "profile_update");

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

  async function cancelRequest(request: ProfileChangeRequest) {
    if (cancellingId) return;
    setCancellingId(request.id);
    try {
      const result = await cancelOwnProfileChangeRequest(request.id);
      setChangeRequests((cur) =>
        cur.map((r) => (r.id === result.request.id ? result.request : r)),
      );
      toast.success("Name change request cancelled.");
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
                  <Check size={14} />
                  {saving ? "Saving..." : "Save changes"}
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
                  {cancellingId === pendingNameRequest.id ? "Cancelling..." : "Cancel request"}
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
                {requestFirstNameError && (
                  <p className="dg-form-error">{requestFirstNameError}</p>
                )}
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
                {requestLastNameError && (
                  <p className="dg-form-error">{requestLastNameError}</p>
                )}
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
              {submittingRequest ? "Sending..." : "Request name change"}
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
