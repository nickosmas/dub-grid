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
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { Pressable } from "../../../shared/components/Pressable";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { InlineError } from "../../../shared/components/InlineError";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import {
  getProfile,
  requireMobileCredentialAssurance,
  signOutMobileSessions,
} from "../../../shared/lib/api";
import {
  disablePushForCurrentDevice,
  handleExpiredMobileSession,
} from "../../../shared/lib/auth-reset";
import { getInlineErrorMessageOrToast } from "../../../shared/lib/errors";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
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
import { useMobileStepUpAction } from "../hooks/useMobileStepUpAction";

type PasswordField = "newPassword" | "confirmPassword";

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
  const stepUp = useMobileStepUpAction();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [focusedPasswordField, setFocusedPasswordField] = useState<PasswordField | null>(null);
  const [visiblePasswordFields, setVisiblePasswordFields] = useState<
    Record<PasswordField, boolean>
  >({
    newPassword: false,
    confirmPassword: false,
  });

  const profileQuery = useQuery({
    queryKey: mobileQueryKeys.profile(accessToken),
    queryFn: ({ signal }) => getProfile(accessToken!, signal),
    enabled: Boolean(accessToken),
  });
  const contentState = useMobileContentState({
    hasData: Boolean(profileQuery.data),
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
  });
  const confirmPasswordError = getPasswordMismatchError(newPassword, confirmPassword);
  // The same bar as the reset flow and web, via the shared rule. Gating on
  // length alone let a password the reset screen would reject enable this
  // submit, which is the exact drift `@dubgrid/domain/password` exists to stop.
  const passwordLooksReady =
    isPasswordAcceptable(newPassword) && passwordsMatch(newPassword, confirmPassword);

  // Anything typed into any of the three fields. Back navigation is the only
  // way off this screen, so without a guard a part-entered password change is
  // gone the moment a swipe is misread as a back gesture.
  const hasUnsavedChanges = newPassword !== "" || confirmPassword !== "";
  const guard = useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    disabled: passwordSaving,
    title: "Discard this password change?",
    body: "The password you were entering won't be saved.",
    onDiscard: () => {
      setNewPassword("");
      setConfirmPassword("");
    },
  });
  useNavigationDiscardGuard(guard);

  function togglePasswordVisibility(field: PasswordField) {
    setVisiblePasswordFields((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }

  function showPasswordError(message: string) {
    pushToast({ tone: "error", title: "Could not change password", message });
  }

  function requestPasswordChange() {
    if (passwordSaving) {
      return;
    }

    if (!isPasswordAcceptable(newPassword)) {
      // Same wording as the reset flow: the strength hints above the field
      // already name the specific rule that is still unmet.
      showPasswordError("Choose a stronger password.");
      return;
    }
    if (!passwordsMatch(newPassword, confirmPassword)) {
      showPasswordError(PASSWORD_MISMATCH_MESSAGE);
      return;
    }
    setConfirmError(null);
    setIsConfirming(true);
  }

  async function saveNewPassword() {
    if (passwordSaving) {
      return;
    }
    setPasswordSaving(true);
    setConfirmError(null);
    let isRedirecting = false;
    // Null when a failure's message already went to a toast (the network
    // case getInlineErrorMessageOrToast handles itself) — the dialog can
    // close then, the toast is the whole story. Any other string means the
    // dialog needs to stay open and show it.
    let inlineError: string | null = null;
    let failed = false;
    let identityCancelled = false;

    function fail(error: unknown, fallbackMessage: string) {
      failed = true;
      inlineError = getInlineErrorMessageOrToast(pushToast, { error, fallbackMessage });
      setConfirmError(inlineError);
    }

    try {
      let assuredAccessToken: string | null = null;
      const completed = await stepUp.run(async (actionAccessToken) => {
        // The preflight must finish before calling Supabase's public mutation.
        // The mutation is never replayed after an ambiguous provider failure.
        await requireMobileCredentialAssurance(actionAccessToken);
        const updateResult = await getSupabaseClient().auth.updateUser({
          password: newPassword,
        });
        if (updateResult.error) {
          throw updateResult.error;
        }
        assuredAccessToken = actionAccessToken;
      });
      if (!completed) {
        identityCancelled = true;
        return;
      }

      // Before the sign-out, while this device's token is still valid.
      await disablePushForCurrentDevice();

      try {
        if (!assuredAccessToken) throw new Error("Missing assured session");
        await signOutMobileSessions(assuredAccessToken, { scope: "global" });
      } catch (error) {
        fail(error, "Your password changed, but we couldn't sign out every session.");
        return;
      }

      isRedirecting = true;
      // Every session is already revoked; this only clears the device.
      await handleExpiredMobileSession();
    } catch (error) {
      isRedirecting = false;
      fail(error, "We couldn't update your password right now.");
    } finally {
      setPasswordSaving(false);
      // Stays open when there's an inline message to show, next to "Update
      // and sign out" for an immediate retry — closing unconditionally (as a
      // plain `finally` once did) meant a toast was the only trace of what
      // happened, easy to miss and gone once dismissed.
      if (!isRedirecting && !identityCancelled && !(failed && inlineError)) {
        setIsConfirming(false);
      }
    }
  }

  return (
    <Screen
      bottomPaddingMode="tabbed"
      footer={
        contentState.kind === "loading" || contentState.kind === "error" ? null : (
          <View style={styles.submitRow}>
            <Button
              disabled={!passwordLooksReady || passwordSaving}
              label="Update password"
              loading={passwordSaving}
              onPress={requestPasswordChange}
            />
          </View>
        )
      }
      scrollEnabled={contentState.kind !== "loading"}
    >
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ProfileSkeleton rowsPerSection={3} sections={1} showHero={false} />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load your account"
          variant="centered"
          onAction={() => {
            void profileQuery.refetch();
          }}
        />
      ) : (
        <ProfileSection description="Choose a password you don't use anywhere else. You'll be signed out everywhere once it changes.">
          <ProfilePanel>
            <ProfileTextInput
              accessibilityLabel="New password"
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
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
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
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
        </ProfileSection>
      )}
      <ConfirmationModal
        body="You'll be signed out of every device after the password is updated."
        confirmLabel="Update and sign out"
        confirmTone="warning"
        iconName="key-outline"
        loading={passwordSaving}
        onCancel={() => {
          setIsConfirming(false);
          setConfirmError(null);
        }}
        onConfirm={() => saveNewPassword()}
        title="Update password?"
        visible={isConfirming && !stepUp.active}
      >
        {confirmError ? (
          <View style={styles.confirmErrorBlock}>
            <Text style={styles.confirmErrorTitle}>Could not change password</Text>
            <InlineError message={confirmError} />
          </View>
        ) : null}
      </ConfirmationModal>
      {stepUp.sheet}
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
      gap: mobileSpace.md,
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
      gap: mobileSpace.sm,
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
    confirmErrorBlock: {
      gap: 4,
    },
    confirmErrorTitle: {
      ...mobileTextWeighted("body", "semibold"),
      color: mobileColors.dangerText,
    },
  });
