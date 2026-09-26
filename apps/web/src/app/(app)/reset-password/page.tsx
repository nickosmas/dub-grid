"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { PublicRoute } from "@/components/RouteGuards";
import { Form } from "@/components/Form";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { AuthStateCard } from "@/components/auth/AuthStateCard";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { getPasswordMismatchError, isPasswordAcceptable } from "@dubgrid/domain";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { ApexLandingLink } from "@/components/auth/ApexLandingLink";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-handling";
import { settleWithRequestTimeout } from "@/lib/fetch-with-timeout";
import { getWebAuthRecoveryMessage } from "@/lib/auth-recovery";
import { ACTION_SIGN_IN } from "@/lib/action-copy";
import {
  isRetryableAuthRecoveryError,
  mayHavePasswordUpdateCommitted,
} from "@dubgrid/client-errors";
import {
  exchangeBrowserCodeForSession,
  completeBrowserPasswordRecovery,
  getBrowserAssuranceLevel,
  signOutFromBrowser,
  subscribeToBrowserAuthChanges,
  updateBrowserUserPassword,
} from "@/features/account/client";
import { MFAVerify } from "@/components/profile/MFAVerify";
import {
  clearBrowserRecoveryVerification,
  consumeBrowserRecoveryVerification,
} from "@/lib/auth/browser-recovery-capability";

type PageState = "loading" | "mfa" | "form" | "success" | "error" | "recovery";

/** Once the password has or may have changed, the form never comes back. */
type RecoveryOutcome = "updated" | "updated-unrevoked" | "unconfirmed";

const OUTCOME_MESSAGES: Record<RecoveryOutcome, { heading: string; message: string }> = {
  updated: {
    heading: "Password updated",
    message:
      "Your password has been successfully reset. You can now sign in with your new password.",
  },
  "updated-unrevoked": {
    heading: "Password updated",
    message:
      "Your password has been reset, but we couldn't sign out your other devices. Sign in with your new password and review your active sessions.",
  },
  unconfirmed: {
    heading: "Check your new password",
    message:
      "We couldn't confirm your new password. Try signing in with it. If it doesn't work, request a new reset link.",
  },
};

function ResetPasswordContent() {
  const [state, setState] = useState<PageState>("loading");
  const stateRef = useRef<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RecoveryOutcome>("updated");
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const recoveryCodeRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const checkingRef = useRef(false);
  // Set once the link has produced a recovery session. The code or capability
  // that produced it is spent, so a retry only repeats the assurance check.
  const sessionReadyRef = useRef(false);

  // Supabase refuses a new password from a two-factor account's recovery
  // session until its code promotes the session to aal2, so that account is
  // asked for the code before the form (41b2).
  const openRecoveredSession = useCallback(async () => {
    sessionReadyRef.current = true;
    let next: PageState = "form";
    try {
      const { data, error } = await getBrowserAssuranceLevel();
      if (error) throw error;
      if (data?.currentLevel === "aal1" && data.nextLevel === "aal2") next = "mfa";
    } catch {
      next = "recovery";
    }
    setState(next);
    stateRef.current = next;
  }, []);

  const checkRecoverySession = useCallback(
    async (finalAttempt: boolean) => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      setState("loading");
      stateRef.current = "loading";
      try {
        if (sessionReadyRef.current) {
          await openRecoveredSession();
          return;
        }
        const code = recoveryCodeRef.current;
        if (code) {
          const { error } = await settleWithRequestTimeout(exchangeBrowserCodeForSession(code));
          if (error) throw error;
          window.history.replaceState({}, "", window.location.pathname);
          recoveryCodeRef.current = null;
          await openRecoveredSession();
          return;
        }

        if (stateRef.current !== "loading") return;
        if (consumeBrowserRecoveryVerification()) {
          await openRecoveredSession();
        } else if (finalAttempt) {
          setState("error");
          stateRef.current = "error";
        }
      } catch (checkError) {
        if (stateRef.current !== "loading") return;
        if (isRetryableAuthRecoveryError(checkError)) {
          setState("recovery");
          stateRef.current = "recovery";
        } else {
          clearBrowserRecoveryVerification();
          window.history.replaceState({}, "", window.location.pathname);
          recoveryCodeRef.current = null;
          setState("error");
          stateRef.current = "error";
        }
      } finally {
        checkingRef.current = false;
      }
    },
    [openRecoveredSession],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Check for error flag from /auth/confirm route (invalid/expired token)
    if (params.get("error") === "invalid_link") {
      clearBrowserRecoveryVerification();
      setState("error");
      stateRef.current = "error";
      return;
    }

    // PKCE flow: Supabase redirects here with ?code=xxx after the user clicks
    // the email link. Exchange it client-side where the code_verifier cookie
    // (set when resetPasswordForEmail was called) is available.
    const code = params.get("code");
    if (code) {
      // Keep the one-time code only long enough to permit a manual retry after
      // a transport failure. It is removed immediately on success or a
      // terminal provider response.
      recoveryCodeRef.current = code;
      void checkRecoverySession(false);
    } else {
      // No code — check if session already exists (e.g. from /auth/confirm).
      void checkRecoverySession(false);
    }

    // Fallback: listen for PASSWORD_RECOVERY event (handles implicit flow
    // or other edge cases where the token arrives via URL hash).
    const {
      data: { subscription },
    } = subscribeToBrowserAuthChanges((event: AuthChangeEvent) => {
      if (event === "PASSWORD_RECOVERY") {
        void openRecoveredSession();
      }
    });

    // If no session arrives, offer an explicit recheck instead of claiming a
    // slow connection proves the link is invalid or expired.
    const timeout = setTimeout(() => {
      if (stateRef.current === "loading") {
        setState("recovery");
        stateRef.current = "recovery";
      }
    }, 15000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [checkRecoverySession, openRecoveredSession]);

  // Focus the first password field once the form becomes available.
  useEffect(() => {
    if (state === "form") firstFieldRef.current?.focus();
  }, [state]);

  // Derived so the warning appears as the user types the confirmation, rather
  // than only after they submit.
  const mismatchError = getPasswordMismatchError(password, confirmPassword);
  const canSubmit = isPasswordAcceptable(password) && mismatchError === null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setFormError(null);

    if (mismatchError) {
      setFormError(mismatchError);
      return;
    }
    if (!isPasswordAcceptable(password)) {
      setFormError("Choose a stronger password.");
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    let confirmed: boolean;
    try {
      await settleWithRequestTimeout(updateBrowserUserPassword(password));
      confirmed = true;
    } catch (err: unknown) {
      if (!mayHavePasswordUpdateCommitted(err)) {
        showRejectedUpdate(err);
        submittingRef.current = false;
        setLoading(false);
        return;
      }
      // The provider may have applied it after the deadline or before the
      // response was lost. Offering the form again would invite a replay of a
      // change that may be done, so the recovery finishes as if it were.
      confirmed = false;
    }

    let revoked = true;
    try {
      // Revokes every session, then signs this browser out even on failure.
      await settleWithRequestTimeout(completeBrowserPasswordRecovery());
    } catch {
      revoked = false;
    }
    setOutcome(!confirmed ? "unconfirmed" : revoked ? "updated" : "updated-unrevoked");
    setState("success");
    stateRef.current = "success";
    submittingRef.current = false;
    setLoading(false);
  }

  function showRejectedUpdate(err: unknown) {
    // The factor was added after the page opened, or the assurance check was
    // wrong: the code step promotes the session and the form comes back.
    if ((err as { code?: unknown } | null)?.code === "insufficient_aal") {
      setState("mfa");
      stateRef.current = "mfa";
      return;
    }
    const msg = extractErrorMessage(err, "").toLowerCase();
    if (msg.includes("same password") || msg.includes("different")) {
      setFormError("New password must be different from your current password.");
    } else if (msg.includes("weak") || msg.includes("short")) {
      setFormError("Password is too weak. Please choose a stronger password.");
    } else if (isRetryableAuthRecoveryError(err)) {
      toast.error(getWebAuthRecoveryMessage(err, "We couldn't update your password. Try again."));
    } else {
      toast.error("We couldn't update your password. Try again.");
    }
  }

  async function leaveRecovery() {
    // Leave no recovery session behind for someone who could not finish.
    await signOutFromBrowser("local").catch(() => undefined);
    window.location.assign("/login");
  }

  if (state === "mfa") {
    return (
      <MFAVerify
        onVerified={() => {
          setState("form");
          stateRef.current = "form";
        }}
        onCancel={() => void leaveRecovery()}
      />
    );
  }

  return (
    <PageShell>
      <Card>
        {/* Logo */}
        <ApexLandingLink className="dg-auth-logo-block dg-auth-logo-block--compact">
          <DubGridLogo size={44} />
          <DubGridWordmark />
        </ApexLandingLink>

        {state === "loading" ? (
          <AuthStateCard
            icon="spinner"
            heading="Verifying reset link"
            message="Please wait while we verify your password reset link."
          />
        ) : state === "recovery" ? (
          <AuthStateCard
            heading="Check your connection"
            message="We couldn't verify this reset link. Check your connection and try again."
            primaryCta={{ label: "Try again", onClick: () => void checkRecoverySession(true) }}
            secondaryCta={{ label: "Request new link", href: "/forgot-password" }}
          />
        ) : state === "error" ? (
          <AuthStateCard
            heading="Invalid or expired link"
            message="This password reset link is invalid or has expired. Please request a new one."
            primaryCta={{ label: "Request New Link", href: "/forgot-password" }}
            secondaryCta={{ label: "Back to login", href: "/login" }}
          />
        ) : state === "success" ? (
          <AuthStateCard
            icon="check"
            heading={OUTCOME_MESSAGES[outcome].heading}
            message={OUTCOME_MESSAGES[outcome].message}
            primaryCta={{ label: ACTION_SIGN_IN, href: "/login" }}
          />
        ) : (
          <>
            <h1 className="dg-auth-heading dg-auth-page-heading">Set new password</h1>
            <p className="dg-auth-description">
              Choose a strong password: at least 10 characters with a letter and a number, plus an
              uppercase letter or a symbol.
            </p>

            <Form onSubmit={handleSubmit} className="dg-auth-form">
              <div>
                <label htmlFor="reset-new-password" className="dg-auth-field-label">
                  New password
                </label>
                <PasswordInput
                  id="reset-new-password"
                  inputRef={firstFieldRef}
                  placeholder="Enter new password"
                  value={password}
                  onChange={setPassword}
                  showPassword={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  autoComplete="new-password"
                  ariaDescribedBy={
                    "password-strength-label password-strength-hints" +
                    (formError ? " reset-form-error" : "")
                  }
                  disabled={loading}
                />
                {password.length > 0 && <PasswordStrength password={password} />}
              </div>

              <div>
                <label htmlFor="reset-confirm-password" className="dg-auth-field-label">
                  Confirm password
                </label>
                <PasswordInput
                  id="reset-confirm-password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  showPassword={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  autoComplete="new-password"
                  ariaDescribedBy={
                    mismatchError
                      ? "reset-confirm-error"
                      : formError
                        ? "reset-form-error"
                        : undefined
                  }
                  disabled={loading}
                />
                {mismatchError && (
                  <p className="dg-form-error" id="reset-confirm-error">
                    {mismatchError}
                  </p>
                )}
              </div>

              {formError && (
                <p className="dg-form-error" id="reset-form-error">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="dg-btn dg-btn-primary dg-btn-lg dg-auth-submit"
              >
                <ButtonLoading
                  loading={loading}
                  spinnerColor="var(--dg-color-text-inverse)"
                  spinnerSize={20}
                >
                  Reset Password
                </ButtonLoading>
              </button>
            </Form>
          </>
        )}
      </Card>
    </PageShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <PublicRoute>
      <ResetPasswordContent />
    </PublicRoute>
  );
}
