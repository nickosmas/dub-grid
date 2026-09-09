import { useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PASSWORD_MISMATCH_MESSAGE,
  getPasswordMismatchError,
  isPasswordAcceptable,
} from "@dubgrid/domain";
import type { TextInput } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { Button } from "../../../shared/components/Button";
import { useKeyboardDoneAccessory } from "../../../shared/components/KeyboardDoneAccessory";
import { createEphemeralSupabaseClient } from "../../../shared/lib/supabase";
import { useToast } from "../../../shared/providers/ToastProvider";
import { AuthActions, AuthFields, AuthHeader, AuthShell, AuthStage } from "../components/AuthShell";
import { AuthField, AuthFieldError } from "../components/AuthField";
import { PasswordStrengthHints } from "../components/PasswordStrengthHints";
import { getRecoveryErrorMessage } from "../lib/recovery-errors";
import { settleMobileAuthAction } from "../lib/request-deadline";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

type Stage = "code" | "password";

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? "";
  const { pushToast } = useToast();

  const [stage, setStage] = useState<Stage>("code");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  const codeInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
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

    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from your email.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { error: verifyError } = await settleMobileAuthAction(
        supabase.auth.verifyOtp({
          email,
          token: code,
          type: "recovery",
        }),
      );
      if (verifyError) throw verifyError;

      setStage("password");
      setTimeout(() => passwordInputRef.current?.focus(), 0);
    } catch (caught) {
      setError(getRecoveryErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
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
    try {
      const { error: updateError } = await settleMobileAuthAction(
        supabase.auth.updateUser({ password }),
      );
      if (updateError) throw updateError;

      // Revoke everywhere: a password reset usually means the old one was
      // compromised, so any session still holding it has to go. Same posture as
      // the in-app password change.
      await settleMobileAuthAction(supabase.auth.signOut({ scope: "global" }));

      pushToast({ message: "Password updated. Sign in with your new password!", tone: "success" });
      router.replace("/(auth)/login");
    } catch (caught) {
      setError(getRecoveryErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell footer={keyboardDoneAccessory}>
      {stage === "code" ? (
        <AuthStage>
          <AuthHeader
            subtitle={
              <AppText tone="muted">
                {email ? `We sent a 6-digit code to ${email}.` : "Enter the code from your email."}
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
              maxLength={CODE_LENGTH}
              onChangeText={(value) => {
                setCode(value.replace(/\D/g, ""));
                if (error) setError(null);
              }}
              onSubmitEditing={() => void verifyCode()}
              placeholder="000000"
              ref={codeInputRef}
              returnKeyType="go"
              textContentType="oneTimeCode"
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
              onPress={() => router.replace("/(auth)/login")}
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
              textContentType="newPassword"
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
              textContentType="newPassword"
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
