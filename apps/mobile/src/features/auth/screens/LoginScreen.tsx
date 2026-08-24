import { useEffect, useMemo, useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ApiResponseError } from "@dubgrid/api-client";
import type { MobileAuthLoginResponse } from "@dubgrid/contracts";
import { ACCOUNT_DISABLED_CODE, ACCOUNT_DISABLED_MESSAGE } from "@dubgrid/domain";
import { Redirect, router } from "expo-router";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Pressable } from "../../../shared/components/Pressable";
import { Button } from "../../../shared/components/Button";
import { useKeyboardDoneAccessory } from "../../../shared/components/KeyboardDoneAccessory";
import { AuthShell } from "../components/AuthShell";
import {
  useIsConsentDecisionPending,
  useRecheckConsentDecision,
} from "../../consent/components/ConsentGate";
import { clearStoredConsent } from "../../consent/lib/consent";
import {
  getBootstrap,
  loginToOrganization,
  lookupOrganization,
  registerMobileSessionPresence,
  verifyMobileTotpFactor,
} from "../../../shared/lib/api";
import { buildBootstrapQueryKey } from "../hooks/useBootstrap";
import { queryClient } from "../../../shared/lib/query-client";
import { getInlineErrorMessageOrToast } from "../../../shared/lib/errors";
import { getMobileEnvConfig } from "../../../shared/lib/env";
import { loadLastOrg, saveLastOrg } from "../../../shared/lib/session";
import { markHasSeenOnboarding } from "../hooks/useHasSeenOnboarding";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  mobileTypography,
  type MobileColors,
} from "../../../shared/theme/tokens";

type Stage = "organization" | "credentials" | "mfa";

type PendingMfaLogin = MobileAuthLoginResponse & {
  mfaRequired: true;
  mfa: NonNullable<MobileAuthLoginResponse["mfa"]>;
};

const SESSION_HANDOFF_TIMEOUT_MS = 15_000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

function getOrgSuffixLabel(apiBaseUrl: string) {
  try {
    const hostname = new URL(apiBaseUrl).hostname.replace(/^www\./, "");
    if (hostname && hostname !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return `.${hostname}`;
    }
  } catch {
    // Fall back to a generic suffix below.
  }

  return ".dubgrid.com";
}

function InlineError({ message }: { message: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View style={styles.errorRow}>
      <Ionicons color={mobileColors.dangerText} name="alert-circle" size={16} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function withSessionHandoffTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          "Sign-in is taking longer than expected. Check your internet connection and try again.",
        ),
      );
    }, SESSION_HANDOFF_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export default function LoginScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { accessToken, isLoading } = useSessionState();
  const isConsentDecisionPending = useIsConsentDecisionPending();
  const recheckConsentDecision = useRecheckConsentDecision();
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const mfaInputRef = useRef<TextInput>(null);
  // One bar serves every stage's field: the keyboard covers the stage's submit
  // button here, so each field gets a visible way out even when its own return
  // key could also dismiss it.
  const { inputAccessoryViewID, keyboardDoneAccessory } = useKeyboardDoneAccessory({
    always: true,
  });
  const [orgSlug, setOrgSlug] = useState("");
  const [orgName, setOrgName] = useState<string | null>(null);
  // True only while a remembered organization's name is still being fetched,
  // which is the one window where we don't yet know what to call it.
  const [isResolvingOrgName, setIsResolvingOrgName] = useState(false);
  const [stage, setStage] = useState<Stage>("organization");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [pendingMfaLogin, setPendingMfaLogin] = useState<PendingMfaLogin | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOrgHelp, setShowOrgHelp] = useState(false);
  const [orgLoading, setOrgLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<"organization" | "email" | "password" | null>(
    null,
  );
  const { pushToast } = useToast();
  const { apiBaseUrl } = getMobileEnvConfig();
  const orgSuffix = getOrgSuffixLabel(apiBaseUrl);

  useEffect(() => {
    // Both this and the consent gate's own storage read start at mount, and
    // this one usually wins — which raised the keyboard a moment before the
    // consent sheet slid up over it. Wait for the decision instead of racing
    // it: this effect re-runs once consent resolves, and the focus below then
    // lands on a screen the user can actually act on.
    if (isConsentDecisionPending) {
      return;
    }

    let active = true;

    void (async () => {
      const storedOrg = await loadLastOrg();
      if (!active || !storedOrg) {
        return;
      }

      // Take the user straight to the credentials step: the saved slug is
      // enough to attempt sign-in. The cached name renders the subtitle right
      // away, so a returning user sees their organization named in full even
      // before (or without) the network lookup below, which only refreshes a
      // name that may have changed server-side.
      setOrgSlug(storedOrg.slug);
      setOrgName(storedOrg.name);
      setStage("credentials");
      setIsResolvingOrgName(!storedOrg.name);
      setTimeout(() => emailInputRef.current?.focus(), 0);
      try {
        const result = await lookupOrganization(storedOrg.slug);
        if (!active) return;
        setOrgName(result.organization.name);
        setOrgSlug(result.organization.slug);
        await saveLastOrg(result.organization);
      } catch {
        // Ignore: the cached name (or the subdomain) still names the target.
      } finally {
        if (active) setIsResolvingOrgName(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isConsentDecisionPending]);

  // No splash here: the only time the session is still restoring is launch, and
  // `StartupSplashGate` is already covering the screen with the app's one
  // splash instance. Rendering another would restart the brand animation.
  if (isLoading) {
    return null;
  }

  if (accessToken) {
    return <Redirect href="/(tabs)/home" />;
  }

  async function finishLogin(response: MobileAuthLoginResponse, session = response.session) {
    await saveLastOrg(response.organization);

    const { error: sessionError } = await withSessionHandoffTimeout(
      getSupabaseClient().auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      }),
    );

    if (sessionError) {
      const nextError = getInlineErrorMessageOrToast(pushToast, {
        error: sessionError,
        fallbackMessage: "We couldn't finish signing you in. Try again in a moment.",
      });
      setError(nextError);
      return;
    }

    registerMobileSessionPresence(session.accessToken).catch(() => {});

    // Warm bootstrap before handing off. The tab tree can't draw its tab bar or
    // pick the Home screen without it, and the launch splash is long spent by
    // now, so arriving without it would blank the screen. The submit button
    // stays in its pending state for this, which is the honest place to show
    // the wait. `prefetchQuery` never rejects: a failed bootstrap should still
    // let the user through to the tab gate's locked/error handling.
    await queryClient.prefetchQuery({
      queryKey: buildBootstrapQueryKey(session.accessToken),
      queryFn: () => getBootstrap(session.accessToken),
    });

    router.replace("/(tabs)/home");
  }

  async function handleOrganizationContinue() {
    if (orgLoading) return;

    const normalizedSlug = orgSlug.trim().toLowerCase();
    if (!normalizedSlug) {
      setError("Enter your organization to continue.");
      return;
    }

    setOrgLoading(true);
    setError(null);

    try {
      const result = await lookupOrganization(normalizedSlug);
      await saveLastOrg(result.organization);
      setOrgSlug(result.organization.slug);
      setOrgName(result.organization.name);
      setStage("credentials");
      setTimeout(() => emailInputRef.current?.focus(), 0);
    } catch (organizationError) {
      const nextError = getInlineErrorMessageOrToast(pushToast, {
        error: organizationError,
        fallbackMessage: "We couldn't find that organization. Check the subdomain and try again.",
        preferInlineNetworkError: true,
      });
      setError(nextError);
    } finally {
      setOrgLoading(false);
    }
  }

  async function handleLogin() {
    if (submitting || !orgSlug || !email || !password) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await loginToOrganization({
        orgSlug: orgSlug.trim().toLowerCase(),
        email: email.trim(),
        password,
      });

      if (response.mfaRequired && response.mfa) {
        setPendingMfaLogin(response as PendingMfaLogin);
        setMfaCode("");
        setPassword("");
        setStage("mfa");
        setTimeout(() => mfaInputRef.current?.focus(), 0);
        return;
      }

      await finishLogin(response);
    } catch (loginError) {
      // The JWT hook refuses terminated employees with a sentinel message
      // (ACCOUNT_DISABLED_CODE) — surface a friendly disabled-account message
      // instead of the generic invalid-credentials fallback.
      if (
        loginError instanceof ApiResponseError &&
        loginError.status === 403 &&
        loginError.payload &&
        typeof loginError.payload === "object" &&
        (loginError.payload as { code?: unknown }).code === ACCOUNT_DISABLED_CODE
      ) {
        setError(ACCOUNT_DISABLED_MESSAGE);
        pushToast({
          title: "Account disabled",
          message: ACCOUNT_DISABLED_MESSAGE,
          tone: "error",
        });
        setPassword("");
        return;
      }
      const nextError = getInlineErrorMessageOrToast(pushToast, {
        error: loginError,
        fallbackMessage: "We couldn't sign you in right now. Try again in a moment.",
      });
      setError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaVerify() {
    if (submitting || !pendingMfaLogin || mfaCode.length !== 6) return;

    setSubmitting(true);
    setError(null);
    try {
      const verifiedSession = await verifyMobileTotpFactor({
        session: pendingMfaLogin.session,
        factorId: pendingMfaLogin.mfa.factorId,
        code: mfaCode,
      });

      await finishLogin(pendingMfaLogin, verifiedSession);
    } catch (mfaError) {
      const nextError = getInlineErrorMessageOrToast(pushToast, {
        error: mfaError,
        fallbackMessage: "We couldn't verify that code right now. Try again in a moment.",
      });
      setError(nextError);
      setMfaCode("");
      setTimeout(() => mfaInputRef.current?.focus(), 0);
    } finally {
      setSubmitting(false);
    }
  }

  function switchOrganization() {
    setStage("organization");
    setError(null);
    setPendingMfaLogin(null);
    setMfaCode("");
    setEmail("");
    setPassword("");
    setOrgName(null);
  }

  // "Continue to" always names the organization in full. The subdomain form is
  // a last resort for when no name is coming, and must never flash ahead of a
  // name that is still on its way, so the line stays blank while we're still
  // finding out. `styles.subtitle` reserves its height so nothing shifts.
  const orgSubtitle = orgName ? (
    <>
      Continue to <Text style={styles.subtitleStrong}>{orgName}</Text>.
    </>
  ) : isResolvingOrgName ? null : (
    <>
      Signing in at{" "}
      <Text style={styles.subtitleStrong}>
        {orgSlug}
        {orgSuffix}
      </Text>
      .
    </>
  );

  // `__DEV__` is a Metro/RN global that isn't defined outside the app
  // runtime (e.g. under vitest), so guard the lookup rather than reference
  // it directly.
  const isDevBuild = typeof __DEV__ !== "undefined" && __DEV__;

  // Dev-only: long-press the wordmark to replay first run after a local
  // `db:reset`. Both the onboarding flag and the consent choice live in device
  // storage, which a DB reset has no way to reach, so a fresh database
  // otherwise lands on a device that has already seen and decided everything.
  async function handleDevResetFirstRun() {
    if (!isDevBuild) return;
    await Promise.all([markHasSeenOnboarding(false), clearStoredConsent()]);
    recheckConsentDecision();
    pushToast({
      title: "First run reset",
      message: "Showing onboarding and the privacy prompt again.",
      tone: "info",
    });
    router.replace("/(auth)/onboarding");
  }

  return (
    <AuthShell
      footer={keyboardDoneAccessory}
      onBrandLongPress={isDevBuild ? () => void handleDevResetFirstRun() : undefined}
    >
      {stage === "organization" ? (
        <View style={styles.stage}>
          <View style={styles.header}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>Enter the subdomain for your team.</Text>
          </View>

          <View style={styles.fields}>
            <View
              style={[
                styles.inputRow,
                focusedField === "organization" && styles.inputRowFocused,
                error ? styles.inputRowError : null,
              ]}
            >
              <TextInput
                accessibilityLabel="Organization"
                autoCapitalize="none"
                autoCorrect={false}
                inputAccessoryViewID={inputAccessoryViewID}
                placeholder="yourorg"
                placeholderTextColor={mobileColors.placeholderText}
                returnKeyType="go"
                style={[styles.input, styles.inputFlex]}
                value={orgSlug}
                onBlur={() => setFocusedField(null)}
                onChangeText={(value) => {
                  setOrgSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                  setError(null);
                }}
                onSubmitEditing={() => handleOrganizationContinue()}
                onFocus={() => setFocusedField("organization")}
              />
              <View style={styles.suffix}>
                <Text style={styles.suffixText}>{orgSuffix}</Text>
              </View>
            </View>

            {error ? <InlineError message={error} /> : null}
          </View>

          <View style={styles.actions}>
            <Button
              disabled={orgLoading || !orgSlug.trim()}
              label="Continue"
              loading={orgLoading}
              loadingLabel="Checking"
              onPress={() => handleOrganizationContinue()}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showOrgHelp }}
              android_ripple={{ color: mobileColors.rippleNeutral }}
              style={styles.link}
              onPress={() => setShowOrgHelp((current) => !current)}
            >
              <Text style={styles.linkText}>Need help with your subdomain?</Text>
            </Pressable>

            {showOrgHelp ? (
              <Text style={styles.helperText}>
                Your subdomain is the first part of your organization URL - for example, the{" "}
                <Text style={styles.helperStrong}>yourorg</Text> in{" "}
                <Text style={styles.helperStrong}>yourorg{orgSuffix}</Text>.
              </Text>
            ) : null}
          </View>
        </View>
      ) : stage === "credentials" ? (
        <View style={styles.stage}>
          <View style={styles.header}>
            <Text style={styles.title}>Welcome back!</Text>
            <Text style={styles.subtitle}>{orgSubtitle}</Text>
          </View>

          <View style={styles.fields}>
            <View
              style={[
                styles.inputRow,
                focusedField === "email" && styles.inputRowFocused,
                error ? styles.inputRowError : null,
              ]}
            >
              <TextInput
                accessibilityLabel="Email"
                ref={emailInputRef}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                blurOnSubmit={false}
                inputAccessoryViewID={inputAccessoryViewID}
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor={mobileColors.placeholderText}
                returnKeyType="next"
                style={[styles.input, styles.inputFlex]}
                textContentType="emailAddress"
                value={email}
                onBlur={() => setFocusedField(null)}
                onChangeText={setEmail}
                onFocus={() => setFocusedField("email")}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
              />
            </View>

            <View
              style={[
                styles.inputRow,
                focusedField === "password" && styles.inputRowFocused,
                error ? styles.inputRowError : null,
              ]}
            >
              <TextInput
                accessibilityLabel="Password"
                ref={passwordInputRef}
                autoCapitalize="none"
                autoComplete="password"
                autoCorrect={false}
                inputAccessoryViewID={inputAccessoryViewID}
                placeholder="Password"
                placeholderTextColor={mobileColors.placeholderText}
                returnKeyType="done"
                secureTextEntry={!showPassword}
                style={[styles.input, styles.inputFlex]}
                textContentType="password"
                value={password}
                onBlur={() => setFocusedField(null)}
                onChangeText={setPassword}
                onFocus={() => setFocusedField("password")}
                onSubmitEditing={() => handleLogin()}
              />
              <View style={styles.eyeButton}>
                <Button
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  icon={showPassword ? "eye-off-outline" : "eye-outline"}
                  iconOnly
                  onPress={() => setShowPassword((current) => !current)}
                  tone="ghost"
                />
              </View>
            </View>

            {error ? <InlineError message={error} /> : null}
          </View>

          <View style={styles.actions}>
            <Button
              disabled={submitting || !isValidEmail(email) || !password}
              label="Sign In"
              loading={submitting}
              loadingLabel="Signing In"
              onPress={() => handleLogin()}
            />

            <View style={styles.linkRow}>
              <Pressable
                accessibilityRole="button"
                android_ripple={{ color: mobileColors.rippleNeutral }}
                style={styles.link}
                onPress={switchOrganization}
              >
                <Text style={styles.linkText}>Switch organization</Text>
              </Pressable>
              <Text style={styles.linkSeparator}>·</Text>
              <Pressable
                accessibilityRole="button"
                android_ripple={{ color: mobileColors.rippleNeutral }}
                style={styles.link}
                onPress={() => {
                  // Native now, rather than handing the user off to the
                  // web app in a browser sheet mid sign-in.
                  router.push({
                    pathname: "/(auth)/forgot-password",
                    params: { email },
                  });
                }}
              >
                <Text style={styles.linkText}>Forgot password?</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.stage}>
          <View style={styles.header}>
            <Text style={styles.title}>Two-factor authentication</Text>
            <Text style={styles.subtitle}>Enter the 6-digit code from your authenticator app.</Text>
          </View>

          <View style={styles.fields}>
            <View style={[styles.inputRow, styles.codeRow, error ? styles.inputRowError : null]}>
              <TextInput
                ref={mfaInputRef}
                accessibilityLabel="Verification code"
                autoComplete="one-time-code"
                inputAccessoryViewID={inputAccessoryViewID}
                inputMode="numeric"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value) => {
                  setMfaCode(value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                placeholder="000000"
                placeholderTextColor={mobileColors.placeholderText}
                returnKeyType="done"
                style={[styles.input, styles.codeInput]}
                textContentType="oneTimeCode"
                value={mfaCode}
                onSubmitEditing={() => handleMfaVerify()}
              />
            </View>

            {error ? <InlineError message={error} /> : null}
          </View>

          <View style={styles.actions}>
            <Button
              disabled={submitting || mfaCode.length !== 6}
              label="Verify and Sign In"
              loading={submitting}
              loadingLabel="Verifying"
              onPress={() => handleMfaVerify()}
            />

            <Pressable
              accessibilityRole="button"
              android_ripple={{ color: mobileColors.rippleNeutral }}
              style={styles.link}
              onPress={() => {
                setStage("credentials");
                setPendingMfaLogin(null);
                setMfaCode("");
                setError(null);
              }}
            >
              <Text style={styles.linkText}>Back to sign in</Text>
            </Pressable>
          </View>
        </View>
      )}
    </AuthShell>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    stage: {
      gap: 24,
    },
    header: {
      gap: 6,
    },
    title: {
      ...mobileText.heroMetric,
      color: mobileColors.textPrimary,
      fontSize: 30,
      lineHeight: 36,
    },
    subtitle: {
      ...mobileText.body,
      color: mobileColors.textMuted,
      // Holds one line's height while the organization's name is still being
      // resolved, so the header doesn't jump when the copy lands.
      minHeight: mobileText.body.lineHeight,
    },
    subtitleStrong: {
      color: mobileColors.textPrimary,
      fontFamily: mobileTypography.fontFamily.bold,
    },
    fields: {
      gap: 12,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 54,
      borderRadius: mobileRadii.control,
      borderWidth: 1.5,
      borderColor: mobileColors.inputBorder,
      backgroundColor: mobileColors.surface,
    },
    inputRowFocused: {
      borderColor: mobileColors.inputBorderFocused,
    },
    inputRowError: {
      borderColor: mobileColors.inputBorderError,
    },
    codeRow: {
      minHeight: 62,
    },
    input: {
      // No fontFamily: an explicit DM Sans family on TextInput breaks
      // Android EditText interactivity when the font hasn't loaded yet.
      // System font keeps the input safe; surrounding Text stays DM Sans.
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "400",
      color: mobileColors.textPrimary,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    inputFlex: {
      flex: 1,
    },
    codeInput: {
      flex: 1,
      textAlign: "center",
      fontSize: 26,
      letterSpacing: 10,
      fontWeight: "600",
    },
    suffix: {
      alignSelf: "stretch",
      justifyContent: "center",
      paddingHorizontal: 14,
      borderLeftWidth: 1,
      borderLeftColor: mobileColors.borderSubtle,
    },
    suffixText: {
      ...mobileText.bodyStrong,
      color: mobileColors.textMuted,
    },
    // Centres the round toggle inside the field's trailing edge. The button
    // brings its own 44pt target, so this only handles the inset.
    eyeButton: {
      alignItems: "center",
      justifyContent: "center",
      paddingRight: mobileSpace.xs,
      alignSelf: "center",
    },
    actions: {
      gap: 16,
    },
    link: {
      alignSelf: "center",
      minHeight: 36,
      paddingVertical: 6,
      paddingHorizontal: 4,
      justifyContent: "center",
    },
    linkText: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    linkSeparator: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    helperText: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      textAlign: "center",
    },
    helperStrong: {
      ...mobileTextWeighted("meta", "bold"),
      color: mobileColors.textPrimary,
    },
    errorRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      paddingHorizontal: 4,
    },
    errorText: {
      ...mobileText.meta,
      color: mobileColors.dangerText,
      flex: 1,
    },
  });
