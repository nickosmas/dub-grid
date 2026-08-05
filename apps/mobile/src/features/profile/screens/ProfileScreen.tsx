import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { MobileProfileChangeRequest } from "@dubgrid/contracts";
import { getOrgRoleLabel } from "@dubgrid/domain";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { ModalHeader } from "../../../shared/components/ModalHeader";
import { DetailSkeleton } from "../../../shared/components/Skeleton";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { createDetailStackOptions } from "../../../shared/navigation/top-level-stack";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  getProfile,
  getProfileChangeRequests,
  updateProfileChangeRequest,
} from "../../../shared/lib/api";
import {
  disablePushForCurrentDevice,
  handleExpiredMobileSession,
} from "../../../shared/lib/auth-reset";
import { getAvatarTone } from "../../../shared/lib/avatar-tone";
import {
  getInlineErrorMessageOrToast,
  pushClientFriendlyErrorToast,
} from "../../../shared/lib/errors";
import { getMobileQueryContentState, getQueryErrorMessage } from "../../../shared/lib/query-state";
import { saveLastOrgSlug } from "../../../shared/lib/session";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { mobileText, type MobileColors } from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useMobileColors, useThemeMode } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { queryClient } from "../../../shared/lib/query-client";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { getMobileOrgRoleBadge } from "../../people/lib/orgRoleBadges";
import {
  ProfileHero,
  ProfileHeroMeta,
  ProfileInfoRow,
  ProfileList,
  ProfileNavRow,
  ProfileSection,
  formatProfileStatus,
  formatProfileValue,
  getProfileInitials,
  useProfilePrimitiveStyles,
} from "../components/ProfilePrimitives";
import { PendingRequestsCard } from "../components/PendingRequestsCard";

type OrganizationSwitchClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
};
type ProfileConfirmation = { kind: "logout"; force?: boolean };

function formatDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProfileScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const profilePrimitiveStyles = useProfilePrimitiveStyles();
  const { resolvedTheme } = useThemeMode();
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isSwitchModalVisible, setIsSwitchModalVisible] = useState(false);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<ProfileConfirmation | null>(null);
  const [showCollapsedHeader, setShowCollapsedHeader] = useState(false);
  const profileQuery = useQuery({
    queryKey: ["mobile", "profile", accessToken],
    queryFn: () => getProfile(accessToken!),
    enabled: Boolean(accessToken),
  });
  const changeRequestsQuery = useQuery({
    queryKey: ["mobile", "profile", "change-requests", accessToken],
    queryFn: () => getProfileChangeRequests(accessToken!),
    enabled: Boolean(accessToken),
  });
  const bootstrapQuery = useBootstrap(accessToken);
  const manualRefresh = useManualRefresh(() =>
    Promise.all([profileQuery.refetch(), changeRequestsQuery.refetch(), bootstrapQuery.refetch()]),
  );
  const pendingChangeRequests: MobileProfileChangeRequest[] =
    changeRequestsQuery.data?.requests.filter((request) => request.status === "pending") ?? [];
  const cancelChangeRequestMutation = useMutation({
    mutationFn: (request: MobileProfileChangeRequest) =>
      updateProfileChangeRequest(accessToken!, request.id, { action: "cancel" }),
    onSuccess: async (_data, request) => {
      pushToast({
        tone: "success",
        message:
          request.type === "account_deletion"
            ? "Account deletion request cancelled."
            : "Name change request cancelled.",
      });
      await Promise.all([changeRequestsQuery.refetch(), profileQuery.refetch()]);
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        fallbackMessage: "We couldn't cancel that request right now.",
        title: "Could not cancel request",
      });
    },
  });
  const profile = profileQuery.data ?? null;
  const contentState = getMobileQueryContentState({
    hasData: Boolean(profile),
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
  });
  const displayName =
    [profile?.user.firstName, profile?.user.lastName].filter(Boolean).join(" ").trim() ||
    profile?.user.email ||
    "DubGrid user";
  const focusAreaNames =
    profile?.linkedEmployee?.focusAreaIds
      .map((id) => profile.focusAreas.find((focusArea) => focusArea.id === id)?.name)
      .filter((value): value is string => Boolean(value)) ?? [];
  const memberships = bootstrapQuery.data?.memberships ?? [];
  const canSwitchOrganizations = memberships.length > 1;
  const orgRoleBadge = getMobileOrgRoleBadge(mobileColors, profile?.effectiveRole);
  const roleLabel = orgRoleBadge?.label ?? getOrgRoleLabel(profile?.effectiveRole);
  const avatarSeed = profile?.linkedEmployee?.id ?? profile?.user.id ?? "";
  const avatarTone = avatarSeed ? getAvatarTone(avatarSeed, resolvedTheme === "dark") : null;
  const staffStatusLabel = formatProfileStatus(profile?.linkedEmployee?.status);

  async function handleLogout() {
    setIsSigningOut(true);
    setLogoutError(null);

    try {
      await disablePushForCurrentDevice();

      const { error } = await getSupabaseClient().auth.signOut({
        scope: "local",
      });
      if (error) {
        setLogoutError(
          getInlineErrorMessageOrToast(pushToast, {
            error,
            fallbackMessage: "We couldn't sign you out right now. Try again in a moment.",
          }),
        );
        return;
      }

      await handleExpiredMobileSession({ skipSignOut: true });
    } catch (error) {
      setLogoutError(
        getInlineErrorMessageOrToast(pushToast, {
          error,
          fallbackMessage: "We couldn't sign you out right now. Try again in a moment.",
        }),
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleSwitchOrganization(input: {
    id: string;
    slug: string | null;
    isCurrent: boolean;
  }) {
    if (input.isCurrent || switchingOrgId) {
      return;
    }

    setSwitchingOrgId(input.id);

    try {
      const supabase = getSupabaseClient();
      const organizationClient = supabase as unknown as OrganizationSwitchClient;
      const switchResult = await organizationClient.rpc("switch_org", {
        target_org_id: input.id,
      });

      if (switchResult.error) {
        pushClientFriendlyErrorToast(pushToast, {
          error: switchResult.error,
          fallbackMessage: "We couldn't switch organizations right now.",
          title: "Could not switch organization",
        });
        return;
      }

      const refreshResult = await supabase.auth.refreshSession();
      if (refreshResult.error || !refreshResult.data.session) {
        pushClientFriendlyErrorToast(pushToast, {
          error: refreshResult.error,
          fallbackMessage: "We couldn't refresh your session after switching organizations.",
          title: "Could not switch organization",
        });
        return;
      }

      await saveLastOrgSlug(input.slug);

      // Drop the previous org's data outright rather than marking it stale —
      // `invalidateQueries` keeps rendering the old rows until each refetch
      // lands, which flashes another tenant's people and schedule. Web resets
      // just as hard (clear + hard navigation) for the same reason. Resetting
      // to Home also re-derives tab visibility from the new bootstrap instead
      // of leaving the old org's tabs on screen.
      queryClient.clear();
      router.replace("/(tabs)/home");
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        fallbackMessage: "We couldn't switch organizations right now.",
        title: "Could not switch organization",
      });
    } finally {
      setSwitchingOrgId(null);
    }
  }

  function confirmProfileAction() {
    const action = pendingConfirmation;
    setPendingConfirmation(null);
    if (!action) return;
    void handleLogout();
  }

  const confirmationTitle = pendingConfirmation?.force ? "Force sign out?" : "Sign out?";
  const confirmationBody = pendingConfirmation?.force
    ? "You'll be signed out immediately, even if data hasn't synced."
    : "You'll be signed out on this device.";
  const confirmationLabel = "Sign Out";

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const shouldShowHeader = event.nativeEvent.contentOffset.y > 88;
    setShowCollapsedHeader((current) =>
      current === shouldShowHeader ? current : shouldShowHeader,
    );
  }

  return (
    <Screen
      bottomPaddingMode="tabbed"
      title="Profile"
      subtitle="Profile"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <Stack.Screen
        options={createDetailStackOptions(mobileColors, showCollapsedHeader ? displayName : "")}
      />
      {contentState.kind === "loading" ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingTitle}>Loading profile</Text>
          <DetailSkeleton sections={3} />
        </View>
      ) : contentState.kind === "error" ? (
        <>
          <StatusBanner
            actionLabel="Try again"
            body={contentState.message}
            fillScreen
            title="Could not load profile"
            variant="centered"
            onAction={() => {
              void profileQuery.refetch();
            }}
          />
          {logoutError ? (
            <StatusBanner
              body={getQueryErrorMessage(logoutError, logoutError)}
              title="Could not sign out"
            />
          ) : null}
          {accessToken ? (
            <Button
              disabled={isSigningOut}
              label={isSigningOut ? "Signing Out..." : "Force Sign Out"}
              onPress={() => {
                setPendingConfirmation({ kind: "logout", force: true });
              }}
              tone="danger"
            />
          ) : null}
        </>
      ) : contentState.kind === "empty" || !profile ? (
        <EmptyStateCard
          fillScreen
          body="We couldn't load your account details. Try signing out and back in."
          iconName="person-circle-outline"
          title="Profile unavailable"
        />
      ) : (
        <>
          <ProfileHero
            avatarStyle={
              avatarTone
                ? {
                    backgroundColor: avatarTone.backgroundColor,
                    borderColor: avatarTone.borderColor,
                    borderWidth: 1,
                  }
                : undefined
            }
            avatarTextStyle={avatarTone ? { color: avatarTone.textColor } : undefined}
            badge={roleLabel}
            badgeTone={orgRoleBadge?.tone}
            initials={getProfileInitials(displayName)}
            title={displayName}
            subtitle={profile.user.email || "No email on file"}
            style={{ paddingBottom: 16 }}
          >
            <ProfileHeroMeta label="Organization" value={profile.currentOrg.name} />
            <ProfileHeroMeta
              label="Phone"
              value={formatProfileValue(profile.linkedEmployee?.phone)}
            />
            <ProfileHeroMeta label="Date joined" value={formatDate(profile.user.createdAt)} />
          </ProfileHero>

          <PendingRequestsCard
            requests={pendingChangeRequests}
            cancellingId={
              cancelChangeRequestMutation.isPending
                ? (cancelChangeRequestMutation.variables?.id ?? null)
                : null
            }
            onCancel={(request) => cancelChangeRequestMutation.mutate(request)}
          />

          <ProfileSection title="Organization details">
            <ProfileList>
              <ProfileInfoRow
                iconName="business-outline"
                label="Organization"
                value={profile.currentOrg.name}
              />
              <ProfileInfoRow
                iconName="compass-outline"
                label="Organization"
                value={formatProfileValue(profile.currentOrg.slug)}
              />
              <ProfileInfoRow iconName="shield-checkmark-outline" label="Role" value={roleLabel} />
              {profile.linkedEmployee ? (
                <>
                  <ProfileInfoRow
                    iconName="person-circle-outline"
                    label="Staff status"
                    value={staffStatusLabel}
                  />
                  <ProfileInfoRow
                    iconName="albums-outline"
                    isLast
                    label={profile.currentOrg.labels.focusArea}
                    value={focusAreaNames.length > 0 ? focusAreaNames.join(", ") : "Not set"}
                  />
                </>
              ) : (
                <ProfileInfoRow
                  iconName="person-remove-outline"
                  isLast
                  label="Staff profile"
                  value="Not linked"
                />
              )}
            </ProfileList>
          </ProfileSection>

          <ProfileSection title="Details">
            <ProfileList>
              <ProfileNavRow
                iconName="id-card-outline"
                label="Profile details"
                onPress={() => router.push("/(tabs)/profile/work")}
              />
              <ProfileNavRow
                iconName="lock-closed-outline"
                label="Security & sessions"
                onPress={() => router.push("/(tabs)/profile/security")}
              />
              <ProfileNavRow
                iconName="notifications-outline"
                label="Notifications"
                onPress={() => router.push("/(tabs)/profile/notifications")}
              />
              <ProfileNavRow
                iconName="shield-outline"
                label="Privacy & data"
                onPress={() => router.push("/(tabs)/profile/privacy")}
              />
              <ProfileNavRow
                iconName="color-palette-outline"
                isLast
                label="Appearance"
                onPress={() => router.push("/(tabs)/profile/appearance")}
              />
            </ProfileList>
          </ProfileSection>

          {logoutError ? (
            <StatusBanner
              body={getQueryErrorMessage(logoutError, logoutError)}
              title="Could not sign out"
            />
          ) : null}
          <ProfileSection title="Account actions">
            <View style={profilePrimitiveStyles.actionsStack}>
              <Button
                disabled={isSigningOut}
                label={isSigningOut ? "Signing Out..." : "Sign Out"}
                onPress={() => {
                  setPendingConfirmation({ kind: "logout" });
                }}
                tone="danger"
              />
              {canSwitchOrganizations ? (
                <Button
                  label="Switch organization"
                  onPress={() => {
                    setIsSwitchModalVisible(true);
                  }}
                  tone="secondary"
                />
              ) : null}
            </View>
          </ProfileSection>

          <Modal
            animationType="slide"
            allowSwipeDismissal
            onRequestClose={() => setIsSwitchModalVisible(false)}
            presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
            visible={isSwitchModalVisible}
          >
            <Screen
              bottomPaddingMode="modal"
              stickyHeader={
                <ModalHeader
                  title="Switch organization"
                  onClose={() => setIsSwitchModalVisible(false)}
                />
              }
              stickyHeaderTopPadding={15}
            >
              <ProfileSection title="Organizations">
                <ProfileList>
                  {memberships.map((membership, index) => (
                    <OrganizationOptionRow
                      key={membership.id}
                      isLast={index === memberships.length - 1}
                      membership={membership}
                      switching={switchingOrgId === membership.id}
                      onPress={() => {
                        // Use the native Alert API for confirmation: an iOS
                        // pageSheet Modal cannot reliably present another RN
                        // Modal on top, but UIAlertController always can. The
                        // pageSheet is closed synchronously on confirm so the
                        // refreshSession() cascade (new accessToken → query
                        // refetches → realtime channel rebuild) doesn't tear
                        // down a still-mounted native modal.
                        Alert.alert(
                          "Switch organization?",
                          `You'll switch to ${membership.name ?? "this organization"}.`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Switch",
                              onPress: () => {
                                setIsSwitchModalVisible(false);
                                void handleSwitchOrganization(membership);
                              },
                            },
                          ],
                        );
                      }}
                    />
                  ))}
                </ProfileList>
              </ProfileSection>
            </Screen>
          </Modal>
        </>
      )}
      <ConfirmationModal
        body={confirmationBody}
        confirmLabel={confirmationLabel}
        confirmTone="dangerFilled"
        loading={isSigningOut}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={confirmProfileAction}
        title={confirmationTitle}
        visible={pendingConfirmation != null}
      />
    </Screen>
  );
}

function OrganizationOptionRow({
  membership,
  switching,
  isLast,
  onPress,
}: {
  membership: {
    id: string;
    slug: string | null;
    isCurrent: boolean;
    name?: string;
    orgRole?: string | null;
  };
  switching: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const disabled = membership.isCurrent || switching;
  const statusLabel = membership.isCurrent
    ? "Selected"
    : switching
      ? "Switching..."
      : "Tap to switch";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{
        disabled,
        selected: membership.isCurrent,
        busy: switching,
      }}
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.orgOptionRow,
        !isLast && styles.orgOptionDivider,
        membership.isCurrent && styles.orgOptionCurrent,
        pressed && !disabled && styles.orgOptionPressed,
      ]}
    >
      <View style={styles.orgOptionIcon}>
        <Ionicons
          color={membership.isCurrent ? mobileColors.brand : mobileColors.textSecondary}
          name={membership.isCurrent ? "checkmark" : "business-outline"}
          size={18}
        />
      </View>
      <View style={styles.orgOptionCopy}>
        <Text style={styles.orgOptionName}>{membership.name ?? "Organization"}</Text>
        <Text style={styles.orgOptionMeta}>
          {membership.slug ?? "organization"} - {membership.orgRole ?? "user"}
        </Text>
      </View>
      <Text style={styles.orgOptionStatus}>{statusLabel}</Text>
    </Pressable>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    loadingState: {
      gap: 14,
    },
    loadingTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    orgOptionRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: 70,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    orgOptionCurrent: {
      backgroundColor: mobileColors.surfaceSecondary,
    },
    orgOptionPressed: {
      opacity: 0.64,
    },
    orgOptionDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    orgOptionIcon: {
      alignItems: "center",
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    orgOptionCopy: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    orgOptionName: {
      ...mobileText.cardTitle,
      color: mobileColors.textPrimary,
      fontWeight: "500",
    },
    orgOptionMeta: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    orgOptionStatus: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
      fontWeight: "500",
    },
  });
