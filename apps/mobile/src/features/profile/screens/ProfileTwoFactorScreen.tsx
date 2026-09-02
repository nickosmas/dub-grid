import { useEffect, useMemo, useRef, useState } from "react";
import type { Factor } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { getProfile, updateProfileMfaStatus } from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useNavigationDiscardGuard } from "../../../shared/hooks/useNavigationDiscardGuard";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import {
  ProfileInfoRow,
  ProfileList,
  ProfilePanel,
  ProfileSection,
  ProfileTextInput,
} from "../components/ProfilePrimitives";
import { ProfileSkeleton } from "../components/ProfileSkeleton";

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

/**
 * Two-factor setup, on its own screen.
 *
 * Enrollment is a two-step flow with a secret to copy into another app and a
 * code to bring back, which is a poor fit for a section that used to swap
 * itself out in the middle of the security page. It stays inline *here*,
 * rather than in a sheet, because the second step is keyboard-driven and a
 * six-digit field wants the full screen above the keyboard.
 */
export default function ProfileTwoFactorScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState("");
  const [isConfirmingDisable, setIsConfirmingDisable] = useState(false);

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
  const mfaEnabled = Boolean(profileQuery.data?.user.mfaEnabled);

  // Leaving mid-enrollment used to strand an unverified factor on the account:
  // the old inline editor only unenrolled from its Cancel button, and back is
  // now the way out of this screen. A ref rather than state so the cleanup
  // reads the latest id without re-running on every step.
  const pendingFactorIdRef = useRef<string | null>(null);
  pendingFactorIdRef.current = mfaFactorId;
  useEffect(() => {
    return () => {
      const factorId = pendingFactorIdRef.current;
      if (!factorId) return;
      getSupabaseClient()
        .auth.mfa.unenroll({ factorId })
        .catch(() => {});
    };
  }, []);

  // Mid-enrollment is real progress to lose: the secret has already been
  // registered with the authenticator app, and leaving unenrolls it (above), so
  // coming back means starting from a fresh secret and re-scanning.
  const guard = useUnsavedChangesGuard({
    isDirty: isEnrolling,
    disabled: mfaLoading,
    title: "Cancel two-factor setup?",
    body: "You'll need to start again with a new secret.",
    confirmLabel: "Cancel Setup",
    cancelLabel: "Keep Going",
  });
  useNavigationDiscardGuard(guard);

  function resetMfaEnrollment() {
    setIsEnrolling(false);
    setMfaSecret(null);
    setMfaFactorId(null);
    setMfaVerifyCode("");
  }

  async function startMfaEnrollment() {
    if (mfaLoading) return;
    setMfaLoading(true);
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
      setIsEnrolling(true);
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
    try {
      const { data: verifiedSession, error } =
        await getSupabaseClient().auth.mfa.challengeAndVerify({
          factorId: mfaFactorId,
          code: mfaVerifyCode,
        });
      if (error) throw error;
      if (!verifiedSession?.access_token) {
        throw new Error("We couldn't finish two-factor setup. Try again.");
      }

      // Verifying TOTP promotes the current Supabase session to AAL2. The
      // accessToken captured by this render is still the password-only AAL1
      // token, which the mobile API must reject once a verified factor exists.
      // Use the promoted token returned by verification; AuthSessionProvider
      // receives the same session update and refetches this profile under its
      // new token key.
      await updateProfileMfaStatus(verifiedSession.access_token, { enabled: true });
      pushToast({
        tone: "success",
        title: "Two-factor authentication enabled",
        message: "Your account is now protected.",
      });
      resetMfaEnrollment();
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not verify code",
        fallbackMessage: "Invalid verification code. Please try again.",
      });
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

  return (
    <Screen bottomPaddingMode="tabbed" scrollEnabled={contentState.kind !== "error"}>
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ProfileSkeleton rowsPerSection={1} sections={1} showHero={false} />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try Again"
          body={contentState.message}
          fillScreen
          title="Could not load two-factor status"
          variant="centered"
          onAction={() => profileQuery.refetch()}
        />
      ) : isEnrolling ? (
        <ProfileSection
          title="Set up"
          description="Add a new entry in your authenticator app (Google Authenticator, Authy, 1Password, etc.) using this key, then enter the 6-digit code it generates."
        >
          <ProfilePanel>
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
              onChangeText={(text) => setMfaVerifyCode(text.replace(/\D/g, "").slice(0, 6))}
            />
          </ProfilePanel>
          <View style={styles.actionsStack}>
            <Button
              disabled={mfaLoading || mfaVerifyCode.length !== 6}
              label="Verify & enable"
              loading={mfaLoading}
              onPress={() => void verifyMfaEnrollment()}
            />
            <Button
              disabled={mfaLoading}
              label="Cancel"
              onPress={cancelMfaEnrollment}
              tone="neutral"
            />
          </View>
        </ProfileSection>
      ) : (
        <ProfileSection description="An authenticator app generates a short code that DubGrid asks for alongside your password, so a stolen password isn't enough to sign in.">
          <ProfileList>
            <ProfileInfoRow
              iconName="shield-outline"
              isLast
              label="Status"
              value={mfaEnabled ? "Enabled" : "Not enabled"}
            />
          </ProfileList>
          {mfaEnabled ? (
            <Button
              disabled={mfaLoading}
              label="Disable 2FA"
              onPress={() => setIsConfirmingDisable(true)}
              tone="danger"
            />
          ) : (
            <Button
              label="Enable 2FA"
              loading={mfaLoading}
              onPress={() => void startMfaEnrollment()}
            />
          )}
        </ProfileSection>
      )}
      <ConfirmationModal
        body="This will make your account less secure."
        confirmLabel="Disable"
        confirmTone="danger"
        loading={mfaLoading}
        onCancel={() => setIsConfirmingDisable(false)}
        onConfirm={() => {
          setIsConfirmingDisable(false);
          return disableMfa();
        }}
        title="Disable two-factor authentication?"
        visible={isConfirmingDisable}
      />
      <ConfirmationModal {...guard.confirmationProps} />
    </Screen>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    actionsStack: {
      gap: mobileSpace.sm,
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
  });
