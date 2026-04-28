"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useOrganizationData, usePermissions } from "@/hooks";
import { ProtectedRoute } from "@/components/RouteGuards";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-handling";
import { ChevronLeft, Check, Trash2, X } from "lucide-react";
import { MFASetup } from "@/components/profile/MFASetup";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { SessionList } from "@/components/profile/SessionList";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { ProfileSectionTabs } from "@/components/profile/ProfileSectionTabs";
import { SelfWorkOverview, SelfWorkSchedule } from "@/components/profile/SelfWorkProfile";
import { useSelfProfileData } from "@/hooks/useSelfProfileData";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import {
  signOutFromBrowser,
  updateBrowserUserEmail,
  updateBrowserUserPassword,
  updateSelfProfileDetails,
} from "@/features/account/client";

const ROLE_LABELS: Record<string, string> = {
  gridmaster: "Gridmaster",
  super_admin: "Super Admin",
  admin: "Admin",
  scheduler: "Admin",   // legacy
  supervisor: "Admin",  // legacy
  user: "User",
};

const inputFieldStyle: CSSProperties = {
  width: "100%",
  padding: "10px 13px",
  border: "1.5px solid var(--color-border)",
  borderRadius: "var(--dg-btn-radius)",
  fontSize: "var(--dg-fs-body-sm)",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--dg-fs-body-sm)", color: value ? "var(--color-text-primary)" : "var(--color-text-subtle)" }}>
        {value || "—"}
      </span>
    </div>
  );
}

export function ProfilePageContent() {
  const router = useRouter();
  const { role, orgId, isLoading: permissionsLoading } = usePermissions();
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
  const [savingAccountDetails, setSavingAccountDetails] = useState(false);

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Session management
  const [signingOut, setSigningOut] = useState<"others" | "global" | null>(null);

  // Account deletion
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileSection>("account");

  const firstName = profile?.first_name?.trim() || null;
  const lastName = profile?.last_name?.trim() || null;
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;
  const mfaEnabled = profile?.mfa_enabled ?? false;

  const initials = name
    ? name.split(" ").filter(Boolean).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? "?").toUpperCase();

  const hasLinkedEmployee = !!employee;
  const hasNameChanges =
    editFirstName.trim() !== (firstName ?? "") ||
    editLastName.trim() !== (lastName ?? "");
  const savedEmail = (user?.email ?? "").trim().toLowerCase();
  const editedEmail = editEmail.trim().toLowerCase();
  const hasEmailChanges = editedEmail !== "" && editedEmail !== savedEmail;
  const hasAccountChanges = hasNameChanges || hasEmailChanges;
  const hasPasswordChanges = newPassword.length > 0 || confirmNewPassword.length > 0;
  const hasInvalidAccountDraft = isEditingAccountDetails && editEmail.trim() === "";

  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : null;

  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : null;
  const displayName = name ?? user?.email?.split("@")[0] ?? "Your profile";
  const isPageLoading = permissionsLoading || selfProfileLoading;
  const profileTabs = hasLinkedEmployee
    ? [
        { id: "account", label: "Account" },
        { id: "overview", label: "Overview" },
        { id: "schedule", label: "Schedule" },
      ]
    : [
        { id: "account", label: "Account" },
      ];

  useEffect(() => {
    if (!hasLinkedEmployee && activeTab !== "account") {
      setActiveTab("account");
    }
  }, [activeTab, hasLinkedEmployee]);

  function startEditingAccountDetails() {
    setEditFirstName(firstName ?? "");
    setEditLastName(lastName ?? "");
    setEditEmail(user?.email ?? "");
    setIsEditingAccountDetails(true);
  }

  function cancelEditingAccountDetails() {
    setEditFirstName(firstName ?? "");
    setEditLastName(lastName ?? "");
    setEditEmail(user?.email ?? "");
  }

  function closeAccountDetailsEditor() {
    cancelEditingAccountDetails();
    setIsEditingAccountDetails(false);
  }

  async function saveAccountDetails() {
    if (!user) return;
    if (!hasAccountChanges) {
      setIsEditingAccountDetails(false);
      return;
    }

    setSavingAccountDetails(true);
    try {
      const nextFirstName = editFirstName.trim() || null;
      const nextLastName = editLastName.trim() || null;
      const nextEmail = editEmail.trim().toLowerCase();

      if (hasNameChanges) {
        const updated = await updateSelfProfileDetails({
          firstName: nextFirstName,
          lastName: nextLastName,
          orgId,
        });
        setProfile(updated.profile);
        setEmployee(updated.employee);
      }

      if (hasEmailChanges) {
        await updateBrowserUserEmail(nextEmail);
      }

      setIsEditingAccountDetails(false);

      if (hasNameChanges && hasEmailChanges) {
        toast.success("Account details updated. Confirmation sent to your new email address.");
      } else if (hasNameChanges) {
        toast.success("Account details updated.");
      } else if (hasEmailChanges) {
        toast.success("Confirmation sent to your new email address.");
      }
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "Failed to update account details."));
    } finally {
      setSavingAccountDetails(false);
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    if (savingPassword) return;
    setPasswordError(null);

    if (newPassword !== confirmNewPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError("Password must be at least 10 characters.");
      return;
    }

    setSavingPassword(true);
    try {
      await updateBrowserUserPassword(newPassword);
      toast.success("Password updated successfully.");
      setNewPassword("");
      setConfirmNewPassword("");
      setShowPasswordForm(false);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("same") || msg.includes("different")) {
        setPasswordError("New password must be different from your current password.");
      } else if (msg.includes("reauthentication") || msg.includes("recently")) {
        setPasswordError("Please sign out and sign in again before changing your password.");
      } else if (msg.includes("weak") || msg.includes("short")) {
        setPasswordError("Password is too weak. Please choose a stronger password.");
      } else {
        toast.error("Failed to update password. Please try again.");
      }
    } finally {
      setSavingPassword(false);
    }
  }

  function openPasswordForm() {
    setPasswordError(null);
    setNewPassword("");
    setConfirmNewPassword("");
    setShowPassword(false);
    setShowPasswordForm(true);
  }

  function closePasswordForm() {
    setPasswordError(null);
    setNewPassword("");
    setConfirmNewPassword("");
    setShowPassword(false);
    setShowPasswordForm(false);
  }

  function discardPasswordChanges() {
    setPasswordError(null);
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

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE MY ACCOUNT") return;
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete account");
        return;
      }
      window.location.replace("/login");
    } catch {
      toast.error("Failed to delete account. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="p-4 md:p-6 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-[1100px] space-y-6 pb-10 dg-page-enter">
          <button
            type="button"
            onClick={() => window.history.length > 1 ? router.back() : router.push(role === "gridmaster" ? "/gridmaster" : "/schedule")}
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
              style={{ borderColor: "var(--color-warning-border)", background: "var(--color-warning-bg)" }}
            >
              <div className="dg-card-body">
                <p className="m-0 text-[14px] text-[var(--color-text-muted)]">
                  {selfProfileError}
                </p>
              </div>
            </div>
          )}

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">
                  Profile sections
                </h2>
                <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
                  {hasLinkedEmployee
                    ? "Move between account settings and your work profile without leaving the page."
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
                        <div className="dg-card-subtitle">Personal identity and organization access for this account.</div>
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
                            void saveAccountDetails();
                          }}
                          className="flex flex-col gap-5 rounded-[var(--dg-radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
                        >
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <label style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                First name
                              </label>
                              <input
                                value={editFirstName}
                                onChange={(e) => setEditFirstName(e.target.value)}
                                placeholder="First name"
                                style={inputFieldStyle}
                                autoFocus
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <label style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Last name
                              </label>
                              <input
                                value={editLastName}
                                onChange={(e) => setEditLastName(e.target.value)}
                                placeholder="Last name"
                                style={inputFieldStyle}
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <label style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              Email
                            </label>
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              style={inputFieldStyle}
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={savingAccountDetails || !hasAccountChanges || hasInvalidAccountDraft}
                              className="dg-btn dg-btn-primary dg-btn-sm"
                            >
                              <Check size={14} />
                              {savingAccountDetails ? "Saving..." : "Save changes"}
                            </button>
                            <button
                              type="button"
                              onClick={hasAccountChanges ? cancelEditingAccountDetails : closeAccountDetailsEditor}
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                            >
                              <X size={14} />
                              {getEditorDismissLabel(hasAccountChanges)}
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
                        </>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2">
                        {role === "gridmaster" ? (
                          <Field label="Platform role" value="Gridmaster" />
                        ) : (
                          <Field label="Organization role" value={ROLE_LABELS[role] ?? "User"} />
                        )}
                        <Field label="Member since" value={createdAt} />
                        <Field label="Last sign in" value={lastSignIn} />
                      </div>
                    </div>
                </div>

                <div className="dg-card h-full">
                    <div className="dg-card-header">
                        <div>
                          <div className="dg-card-title">Security</div>
                          <div className="dg-card-subtitle">Password, two-factor authentication, and sign-in protection.</div>
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
                              Choose a strong password with at least 10 characters.
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
                            onSubmit={handlePasswordChange}
                            style={{ display: "flex", flexDirection: "column", gap: 14 }}
                          >
                            <div>
                              <label style={{ display: "block", fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>
                                New Password
                              </label>
                              <PasswordInput
                                placeholder="Enter new password"
                                value={newPassword}
                                onChange={setNewPassword}
                                showPassword={showPassword}
                                onToggle={() => setShowPassword((v) => !v)}
                                autoComplete="new-password"
                                ariaDescribedBy="password-strength-label"
                                style={inputFieldStyle}
                              />
                              {newPassword.length > 0 ? <PasswordStrength password={newPassword} /> : null}
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>
                                Confirm New Password
                              </label>
                              <PasswordInput
                                placeholder="Confirm new password"
                                value={confirmNewPassword}
                                onChange={setConfirmNewPassword}
                                showPassword={showPassword}
                                onToggle={() => setShowPassword((v) => !v)}
                                autoComplete="new-password"
                                style={inputFieldStyle}
                              />
                            </div>
                            {passwordError ? (
                              <p style={{ color: "var(--color-danger-dark)", fontSize: "var(--dg-fs-body-sm)", margin: 0 }}>
                                {passwordError}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="submit"
                                disabled={savingPassword || !newPassword || !confirmNewPassword}
                                className="dg-btn dg-btn-primary dg-btn-sm"
                              >
                                <ButtonLoading loading={savingPassword} spinnerColor="var(--color-text-inverse)" spinnerSize={16}>
                                  Update Password
                                </ButtonLoading>
                              </button>
                              <button
                                type="button"
                                onClick={hasPasswordChanges ? discardPasswordChanges : closePasswordForm}
                                className="dg-btn dg-btn-secondary dg-btn-sm"
                              >
                                {getEditorDismissLabel(hasPasswordChanges)}
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>

                      <div
                        style={{
                          paddingTop: 4,
                        }}
                      >
                        <label
                          style={{
                            display: "block",
                            fontSize: "var(--dg-fs-footnote)",
                            fontWeight: 600,
                            color: "var(--color-text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginBottom: 12,
                          }}
                        >
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
                        <div className="dg-card-subtitle">Choose how and when DubGrid contacts you.</div>
                      </div>
                    </div>
                    <div className="dg-card-body">
                      <NotificationPreferences visibleCategories={role === "gridmaster" ? ["system"] : undefined} />
                    </div>
                </div>

                <div className="dg-card h-full">
                    <div className="dg-card-header">
                      <div>
                        <div className="dg-card-title">Sessions</div>
                        <div className="dg-card-subtitle">Manage sign-in state across browsers and devices.</div>
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
                          <ButtonLoading loading={signingOut === "others"} spinnerSize={14}>
                            Sign out other devices
                          </ButtonLoading>
                        </button>
                        <button
                          type="button"
                          onClick={handleSignOutAll}
                          disabled={signingOut !== null}
                          className="dg-btn dg-btn-danger"
                        >
                          <ButtonLoading loading={signingOut === "global"} spinnerSize={14}>
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
                            Inspect current and recent authenticated devices.
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-[var(--dg-radius-md)] border border-[var(--color-border-light)] bg-[var(--color-surface)]">
                          <SessionList />
                        </div>
                      </div>
                    </div>
                </div>

                <div className="dg-card h-full md:col-span-2" style={{ borderColor: "var(--color-danger)" }}>
                    <div
                      className="dg-card-header"
                      style={{ borderBottomColor: "var(--color-danger-bg)" }}
                    >
                      <div>
                        <div className="dg-card-title" style={{ color: "var(--color-danger)" }}>Danger zone</div>
                        <div className="dg-card-subtitle">Irreversible account actions that affect your login and data.</div>
                      </div>
                    </div>
                    <div className="dg-card-body flex flex-col gap-3">
                      {role === "gridmaster" ? (
                        <p className="m-0 text-[14px] text-[var(--color-text-muted)]">
                          Gridmaster accounts cannot be deleted through self-service. Contact another gridmaster or use direct database access to remove this account.
                        </p>
                      ) : !showDeleteConfirm ? (
                        <>
                          <p className="m-0 text-[14px] text-[var(--color-text-muted)]">
                            Permanently delete your account and all associated data. This action cannot be undone.
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="dg-btn dg-btn-danger"
                            style={{ alignSelf: "flex-start" }}
                          >
                            <Trash2 size={14} style={{ marginRight: 4 }} />
                            Delete Account
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="m-0 text-[14px] font-semibold text-[var(--color-danger)]">
                            This will permanently delete your account, remove you from all organizations, and sign you out of all devices.
                          </p>
                          <div>
                            <label style={{ display: "block", fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 5 }}>
                              Type <strong>DELETE MY ACCOUNT</strong> to confirm
                            </label>
                            <input
                              value={deleteConfirmText}
                              onChange={(e) => setDeleteConfirmText(e.target.value)}
                              placeholder="DELETE MY ACCOUNT"
                              style={{ ...inputFieldStyle, borderColor: "var(--color-danger)" }}
                              autoComplete="off"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleDeleteAccount}
                              disabled={deleting || deleteConfirmText !== "DELETE MY ACCOUNT"}
                              className="dg-btn dg-btn-danger"
                            >
                              <ButtonLoading loading={deleting} spinnerSize={14}>
                                Permanently Delete
                              </ButtonLoading>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                              className="dg-btn dg-btn-secondary"
                            >
                              Cancel
                            </button>
                          </div>
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
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfilePageContent />
    </ProtectedRoute>
  );
}
