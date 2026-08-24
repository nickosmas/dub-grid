import { useMemo, useState } from "react";
import {
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_STRENGTH_LABELS,
  getPasswordMismatchError,
  getPasswordStrengthHints,
  getPasswordStrengthLevel,
  isPasswordAcceptable,
  passwordsMatch,
} from "@dubgrid/domain";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "../../../shared/components/Pressable";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { getProfile } from "../../../shared/lib/api";
import {
  disablePushForCurrentDevice,
  handleExpiredMobileSession,
} from "../../../shared/lib/auth-reset";
import { getInlineErrorMessageOrToast } from "../../../shared/lib/errors";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useNavigationDiscardGuard } from "../../../shared/hooks/useNavigationDiscardGuard";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  mobileTypography,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { ProfilePanel, ProfileSection, ProfileTextInput } from "../components/ProfilePrimitives";
import { ProfileSkeleton } from "../components/ProfileSkeleton";

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";

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

/**
 * Password change, as a pushed screen rather than an editor that unfolds inside
 * the security hub.
 *
 * Three fields, a live strength readout and a consequence that signs every
 * device out is not something to open in place under four unrelated sections:
 * the page changed length as it opened, and everything it sat beside stayed
 * tappable behind an in-progress flow. A screen has one job, and the native
 * back button is the way out — which is why there is no Cancel button here.
 */
export default function ProfilePasswordScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [focusedPasswordField, setFocusedPasswordField] = useState<PasswordField | null>(null);
  const [visiblePasswordFields, setVisiblePasswordFields] = useState<
    Record<PasswordField, boolean>
  >({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  const profileQuery = useQuery({
    queryKey: ["mobile", "profile", accessToken],
    queryFn: () => getProfile(accessToken!),
    enabled: Boolean(accessToken),
  });
  const contentState = useMobileContentState({
    hasData: Boolean(profileQuery.data),
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
  });
  const accountEmail = profileQuery.data?.user.email ?? null;
  const confirmPasswordError = getPasswordMismatchError(newPassword, confirmPassword);
  // The same bar as the reset flow and web, via the shared rule. Gating on
  // length alone let a password the reset screen would reject enable this
  // submit, which is the exact drift `@dubgrid/domain/password` exists to stop.
  const passwordLooksReady =
    currentPassword.length > 0 &&
    isPasswordAcceptable(newPassword) &&
    passwordsMatch(newPassword, confirmPassword);

  // Anything typed into any of the three fields. Back navigation is the only
  // way off this screen, so without a guard a part-entered password change is
  // gone the moment a swipe is misread as a back gesture.
  const hasUnsavedChanges = currentPassword !== "" || newPassword !== "" || confirmPassword !== "";
  const guard = useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    disabled: passwordSaving,
    title: "Discard this password change?",
    body: "The password you were entering won't be saved.",
    onDiscard: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
    },
  });
  useNavigationDiscardGuard(guard);

  function togglePasswordVisibility(field: PasswordField) {
    setVisiblePasswordFields((current) => ({
      ...current,
      [field]: !current[field],
    }));
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
    if (!isPasswordAcceptable(newPassword)) {
      // Same wording as the reset flow: the strength hints above the field
      // already name the specific rule that is still unmet.
      setPasswordError("Choose a stronger password.");
      return;
    }
    if (!passwordsMatch(newPassword, confirmPassword)) {
      setPasswordError(PASSWORD_MISMATCH_MESSAGE);
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("New password must be different from your current password.");
      return;
    }

    setIsConfirming(true);
  }

  async function saveNewPassword() {
    if (passwordSaving) {
      return;
    }
    if (!accountEmail) {
      setIsConfirming(false);
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

      // Before the sign-out, while this device's token is still valid.
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
        setIsConfirming(false);
        setPasswordSaving(false);
      }
    }
  }

  return (
    <Screen bottomPaddingMode="tabbed">
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ProfileSkeleton rowsPerSection={3} sections={1} showHero={false} />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try Again"
          body={contentState.message}
          title="Could not load your account"
          onAction={() => {
            void profileQuery.refetch();
          }}
        />
      ) : (
        <ProfileSection description="Choose a password you don't use anywhere else. You'll be signed out everywhere once it changes.">
          {passwordError ? (
            <StatusBanner body={passwordError} title="Could not change password" />
          ) : null}
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
              Changing your password signs you out everywhere else.
            </Text>
          </ProfilePanel>
          <View style={styles.submitRow}>
            <Button
              disabled={!passwordLooksReady || passwordSaving}
              label="Update password"
              loading={passwordSaving}
              loadingLabel="Updating"
              onPress={requestPasswordChange}
            />
          </View>
        </ProfileSection>
      )}
      <ConfirmationModal
        body="You'll be signed out of every device after the password is updated."
        confirmLabel="Update and sign out"
        confirmPendingLabel="Updating"
        confirmTone="danger"
        loading={passwordSaving}
        onCancel={() => setIsConfirming(false)}
        onConfirm={() => void saveNewPassword()}
        title="Update password?"
        visible={isConfirming}
      />
      <ConfirmationModal {...guard.confirmationProps} />
    </Screen>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    submitRow: {
      marginTop: mobileSpace.xs,
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
      ...mobileTextWeighted("caption", "medium"),
      color: mobileColors.textMuted,
    },
    passwordStrengthLevel: {
      ...mobileTextWeighted("caption", "semibold"),
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
      fontFamily: mobileTypography.fontFamily.medium,
    },
    passwordVisibilityButton: {
      alignItems: "center",
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    signOutNotice: {
      ...mobileTextWeighted("meta", "medium"),
      color: mobileColors.danger,
    },
  });
