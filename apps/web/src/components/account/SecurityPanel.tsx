"use client";

import { useCallback, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getPasswordMismatchError, isPasswordAcceptable } from "@dubgrid/domain";

import { SectionCard } from "@/components/settings/shared";
import { Form } from "@/components/Form";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { MFASetup } from "@/components/profile/MFASetup";
import { SessionList } from "@/components/profile/SessionList";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { extractErrorMessage } from "@/lib/error-handling";
import { useLogout } from "@/hooks";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { queryKeys } from "@/lib/query-keys";
import {
  requireCredentialAssurance,
  updateBrowserUserPassword,
  signOutAccountSessions,
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
  const { signOut } = useLogout();
  const stepUp = useStepUpAction();
  const queryClient = useQueryClient();
  const mfaEnabled = profile?.mfa_enabled ?? false;

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState<"others" | "global" | null>(null);
  const [pendingSessionSignOut, setPendingSessionSignOut] = useState<"others" | "global" | null>(
    null,
  );
  const [otherSessionCount, setOtherSessionCount] = useState<number | null>(null);

  const handleOtherSessionCountChange = useCallback((count: number) => {
    setOtherSessionCount(count);
  }, []);

  const hasPasswordChanges = newPassword.length > 0 || confirmPassword.length > 0;

  function openForm() {
    setError(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowPasswordForm(true);
  }

  function closeForm() {
    setError(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowPasswordForm(false);
  }

  function discardChanges() {
    setError(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  }

  // Derived so the warning appears as the user types the confirmation, matching
  // the mobile in-app change screen.
  const mismatchError = getPasswordMismatchError(newPassword, confirmPassword);
  const canSubmitPassword = isPasswordAcceptable(newPassword) && mismatchError === null;

  function requestPasswordChange(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    if (mismatchError) return setError(mismatchError);
    if (!isPasswordAcceptable(newPassword)) return setError("Choose a stronger password.");
    setPendingConfirm(true);
  }

  async function handlePasswordChange() {
    if (saving) return;
    setError(null);
    setSaving(true);
    let passwordUpdated = false;
    let shouldRedirect = false;
    try {
      const completed = await stepUp.run(async (accessToken) => {
        // The preflight must finish before calling Supabase's public mutation.
        // The mutation is never automatically replayed after an ambiguous error.
        await requireCredentialAssurance(accessToken);
        await updateBrowserUserPassword(newPassword);
      });
      if (!completed) return;
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
            : "We couldn't update your password. Try again.",
        );
      }
    } finally {
      if (!shouldRedirect) {
        setSaving(false);
      }
    }
  }

  async function handleSessionSignOut(scope: "others" | "global") {
    if (signingOut !== null) return;
    setSigningOut(scope);
    try {
      const completed = await stepUp.run((token) => signOutAccountSessions(scope, token));
      if (!completed) return;
      setPendingSessionSignOut(null);
      if (scope === "global") {
        // The protected bulk mutation finished before navigation and teardown.
        signOut({ scope: "local" });
      } else {
        setOtherSessionCount(0);
        toast.success("Your other devices are signed out.");
      }
    } catch {
      toast.error(
        "We couldn't finish signing out those devices. Check your sessions before trying again.",
      );
    } finally {
      setSigningOut(null);
      // Password confirmation can replace the current browser session even
      // when the action is subsequently cancelled or fails.
      if (user)
        void queryClient.invalidateQueries({ queryKey: queryKeys.account.sessions(user.id) });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                Password
              </div>
              <p className="mb-0 mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
                Choose a strong password: at least 10 characters, with a mix of uppercase letters,
                numbers, and symbols.
              </p>
            </div>
            {!showPasswordForm && (
              <Button
                type="button"
                onClick={openForm}
                className="dg-btn dg-btn-secondary dg-btn-sm self-start"
              >
                Change password
              </Button>
            )}
          </div>

          {showPasswordForm && (
            <Form
              onSubmit={requestPasswordChange}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
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
                  ariaDescribedBy={mismatchError ? "security-confirm-error" : undefined}
                  autoComplete="new-password"
                  className="dg-input"
                />
                {mismatchError && (
                  <p className="dg-form-error" id="security-confirm-error">
                    {mismatchError}
                  </p>
                )}
              </div>
              {error && <p className="dg-form-error">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={hasPasswordChanges ? discardChanges : closeForm}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                >
                  {getEditorDismissLabel({ hasUnsavedChanges: hasPasswordChanges })}
                </Button>
                <button
                  type="submit"
                  disabled={saving || !canSubmitPassword}
                  className="dg-btn dg-btn-primary dg-btn-sm"
                >
                  <ButtonLoading
                    loading={saving}
                    spinnerColor="var(--dg-color-text-inverse)"
                    spinnerSize={16}
                  >
                    Update Password
                  </ButtonLoading>
                </button>
              </div>
            </Form>
          )}
        </div>
      </SectionCard>

      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
              Two-factor authentication
            </div>
            <p className="mb-0 mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
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
              if (user) {
                void queryClient.invalidateQueries({ queryKey: queryKeys.account.all(user.id) });
              }
            }}
          />
        </div>
      </SectionCard>

      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
              Sessions
            </div>
            <p className="mb-0 mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
              Manage sign-in state across browsers and devices.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => setPendingSessionSignOut("others")}
              disabled={signingOut !== null || otherSessionCount === 0}
              className="dg-btn dg-btn-secondary w-full"
            >
              <ButtonLoading loading={signingOut === "others"} spinnerSize={14}>
                Sign out other devices
              </ButtonLoading>
            </Button>
            <Button
              type="button"
              onClick={() => setPendingSessionSignOut("global")}
              disabled={signingOut !== null}
              className="dg-btn dg-btn-danger w-full"
            >
              <ButtonLoading loading={signingOut === "global"} spinnerSize={14}>
                Sign out everywhere
              </ButtonLoading>
            </Button>
          </div>
          <div className="border-t border-[var(--dg-color-border-light)] pt-4">
            <div className="mb-3">
              <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                Devices
              </div>
              <div className="mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
                Inspect authenticated devices and recent sign-in history.
              </div>
            </div>
            <SessionList onOtherSessionCountChange={handleOtherSessionCountChange} />
          </div>
        </div>
      </SectionCard>

      {pendingConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Update password?"
          message="Confirm that you want to update your password. You will be signed out of every session."
          confirmLabel="Update and sign out"
          variant="warning"
          isLoading={saving}
          onConfirm={() => handlePasswordChange()}
          onCancel={() => {
            if (!saving) setPendingConfirm(false);
          }}
        />
      )}
      {stepUp.dialog}
      {pendingSessionSignOut && !stepUp.dialog && (
        <ConfirmDialog
          title={
            pendingSessionSignOut === "others" ? "Sign out other devices?" : "Sign out everywhere?"
          }
          message={
            pendingSessionSignOut === "others"
              ? "Every other device will be signed out. You will stay signed in here."
              : "Every device, including this one, will be signed out. You will need to sign in again."
          }
          confirmLabel={
            pendingSessionSignOut === "others" ? "Sign out other devices" : "Sign out everywhere"
          }
          variant="danger"
          isLoading={signingOut === pendingSessionSignOut}
          onConfirm={() => handleSessionSignOut(pendingSessionSignOut)}
          onCancel={() => {
            if (signingOut === null) setPendingSessionSignOut(null);
          }}
        />
      )}
    </div>
  );
}
