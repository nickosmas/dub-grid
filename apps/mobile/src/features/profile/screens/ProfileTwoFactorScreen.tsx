import { ActionButtons } from "../../../shared/components/ActionButtons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Factor } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatClientErrorMessage } from "@dubgrid/client-errors";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import {
  getProfile,
  requireMobileCredentialAssurance,
  updateProfileMfaStatus,
} from "../../../shared/lib/api";
import {
  enrollMobileMfa,
  removeMobileMfa,
  withMfaDeadline,
  MfaRequestTimeoutError,
} from "../../../shared/lib/mfa-lifecycle";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
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
import { useMobileStepUpAction } from "../hooks/useMobileStepUpAction";

const MOBILE_TOTP_FRIENDLY_NAME = "Mobile App Authenticator";

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
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const stepUp = useMobileStepUpAction();
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState("");
  const [isConfirmingDisable, setIsConfirmingDisable] = useState(false);
  const [phase, setPhase] = useState<"sync" | null>(null);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const tokenRef = useRef(accessToken);
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);
  const mountedRef = useRef(true);
  const verifyingRef = useRef(false);

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
  const mfaEnabled = Boolean(profileQuery.data?.user.mfaEnabled);

  // Leaving mid-enrollment used to strand an unverified factor on the account:
  // the old inline editor only unenrolled from its Cancel button, and back is
  // now the way out of this screen. A ref rather than state so the cleanup
  // reads the latest id without re-running on every step.
  const pendingFactorIdRef = useRef<string | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const factorId = pendingFactorIdRef.current;
      if (!factorId || !tokenRef.current || verifyingRef.current) return;
      void removeMobileMfa(tokenRef.current, factorId, true).catch(() => {});
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
    pendingFactorIdRef.current = null;
    setIsEnrolling(false);
    setMfaSecret(null);
    setMfaFactorId(null);
    setMfaVerifyCode("");
    setPhase(null);
    setActionError(null);
  }

  async function reconcileStatus(token = tokenRef.current) {
    setNeedsReconciliation(true);
    setPhase("sync");
    if (!token) throw new Error("Sign in again to refresh two-factor status.");
    tokenRef.current = token;
    const result = await updateProfileMfaStatus(token);
    // Update both the current render and the promoted-session query key.
    for (const keyToken of new Set([accessToken, token])) {
      queryClient.setQueryData(mobileQueryKeys.profile(keyToken), {
        ...profileQuery.data,
        user: result.user,
      });
    }
    resetMfaEnrollment();
    setNeedsReconciliation(false);
  }

  async function retryStatus() {
    setMfaLoading(true);
    setActionError(null);
    try {
      const { data, error } = await withMfaDeadline(getSupabaseClient().auth.getSession());
      if (error) throw error;
      await reconcileStatus(data.session?.access_token ?? tokenRef.current);
    } catch (error) {
      setActionError(
        formatClientErrorMessage(error, "We couldn't refresh two-factor status. Try again."),
      );
    } finally {
      setMfaLoading(false);
    }
  }

  async function startMfaEnrollment() {
    if (mfaLoading || !accessToken) return;
    setMfaLoading(true);
    setActionError(null);
    try {
      await stepUp.run(async (actionAccessToken) => {
        // No cleanup or provider mutation begins until the same canonical
        // five-minute assurance preflight used by credential changes passes.
        await requireMobileCredentialAssurance(actionAccessToken);
        tokenRef.current = actionAccessToken;

        const { data: factorsData, error: listError } = await withMfaDeadline(
          getSupabaseClient().auth.mfa.listFactors(),
        );
        if (listError) throw listError;

        const existingVerifiedTotp = factorsData.all.find(isVerifiedTotpFactor);
        if (existingVerifiedTotp) {
          await reconcileStatus(actionAccessToken);
          return;
        }

        const staleFactors = factorsData.all.filter(isStaleMobileTotpFactor);
        for (const factor of staleFactors) {
          await removeMobileMfa(actionAccessToken, factor.id, true);
        }

        const data = await enrollMobileMfa(actionAccessToken);
        if (!mountedRef.current) {
          await removeMobileMfa(actionAccessToken, data.id, true);
          return;
        }

        setMfaSecret(data.totp.secret);
        pendingFactorIdRef.current = data.id;
        setMfaFactorId(data.id);
        setIsEnrolling(true);
        setPhase(null);
      });
    } catch (error) {
      setActionError(
        formatClientErrorMessage(error, "We couldn't start two-factor setup right now."),
      );
    } finally {
      setMfaLoading(false);
    }
  }

  async function verifyMfaEnrollment() {
    if (!mfaFactorId || mfaVerifyCode.length !== 6 || mfaLoading) return;
    setMfaLoading(true);
    setActionError(null);
    verifyingRef.current = true;
    try {
      const { data: verifiedSession, error } = await withMfaDeadline(
        getSupabaseClient().auth.mfa.challengeAndVerify({
          factorId: mfaFactorId,
          code: mfaVerifyCode,
        }),
      );
      if (error) throw error;
      pendingFactorIdRef.current = null;
      setNeedsReconciliation(true);
      setPhase("sync");
      if (!verifiedSession?.access_token) {
        throw new Error("We couldn't finish two-factor setup. Try again.");
      }

      // Verifying TOTP promotes the current Supabase session to AAL2. The
      // accessToken captured by this render is still the password-only AAL1
      // token, which the mobile API must reject once a verified factor exists.
      // Use the promoted token returned by verification; AuthSessionProvider
      // receives the same session update and refetches this profile under its
      // new token key.
      await reconcileStatus(verifiedSession.access_token);
      pushToast({
        tone: "success",
        title: "Two-factor status refreshed",
        message: "Your account shows its current protection status.",
      });
      resetMfaEnrollment();
    } catch (error) {
      if (error instanceof MfaRequestTimeoutError) {
        pendingFactorIdRef.current = null;
        setNeedsReconciliation(true);
        setPhase("sync");
      }
      setActionError(formatClientErrorMessage(error, "We couldn't verify this code. Try again."));
    } finally {
      verifyingRef.current = false;
      if (!mountedRef.current && pendingFactorIdRef.current && tokenRef.current) {
        void removeMobileMfa(tokenRef.current, pendingFactorIdRef.current, true).catch(() => {});
      }
      setMfaLoading(false);
    }
  }

  async function cancelMfaEnrollment() {
    const pendingFactorId = pendingFactorIdRef.current;
    setMfaLoading(true);
    try {
      if (pendingFactorId && tokenRef.current)
        await removeMobileMfa(tokenRef.current, pendingFactorId, true);
      resetMfaEnrollment();
    } catch {
      setPhase("sync");
      setActionError("We couldn't cancel setup. Refresh its status before trying again.");
    } finally {
      setMfaLoading(false);
    }
  }

  async function disableMfa() {
    if (mfaLoading) return;
    setMfaLoading(true);
    setActionError(null);
    try {
      await stepUp.run(async (actionAccessToken) => {
        // The challenge installs the promoted session before this callback is
        // retried. Once removal begins, any failure reconciles instead of
        // replaying an outcome-unknown provider mutation.
        await requireMobileCredentialAssurance(actionAccessToken);
        tokenRef.current = actionAccessToken;
        const { data: factorsData, error: listError } = await withMfaDeadline(
          getSupabaseClient().auth.mfa.listFactors(),
        );
        if (listError) throw listError;

        const verifiedTotp = factorsData.totp.filter((factor) => factor.status === "verified");
        if (!verifiedTotp.length) {
          await reconcileStatus(actionAccessToken);
          return;
        }
        setNeedsReconciliation(true);
        setPhase("sync");
        for (const factor of verifiedTotp) {
          await removeMobileMfa(actionAccessToken, factor.id);
        }

        await reconcileStatus(actionAccessToken);
        pushToast({
          tone: "success",
          title: "Two-factor status refreshed",
          message: "Your account shows its current protection status.",
        });
        resetMfaEnrollment();
      });
    } catch (error) {
      // Provider removal may have completed even if its response was lost.
      // Reconcile before allowing another attempt; never replay automatically.
      setNeedsReconciliation(true);
      setPhase("sync");
      setActionError(
        formatClientErrorMessage(error, "We couldn't disable two-factor authentication right now."),
      );
    } finally {
      setMfaLoading(false);
    }
  }

  return (
    <Screen bottomPaddingMode="tabbed" scrollEnabled={contentState.kind !== "loading"}>
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ProfileSkeleton rowsPerSection={1} sections={1} showHero={false} />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load two-factor status"
          variant="centered"
          onAction={() => profileQuery.refetch()}
        />
      ) : phase === "sync" ? (
        <ProfileSection
          title="Refresh status"
          description="Refresh two-factor status before making another change."
        >
          <ActionButtons
            primaryAction={
              <Button
                label="Refresh status"
                loading={mfaLoading}
                disabled={mfaLoading}
                onPress={retryStatus}
              />
            }
          >
            <Button
              label="Cancel"
              tone="neutral"
              disabled={mfaLoading}
              onPress={resetMfaEnrollment}
            />
          </ActionButtons>
        </ProfileSection>
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
              textContentType="oneTimeCode"
              label="Verification code"
              maxLength={6}
              placeholder="000000"
              value={mfaVerifyCode}
              onChangeText={(text) => setMfaVerifyCode(text.replace(/\D/g, "").slice(0, 6))}
            />
          </ProfilePanel>
          <ActionButtons
            primaryAction={
              <Button
                disabled={mfaLoading || mfaVerifyCode.length !== 6}
                label="Verify & enable"
                loading={mfaLoading}
                onPress={() => verifyMfaEnrollment()}
              />
            }
            style={styles.actionsStack}
          >
            <Button
              disabled={mfaLoading}
              label="Cancel"
              onPress={cancelMfaEnrollment}
              tone="neutral"
            />
          </ActionButtons>
        </ProfileSection>
      ) : (
        <ProfileSection description="An authenticator app generates a short code that the app asks for alongside your password, so a stolen password isn't enough to sign in.">
          <ProfileList>
            <ProfileInfoRow
              iconName="shield-outline"
              isLast
              label="Status"
              value={needsReconciliation ? "Needs refresh" : mfaEnabled ? "Enabled" : "Not enabled"}
            />
          </ProfileList>
          {needsReconciliation ? (
            <Button label="Refresh status" onPress={retryStatus} tone="neutral" />
          ) : mfaEnabled ? (
            <Button
              disabled={mfaLoading}
              label="Disable 2FA"
              onPress={() => setIsConfirmingDisable(true)}
              tone="danger"
            />
          ) : (
            <Button label="Enable 2FA" loading={mfaLoading} onPress={startMfaEnrollment} />
          )}
        </ProfileSection>
      )}
      {actionError && (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {actionError}
        </Text>
      )}
      <ConfirmationModal
        body="This will make your account less secure."
        confirmLabel="Disable"
        confirmTone="danger"
        loading={mfaLoading}
        onCancel={() => setIsConfirmingDisable(false)}
        onConfirm={async () => {
          setIsConfirmingDisable(false);
          await disableMfa();
        }}
        title="Disable two-factor authentication?"
        visible={isConfirmingDisable}
      />
      {stepUp.sheet}
      <ConfirmationModal {...guard.confirmationProps} />
    </Screen>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    errorText: { ...mobileText.body, color: mobileColors.dangerText },
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
