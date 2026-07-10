"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { SectionCard } from "@/components/settings/shared";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { MFASetup } from "@/components/profile/MFASetup";
import { SessionList } from "@/components/profile/SessionList";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { extractErrorMessage } from "@/lib/error-handling";
import { useLogout } from "@/hooks";
import {
  signInBrowserWithPassword,
  updateBrowserUserPassword,
  type SelfProfileRecord,
} from "@/features/account/client";
import type { User } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";

interface SecurityPanelProps {
  user: User | null;
  profile: SelfProfileRecord | null;
  setProfile: Dispatch<SetStateAction<SelfProfileRecord | null>>;
}

export function SecurityPanel({ user, profile, setProfile }: SecurityPanelProps) {
  const { signOut, signOutOthers } = useLogout();
  const mfaEnabled = profile?.mfa_enabled ?? false;

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState<"others" | "global" | null>(null);

  const hasPasswordChanges =
    currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0;

  function openForm() {
    setError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowPasswordForm(true);
  }

  function closeForm() {
    setError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowPasswordForm(false);
  }

  function discardChanges() {
    setError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  }

  function requestPasswordChange(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    if (!currentPassword) return setError("Enter your current password.");
    if (newPassword !== confirmPassword) return setError("Passwords do not match.");
    if (newPassword.length < 10) return setError("Password must be at least 10 characters.");
    setPendingConfirm(true);
  }

  async function handlePasswordChange() {
    if (saving) return;
    setError(null);
    setSaving(true);
    let passwordUpdated = false;
    let shouldRedirect = false;
    try {
      const accountEmail = user?.email?.trim();
      if (!accountEmail) {
        setError(
          "This account does not have an email address available for password verification.",
        );
        return;
      }
      const verify = await signInBrowserWithPassword({
        email: accountEmail,
        password: currentPassword,
      });
      if (verify.error) {
        setError("That password did not match this account.");
        return;
      }
      await updateBrowserUserPassword(newPassword);
      passwordUpdated = true;
      shouldRedirect = true;
      // Rotate session everywhere after a password change. /goodbye handles teardown.
      signOut({ scope: "global" });
    } catch (err) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("same") || msg.includes("different")) {
        setError("New password must be different from your current password.");
      } else if (msg.includes("reauthentication") || msg.includes("recently")) {
        setError("Please sign out and sign in again before changing your password.");
      } else if (msg.includes("weak") || msg.includes("short")) {
        setError("Password is too weak. Please choose a stronger password.");
      } else {
        toast.error(
          passwordUpdated
            ? "Password updated, but we couldn't sign you out. Please sign out and sign in again."
            : "Failed to update password. Please try again.",
        );
      }
    } finally {
      if (!shouldRedirect) {
        setPendingConfirm(false);
        setSaving(false);
      }
    }
  }

  async function handleSignOutOthers() {
    setSigningOut("others");
    try {
      await signOutOthers();
      toast.success("All other sessions have been signed out.");
    } catch {
      toast.error("Failed to sign out other sessions.");
    } finally {
      setSigningOut(null);
    }
  }

  function handleSignOutAll() {
    setSigningOut("global");
    signOut({ scope: "global" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                Password
              </div>
              <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
                Choose a strong password with at least 10 characters.
              </p>
            </div>
            {!showPasswordForm && (
              <button
                type="button"
                onClick={openForm}
                className="dg-btn dg-btn-secondary dg-btn-sm self-start"
              >
                Change password
              </button>
            )}
          </div>

          {showPasswordForm && (
            <form
              onSubmit={requestPasswordChange}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
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
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  showPassword={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  autoComplete="new-password"
                  className="dg-input"
                />
              </div>
              {error && (
                <p
                  style={{
                    color: "var(--color-danger-dark)",
                    fontSize: "var(--dg-fs-body-sm)",
                    margin: 0,
                  }}
                >
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                  className="dg-btn dg-btn-primary dg-btn-sm"
                >
                  <ButtonLoading
                    loading={saving}
                    spinnerColor="var(--color-text-inverse)"
                    spinnerSize={16}
                  >
                    Update Password
                  </ButtonLoading>
                </button>
                <button
                  type="button"
                  onClick={hasPasswordChanges ? discardChanges : closeForm}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                >
                  {getEditorDismissLabel({ hasUnsavedChanges: hasPasswordChanges })}
                </button>
              </div>
            </form>
          )}
        </div>
      </SectionCard>

      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
              Two-factor authentication
            </div>
            <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
              Add a second sign-in step using an authenticator app.
            </p>
          </div>
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
      </SectionCard>

      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
              Sessions
            </div>
            <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
              Manage sign-in state across browsers and devices.
            </p>
          </div>
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
                Devices
              </div>
              <div className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                Inspect authenticated devices and recent sign-in history.
              </div>
            </div>
            <SessionList />
          </div>
        </div>
      </SectionCard>

      {pendingConfirm && (
        <ConfirmDialog
          title="Update password?"
          message="Confirm that you want to update your password. You will be signed out of every session."
          confirmLabel="Update and sign out"
          variant="warning"
          isLoading={saving}
          onConfirm={() => void handlePasswordChange()}
          onCancel={() => {
            if (!saving) setPendingConfirm(false);
          }}
        />
      )}
    </div>
  );
}
