"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  getRequiredStaffEmailError,
  getStaffNameError,
  getStaffNotesError,
  getOptionalUsPhoneError,
  normalizeOptionalUsPhone,
  normalizeStaffName,
  normalizeStaffNotes,
  normalizeRequiredStaffEmail,
} from "@dubgrid/contracts";
import { useOrganizationData, usePermissions } from "@/hooks";
import { ProtectedRoute } from "@/components/RouteGuards";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-handling";
import { formatClientLabel } from "@/lib/client-facing";
import { ChevronLeft, Check, Trash2, X } from "lucide-react";
import { PageContainer } from "@/components/PageContainer";
import { MFASetup } from "@/components/profile/MFASetup";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { SessionList } from "@/components/profile/SessionList";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { PendingRequestsCard } from "@/components/profile/PendingRequestsCard";
import { ProfileSectionTabs } from "@/components/profile/ProfileSectionTabs";
import { openConsentPreferences } from "@/components/CookieConsent";
import {
  SelfWorkOverview,
  SelfWorkSchedule,
} from "@/components/profile/SelfWorkProfile";
import { useSelfProfileData } from "@/hooks/useSelfProfileData";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getAvatarInitials } from "@/lib/utils";
import {
  cancelOwnProfileChangeRequest,
  createOwnProfileChangeRequest,
  fetchOwnProfileChangeRequests,
  signInBrowserWithPassword,
  signOutFromBrowser,
  updateBrowserUserEmail,
  updateBrowserUserPassword,
  updateSelfProfileDetails,
  updateSelfProfilePhone,
  type ProfileChangeRequest,
  type ProfileRequestedChanges,
} from "@/features/account/client";

const ROLE_LABELS: Record<string, string> = {
  gridmaster: "Gridmaster",
  super_admin: "Super Admin",
  admin: "Admin",
  scheduler: "Admin", // legacy
  supervisor: "Admin", // legacy
  user: "User",
};

type ProfileConfirmation =
  | "account-details"
  | "profile-change-request"
  | "account-deletion"
  | "password";

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="dg-label" style={{ marginBottom: 0 }}>{label}</span>
      <span
        style={{
          fontSize: "var(--dg-fs-body-sm)",
          color: value
            ? "var(--color-text-primary)"
            : "var(--color-text-subtle)",
        }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

export function ProfilePageContent() {
  const router = useRouter();
  const {
    role,
    orgId,
    isLoading: permissionsLoading,
    canManageEmployees,
    isSuperAdmin,
    isGridmaster,
  } = usePermissions();
  const {
    org,
    focusAreas,
    assignments: assignments,
    shiftCategories,
    absenceTypes,
    certifications,
    orgRoles,
  } = useOrganizationData();
  const {
    user,
    profile,
    employee,
    shifts,
    recurringShifts,
    shiftRequests,
    auditNames,
    isLoading: selfProfileLoading,
    error: selfProfileError,
    setProfile,
    setEmployee,
  } = useSelfProfileData({ orgId });

  type ProfileSection = "account" | "overview" | "schedule";

  // Account details editing
  const [isEditingAccountDetails, setIsEditingAccountDetails] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingAccountDetails, setSavingAccountDetails] = useState(false);
  const [changeRequests, setChangeRequests] = useState<ProfileChangeRequest[]>(
    [],
  );
  const [loadingChangeRequests, setLoadingChangeRequests] = useState(false);
  const [requestFirstName, setRequestFirstName] = useState("");
  const [requestLastName, setRequestLastName] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [cancellingChangeRequestId, setCancellingChangeRequestId] = useState<
    string | null
  >(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ProfileConfirmation | null>(null);

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Session management
  const [signingOut, setSigningOut] = useState<"others" | "global" | null>(
    null,
  );

  const [activeTab, setActiveTab] = useState<ProfileSection>("account");

  const firstName = profile?.first_name?.trim() || null;
  const lastName = profile?.last_name?.trim() || null;
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;
  const mfaEnabled = profile?.mfa_enabled ?? false;

  const initials = getAvatarInitials(
    name,
    (user?.email?.[0] ?? "?").toUpperCase(),
  );

  const hasLinkedEmployee = !!employee;
  const canEditProfileDirectly =
    Boolean(canManageEmployees) ||
    Boolean(isSuperAdmin) ||
    Boolean(isGridmaster);
  const savedFirstName = firstName ?? "";
  const savedLastName = lastName ?? "";
  const hasNameChanges =
    canEditProfileDirectly &&
    (editFirstName.trim() !== savedFirstName ||
      editLastName.trim() !== savedLastName);
  const savedEmail = (user?.email ?? "").trim().toLowerCase();
  const editedEmail = editEmail.trim().toLowerCase();
  const hasEmailChanges = editedEmail !== "" && editedEmail !== savedEmail;
  const savedPhone = employee?.phone ?? "";
  const accountFirstNameError =
    canEditProfileDirectly && isEditingAccountDetails
      ? getStaffNameError(editFirstName, "First name")
      : null;
  const accountLastNameError =
    canEditProfileDirectly && isEditingAccountDetails
      ? getStaffNameError(editLastName, "Last name")
      : null;
  const accountEmailError = isEditingAccountDetails
    ? getRequiredStaffEmailError(editEmail)
    : null;
  const accountPhoneError =
    employee && isEditingAccountDetails
      ? getOptionalUsPhoneError(editPhone)
      : null;
  const normalizedEditedPhone =
    accountPhoneError || !employee
      ? editPhone.trim()
      : normalizeOptionalUsPhone(editPhone);
  const hasPhoneChanges = normalizedEditedPhone !== savedPhone;
  const hasAccountChanges =
    hasNameChanges || hasEmailChanges || hasPhoneChanges;
  const hasPasswordChanges =
    currentPassword.length > 0 ||
    newPassword.length > 0 ||
    confirmNewPassword.length > 0;
  const requestFirstNameError =
    requestFirstName.trim().length > 0
      ? getStaffNameError(requestFirstName, "First name")
      : null;
  const requestLastNameError =
    requestLastName.trim().length > 0
      ? getStaffNameError(requestLastName, "Last name")
      : null;
  const requestNoteError = getStaffNotesError(requestNote);
  const hasInvalidAccountDraft =
    isEditingAccountDetails &&
    Boolean(
      accountFirstNameError ||
      accountLastNameError ||
      accountEmailError ||
      accountPhoneError,
    );

  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const displayName = name ?? user?.email?.split("@")[0] ?? "Your profile";
  const isPageLoading = permissionsLoading || selfProfileLoading;
  const profileTabs = hasLinkedEmployee
    ? [
        { id: "account", label: "Account" },
        { id: "overview", label: "Overview" },
        { id: "schedule", label: "Schedule" },
      ]
    : [{ id: "account", label: "Account" }];

  useEffect(() => {
    if (!hasLinkedEmployee && activeTab !== "account") {
      setActiveTab("account");
    }
  }, [activeTab, hasLinkedEmployee]);

  useEffect(() => {
    if (!orgId || canEditProfileDirectly) {
      setChangeRequests([]);
      return;
    }

    let cancelled = false;
    setLoadingChangeRequests(true);
    fetchOwnProfileChangeRequests(orgId)
      .then((result) => {
        if (!cancelled) {
          setChangeRequests(result.requests);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChangeRequests([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingChangeRequests(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canEditProfileDirectly, orgId]);

  const pendingRequests = changeRequests.filter(
    (request) => request.status === "pending",
  );
  const pendingProfileRequest = pendingRequests.find(
    (request) => request.type === "profile_update",
  );
  const pendingDeletionRequest = pendingRequests.find(
    (request) => request.type === "account_deletion",
  );

  function startEditingAccountDetails() {
    setEditFirstName(savedFirstName);
    setEditLastName(savedLastName);
    setEditEmail(user?.email ?? "");
    setEditPhone(employee?.phone ?? "");
    setIsEditingAccountDetails(true);
  }

  function cancelEditingAccountDetails() {
    setEditFirstName(savedFirstName);
    setEditLastName(savedLastName);
    setEditEmail(user?.email ?? "");
    setEditPhone(employee?.phone ?? "");
  }

  function closeAccountDetailsEditor() {
    cancelEditingAccountDetails();
    setIsEditingAccountDetails(false);
  }

  function requestAccountDetailsSave() {
    if (savingAccountDetails || hasInvalidAccountDraft) return;
    if (!hasAccountChanges) {
      setIsEditingAccountDetails(false);
      return;
    }
    setPendingConfirmation("account-details");
  }

  async function saveAccountDetails() {
    if (!user) return;
    if (!hasAccountChanges) {
      setIsEditingAccountDetails(false);
      return;
    }

    setSavingAccountDetails(true);
    try {
      const nextEmail = normalizeRequiredStaffEmail(editEmail);
      const nextFirstName = normalizeStaffName(editFirstName);
      const nextLastName = normalizeStaffName(editLastName);
      const nextPhone = employee ? normalizeOptionalUsPhone(editPhone) : "";

      if (hasEmailChanges) {
        await updateBrowserUserEmail(nextEmail);
      }

      if (hasNameChanges) {
        const updated = await updateSelfProfileDetails({
          firstName: nextFirstName,
          lastName: nextLastName,
          orgId,
        });
        setProfile(updated.profile);
        if (updated.employee) {
          setEmployee(updated.employee);
        }
      }

      if (hasPhoneChanges && orgId && employee) {
        const updated = await updateSelfProfilePhone({
          orgId,
          phone: nextPhone,
          expectedVersion: employee.version,
        });
        setEmployee(updated.employee);
      }

      setIsEditingAccountDetails(false);

      if (hasEmailChanges && hasPhoneChanges) {
        toast.success(
          "Phone updated. Confirmation sent to your new email address.",
        );
      } else if (hasEmailChanges && hasNameChanges) {
        toast.success(
          "Account details updated. Confirmation sent to your new email address.",
        );
      } else if (hasEmailChanges) {
        toast.success("Confirmation sent to your new email address.");
      } else if (hasNameChanges && hasPhoneChanges) {
        toast.success("Account and contact details updated.");
      } else if (hasNameChanges) {
        toast.success("Account details updated.");
      } else if (hasPhoneChanges) {
        toast.success("Phone updated.");
      }
    } catch (err: unknown) {
      toast.error(
        extractErrorMessage(err, "Failed to update account details."),
      );
    } finally {
      setSavingAccountDetails(false);
    }
  }

  async function submitProfileChangeRequest() {
    if (!orgId || submittingChangeRequest || pendingProfileRequest) return;

    const requestedChanges: ProfileRequestedChanges = {};
    if (requestFirstNameError || requestLastNameError || requestNoteError) {
      toast.error(
        requestFirstNameError ??
          requestLastNameError ??
          requestNoteError ??
          "Invalid input.",
      );
      return;
    }
    if (
      requestFirstName.trim() &&
      requestFirstName.trim() !== (firstName ?? "")
    ) {
      requestedChanges.firstName = normalizeStaffName(requestFirstName);
    }
    if (requestLastName.trim() && requestLastName.trim() !== (lastName ?? "")) {
      requestedChanges.lastName = normalizeStaffName(requestLastName);
    }

    if (Object.keys(requestedChanges).length === 0) {
      toast.error("Enter at least one name change to request.");
      return;
    }

    setPendingConfirmation("profile-change-request");
  }

  async function sendProfileChangeRequest() {
    if (!orgId || submittingChangeRequest || pendingProfileRequest) return;

    const requestedChanges: ProfileRequestedChanges = {};
    if (
      requestFirstName.trim() &&
      requestFirstName.trim() !== (firstName ?? "")
    ) {
      requestedChanges.firstName = normalizeStaffName(requestFirstName);
    }
    if (requestLastName.trim() && requestLastName.trim() !== (lastName ?? "")) {
      requestedChanges.lastName = normalizeStaffName(requestLastName);
    }

    if (Object.keys(requestedChanges).length === 0) {
      toast.error("Enter at least one name change to request.");
      return;
    }

    setSubmittingChangeRequest(true);
    try {
      const result = await createOwnProfileChangeRequest({
        orgId,
        type: "profile_update",
        requestedChanges,
        requestNote: normalizeStaffNotes(requestNote),
      });
      setChangeRequests((current) => [result.request, ...current]);
      setRequestFirstName("");
      setRequestLastName("");
      setRequestNote("");
      toast.success("Name change request sent.");
    } catch (err) {
      toast.error(
        extractErrorMessage(err, "Failed to send name change request."),
      );
    } finally {
      setSubmittingChangeRequest(false);
    }
  }

  async function requestAccountDeletion() {
    if (!orgId || requestingDeletion || pendingDeletionRequest) return;

    setPendingConfirmation("account-deletion");
  }

  async function cancelChangeRequest(request: ProfileChangeRequest) {
    if (cancellingChangeRequestId) return;

    setCancellingChangeRequestId(request.id);
    try {
      const result = await cancelOwnProfileChangeRequest(request.id);
      setChangeRequests((current) =>
        current.map((existing) =>
          existing.id === result.request.id ? result.request : existing,
        ),
      );
      toast.success(
        request.type === "account_deletion"
          ? "Account deletion request cancelled."
          : "Name change request cancelled.",
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to cancel that request."));
    } finally {
      setCancellingChangeRequestId(null);
    }
  }

  async function sendAccountDeletionRequest() {
    if (!orgId || requestingDeletion || pendingDeletionRequest) return;

    setRequestingDeletion(true);
    try {
      const result = await createOwnProfileChangeRequest({
        orgId,
        type: "account_deletion",
        requestNote: "Account deletion requested from self profile.",
      });
      setChangeRequests((current) => [result.request, ...current]);
      toast.success("Account deletion request sent.");
    } catch (err) {
      toast.error(
        extractErrorMessage(err, "Failed to request account deletion."),
      );
    } finally {
      setRequestingDeletion(false);
    }
  }

  function requestPasswordChange(e: FormEvent) {
    e.preventDefault();
    if (savingPassword) return;
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError("Password must be at least 10 characters.");
      return;
    }

    setPendingConfirmation("password");
  }

  async function handlePasswordChange() {
    if (savingPassword) return;
    setPasswordError(null);

    if (!currentPassword) {
      setPendingConfirmation(null);
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPendingConfirmation(null);
      setPasswordError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 10) {
      setPendingConfirmation(null);
      setPasswordError("Password must be at least 10 characters.");
      return;
    }

    setSavingPassword(true);
    let passwordUpdated = false;
    let shouldRedirectToLogin = false;
    try {
      const accountEmail = user?.email?.trim();
      if (!accountEmail) {
        setPasswordError(
          "This account does not have an email address available for password verification.",
        );
        return;
      }

      const verifyResult = await signInBrowserWithPassword({
        email: accountEmail,
        password: currentPassword,
      });
      if (verifyResult.error) {
        setPasswordError("That password did not match this account.");
        return;
      }

      await updateBrowserUserPassword(newPassword);
      passwordUpdated = true;
      await signOutFromBrowser("global");
      shouldRedirectToLogin = true;
      window.location.replace("/login");
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("same") || msg.includes("different")) {
        setPasswordError(
          "New password must be different from your current password.",
        );
      } else if (msg.includes("reauthentication") || msg.includes("recently")) {
        setPasswordError(
          "Please sign out and sign in again before changing your password.",
        );
      } else if (msg.includes("weak") || msg.includes("short")) {
        setPasswordError(
          "Password is too weak. Please choose a stronger password.",
        );
      } else {
        toast.error(
          passwordUpdated
            ? "Password updated, but we couldn't sign you out. Please sign out and sign in again."
            : "Failed to update password. Please try again.",
        );
      }
    } finally {
      if (!shouldRedirectToLogin) {
        setPendingConfirmation(null);
        setSavingPassword(false);
      }
    }
  }

  function openPasswordForm() {
    setPasswordError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowPassword(false);
    setShowPasswordForm(true);
  }

  function closePasswordForm() {
    setPasswordError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowPassword(false);
    setShowPasswordForm(false);
  }

  function discardPasswordChanges() {
    setPasswordError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowPassword(false);
  }

  async function handleSignOutOthers() {
    setSigningOut("others");
    try {
      await signOutFromBrowser("others");
      toast.success("All other sessions have been signed out.");
    } catch {
      toast.error("Failed to sign out other sessions.");
    } finally {
      setSigningOut(null);
    }
  }

  async function handleSignOutAll() {
    setSigningOut("global");
    try {
      await signOutFromBrowser("global");
      window.location.replace("/login");
    } catch {
      toast.error("Failed to sign out. Please try again.");
      setSigningOut(null);
    }
  }

  function confirmPendingAction() {
    const action = pendingConfirmation;
    if (!action) return;

    if (action === "password") {
      void handlePasswordChange();
      return;
    }

    setPendingConfirmation(null);

    if (action === "account-details") {
      void saveAccountDetails();
    } else if (action === "profile-change-request") {
      void sendProfileChangeRequest();
    } else if (action === "account-deletion") {
      void sendAccountDeletionRequest();
    }
  }

  const confirmation =
    pendingConfirmation === "account-details"
      ? {
          title: "Save changes?",
          message: "Confirm that you want to save these account and contact changes.",
          confirmLabel: "Confirm save",
          variant: "info" as const,
        }
      : pendingConfirmation === "profile-change-request"
        ? {
            title: "Send request?",
            message: "Confirm that you want to send this name change request.",
            confirmLabel: "Confirm request",
            variant: "info" as const,
          }
        : pendingConfirmation === "account-deletion"
          ? {
              title: "Request account deletion?",
              message: "Confirm that you want to request account deletion.",
              confirmLabel: "Request deletion",
              variant: "danger" as const,
            }
          : pendingConfirmation === "password"
            ? {
                title: "Update password?",
                message:
                  "Confirm that you want to update your password. You will be signed out of every session.",
                confirmLabel: "Update and sign out",
                variant: "warning" as const,
              }
            : null;

  const confirmationLoading =
    pendingConfirmation === "account-details"
      ? savingAccountDetails
      : pendingConfirmation === "profile-change-request"
        ? submittingChangeRequest
        : pendingConfirmation === "account-deletion"
          ? requestingDeletion
          : pendingConfirmation === "password"
            ? savingPassword
            : false;

  return (
    <>
      <div className="min-h-screen bg-[var(--color-bg)]">
        <PageContainer maxWidth={1100} contentStyle={{ paddingBottom: 40 }}>
          <div className="space-y-6">
            <button
              type="button"
              onClick={() =>
                window.history.length > 1
                  ? router.back()
                  : router.push(
                      role === "gridmaster" ? "/gridmaster" : "/schedule",
                    )
              }
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              <ChevronLeft className="size-4" strokeWidth={2.5} />
              Back
            </button>

            <ProfileHeroCard
              initials={isPageLoading ? "" : initials}
              name={displayName}
              email={user?.email ?? null}
              roleLabel={ROLE_LABELS[role] ?? "User"}
              createdAt={createdAt}
              lastSignIn={lastSignIn}
              employee={employee}
            />

            {selfProfileError && (
              <div
                className="dg-card"
                style={{
                  borderColor: "var(--color-warning-border)",
                  background: "var(--color-warning-bg)",
                }}
              >
                <div className="dg-card-body">
                  <p className="m-0 text-[14px] text-[var(--color-text-muted)]">
                    {selfProfileError}
                  </p>
                </div>
              </div>
            )}

            <PendingRequestsCard
              requests={pendingRequests}
              cancellingId={cancellingChangeRequestId}
              onCancel={cancelChangeRequest}
            />

            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">
                    Profile sections
                  </h2>
                  <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
                    {hasLinkedEmployee
                      ? "Use Account for name, email, and phone. Work shows current organization details and schedule."
                      : "Manage your account settings from one place."}
                  </p>
                </div>

                {profileTabs.length > 1 ? (
                  <ProfileSectionTabs
                    tabs={profileTabs}
                    activeTab={activeTab}
                    onChange={(tabId) => setActiveTab(tabId as ProfileSection)}
                  />
                ) : null}
              </div>

              {activeTab === "account" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="dg-card h-full">
                    <div className="dg-card-header">
                      <div>
                        <div className="dg-card-title">Account details</div>
                        <div className="dg-card-subtitle">
                          Name, email, phone, and access for this account.
                        </div>
                      </div>
                      {!isEditingAccountDetails ? (
                        <button
                          type="button"
                          onClick={startEditingAccountDetails}
                          className="dg-btn dg-btn-secondary dg-btn-sm"
                        >
                          Edit account details
                        </button>
                      ) : null}
                    </div>
                    <div className="dg-card-body flex flex-col gap-5">
                      {isEditingAccountDetails ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            requestAccountDetailsSave();
                          }}
                          className="flex flex-col gap-5 rounded-[var(--dg-radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
                        >
                          {canEditProfileDirectly ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="dg-label">First name</label>
                                <input
                                  aria-label="First name"
                                  value={editFirstName}
                                  onChange={(e) =>
                                    setEditFirstName(e.target.value)
                                  }
                                  className="dg-input"
                                />
                                {accountFirstNameError ? (
                                  <p className="dg-form-error">
                                    {accountFirstNameError}
                                  </p>
                                ) : null}
                              </div>
                              <div>
                                <label className="dg-label">Last name</label>
                                <input
                                  aria-label="Last name"
                                  value={editLastName}
                                  onChange={(e) =>
                                    setEditLastName(e.target.value)
                                  }
                                  className="dg-input"
                                />
                                {accountLastNameError ? (
                                  <p className="dg-form-error">
                                    {accountLastNameError}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          <div>
                            <label className="dg-label">Email</label>
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              className="dg-input"
                              autoFocus
                            />
                            {accountEmailError ? (
                              <p className="dg-form-error">
                                {accountEmailError}
                              </p>
                            ) : null}
                          </div>
                          {employee ? (
                            <div>
                              <label className="dg-label">Phone</label>
                              <input
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                onBlur={() => {
                                  if (!accountPhoneError && editPhone.trim()) {
                                    setEditPhone(normalizedEditedPhone);
                                  }
                                }}
                                placeholder="Phone"
                                className="dg-input"
                              />
                              {accountPhoneError ? (
                                <p className="dg-form-error">
                                  {accountPhoneError}
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={
                                savingAccountDetails ||
                                !hasAccountChanges ||
                                hasInvalidAccountDraft
                              }
                              className="dg-btn dg-btn-primary dg-btn-sm"
                            >
                              <Check size={14} />
                              {savingAccountDetails
                                ? "Saving..."
                                : "Save changes"}
                            </button>
                            <button
                              type="button"
                              onClick={
                                hasAccountChanges
                                  ? cancelEditingAccountDetails
                                  : closeAccountDetailsEditor
                              }
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                            >
                              <X size={14} />
                              {getEditorDismissLabel({ hasUnsavedChanges: hasAccountChanges })}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="First name" value={firstName} />
                            <Field label="Last name" value={lastName} />
                          </div>
                          <Field label="Email" value={user?.email} />
                          {employee ? (
                            <Field label="Phone" value={employee.phone} />
                          ) : null}
                        </>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2">
                        {role === "gridmaster" ? (
                          <Field label="Platform role" value="Gridmaster" />
                        ) : (
                          <Field
                            label="Organization role"
                            value={ROLE_LABELS[role] ?? "User"}
                          />
                        )}
                        <Field label="Date joined" value={createdAt} />
                        <Field label="Last sign in" value={lastSignIn} />
                      </div>
                    </div>
                  </div>

                  {!canEditProfileDirectly ? (
                    <div className="dg-card h-full">
                      <div className="dg-card-header">
                        <div>
                          <div className="dg-card-title">
                            Name change requests
                          </div>
                          <div className="dg-card-subtitle">
                            Ask an admin to update your name. Email and phone
                            are managed in Account details.
                          </div>
                        </div>
                      </div>
                      <div className="dg-card-body flex flex-col gap-4">
                        {pendingProfileRequest ? (
                          <div className="rounded-[var(--dg-radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-3 text-[13px] text-[var(--color-warning-text)]">
                            A name change request is pending admin review.
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input
                            aria-label="Requested first name"
                            className="dg-input"
                            disabled={!!pendingProfileRequest}
                            placeholder="Requested first name"
                            value={requestFirstName}
                            onChange={(event) =>
                              setRequestFirstName(event.target.value)
                            }
                          />
                          {requestFirstNameError ? (
                            <p className="dg-form-error">
                              {requestFirstNameError}
                            </p>
                          ) : null}
                          <input
                            aria-label="Requested last name"
                            className="dg-input"
                            disabled={!!pendingProfileRequest}
                            placeholder="Requested last name"
                            value={requestLastName}
                            onChange={(event) =>
                              setRequestLastName(event.target.value)
                            }
                          />
                          {requestLastNameError ? (
                            <p className="dg-form-error">
                              {requestLastNameError}
                            </p>
                          ) : null}
                        </div>
                        <textarea
                          aria-label="Request note"
                          className="dg-input"
                          disabled={!!pendingProfileRequest}
                          placeholder="Note for admins"
                          rows={3}
                          value={requestNote}
                          onChange={(event) =>
                            setRequestNote(event.target.value)
                          }
                        />
                        {requestNoteError ? (
                          <p className="dg-form-error">{requestNoteError}</p>
                        ) : null}
                        <button
                          type="button"
                          disabled={
                            submittingChangeRequest ||
                            !!pendingProfileRequest ||
                            !orgId ||
                            Boolean(requestFirstNameError) ||
                            Boolean(requestLastNameError) ||
                            Boolean(requestNoteError)
                          }
                          onClick={() => void submitProfileChangeRequest()}
                          className="dg-btn dg-btn-secondary dg-btn-sm self-start"
                        >
                          {submittingChangeRequest
                            ? "Sending..."
                            : "Request name change"}
                        </button>
                        {loadingChangeRequests ? (
                          <p className="m-0 text-[13px] text-[var(--color-text-muted)]">
                            Loading request history...
                          </p>
                        ) : changeRequests.length > 0 ? (
                          <p className="m-0 text-[13px] text-[var(--color-text-muted)]">
                            Latest request:{" "}
                            {formatClientLabel(changeRequests[0].status)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="dg-card h-full">
                    <div className="dg-card-header">
                      <div>
                        <div className="dg-card-title">Security</div>
                        <div className="dg-card-subtitle">
                          Password, two-factor authentication, and sign-in
                          protection.
                        </div>
                      </div>
                    </div>
                    <div className="dg-card-body flex flex-col gap-5">
                      <div className="flex flex-col gap-4 rounded-[var(--dg-radius-md)] border border-[var(--color-border-light)] bg-[var(--color-bg)] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                              Password
                            </div>
                            <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
                              Choose a strong password with at least 10
                              characters.
                            </p>
                          </div>
                          {!showPasswordForm ? (
                            <button
                              type="button"
                              onClick={openPasswordForm}
                              className="dg-btn dg-btn-secondary dg-btn-sm self-start"
                            >
                              Change password
                            </button>
                          ) : null}
                        </div>

                        {showPasswordForm ? (
                          <form
                            onSubmit={requestPasswordChange}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 14,
                            }}
                          >
                            <div>
                              <label className="dg-label">Current Password</label>
                              <PasswordInput
                                placeholder="Enter current password"
                                value={currentPassword}
                                onChange={setCurrentPassword}
                                showPassword={showPassword}
                                onToggle={() => setShowPassword((v) => !v)}
                                autoComplete="current-password"
                                className="dg-input"
                              />
                            </div>
                            <div>
                              <label className="dg-label">New Password</label>
                              <PasswordInput
                                placeholder="Enter new password"
                                value={newPassword}
                                onChange={setNewPassword}
                                showPassword={showPassword}
                                onToggle={() => setShowPassword((v) => !v)}
                                autoComplete="new-password"
                                ariaDescribedBy="password-strength-label password-strength-hints"
                                className="dg-input"
                              />
                              <PasswordStrength password={newPassword} />
                            </div>
                            <div>
                              <label className="dg-label">Confirm New Password</label>
                              <PasswordInput
                                placeholder="Confirm new password"
                                value={confirmNewPassword}
                                onChange={setConfirmNewPassword}
                                showPassword={showPassword}
                                onToggle={() => setShowPassword((v) => !v)}
                                autoComplete="new-password"
                                className="dg-input"
                              />
                            </div>
                            {passwordError ? (
                              <p
                                style={{
                                  color: "var(--color-danger-dark)",
                                  fontSize: "var(--dg-fs-body-sm)",
                                  margin: 0,
                                }}
                              >
                                {passwordError}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="submit"
                                disabled={
                                  savingPassword ||
                                  !currentPassword ||
                                  !newPassword ||
                                  !confirmNewPassword
                                }
                                className="dg-btn dg-btn-primary dg-btn-sm"
                              >
                                <ButtonLoading
                                  loading={savingPassword}
                                  spinnerColor="var(--color-text-inverse)"
                                  spinnerSize={16}
                                >
                                  Update Password
                                </ButtonLoading>
                              </button>
                              <button
                                type="button"
                                onClick={
                                  hasPasswordChanges
                                    ? discardPasswordChanges
                                    : closePasswordForm
                                }
                                className="dg-btn dg-btn-secondary dg-btn-sm"
                              >
                                {getEditorDismissLabel({ hasUnsavedChanges: hasPasswordChanges })}
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>

                      <div style={{ paddingTop: 4 }}>
                        <label className="dg-label" style={{ marginBottom: 12 }}>
                          Two-Factor Authentication
                        </label>
                        <MFASetup
                          mfaEnabled={mfaEnabled}
                          onStatusChange={(enabled) => {
                            setProfile((current) => ({
                              first_name: current?.first_name ?? null,
                              last_name: current?.last_name ?? null,
                              mfa_enabled: enabled,
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="dg-card h-full">
                    <div className="dg-card-header">
                      <div>
                        <div className="dg-card-title">Notifications</div>
                        <div className="dg-card-subtitle">
                          Choose how and when DubGrid contacts you.
                        </div>
                      </div>
                    </div>
                    <div className="dg-card-body">
                      <NotificationPreferences
                        visibleCategories={
                          role === "gridmaster" ? ["system"] : undefined
                        }
                      />
                    </div>
                  </div>

                  <div className="dg-card h-full">
                    <div className="dg-card-header">
                      <div>
                        <div className="dg-card-title">Sessions</div>
                        <div className="dg-card-subtitle">
                          Manage sign-in state across browsers and devices.
                        </div>
                      </div>
                    </div>
                    <div className="dg-card-body flex flex-col gap-3">
                      <p className="m-0 text-[14px] text-[var(--color-text-muted)]">
                        Manage your active sessions across devices.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSignOutOthers}
                          disabled={signingOut !== null}
                          className="dg-btn dg-btn-secondary"
                        >
                          <ButtonLoading
                            loading={signingOut === "others"}
                            spinnerSize={14}
                          >
                            Sign out other devices
                          </ButtonLoading>
                        </button>
                        <button
                          type="button"
                          onClick={handleSignOutAll}
                          disabled={signingOut !== null}
                          className="dg-btn dg-btn-danger"
                        >
                          <ButtonLoading
                            loading={signingOut === "global"}
                            spinnerSize={14}
                          >
                            Sign out everywhere
                          </ButtonLoading>
                        </button>
                      </div>
                      <div className="border-t border-[var(--color-border-light)] pt-4">
                        <div className="mb-3">
                          <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                            Active sessions
                          </div>
                          <div className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                            Inspect authenticated devices that are still active.
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-[var(--dg-radius-md)] border border-[var(--color-border-light)] bg-[var(--color-surface)]">
                          <SessionList />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="dg-card h-full">
                    <div className="dg-card-header">
                      <div>
                        <div className="dg-card-title">Privacy &amp; data</div>
                        <div className="dg-card-subtitle">
                          Review our policies and manage cookie preferences.
                        </div>
                      </div>
                    </div>
                    <div className="dg-card-body flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        <a
                          href="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="dg-btn dg-btn-secondary"
                        >
                          Privacy policy
                        </a>
                        <a
                          href="/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="dg-btn dg-btn-secondary"
                        >
                          Terms of service
                        </a>
                        <a
                          href="/cookie-policy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="dg-btn dg-btn-secondary"
                        >
                          Cookie policy
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={openConsentPreferences}
                        className="dg-btn dg-btn-primary"
                        style={{ alignSelf: "flex-start" }}
                      >
                        Manage cookie preferences
                      </button>
                    </div>
                  </div>

                  <div
                    className="dg-card h-full md:col-span-2"
                    style={{ borderColor: "var(--color-danger)" }}
                  >
                    <div
                      className="dg-card-header"
                      style={{ borderBottomColor: "var(--color-danger-bg)" }}
                    >
                      <div>
                        <div
                          className="dg-card-title"
                          style={{ color: "var(--color-danger)" }}
                        >
                          Danger zone
                        </div>
                        <div className="dg-card-subtitle">
                          Irreversible account actions that affect your login
                          and data.
                        </div>
                      </div>
                    </div>
                    <div className="dg-card-body flex flex-col gap-3">
                      {role === "gridmaster" ? (
                        <p className="m-0 text-[14px] text-[var(--color-text-muted)]">
                          Gridmaster accounts cannot be deleted through
                          self-service. Contact another gridmaster or use direct
                          database access to remove this account.
                        </p>
                      ) : canEditProfileDirectly ? (
                        <p className="m-0 text-[14px] text-[var(--color-text-muted)]">
                          Your account has employee-management access, so name
                          and contact details can be saved directly here instead
                          of requested.
                        </p>
                      ) : (
                        <>
                          <p className="m-0 text-[14px] text-[var(--color-text-muted)]">
                            Request account deletion.
                          </p>
                          {pendingDeletionRequest ? (
                            <p className="m-0 rounded-[var(--dg-radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-3 text-[13px] text-[var(--color-warning-text)]">
                              Account deletion request pending admin review.
                            </p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void requestAccountDeletion()}
                            disabled={
                              requestingDeletion ||
                              !!pendingDeletionRequest ||
                              !orgId
                            }
                            className="dg-btn dg-btn-danger"
                            style={{ alignSelf: "flex-start" }}
                          >
                            <Trash2 size={14} style={{ marginRight: 4 }} />
                            {requestingDeletion
                              ? "Requesting..."
                              : "Request account deletion"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "overview" && employee ? (
                <SelfWorkOverview
                  employee={employee}
                  focusAreas={focusAreas}
                  focusAreaLabel={org?.focusAreaLabel}
                  assignments={assignments}
                  shiftCategories={shiftCategories}
                  absenceTypes={absenceTypes}
                  certifications={certifications}
                  orgRoles={orgRoles}
                  shiftDisplayMode={org?.shiftDisplayMode}
                  shifts={shifts}
                  recurringShifts={recurringShifts}
                  shiftRequests={shiftRequests}
                  auditNames={auditNames}
                />
              ) : null}

              {activeTab === "schedule" && employee ? (
                <SelfWorkSchedule
                  employee={employee}
                  focusAreas={focusAreas}
                  focusAreaLabel={org?.focusAreaLabel}
                  assignments={assignments}
                  shiftCategories={shiftCategories}
                  absenceTypes={absenceTypes}
                  certifications={certifications}
                  orgRoles={orgRoles}
                  shiftDisplayMode={org?.shiftDisplayMode}
                  shifts={shifts}
                  recurringShifts={recurringShifts}
                  shiftRequests={shiftRequests}
                  auditNames={auditNames}
                />
              ) : null}
            </section>
          </div>
        </PageContainer>
      </div>
      {confirmation ? (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          variant={confirmation.variant}
          isLoading={confirmationLoading}
          onConfirm={confirmPendingAction}
          onCancel={() => {
            if (!confirmationLoading) {
              setPendingConfirmation(null);
            }
          }}
        />
      ) : null}
    </>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfilePageContent />
    </ProtectedRoute>
  );
}
