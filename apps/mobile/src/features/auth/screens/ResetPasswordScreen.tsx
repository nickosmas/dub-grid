import { useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mayHavePasswordUpdateCommitted } from "@dubgrid/client-errors";
import {
  EMAIL_OTP_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
  TOTP_CODE_LENGTH,
  getPasswordMismatchError,
  isPasswordAcceptable,
} from "@dubgrid/domain";
import type { TextInput } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { Button } from "../../../shared/components/Button";
import { useKeyboardDoneAccessory } from "../../../shared/components/KeyboardDoneAccessory";
import { signOutMobileSessions } from "../../../shared/lib/api";
import { createEphemeralSupabaseClient } from "../../../shared/lib/supabase";
import { useToast } from "../../../shared/providers/ToastProvider";
import { AuthActions, AuthFields, AuthHeader, AuthShell, AuthStage } from "../components/AuthShell";
import { AuthField, AuthFieldError } from "../components/AuthField";
import { PasswordStrengthHints } from "../components/PasswordStrengthHints";
import { getRecoveryErrorMessage } from "../lib/recovery-errors";
import { settleMobileAuthAction } from "../lib/request-deadline";

const RESEND_COOLDOWN_SECONDS = 60;

type Stage = "code" | "factor" | "no-factor" | "password";

const NO_FACTOR_MESSAGE =
  "We couldn't find an authenticator app on this account. Contact support for help.";
const WRONG_FACTOR_CODE_MESSAGE =
  "That code didn't work. Check your authenticator app and try again.";

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? "";
  const { pushToast } = useToast();

  const [stage, setStage] = useState<Stage>("code");
  const [code, setCode] = useState("");
  const [factorCode, setFactorCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  const codeInputRef = useRef<TextInput>(null);
  const factorInputRef = useRef<TextInput>(null);
  const factorIdRef = useRef<string | null>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  // Held from the verification itself: a timed-out update can still hold the
  // client's auth lock, and reading the session back would wait behind it.
  const recoveryAccessTokenRef = useRef<string | null>(null);
  const { inputAccessoryViewID, keyboardDoneAccessory } = useKeyboardDoneAccessory({
    always: true,
  });

  /**
   * One client for the whole flow, and deliberately the *ephemeral* one.
   *
   * `verifyOtp({ type: "recovery" })` returns a real session. On the persistent
   * client that session lands in SecureStore, `AuthSessionProvider` picks it up,
   * and `LoginScreen`'s `if (accessToken) return <Redirect href="/(tabs)/home">`
   * fires, dropping the user into the tab tree mid-reset with no organization
   * session behind it. The ephemeral client holds the token in memory just long
   * enough for `updateUser`, and never persists it.
   */
  const supabase = useMemo<SupabaseClient>(() => createEphemeralSupabaseClient(), []);

  // Derived, not stored: the warning has to appear as the user types the
  // confirmation, not after they press Update and are told they wasted a tap.
  const mismatchError = getPasswordMismatchError(password, confirmPassword);
  const canSubmitPassword = isPasswordAcceptable(password) && mismatchError === null;

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function verifyCode() {
    if (submitting) return;

    if (code.length !== EMAIL_OTP_LENGTH) {
      setError(`Enter the ${EMAIL_OTP_LENGTH}-digit code from your email.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      // The emailed code is single-use: once it has verified, a retry after a
      // failed lookup below only repeats the lookup (41b2/F-03).
      if (!recoveryAccessTokenRef.current) {
        const { data, error: verifyError } = await settleMobileAuthAction(
          supabase.auth.verifyOtp({
            email,
            token: code,
            type: "recovery",
          }),
        );
        if (verifyError) throw verifyError;
        recoveryAccessTokenRef.current = data?.session?.access_token ?? null;
      }

      if (await needsSecondFactor()) {
        await openFactorStage();
        return;
      }
      setStage("password");
      setTimeout(() => passwordInputRef.current?.focus(), 0);
    } catch (caught) {
      setError(getRecoveryErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  // Supabase refuses a new password from a two-factor account's recovery
  // session until its authenticator code promotes the session to aal2 (41b2).
  async function needsSecondFactor(): Promise<boolean> {
    const { data, error: levelError } = await settleMobileAuthAction(
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    );
    if (levelError) throw levelError;
    return data?.currentLevel === "aal1" && data.nextLevel === "aal2";
  }

  async function openFactorStage() {
    const { data, error: listError } = await settleMobileAuthAction(
      supabase.auth.mfa.listFactors(),
    );
    if (listError) throw listError;
    const factor = data?.totp.find((candidate) => candidate.status === "verified");
    if (!factor) {
      setError(null);
      setStage("no-factor");
      return;
    }
    factorIdRef.current = factor.id;
    setFactorCode("");
    setError(null);
    setStage("factor");
    setTimeout(() => factorInputRef.current?.focus(), 0);
  }

  async function verifyFactor() {
    if (submitting) return;
    const factorId = factorIdRef.current;
    if (!factorId) return;
    if (factorCode.length !== TOTP_CODE_LENGTH) {
      setError(`Enter the ${TOTP_CODE_LENGTH}-digit code from your authenticator app.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { data, error: verifyError } = await settleMobileAuthAction(
        supabase.auth.mfa.challengeAndVerify({ factorId, code: factorCode }),
      );
      if (verifyError) throw verifyError;
      // The promoted session is the one the recovery sign-out must present.
      recoveryAccessTokenRef.current = data?.access_token ?? recoveryAccessTokenRef.current;
      setStage("password");
      setTimeout(() => passwordInputRef.current?.focus(), 0);
    } catch (caught) {
      const status = (caught as { status?: unknown } | null)?.status;
      setError(
        status === 400 || status === 422
          ? WRONG_FACTOR_CODE_MESSAGE
          : getRecoveryErrorMessage(caught),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function leaveRecovery() {
    // Not awaited: the ephemeral client may still hold its auth lock after a
    // timed-out request, and leaving must never wait on it (41b2/F-11).
    void settleMobileAuthAction(supabase.auth.signOut({ scope: "local" })).catch(() => undefined);
    router.replace("/(auth)/login");
  }

  async function resendCode() {
    if (resending) return;

    setError(null);
    setResending(true);
    try {
      // Resolves with `{ error }` rather than throwing, so ignoring the return
      // value claimed "we sent a new code" even when the resend was rejected.
      const { error: resendError } = await settleMobileAuthAction(
        supabase.auth.resetPasswordForEmail(email),
      );
      if (resendError) throw resendError;

      setCooldown(RESEND_COOLDOWN_SECONDS);
      pushToast({ message: "We sent a new code.", tone: "info" });
    } catch (caught) {
      setError(getRecoveryErrorMessage(caught));
    } finally {
      setResending(false);
    }
  }

  async function savePassword() {
    if (submitting) return;

    if (!isPasswordAcceptable(password)) {
      setError("Choose a stronger password.");
      return;
    }
    if (mismatchError) {
      setError(PASSWORD_MISMATCH_MESSAGE);
      return;
    }

    setError(null);
    setSubmitting(true);
    let confirmed: boolean;
    try {
      const { error: updateError } = await settleMobileAuthAction(
        supabase.auth.updateUser({ password }),
      );
      if (updateError) throw updateError;
      confirmed = true;
    } catch (caught) {
      if ((caught as { code?: unknown } | null)?.code === "insufficient_aal") {
        setSubmitting(false);
        await openFactorStage().catch((factorError: unknown) =>
          setError(getRecoveryErrorMessage(factorError)),
        );
        return;
      }
      if (!mayHavePasswordUpdateCommitted(caught)) {
        setError(getRecoveryErrorMessage(caught));
        setSubmitting(false);
        return;
      }
      // The provider may have applied it after the deadline or before the
      // response was lost. A retry would replay a change that may be done, so
      // the flow finishes as if it were, and never re-enables the submit.
      confirmed = false;
    }
    await finishRecovery(confirmed);
  }

  /**
   * Revoke everywhere: a password reset usually means the old one was
   * compromised, so any session still holding it has to go. DubGrid records the
   * revocation too, or a copied access token keeps working until it expires.
   */
  async function finishRecovery(confirmed: boolean) {
    let revoked = false;
    try {
      const accessToken = recoveryAccessTokenRef.current;
      if (accessToken) {
        await signOutMobileSessions(accessToken, {
          scope: "global",
          reason: "password_recovery",
        });
        revoked = true;
      }
    } catch {
      revoked = false;
    }
    await settleMobileAuthAction(supabase.auth.signOut({ scope: "local" })).catch(() => undefined);

    if (!confirmed) {
      pushToast({
        message:
          "We couldn't confirm your new password. Try signing in with it. If it doesn't work, request a new code.",
        tone: "info",
      });
    } else if (revoked) {
      pushToast({ message: "Password updated. Sign in with your new password!", tone: "success" });
    } else {
      pushToast({
        message: "Password updated. Sign in and review your active sessions.",
        tone: "info",
      });
    }
    router.replace("/(auth)/login");
  }

  return (
    <AuthShell footer={keyboardDoneAccessory}>
      {stage === "code" ? (
        <AuthStage>
          <AuthHeader
            subtitle={
              <AppText tone="muted">
                {email
                  ? `We sent a ${EMAIL_OTP_LENGTH}-digit code to ${email}.`
                  : "Enter the code from your email."}
              </AppText>
            }
            title={<AppText variant="heroMetric">Enter your code</AppText>}
          />

          <AuthFields>
            <AuthField
              accessibilityLabel="Reset code"
              autoComplete="one-time-code"
              hasError={Boolean(error)}
              inputAccessoryViewID={inputAccessoryViewID}
              keyboardType="number-pad"
              maxLength={EMAIL_OTP_LENGTH}
              onChangeText={(value) => {
                setCode(value.replace(/\D/g, ""));
                if (error) setError(null);
              }}
              onSubmitEditing={() => void verifyCode()}
              placeholder="000000"
              ref={codeInputRef}
              returnKeyType="go"
              value={code}
              variant="code"
            />
            {error ? <AuthFieldError message={error} /> : null}
          </AuthFields>

          <AuthActions
            primaryAction={
              <Button
                label="Verify code"
                loading={submitting}
                onPress={() => verifyCode()}
                size="lg"
              />
            }
          >
            <Button
              disabled={cooldown > 0 || submitting || resending}
              label={cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              loading={resending}
              onPress={() => resendCode()}
              tone="link"
            />
            <Button
              disabled={submitting}
              label="Back to sign in"
              onPress={() => leaveRecovery()}
              tone="link"
            />
          </AuthActions>
        </AuthStage>
      ) : stage === "no-factor" ? (
        <AuthStage>
          <AuthHeader
            subtitle={<AppText tone="muted">{NO_FACTOR_MESSAGE}</AppText>}
            title={<AppText variant="heroMetric">We can't finish this reset</AppText>}
          />
          <AuthActions
            primaryAction={
              <Button label="Back to sign in" onPress={() => leaveRecovery()} size="lg" />
            }
          />
        </AuthStage>
      ) : stage === "factor" ? (
        <AuthStage>
          <AuthHeader
            subtitle={
              <AppText tone="muted">
                Your account uses two-step verification. Enter the {TOTP_CODE_LENGTH}-digit code
                from your authenticator app.
              </AppText>
            }
            title={<AppText variant="heroMetric">Enter your authenticator code</AppText>}
          />

          <AuthFields>
            <AuthField
              accessibilityLabel="Authenticator code"
              autoComplete="one-time-code"
              hasError={Boolean(error)}
              inputAccessoryViewID={inputAccessoryViewID}
              keyboardType="number-pad"
              maxLength={TOTP_CODE_LENGTH}
              onChangeText={(value) => {
                setFactorCode(value.replace(/\D/g, ""));
                if (error) setError(null);
              }}
              onSubmitEditing={() => void verifyFactor()}
              placeholder="000000"
              ref={factorInputRef}
              returnKeyType="go"
              value={factorCode}
              variant="code"
            />
            {error ? <AuthFieldError message={error} /> : null}
          </AuthFields>

          <AuthActions
            primaryAction={
              <Button
                label="Verify authenticator code"
                loading={submitting}
                onPress={() => verifyFactor()}
                size="lg"
              />
            }
          >
            <Button
              disabled={submitting}
              label="Back to sign in"
              onPress={() => leaveRecovery()}
              tone="link"
            />
          </AuthActions>
        </AuthStage>
      ) : (
        <AuthStage>
          <AuthHeader
            subtitle={<AppText tone="muted">Choose a password you haven't used before.</AppText>}
            title={<AppText variant="heroMetric">Set a new password</AppText>}
          />

          <AuthFields>
            <AuthField
              accessibilityLabel="New password"
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
              hasError={Boolean(error)}
              inputAccessoryViewID={inputAccessoryViewID}
              onChangeText={(value) => {
                setPassword(value);
                if (error) setError(null);
              }}
              // `returnKeyType="next"` promised a focus advance the field never
              // made: with no `onSubmitEditing` the key only blurred, and
              // without `blurOnSubmit={false}` the keyboard closed on the way.
              blurOnSubmit={false}
              onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
              placeholder="New password"
              ref={passwordInputRef}
              returnKeyType="next"
              secureTextEntry={!showPassword}
              trailingAccessory={
                <Button
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  icon={showPassword ? "eye-off-outline" : "eye-outline"}
                  iconOnly
                  onPress={() => setShowPassword((current) => !current)}
                  tone="ghost"
                />
              }
              value={password}
            />
            <AuthField
              accessibilityLabel="Confirm password"
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
              hasError={Boolean(error) || Boolean(mismatchError)}
              inputAccessoryViewID={inputAccessoryViewID}
              onChangeText={(value) => {
                setConfirmPassword(value);
                if (error) setError(null);
              }}
              onSubmitEditing={() => void savePassword()}
              placeholder="Confirm password"
              ref={confirmPasswordInputRef}
              returnKeyType="go"
              secureTextEntry={!showPassword}
              value={confirmPassword}
            />
            {mismatchError ? <AuthFieldError message={mismatchError} /> : null}
            <PasswordStrengthHints password={password} />
            {error ? <AuthFieldError message={error} /> : null}
          </AuthFields>

          <AuthActions>
            <Button
              disabled={!canSubmitPassword}
              label="Update password"
              loading={submitting}
              onPress={() => savePassword()}
              size="lg"
            />
          </AuthActions>
        </AuthStage>
      )}
    </AuthShell>
  );
}
