import { useEffect, useMemo, useState } from "react";
import type { Factor } from "@supabase/supabase-js";
import * as LocalAuthentication from "expo-local-authentication";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { DetailSkeleton } from "../../../shared/components/Skeleton";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  appLockUnsupported,
  loadAppLockEnabled,
  setAppLockEnabled,
} from "../../../shared/lib/app-lock";
import {
  createProfileChangeRequest,
  getProfile,
  getProfileSessions,
  revokeProfileSession,
  updateProfileMfaStatus,
} from "../../../shared/lib/api";
import {
  getInlineErrorMessageOrToast,
  pushClientFriendlyErrorToast,
} from "../../../shared/lib/errors";
import {
  disablePushForCurrentDevice,
  handleExpiredMobileSession,
} from "../../../shared/lib/auth-reset";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { mobileRadii, mobileText, type MobileColors } from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  ProfileInfoRow,
  ProfileList,
  ProfilePanel,
  ProfileSection,
  ProfileTextInput,
  useProfilePrimitiveStyles,
} from "../components/ProfilePrimitives";

const PENDING_ACCOUNT_DELETION_MESSAGE = "An account deletion request is pending admin review.";

const MOBILE_TOTP_FRIENDLY_NAME = "DubGrid Mobile Authenticator";

function isVerifiedTotpFactor(factor: Factor): boolean {
  return factor.factor_type === "totp" && factor.status === "verified";
}

function isStaleMobileTotpFactor(factor: Factor): boolean {
  return (
    factor.factor_type === "totp" &&
    factor.status === "unverified" &&
    factor.friendly_name === MOBILE_TOTP_FRIENDLY_NAME
  );
}

type MfaStep = "idle" | "enrolling";

const PASSWORD_STRENGTH_RULES = [
  {
    id: "length",
    label: "At least 10 characters",
    isMet: (password: string) => password.length >= 10,
  },
  {
    id: "uppercase",
    label: "Uppercase letter",
    isMet: (password: string) => /[A-Z]/.test(password),
  },
  {
    id: "number",
    label: "Number",
    isMet: (password: string) => /[0-9]/.test(password),
  },
  {
    id: "symbol",
    label: "Symbol",
    isMet: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
] as const;

const PASSWORD_STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Strong"];

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";

type SecurityConfirmation =
  | { kind: "deletion" }
  | { kind: "password" }
  | { kind: "sessionScope"; scope: "others" | "global" }
  | { kind: "revokeSession"; refreshTokenHash: string; label: string }
  | { kind: "mfaDisable" };

function formatSessionPlatform(platform: string | null) {
  if (platform === "ios") return "iOS";
  if (platform === "android") return "AND";
  if (platform === "web") return "WEB";
  return "?";
}

function getPasswordStrengthHints(password: string) {
  return PASSWORD_STRENGTH_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    met: rule.isMet(password),
  }));
}

function getPasswordStrengthLevel(password: string) {
  const hints = getPasswordStrengthHints(password);
  const metCount = hints.filter((hint) => hint.met).length;

  if (!hints[0]?.met) {
    return 0;
  }

  if (metCount === hints.length) {
    return 3;
  }

  if (metCount >= 3) {
    return 2;
  }

  return 1;
}

function PasswordStrengthHints({ password }: { password: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const hints = getPasswordStrengthHints(password);
  const level = getPasswordStrengthLevel(password);
  const hasStartedTyping = password.length > 0;
  const levelStyle =
    level === 3
      ? styles.passwordStrengthLevelStrong
      : level === 0
        ? styles.passwordStrengthLevelShort
        : styles.passwordStrengthLevelMedium;

  return (
    <View accessibilityLabel="Password strength hints" style={styles.passwordStrength}>
      <View style={styles.passwordStrengthHeader}>
        <Text style={styles.passwordStrengthTitle}>Password strength</Text>
        {hasStartedTyping ? (
          <Text style={[styles.passwordStrengthLevel, levelStyle]}>
            {PASSWORD_STRENGTH_LABELS[level]}
          </Text>
        ) : null}
      </View>
      <View style={styles.passwordHintList}>
        {hints.map((hint) => (
          <View key={hint.id} style={styles.passwordHintRow}>
            <View style={[styles.passwordHintDot, hint.met && styles.passwordHintDotMet]} />
            <Text style={[styles.passwordHintText, hint.met && styles.passwordHintTextMet]}>
              {hint.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PasswordVisibilityToggle({
  isVisible,
  label,
  onPress,
}: {
  isVisible: boolean;
  label: string;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <Pressable
      accessibilityLabel={`${isVisible ? "Hide" : "Show"} ${label}`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.passwordVisibilityButton}
    >
      <Ionicons
        color={mobileColors.textMuted}
        name={isVisible ? "eye-off-outline" : "eye-outline"}
        size={22}
      />
    </Pressable>
  );
}

export default function ProfileSecurityScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const profilePrimitiveStyles = useProfilePrimitiveStyles();
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [sessionScopeLoading, setSessionScopeLoading] = useState<"others" | "global" | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPasswordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [focusedPasswordField, setFocusedPasswordField] = useState<PasswordField | null>(null);
  const [visiblePasswordFields, setVisiblePasswordFields] = useState<
    Record<PasswordField, boolean>
  >({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [pendingConfirmation, setPendingConfirmation] = useState<SecurityConfirmation | null>(null);
  const [mfaStep, setMfaStep] = useState<MfaStep>("idle");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [appLockToggling, setAppLockToggling] = useState(false);

  useEffect(() => {
    if (appLockUnsupported) return;
    let active = true;
    void loadAppLockEnabled().then((value) => {
      if (active) setAppLockEnabledState(value);
    });
    return () => {
      active = false;
    };
  }, []);

  async function toggleAppLock(next: boolean) {
    if (appLockToggling) return;
    setAppLockToggling(true);
    try {
      if (next) {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!hasHardware || !isEnrolled) {
          pushToast({
            tone: "error",
            title: "Could not enable app lock",
            message: "Set up a passcode or biometrics in your device settings first.",
          });
          return;
        }
      }
      await setAppLockEnabled(next);
      setAppLockEnabledState(next);
    } finally {
      setAppLockToggling(false);
    }
  }

  const profileQuery = useQuery({
    queryKey: ["mobile", "profile", accessToken],
    queryFn: () => getProfile(accessToken!),
    enabled: Boolean(accessToken),
  });
  const bootstrapQuery = useBootstrap(accessToken);
  const canEditProfileDirectly = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);
  const sessionsQuery = useQuery({
    queryKey: ["mobile", "profile", "sessions", accessToken],
    queryFn: () => getProfileSessions(accessToken!),
    enabled: Boolean(accessToken),
  });
  const revokeMutation = useMutation({
    mutationFn: (refreshTokenHash: string) => revokeProfileSession(accessToken!, refreshTokenHash),
    onSuccess: async () => {
      await sessionsQuery.refetch();
      pushToast({
        tone: "success",
        title: "Session revoked",
        message: "That device has been signed out.",
      });
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not revoke session",
        fallbackMessage: "We couldn't revoke that session right now.",
      });
    },
  });
  const deletionRequestMutation = useMutation({
    mutationFn: () =>
      createProfileChangeRequest(accessToken!, {
        type: "account_deletion",
        requestNote: "Account deletion requested from mobile profile.",
      }),
    onSuccess: async () => {
      await profileQuery.refetch();
      pushToast({
        tone: "success",
        title: "Deletion request sent",
        message: "Your request was sent.",
      });
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not request deletion",
        fallbackMessage: "We couldn't send that request right now.",
      });
    },
  });
  const manualRefresh = useManualRefresh(() =>
    Promise.all([profileQuery.refetch(), sessionsQuery.refetch()]),
  );
  const contentState = getMobileQueryContentState({
    hasData: Boolean(profileQuery.data),
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
  });
  const accountEmail = profileQuery.data?.user.email ?? null;
  const confirmPasswordError =
    confirmPassword.length > 0 && newPassword !== confirmPassword
      ? "Passwords do not match."
      : null;
  const passwordLooksReady =
    currentPassword.length > 0 && newPassword.length >= 10 && newPassword === confirmPassword;

  function resetPasswordEditor() {
    setPasswordError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setFocusedPasswordField(null);
    setVisiblePasswordFields({
      currentPassword: false,
      newPassword: false,
      confirmPassword: false,
    });
    setPasswordEditorOpen(false);
  }

  function togglePasswordVisibility(field: PasswordField) {
    setVisiblePasswordFields((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }

  async function handleSessionAction(scope: "others" | "global") {
    if (sessionScopeLoading) {
      return;
    }

    setSessionScopeLoading(scope);
    try {
      if (scope === "global") {
        // This device is about to lose its session too, so stop its pushes
        // while the token is still valid.
        await disablePushForCurrentDevice();
      }

      const result = await getSupabaseClient().auth.signOut({ scope });
      if (result.error) {
        pushClientFriendlyErrorToast(pushToast, {
          error: result.error,
          title: "Could not update sessions",
          fallbackMessage: "We couldn't update your sessions right now.",
        });
        return;
      }

      if (scope === "global") {
        await handleExpiredMobileSession({ skipSignOut: true });
      } else {
        await sessionsQuery.refetch();
      }
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update sessions",
        fallbackMessage: "We couldn't update your sessions right now.",
      });
    } finally {
      setSessionScopeLoading(null);
    }
  }

  function requestPasswordChange() {
    if (passwordSaving) {
      return;
    }

    setPasswordError(null);
    if (!accountEmail) {
      setPasswordError(
        "This account does not have an email address available for password verification.",
      );
      return;
    }
    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError("Password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("New password must be different from your current password.");
      return;
    }

    setPendingConfirmation({ kind: "password" });
  }

  async function saveNewPassword() {
    if (passwordSaving) {
      return;
    }
    if (!accountEmail) {
      setPendingConfirmation(null);
      return;
    }

    setPasswordError(null);
    setPasswordSaving(true);
    let isRedirecting = false;
    try {
      const verifyResult = await getSupabaseClient().auth.signInWithPassword({
        email: accountEmail,
        password: currentPassword,
      });
      if (verifyResult.error) {
        setPasswordError(
          getInlineErrorMessageOrToast(pushToast, {
            error: verifyResult.error,
            fallbackMessage: "That password did not match this account.",
          }),
        );
        return;
      }

      const updateResult = await getSupabaseClient().auth.updateUser({
        password: newPassword,
      });
      if (updateResult.error) {
        setPasswordError(
          getInlineErrorMessageOrToast(pushToast, {
            error: updateResult.error,
            fallbackMessage: "We couldn't update your password right now.",
          }),
        );
        return;
      }

      await disablePushForCurrentDevice();

      const signOutResult = await getSupabaseClient().auth.signOut({
        scope: "global",
      });
      if (signOutResult.error) {
        setPasswordError(
          getInlineErrorMessageOrToast(pushToast, {
            error: signOutResult.error,
            fallbackMessage: "Your password changed, but we couldn't sign out every session.",
          }),
        );
        return;
      }

      isRedirecting = true;
      await handleExpiredMobileSession({ skipSignOut: true });
    } catch (error) {
      isRedirecting = false;
      setPasswordError(
        getInlineErrorMessageOrToast(pushToast, {
          error,
          fallbackMessage: "We couldn't update your password right now.",
        }),
      );
    } finally {
      if (!isRedirecting) {
        setPendingConfirmation(null);
        setPasswordSaving(false);
      }
    }
  }

  function resetMfaEnrollment() {
    setMfaStep("idle");
    setMfaSecret(null);
    setMfaFactorId(null);
    setMfaVerifyCode("");
    setMfaError(null);
  }

  async function startMfaEnrollment() {
    if (mfaLoading) return;
    setMfaLoading(true);
    setMfaError(null);
    try {
      const { data: factorsData, error: listError } =
        await getSupabaseClient().auth.mfa.listFactors();
      if (listError) throw listError;

      const existingVerifiedTotp = factorsData.all.find(isVerifiedTotpFactor);
      if (existingVerifiedTotp) {
        if (accessToken) await updateProfileMfaStatus(accessToken, { enabled: true });
        await profileQuery.refetch();
        pushToast({
          tone: "success",
          title: "Two-factor authentication",
          message: "Already enabled on this account.",
        });
        resetMfaEnrollment();
        return;
      }

      const staleFactors = factorsData.all.filter(isStaleMobileTotpFactor);
      for (const factor of staleFactors) {
        const { error: unenrollError } = await getSupabaseClient().auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (unenrollError) throw unenrollError;
      }

      const { data, error } = await getSupabaseClient().auth.mfa.enroll({
        factorType: "totp",
        friendlyName: MOBILE_TOTP_FRIENDLY_NAME,
      });
      if (error) throw error;

      setMfaSecret(data.totp.secret);
      setMfaFactorId(data.id);
      setMfaStep("enrolling");
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not start setup",
        fallbackMessage: "We couldn't start two-factor setup right now.",
      });
    } finally {
      setMfaLoading(false);
    }
  }

  async function verifyMfaEnrollment() {
    if (!mfaFactorId || mfaVerifyCode.length !== 6 || mfaLoading) return;
    setMfaLoading(true);
    setMfaError(null);
    try {
      const { error } = await getSupabaseClient().auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code: mfaVerifyCode,
      });
      if (error) throw error;

      if (accessToken) await updateProfileMfaStatus(accessToken, { enabled: true });
      await profileQuery.refetch();
      pushToast({
        tone: "success",
        title: "Two-factor authentication enabled",
        message: "Your account is now protected.",
      });
      resetMfaEnrollment();
    } catch (error) {
      setMfaError(
        getInlineErrorMessageOrToast(pushToast, {
          error,
          fallbackMessage: "Invalid verification code. Please try again.",
        }),
      );
    } finally {
      setMfaLoading(false);
    }
  }

  function cancelMfaEnrollment() {
    if (mfaFactorId) {
      getSupabaseClient()
        .auth.mfa.unenroll({ factorId: mfaFactorId })
        .catch(() => {});
    }
    resetMfaEnrollment();
  }

  async function disableMfa() {
    if (mfaLoading) return;
    setMfaLoading(true);
    try {
      const { data: factorsData, error: listError } =
        await getSupabaseClient().auth.mfa.listFactors();
      if (listError) throw listError;

      const verifiedTotp = factorsData.totp.filter((factor) => factor.status === "verified");
      for (const factor of verifiedTotp) {
        const { error } = await getSupabaseClient().auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
      }

      if (accessToken) await updateProfileMfaStatus(accessToken, { enabled: false });
      await profileQuery.refetch();
      pushToast({
        tone: "success",
        title: "Two-factor authentication disabled",
        message: "You can re-enable it any time.",
      });
      resetMfaEnrollment();
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not disable",
        fallbackMessage: "We couldn't disable two-factor authentication right now.",
      });
    } finally {
      setMfaLoading(false);
    }
  }

  function confirmDeletionRequest() {
    setPendingConfirmation({ kind: "deletion" });
  }

  function confirmSecurityAction() {
    const action = pendingConfirmation;
    if (!action) return;

    if (action.kind === "deletion") {
      setPendingConfirmation(null);
      deletionRequestMutation.mutate();
    } else if (action.kind === "password") {
      void saveNewPassword();
    } else if (action.kind === "sessionScope") {
      setPendingConfirmation(null);
      void handleSessionAction(action.scope);
    } else if (action.kind === "mfaDisable") {
      setPendingConfirmation(null);
      void disableMfa();
    } else {
      setPendingConfirmation(null);
      void revokeMutation.mutateAsync(action.refreshTokenHash);
    }
  }

  const confirmationTitle =
    pendingConfirmation?.kind === "deletion"
      ? "Request account deletion?"
      : pendingConfirmation?.kind === "password"
        ? "Update password?"
        : pendingConfirmation?.kind === "sessionScope" && pendingConfirmation.scope === "global"
          ? "Sign out all devices?"
          : pendingConfirmation?.kind === "sessionScope"
            ? "Sign out other sessions?"
            : pendingConfirmation?.kind === "mfaDisable"
              ? "Disable two-factor authentication?"
              : "Revoke session?";
  const confirmationBody =
    pendingConfirmation?.kind === "deletion"
      ? "Your admin will be notified to start the deletion process."
      : pendingConfirmation?.kind === "password"
        ? "You'll be signed out of every device after the password is updated."
        : pendingConfirmation?.kind === "sessionScope" && pendingConfirmation.scope === "global"
          ? "Every device, including this one, will be signed out."
          : pendingConfirmation?.kind === "sessionScope"
            ? "Every device except this one will be signed out."
            : pendingConfirmation?.kind === "mfaDisable"
              ? "This will make your account less secure."
              : `${pendingConfirmation?.label ?? "This device"} will lose access immediately.`;
  const confirmationLabel =
    pendingConfirmation?.kind === "deletion"
      ? "Request"
      : pendingConfirmation?.kind === "password"
        ? "Update and sign out"
        : pendingConfirmation?.kind === "sessionScope" && pendingConfirmation.scope === "global"
          ? "Sign Out"
          : pendingConfirmation?.kind === "sessionScope"
            ? "Sign Out"
            : pendingConfirmation?.kind === "mfaDisable"
              ? "Disable"
              : "Revoke";

  function renderSessionRow(
    session: NonNullable<typeof sessionsQuery.data>["active"][number],
    options: { isLast: boolean; showRevoke: boolean },
  ) {
    return (
      <View
        key={session.id}
        style={[styles.sessionItem, !options.isLast && styles.sessionItemDivider]}
      >
        <View style={styles.sessionRow}>
          <View style={styles.sessionIcon}>
            <Text style={styles.sessionIconText}>{formatSessionPlatform(session.platform)}</Text>
          </View>
          <View style={styles.sessionCopy}>
            <View style={styles.sessionTitleRow}>
              <Text style={styles.sessionTitle}>
                {session.deviceLabel || session.platform || "Unknown device"}
              </Text>
              {session.isCurrent && (
                <View style={styles.sessionCurrentBadge}>
                  <Text style={styles.sessionCurrentBadgeText}>Current</Text>
                </View>
              )}
            </View>
            <Text style={styles.sessionBody}>
              Last active {new Date(session.lastActiveAt).toLocaleString()}
            </Text>
            {session.appVersion || session.ipAddress ? (
              <Text style={styles.sessionMeta}>
                {[session.appVersion, session.ipAddress].filter(Boolean).join(" - ")}
              </Text>
            ) : null}
          </View>
        </View>
        {options.showRevoke && (
          <Button
            compact
            disabled={revokeMutation.isPending}
            label="Revoke"
            onPress={() => {
              setPendingConfirmation({
                kind: "revokeSession",
                refreshTokenHash: session.refreshTokenHash,
                label: session.deviceLabel || session.platform || "this device",
              });
            }}
            tone="neutral"
          />
        )}
      </View>
    );
  }

  return (
    <Screen refreshing={manualRefresh.isRefreshing} onRefresh={manualRefresh.refresh}>
      {contentState.kind === "loading" ? (
        <DetailSkeleton sections={3} />
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try Again"
          body={contentState.message}
          title="Could not load security"
          onAction={() => {
            void profileQuery.refetch();
          }}
        />
      ) : profileQuery.data ? (
        <>
          {profileQuery.data.pendingAccountDeletionRequest ? (
            <StatusBanner body={PENDING_ACCOUNT_DELETION_MESSAGE} title="Request pending" />
          ) : null}

          <ProfileSection title="Password">
            {passwordError ? (
              <StatusBanner body={passwordError} title="Could not change password" />
            ) : null}
            {isPasswordEditorOpen ? (
              <>
                <ProfilePanel>
                  <ProfileTextInput
                    accessibilityLabel="Current password"
                    focused={focusedPasswordField === "currentPassword"}
                    label="Current password"
                    placeholder="Current password"
                    secureTextEntry={!visiblePasswordFields.currentPassword}
                    trailingAccessory={
                      <PasswordVisibilityToggle
                        isVisible={visiblePasswordFields.currentPassword}
                        label="current password"
                        onPress={() => togglePasswordVisibility("currentPassword")}
                      />
                    }
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    onBlur={() => setFocusedPasswordField(null)}
                    onFocus={() => setFocusedPasswordField("currentPassword")}
                  />
                  <ProfileTextInput
                    accessibilityLabel="New password"
                    focused={focusedPasswordField === "newPassword"}
                    label="New password"
                    placeholder="New password"
                    secureTextEntry={!visiblePasswordFields.newPassword}
                    trailingAccessory={
                      <PasswordVisibilityToggle
                        isVisible={visiblePasswordFields.newPassword}
                        label="new password"
                        onPress={() => togglePasswordVisibility("newPassword")}
                      />
                    }
                    value={newPassword}
                    onChangeText={setNewPassword}
                    onBlur={() => setFocusedPasswordField(null)}
                    onFocus={() => setFocusedPasswordField("newPassword")}
                  />
                  <PasswordStrengthHints password={newPassword} />
                  <ProfileTextInput
                    accessibilityLabel="Confirm new password"
                    error={confirmPasswordError}
                    focused={focusedPasswordField === "confirmPassword"}
                    label="Confirm new password"
                    placeholder="Confirm new password"
                    secureTextEntry={!visiblePasswordFields.confirmPassword}
                    trailingAccessory={
                      <PasswordVisibilityToggle
                        isVisible={visiblePasswordFields.confirmPassword}
                        label="confirm password"
                        onPress={() => togglePasswordVisibility("confirmPassword")}
                      />
                    }
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onBlur={() => setFocusedPasswordField(null)}
                    onFocus={() => setFocusedPasswordField("confirmPassword")}
                  />
                  <Text style={styles.signOutNotice}>
                    You will be logged out of all sessions after changing your password.
                  </Text>
                </ProfilePanel>
                <View style={styles.actionsRow}>
                  <Button
                    compact
                    disabled={!passwordLooksReady || passwordSaving}
                    label={passwordSaving ? "Updating..." : "Update password"}
                    onPress={requestPasswordChange}
                  />
                  <Button
                    compact
                    disabled={passwordSaving}
                    label="Cancel"
                    onPress={resetPasswordEditor}
                    tone="neutral"
                  />
                </View>
              </>
            ) : (
              <Button
                compact
                label="Change password"
                onPress={() => {
                  setPasswordError(null);
                  setPasswordEditorOpen(true);
                }}
              />
            )}
          </ProfileSection>

          <ProfileSection title="Two-factor authentication">
            {mfaStep === "enrolling" ? (
              <>
                {mfaError ? <StatusBanner body={mfaError} title="Could not verify code" /> : null}
                <Text style={styles.mfaInstructions}>
                  Add a new entry in your authenticator app (Google Authenticator, Authy, 1Password,
                  etc.) using this key, then enter the 6-digit code it generates.
                </Text>
                {mfaSecret ? (
                  <View style={styles.mfaSecretRow}>
                    <Text selectable style={styles.mfaSecretText}>
                      {mfaSecret}
                    </Text>
                  </View>
                ) : null}
                <ProfileTextInput
                  accessibilityLabel="6-digit verification code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  keyboardType="number-pad"
                  label="Verification code"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaVerifyCode}
                  onChangeText={(text) => {
                    setMfaVerifyCode(text.replace(/\D/g, "").slice(0, 6));
                    setMfaError(null);
                  }}
                />
                <View style={styles.actionsRow}>
                  <Button
                    compact
                    disabled={mfaLoading || mfaVerifyCode.length !== 6}
                    label={mfaLoading ? "Verifying..." : "Verify & enable"}
                    onPress={() => void verifyMfaEnrollment()}
                  />
                  <Button
                    compact
                    disabled={mfaLoading}
                    label="Cancel"
                    onPress={cancelMfaEnrollment}
                    tone="neutral"
                  />
                </View>
              </>
            ) : (
              <>
                <ProfileList>
                  <ProfileInfoRow
                    iconName="shield-outline"
                    isLast
                    label="Status"
                    value={profileQuery.data.user.mfaEnabled ? "Enabled" : "Not enabled"}
                  />
                </ProfileList>
                {profileQuery.data.user.mfaEnabled ? (
                  <Button
                    compact
                    disabled={mfaLoading}
                    label="Disable 2FA"
                    onPress={() => setPendingConfirmation({ kind: "mfaDisable" })}
                    tone="danger"
                  />
                ) : (
                  <Button
                    compact
                    disabled={mfaLoading}
                    label={mfaLoading ? "Starting..." : "Enable 2FA"}
                    onPress={() => void startMfaEnrollment()}
                  />
                )}
              </>
            )}
          </ProfileSection>

          {!appLockUnsupported ? (
            <ProfileSection title="App lock">
              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.rowTitle}>Require unlock on this device</Text>
                  <Text style={styles.rowDescription}>
                    Ask for Face ID, fingerprint, or your device passcode whenever you return to
                    DubGrid.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="App lock"
                  disabled={appLockToggling}
                  value={appLockEnabled}
                  onValueChange={(next) => void toggleAppLock(next)}
                />
              </View>
            </ProfileSection>
          ) : null}

          {!canEditProfileDirectly ? (
            <ProfileSection title="Account deletion">
              <Button
                compact
                disabled={
                  deletionRequestMutation.isPending ||
                  Boolean(profileQuery.data.pendingAccountDeletionRequest)
                }
                label={
                  deletionRequestMutation.isPending ? "Requesting..." : "Request account deletion"
                }
                onPress={confirmDeletionRequest}
                tone="danger"
              />
            </ProfileSection>
          ) : null}

          <ProfileSection title="Sessions">
            <View style={styles.actionsRow}>
              <View style={styles.actionButtonSlot}>
                <Button
                  compact
                  disabled={sessionScopeLoading != null}
                  label={
                    sessionScopeLoading === "others" ? "Updating..." : "Sign out other sessions"
                  }
                  onPress={() => {
                    setPendingConfirmation({
                      kind: "sessionScope",
                      scope: "others",
                    });
                  }}
                  tone="secondary"
                />
              </View>
              <View style={styles.actionButtonSlot}>
                <Button
                  compact
                  disabled={sessionScopeLoading != null}
                  label={sessionScopeLoading === "global" ? "Updating..." : "Sign out all devices"}
                  onPress={() => {
                    setPendingConfirmation({
                      kind: "sessionScope",
                      scope: "global",
                    });
                  }}
                  tone="danger"
                />
              </View>
            </View>
            {sessionsQuery.isLoading ? (
              <Text style={profilePrimitiveStyles.subtleText}>Loading sessions...</Text>
            ) : sessionsQuery.error ? (
              <StatusBanner
                actionLabel="Try Again"
                body="We couldn't load your sessions right now."
                title="Could not load sessions"
                onAction={() => {
                  void sessionsQuery.refetch();
                }}
              />
            ) : (
              <>
                <View style={styles.sessionList}>
                  <Text style={styles.sessionGroupHeading}>Active sessions</Text>
                  {(sessionsQuery.data?.active ?? []).map((session, index, sessions) =>
                    renderSessionRow(session, {
                      isLast: index === sessions.length - 1,
                      showRevoke: true,
                    }),
                  )}
                </View>
                {(sessionsQuery.data?.stale.length ?? 0) > 0 ? (
                  <View style={styles.sessionList}>
                    <Text style={styles.sessionGroupHeading}>Stale sessions</Text>
                    {(sessionsQuery.data?.stale ?? []).map((session, index, sessions) =>
                      renderSessionRow(session, {
                        isLast: index === sessions.length - 1,
                        showRevoke: false,
                      }),
                    )}
                  </View>
                ) : null}
              </>
            )}
          </ProfileSection>
        </>
      ) : null}
      <ConfirmationModal
        body={confirmationBody}
        confirmLabel={confirmationLabel}
        confirmTone={
          pendingConfirmation?.kind === "deletion" ||
          pendingConfirmation?.kind === "password" ||
          pendingConfirmation?.kind === "revokeSession" ||
          pendingConfirmation?.kind === "mfaDisable" ||
          (pendingConfirmation?.kind === "sessionScope" && pendingConfirmation.scope === "global")
            ? "dangerFilled"
            : "primary"
        }
        loading={
          deletionRequestMutation.isPending ||
          revokeMutation.isPending ||
          passwordSaving ||
          sessionScopeLoading != null ||
          (pendingConfirmation?.kind === "mfaDisable" && mfaLoading)
        }
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={confirmSecurityAction}
        title={confirmationTitle}
        visible={pendingConfirmation != null}
      />
    </Screen>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    actionsRow: {
      flexDirection: "row",
      gap: 10,
    },
    actionButtonSlot: {
      flex: 1,
      minWidth: 0,
    },
    passwordStrength: {
      gap: 8,
    },
    passwordStrengthHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
    },
    passwordStrengthTitle: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
      fontWeight: "500",
    },
    passwordStrengthLevel: {
      ...mobileText.caption,
      fontWeight: "600",
    },
    passwordStrengthLevelShort: {
      color: mobileColors.dangerText,
    },
    passwordStrengthLevelMedium: {
      color: mobileColors.warningText,
    },
    passwordStrengthLevelStrong: {
      color: mobileColors.successText,
    },
    passwordHintList: {
      gap: 6,
    },
    passwordHintRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    passwordHintDot: {
      backgroundColor: mobileColors.border,
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    passwordHintDotMet: {
      backgroundColor: mobileColors.success,
    },
    passwordHintText: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      flexShrink: 1,
    },
    passwordHintTextMet: {
      color: mobileColors.successText,
      fontWeight: "500",
    },
    passwordVisibilityButton: {
      alignItems: "center",
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    signOutNotice: {
      ...mobileText.meta,
      color: mobileColors.danger,
      fontWeight: "500",
    },
    mfaInstructions: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
    },
    toggleCopy: {
      flex: 1,
      gap: 4,
    },
    rowTitle: {
      ...mobileText.cardTitle,
      color: mobileColors.textPrimary,
      fontWeight: "500",
    },
    rowDescription: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
    mfaSecretRow: {
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    mfaSecretText: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
      // "monospace" is an Android alias with no iOS equivalent, so recovery
      // codes silently rendered in the system font there.
      fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
      letterSpacing: 1,
    },
    sessionList: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: 0,
      overflow: "hidden",
    },
    sessionItem: {
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    sessionItemDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    sessionRow: {
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
    },
    sessionIcon: {
      alignItems: "center",
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.borderSubtle,
      borderRadius: 18,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    sessionIconText: {
      ...mobileText.micro,
      color: mobileColors.textSecondary,
    },
    sessionCopy: {
      flex: 1,
      gap: 4,
    },
    sessionTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    sessionTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
      fontWeight: "500",
    },
    sessionCurrentBadge: {
      backgroundColor: mobileColors.brand,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    sessionCurrentBadgeText: {
      ...mobileText.micro,
      color: mobileColors.textInverse,
      fontWeight: "700",
    },
    sessionBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    sessionMeta: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
    },
    sessionGroupHeading: {
      ...mobileText.caption,
      backgroundColor: mobileColors.surfaceSecondary,
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      color: mobileColors.textMuted,
      fontWeight: "600",
      letterSpacing: 0.4,
      paddingHorizontal: 16,
      paddingVertical: 8,
      textTransform: "uppercase",
    },
  });
