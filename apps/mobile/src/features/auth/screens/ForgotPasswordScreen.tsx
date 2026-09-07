import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { TextInput } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { Button } from "../../../shared/components/Button";
import { useKeyboardDoneAccessory } from "../../../shared/components/KeyboardDoneAccessory";
import { createEphemeralSupabaseClient } from "../../../shared/lib/supabase";
import { AuthActions, AuthFields, AuthHeader, AuthShell, AuthStage } from "../components/AuthShell";
import { AuthField, AuthFieldError } from "../components/AuthField";
import { getRecoveryErrorMessage, shouldSurfaceResetRequestError } from "../lib/recovery-errors";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailInputRef = useRef<TextInput>(null);
  const { inputAccessoryViewID, keyboardDoneAccessory } = useKeyboardDoneAccessory({
    always: true,
  });

  async function requestReset() {
    const trimmed = email.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }

    setError(null);
    setSubmitting(true);

    // supabase-js *resolves* with `{ error }` for auth failures rather than
    // throwing, so the returned error is the path that actually fires; rate
    // limits and network failures reached the catch below only in tests, which
    // mocked a rejection. The catch stays for a transport-level throw.
    let requestError: unknown = null;
    try {
      // The ephemeral client throughout, so no part of this flow can write a
      // session to storage. See ResetPasswordScreen for why that matters.
      const { error: resetError } =
        await createEphemeralSupabaseClient().auth.resetPasswordForEmail(trimmed);
      requestError = resetError;
    } catch (caught) {
      requestError = caught;
    }

    if (requestError && shouldSurfaceResetRequestError(requestError)) {
      setError(getRecoveryErrorMessage(requestError));
      setSubmitting(false);
      return;
    }
    // Otherwise fall through: see the comment on the navigation below.

    setSubmitting(false);
    // Advance whether or not the address has an account. Telling the user
    // "no account with that email" turns this screen into a way to discover
    // which addresses are registered. Web's forgot-password page does the same.
    router.replace({ pathname: "/(auth)/reset-password", params: { email: trimmed } });
  }

  return (
    <AuthShell footer={keyboardDoneAccessory}>
      <AuthStage>
        <AuthHeader
          subtitle={
            <AppText tone="muted">
              Enter your email and we'll send you a 6-digit code to reset it.
            </AppText>
          }
          title={<AppText variant="heroMetric">Forgot your password?</AppText>}
        />

        <AuthFields>
          <AuthField
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            hasError={Boolean(error)}
            inputAccessoryViewID={inputAccessoryViewID}
            keyboardType="email-address"
            textContentType="emailAddress"
            onChangeText={(value) => {
              setEmail(value);
              if (error) setError(null);
            }}
            onSubmitEditing={() => void requestReset()}
            placeholder="Email"
            ref={emailInputRef}
            returnKeyType="go"
            value={email}
          />
          {error ? <AuthFieldError message={error} /> : null}
        </AuthFields>

        <AuthActions
          primaryAction={
            <Button
              label="Send reset code"
              loading={submitting}
              onPress={() => requestReset()}
              size="lg"
            />
          }
        >
          <Button
            disabled={submitting}
            label="Back to sign in"
            onPress={() => router.replace("/(auth)/login")}
            tone="link"
          />
        </AuthActions>
      </AuthStage>
    </AuthShell>
  );
}
