import { router } from "expo-router";
import { useMemo, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { useMutation, useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { AppSwitch } from "../../../shared/components/AppSwitch";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { appLockUnsupported, setAppLockEnabled } from "../../../shared/lib/app-lock";
import {
  createProfileChangeRequest,
  getProfile,
  getProfileSessions,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { useAppLockEnabled } from "../../../shared/providers/AppLockProvider";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { mobileText, mobileTextWeighted, type MobileColors } from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  ProfileList,
  ProfileNavRow,
  ProfilePanel,
  ProfileSection,
} from "../components/ProfilePrimitives";
import { ProfileSkeleton } from "../components/ProfileSkeleton";
import { formatSessionCount } from "../components/session-format";

const PENDING_ACCOUNT_DELETION_MESSAGE = "An account deletion request is pending admin review.";

/**
 * The security hub: a list of places, not a page of editors.
 *
 * This screen used to hold the password form, the 2FA enrollment flow, the app
 * lock, account deletion and the full session list on one scroll, with three of
 * those unfolding in place and all five confirmations sharing a single state
 * machine. The three flows now live on their own pushed screens, and only the
 * app-lock toggle (one switch, nothing to unfold) stays inline.
 */
export default function ProfileSecurityScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [isConfirmingDeletion, setIsConfirmingDeletion] = useState(false);
  const [appLockToggling, setAppLockToggling] = useState(false);
  // Read through the same external store the lock itself runs on, rather than
  // mirroring it into local state in an effect — the two could disagree.
  const appLockEnabled = useAppLockEnabled();

  const profileQuery = useQuery({
    queryKey: mobileQueryKeys.profile(accessToken),
    queryFn: ({ signal }) => getProfile(accessToken!, signal),
    enabled: Boolean(accessToken),
  });
  const sessionsQuery = useQuery({
    queryKey: mobileQueryKeys.profileSessions(accessToken),
    queryFn: ({ signal }) => getProfileSessions(accessToken!, signal),
    enabled: Boolean(accessToken),
  });
  const bootstrapQuery = useBootstrap(accessToken);
  // Deletion is a super admin's decision, and a super admin deletes from the
  // web profile; every other member, people managers included, requests it.
  const isSuperAdmin = Boolean(bootstrapQuery.data?.permissions.canManageManagementAccess);
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
  // Both queries in one gate: the session count is part of this page's first
  // paint, so waiting on it here is what stops the old second loading wave
  // (an inline "Loading" that appeared after the skeleton cleared).
  const contentState = useMobileContentState({
    hasData: Boolean(profileQuery.data && sessionsQuery.data),
    isLoading: profileQuery.isLoading || sessionsQuery.isLoading,
    error: profileQuery.error ?? sessionsQuery.error,
  });
  const activeSessionCount = sessionsQuery.data?.active.length ?? 0;

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
    } finally {
      setAppLockToggling(false);
    }
  }

  return (
    <Screen
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      scrollEnabled={contentState.kind !== "loading"}
    >
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ProfileSkeleton rowVariant="nav" rowsPerSection={2} sections={3} showHero={false} />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load security"
          variant="centered"
          onAction={() => {
            void profileQuery.refetch();
            void sessionsQuery.refetch();
          }}
        />
      ) : profileQuery.data ? (
        <>
          {profileQuery.data.pendingAccountDeletionRequest ? (
            <StatusBanner body={PENDING_ACCOUNT_DELETION_MESSAGE} title="Request pending" />
          ) : null}

          <ProfileSection title="Sign-in">
            <ProfileList>
              <ProfileNavRow
                iconName="key-outline"
                label="Password"
                onPress={() => router.push("/(tabs)/profile/password")}
              />
              <ProfileNavRow
                iconName="shield-checkmark-outline"
                isLast
                label="Two-factor authentication"
                value={profileQuery.data.user.mfaEnabled ? "Enabled" : "Not enabled"}
                onPress={() => router.push("/(tabs)/profile/two-factor")}
              />
            </ProfileList>
          </ProfileSection>

          <ProfileSection title="Devices">
            <ProfileList>
              <ProfileNavRow
                iconName="phone-portrait-outline"
                isLast
                label="Signed-in devices"
                value={formatSessionCount(activeSessionCount)}
                onPress={() => router.push("/(tabs)/profile/sessions")}
              />
            </ProfileList>
          </ProfileSection>

          {!appLockUnsupported ? (
            <ProfileSection title="App lock">
              <ProfilePanel>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleCopy}>
                    <Text style={styles.rowTitle}>Require unlock on this device</Text>
                    <Text style={styles.rowDescription}>
                      Ask for Face ID, fingerprint, or your device passcode whenever you return to
                      DubGrid.
                    </Text>
                  </View>
                  <AppSwitch
                    accessibilityLabel="App lock"
                    disabled={appLockToggling}
                    value={appLockEnabled}
                    onValueChange={(next) => void toggleAppLock(next)}
                  />
                </View>
              </ProfilePanel>
            </ProfileSection>
          ) : null}

          {!isSuperAdmin ? (
            <ProfileSection>
              <Button
                disabled={
                  deletionRequestMutation.isPending ||
                  Boolean(profileQuery.data.pendingAccountDeletionRequest)
                }
                label="Request account deletion"
                loading={deletionRequestMutation.isPending}
                onPress={() => setIsConfirmingDeletion(true)}
                tone="danger"
              />
            </ProfileSection>
          ) : null}
        </>
      ) : null}
      <ConfirmationModal
        body="Your admin will be notified to start the deletion process."
        confirmLabel="Request"
        confirmTone="danger"
        loading={deletionRequestMutation.isPending}
        onCancel={() => setIsConfirmingDeletion(false)}
        onConfirm={() => {
          setIsConfirmingDeletion(false);
          return deletionRequestMutation.mutateAsync();
        }}
        title="Request account deletion?"
        visible={isConfirmingDeletion}
      />
    </Screen>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    toggleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 16,
      justifyContent: "space-between",
    },
    toggleCopy: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    rowTitle: {
      ...mobileTextWeighted("cardTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    rowDescription: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
  });
