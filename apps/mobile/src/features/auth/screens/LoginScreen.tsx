import { useEffect, useRef, useState } from "react";
import { Redirect, router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loginToWorkspace, lookupWorkspace } from "../../../shared/lib/api";
import { getMobileEnvConfig } from "../../../shared/lib/env";
import {
  loadLastWorkspaceSlug,
  saveLastWorkspaceSlug,
} from "../../../shared/lib/session";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { LoadingScreen } from "../../../shared/components/LoadingScreen";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";

const LOGO_CELL_OPACITY = [
  1,
  1,
  1,
  1,
  1,
  0.75,
  0.75,
  0.75,
  1,
  0.75,
  0.75,
  0.3,
  1,
  0.75,
  0.3,
  0.3,
] as const;

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

function getBackendHostLabel(apiBaseUrl: string) {
  try {
    return new URL(apiBaseUrl).host;
  } catch {
    return apiBaseUrl;
  }
}

export default function LoginScreen() {
  const { accessToken, isLoading } = useSessionState();
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [stage, setStage] = useState<"workspace" | "credentials">("workspace");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showWorkspaceHelp, setShowWorkspaceHelp] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { apiBaseUrl } = getMobileEnvConfig();
  const workspaceSuffix = getWorkspaceSuffixLabel(apiBaseUrl);
  const backendHost = getBackendHostLabel(apiBaseUrl);

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
      setError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "We couldn't verify that workspace right now.",
      );
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

      await saveLastWorkspaceSlug(response.workspace.slug);

      const { error: sessionError } = await getSupabaseClient().auth.setSession({
        access_token: response.session.accessToken,
        refresh_token: response.session.refreshToken,
      });

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      router.replace("/(tabs)/me");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "We couldn't sign you in right now. Check your connection and try again.",
      );
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
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoBlock}>
            <View style={styles.logoRow}>
              <View style={styles.logoMark}>
                {LOGO_CELL_OPACITY.map((opacity, index) => (
                  <View
                    key={`logo-cell-${index}`}
                    style={[styles.logoCell, { opacity }]}
                  />
                ))}
              </View>
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
                  <View style={styles.workspaceInputRow}>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="yourorg"
                      placeholderTextColor="#8b95a3"
                      returnKeyType="go"
                      style={[styles.input, styles.workspaceInput]}
                      value={workspaceSlug}
                      onChangeText={(value) => {
                        setWorkspaceSlug(
                          value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                        );
                        setError(null);
                      }}
                      onSubmitEditing={() => {
                        void handleWorkspaceContinue();
                      }}
                    />
                    <View style={styles.workspaceSuffix}>
                      <Text style={styles.workspaceSuffixText}>
                        {workspaceSuffix}
                      </Text>
                    </View>
                  </View>
                </View>

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
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
            ) : (
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
                    ref={emailInputRef}
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    blurOnSubmit={false}
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor="#8b95a3"
                    returnKeyType="next"
                    style={styles.input}
                    textContentType="emailAddress"
                    value={email}
                    onChangeText={setEmail}
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <TextInput
                    ref={passwordInputRef}
                    autoCapitalize="none"
                    autoComplete="password"
                    autoCorrect={false}
                    placeholder="Password"
                    placeholderTextColor="#8b95a3"
                    returnKeyType="done"
                    secureTextEntry
                    style={styles.input}
                    textContentType="password"
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={() => {
                      void handleLogin();
                    }}
                  />
                </View>

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
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
                    style={styles.linkButton}
                    onPress={() => {
                      setStage("workspace");
                      setError(null);
                    }}
                  >
                    <Text style={styles.linkButtonText}>Change workspace</Text>
                  </Pressable>
                  <Pressable
                    style={styles.linkButton}
                    onPress={() => {
                      void Linking.openURL(`${apiBaseUrl}/forgot-password`);
                    }}
                  >
                    <Text style={styles.linkButtonText}>Forgot password?</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <Text style={styles.backendHint}>Backend: {backendHost}</Text>
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
    paddingVertical: 32,
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
    width: 32,
    height: 32,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  logoCell: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: "#2563eb",
  },
  wordmark: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  logoCaption: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "600",
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
    color: "#111827",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  panelBody: {
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "700",
  },
  workspaceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 12,
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
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  errorBox: {
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  errorText: {
    color: "#b42318",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
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
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: 2,
  },
  linkButtonText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "600",
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
    color: "#4b5563",
    fontSize: 13,
    lineHeight: 18,
  },
  helperStrong: {
    fontWeight: "800",
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
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryActions: {
    gap: 8,
  },
  backendHint: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "600",
  },
});
