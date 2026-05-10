import { useEffect, useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileAuthLoginResponse } from "@dubgrid/contracts";
import { Redirect, router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LoadingScreen } from "../../../shared/components/LoadingScreen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { getScreenBottomPadding } from "../../../shared/components/screen-layout";
import {
  loginToWorkspace,
  lookupWorkspace,
  registerMobileSessionPresence,
  verifyMobileTotpFactor,
} from "../../../shared/lib/api";
import { getInlineErrorMessageOrToast } from "../../../shared/lib/errors";
import { getMobileEnvConfig } from "../../../shared/lib/env";
import {
  loadLastWorkspaceSlug,
  saveLastWorkspaceSlug,
} from "../../../shared/lib/session";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { mobileText } from "../../../shared/theme/tokens";

function getWorkspaceSuffixLabel(apiBaseUrl: string) {
  try {
    const hostname = new URL(apiBaseUrl).hostname.replace(/^www\./, "");
    if (
      hostname &&
      hostname !== "localhost" &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)
    ) {
      return `.${hostname}`;
    }
  } catch {
    // Fall back to a generic suffix below.
  }

  return ".workspace";
}

type PendingMfaLogin = MobileAuthLoginResponse & {
  mfaRequired: true;
  mfa: NonNullable<MobileAuthLoginResponse["mfa"]>;
};

export default function LoginScreen() {
  const { accessToken, isLoading } = useSessionState();
  const insets = useSafeAreaInsets();
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const mfaInputRef = useRef<TextInput>(null);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [stage, setStage] =
    useState<"workspace" | "credentials" | "mfa">("workspace");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [pendingMfaLogin, setPendingMfaLogin] =
    useState<PendingMfaLogin | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWorkspaceHelp, setShowWorkspaceHelp] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<
    "workspace" | "email" | "password" | null
  >(null);
  const { pushToast } = useToast();
  const { apiBaseUrl } = getMobileEnvConfig();
  const workspaceSuffix = getWorkspaceSuffixLabel(apiBaseUrl);

  useEffect(() => {
    let active = true;

    void loadLastWorkspaceSlug().then((storedSlug) => {
      if (!active || !storedSlug) {
        return;
      }

      setWorkspaceSlug(storedSlug);
    });

    return () => {
      active = false;
    };
  }, []);

  if (isLoading) {
    return (
      <LoadingScreen
        title="Checking your session"
        body="We’re confirming whether you already have mobile access."
      />
    );
  }

  if (accessToken) {
    return <Redirect href="/(tabs)/me" />;
  }

  async function finishLogin(
    response: MobileAuthLoginResponse,
    session = response.session,
  ) {
    await saveLastWorkspaceSlug(response.workspace.slug);

    const { error: sessionError } = await getSupabaseClient().auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    if (sessionError) {
      const nextError = getInlineErrorMessageOrToast(pushToast, {
        error: sessionError,
        fallbackMessage: "We couldn't finish signing you in right now.",
      });
      setError(nextError);
      return;
    }

    registerMobileSessionPresence(session.accessToken).catch(() => {});
    router.replace("/(tabs)/me");
  }

  async function handleWorkspaceContinue() {
    if (workspaceLoading) {
      return;
    }

    const normalizedSlug = workspaceSlug.trim().toLowerCase();
    if (!normalizedSlug) {
      setError("Enter your workspace slug to continue.");
      return;
    }

    setWorkspaceLoading(true);
    setError(null);

    try {
      const result = await lookupWorkspace(normalizedSlug);
      await saveLastWorkspaceSlug(result.workspace.slug);
      setWorkspaceSlug(result.workspace.slug);
      setWorkspaceName(result.workspace.name);
      setStage("credentials");

      setTimeout(() => {
        emailInputRef.current?.focus();
      }, 0);
    } catch (workspaceError) {
      const nextError = getInlineErrorMessageOrToast(pushToast, {
        error: workspaceError,
        fallbackMessage:
          "We couldn't verify that workspace. Check the subdomain and try again.",
        preferInlineNetworkError: true,
      });
      setError(nextError);
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function handleLogin() {
    if (submitting || !workspaceSlug || !email || !password) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await loginToWorkspace({
        workspaceSlug: workspaceSlug.trim().toLowerCase(),
        email: email.trim(),
        password,
      });

      if (response.mfaRequired && response.mfa) {
        setPendingMfaLogin(response as PendingMfaLogin);
        setMfaCode("");
        setPassword("");
        setStage("mfa");
        setTimeout(() => {
          mfaInputRef.current?.focus();
        }, 0);
        return;
      }

      await finishLogin(response);
    } catch (loginError) {
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
    if (submitting || !pendingMfaLogin || mfaCode.length !== 6) {
      return;
    }

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
      setTimeout(() => {
        mfaInputRef.current?.focus();
      }, 0);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardArea}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            {
              paddingBottom: getScreenBottomPadding("stack", insets.bottom),
            },
          ]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoBlock}>
            <View style={styles.logoRow}>
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel="DubGrid logo"
                source={require("../../../../assets/images/logo-blue.png")}
                style={styles.logoMark}
              />
              <Text style={styles.wordmark}>DubGrid</Text>
            </View>
            <Text style={styles.logoCaption}>Mobile sign in</Text>
          </View>

          <View style={styles.authCard}>
            {stage === "workspace" ? (
              <>
                <Text style={styles.panelTitle}>Enter your subdomain</Text>
                <Text style={styles.panelBody}>
                  Enter your subdomain to log in.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Workspace</Text>
                  <View
                    style={[
                      styles.workspaceInputRow,
                      focusedField === "workspace" &&
                        styles.workspaceInputRowFocused,
                      error && stage === "workspace" && styles.inputError,
                    ]}
                  >
                    <TextInput
                      accessibilityLabel="Workspace"
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="yourorg"
                      placeholderTextColor="#8b95a3"
                      returnKeyType="go"
                      style={[styles.input, styles.workspaceInput]}
                      value={workspaceSlug}
                      onBlur={() => setFocusedField(null)}
                      onChangeText={(value) => {
                        setWorkspaceSlug(
                          value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                        );
                        setError(null);
                      }}
                      onSubmitEditing={() => {
                        void handleWorkspaceContinue();
                      }}
                      onFocus={() => setFocusedField("workspace")}
                    />
                    <View style={styles.workspaceSuffix}>
                      <Text style={styles.workspaceSuffixText}>
                        {workspaceSuffix}
                      </Text>
                    </View>
                  </View>
                </View>

                {error ? (
                  <StatusBanner
                    body={error}
                    title="Workspace sign-in issue"
                    tone="error"
                  />
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: workspaceLoading || !workspaceSlug.trim(),
                  }}
                  android_ripple={
                    workspaceLoading || !workspaceSlug.trim()
                      ? undefined
                      : { color: "rgba(255, 255, 255, 0.22)" }
                  }
                  disabled={workspaceLoading || !workspaceSlug.trim()}
                  style={[
                    styles.button,
                    (workspaceLoading || !workspaceSlug.trim()) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    void handleWorkspaceContinue();
                  }}
                >
                  {workspaceLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Continue</Text>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showWorkspaceHelp }}
                  android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
                  style={styles.linkButton}
                  onPress={() => {
                    setShowWorkspaceHelp((current) => !current);
                  }}
                >
                  <Text style={styles.linkButtonText}>
                    Need help with your subdomain?
                  </Text>
                </Pressable>

                {showWorkspaceHelp ? (
                  <View style={styles.helperCard}>
                    <Text style={styles.helperText}>
                      Your subdomain is the first part of your workspace URL,
                      like <Text style={styles.helperStrong}>yourorg</Text>
                      {workspaceSuffix}.
                    </Text>
                  </View>
                ) : null}
              </>
            ) : stage === "credentials" ? (
              <>
                <Text style={styles.panelTitle}>Sign in to your workspace</Text>
                <Text style={styles.panelBody}>
                  Continue into{" "}
                  <Text style={styles.workspaceSlug}>
                    {workspaceName ?? workspaceSlug}
                  </Text>
                  .
                </Text>

                <View style={styles.workspaceBadge}>
                  <Text style={styles.workspaceBadgeText}>
                    {workspaceSlug}
                    {workspaceSuffix}
                  </Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    accessibilityLabel="Email"
                    ref={emailInputRef}
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    blurOnSubmit={false}
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor="#8b95a3"
                    returnKeyType="next"
                    style={[
                      styles.input,
                      focusedField === "email" && styles.inputFocused,
                      error && stage === "credentials" && styles.inputError,
                    ]}
                    textContentType="emailAddress"
                    value={email}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={setEmail}
                    onFocus={() => setFocusedField("email")}
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <View
                    style={[
                      styles.passwordInputRow,
                      focusedField === "password" && styles.inputFocused,
                      error && stage === "credentials" && styles.inputError,
                    ]}
                  >
                    <TextInput
                      accessibilityLabel="Password"
                      ref={passwordInputRef}
                      autoCapitalize="none"
                      autoComplete="password"
                      autoCorrect={false}
                      placeholder="Password"
                      placeholderTextColor="#8b95a3"
                      returnKeyType="done"
                      secureTextEntry={!showPassword}
                      style={[styles.input, styles.passwordInput]}
                      textContentType="password"
                      value={password}
                      onBlur={() => setFocusedField(null)}
                      onChangeText={setPassword}
                      onFocus={() => setFocusedField("password")}
                      onSubmitEditing={() => {
                        void handleLogin();
                      }}
                    />
                    <Pressable
                      accessibilityLabel={
                        showPassword ? "Hide password" : "Show password"
                      }
                      accessibilityRole="button"
                      hitSlop={8}
                      style={styles.passwordVisibilityButton}
                      onPress={() => {
                        setShowPassword((current) => !current);
                      }}
                    >
                      <Ionicons
                        color="#6b7280"
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={22}
                      />
                    </Pressable>
                  </View>
                </View>

                {error ? (
                  <StatusBanner
                    body={error}
                    title="Could not sign in"
                    tone="error"
                  />
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: submitting || !email || !password }}
                  android_ripple={
                    submitting || !email || !password
                      ? undefined
                      : { color: "rgba(255, 255, 255, 0.22)" }
                  }
                  disabled={submitting || !email || !password}
                  style={[
                    styles.button,
                    (submitting || !email || !password) && styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    void handleLogin();
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Sign In</Text>
                  )}
                </Pressable>

                <View style={styles.secondaryActions}>
                  <Pressable
                    accessibilityRole="button"
                    android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
                    style={styles.linkButton}
                    onPress={() => {
                      setStage("workspace");
                      setError(null);
                      setPendingMfaLogin(null);
                      setMfaCode("");
                    }}
                  >
                    <Text style={styles.linkButtonText}>Change workspace</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
                    style={styles.linkButton}
                    onPress={() => {
                      void Linking.openURL(`${apiBaseUrl}/forgot-password`);
                    }}
                  >
                    <Text style={styles.linkButtonText}>Forgot password?</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.panelTitle}>Two-factor authentication</Text>
                <Text style={styles.panelBody}>
                  Enter the 6-digit code from your authenticator app.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Verification code</Text>
                  <TextInput
                    ref={mfaInputRef}
                    accessibilityLabel="Verification code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    keyboardType="number-pad"
                    maxLength={6}
                    onChangeText={(value) => {
                      setMfaCode(value.replace(/\D/g, "").slice(0, 6));
                      setError(null);
                    }}
                    placeholder="000000"
                    placeholderTextColor="#8b95a3"
                    returnKeyType="done"
                    style={[styles.input, styles.codeInput]}
                    textContentType="oneTimeCode"
                    value={mfaCode}
                    onSubmitEditing={() => {
                      void handleMfaVerify();
                    }}
                  />
                </View>

                {error ? (
                  <StatusBanner
                    body={error}
                    title="Could not verify code"
                    tone="error"
                  />
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: submitting || mfaCode.length !== 6,
                  }}
                  android_ripple={
                    submitting || mfaCode.length !== 6
                      ? undefined
                      : { color: "rgba(255, 255, 255, 0.22)" }
                  }
                  disabled={submitting || mfaCode.length !== 6}
                  style={[
                    styles.button,
                    (submitting || mfaCode.length !== 6) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    void handleMfaVerify();
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Verify and Sign In</Text>
                  )}
                </Pressable>

                <View style={styles.secondaryActions}>
                  <Pressable
                    accessibilityRole="button"
                    android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
                    style={styles.linkButton}
                    onPress={() => {
                      setStage("credentials");
                      setPendingMfaLogin(null);
                      setMfaCode("");
                      setError(null);
                    }}
                  >
                    <Text style={styles.linkButtonText}>Back to sign in</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f4ef",
  },
  keyboardArea: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 32,
    gap: 20,
  },
  logoBlock: {
    alignItems: "center",
    gap: 8,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoMark: {
    width: 34,
    height: 34,
  },
  wordmark: {
    ...mobileText.heroMetric,
    color: "#111827",
    fontSize: 30,
    lineHeight: 36,
  },
  logoCaption: {
    ...mobileText.bodyStrong,
    color: "#6b7280",
  },
  authCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 2,
  },
  panelTitle: {
    ...mobileText.heroMetric,
    color: "#111827",
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center",
  },
  panelBody: {
    ...mobileText.body,
    color: "#6b7280",
    textAlign: "center",
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    ...mobileText.bodyStrong,
    color: "#374151",
  },
  workspaceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  workspaceInputRowFocused: {
    borderColor: "#2563eb",
    backgroundColor: "#ffffff",
  },
  workspaceInput: {
    flex: 1,
    borderWidth: 0,
  },
  workspaceSuffix: {
    alignSelf: "stretch",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 14,
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
  },
  workspaceSuffixText: {
    ...mobileText.bodyStrong,
    color: "#6b7280",
  },
  input: {
    ...mobileText.sectionTitle,
    fontWeight: "400",
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  inputFocused: {
    borderColor: "#2563eb",
    backgroundColor: "#ffffff",
  },
  codeInput: {
    fontSize: 24,
    letterSpacing: 8,
    lineHeight: 30,
    textAlign: "center",
  },
  inputError: {
    borderColor: "#b91c1c",
  },
  passwordInputRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d1d5db",
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: "row",
  },
  passwordInput: {
    borderWidth: 0,
    flex: 1,
    paddingRight: 8,
  },
  passwordVisibilityButton: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    marginRight: 6,
    width: 40,
  },
  button: {
    borderRadius: 999,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...mobileText.sectionTitle,
    color: "#ffffff",
  },
  linkButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 8,
  },
  linkButtonText: {
    ...mobileText.bodyStrong,
    color: "#6b7280",
    textDecorationLine: "underline",
  },
  helperCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  helperText: {
    ...mobileText.meta,
    color: "#4b5563",
  },
  helperStrong: {
    fontWeight: "700",
    color: "#111827",
  },
  workspaceSlug: {
    color: "#111827",
    fontWeight: "700",
  },
  workspaceBadge: {
    alignSelf: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  workspaceBadgeText: {
    ...mobileText.meta,
    color: "#1d4ed8",
    fontWeight: "600",
  },
  secondaryActions: {
    gap: 8,
  },
});
