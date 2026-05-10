import { router } from "expo-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { ModalHeader } from "../../../shared/components/ModalHeader";
import { DetailSkeleton } from "../../../shared/components/Skeleton";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  getProfile,
  registerPushToken,
} from "../../../shared/lib/api";
import { handleExpiredMobileSession } from "../../../shared/lib/auth-reset";
import { getInlineErrorMessageOrToast } from "../../../shared/lib/errors";
import {
  getMobileQueryContentState,
  getQueryErrorMessage,
} from "../../../shared/lib/query-state";
import {
  loadStoredPushDevice,
  saveLastWorkspaceSlug,
} from "../../../shared/lib/session";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import {
  mobileColors,
  mobileText,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useToast } from "../../../shared/providers/ToastProvider";
import { queryClient } from "../../../shared/lib/query-client";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
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
  profilePrimitiveStyles,
} from "../components/ProfilePrimitives";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

const PENDING_PROFILE_CHANGE_MESSAGE =
  "A profile change request is pending admin review.";
const PENDING_ACCOUNT_DELETION_MESSAGE =
  "An account deletion request is pending admin review.";

type WorkspaceSwitchClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
};
type ProfileConfirmation =
  | { kind: "logout"; force?: boolean }
  | {
      kind: "switchWorkspace";
      membership: {
        id: string;
        slug: string | null;
        isCurrent: boolean;
        name?: string;
        orgRole?: string | null;
      };
    };

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
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isSwitchModalVisible, setIsSwitchModalVisible] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<
    string | null
  >(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ProfileConfirmation | null>(null);
  const profileQuery = useQuery({
    queryKey: ["mobile", "profile", accessToken],
    queryFn: () => getProfile(accessToken!),
    enabled: Boolean(accessToken),
  });
  const bootstrapQuery = useBootstrap(accessToken);
  const manualRefresh = useManualRefresh(() =>
    Promise.all([profileQuery.refetch(), bootstrapQuery.refetch()]),
  );
  const profile = profileQuery.data ?? null;
  const contentState = getMobileQueryContentState({
    hasData: Boolean(profile),
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
  });
  const displayName =
    [profile?.user.firstName, profile?.user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    profile?.user.email ||
    "DubGrid user";
  const focusAreaNames =
    profile?.linkedEmployee?.focusAreaIds
      .map((id) => profile.focusAreas.find((focusArea) => focusArea.id === id)?.name)
      .filter((value): value is string => Boolean(value)) ?? [];
  const memberships = bootstrapQuery.data?.memberships ?? [];
  const canSwitchOrganizations = memberships.length > 1;
  const roleLabel = ROLE_LABELS[profile?.effectiveRole ?? ""] ?? "User";
  const staffStatusLabel = formatProfileStatus(profile?.linkedEmployee?.status);

  async function handleLogout() {
    setIsSigningOut(true);
    setLogoutError(null);

    try {
      const storedPushDevice = await loadStoredPushDevice();
      if (accessToken && storedPushDevice) {
        try {
          await registerPushToken(accessToken, {
            ...storedPushDevice,
            disabled: true,
          });
        } catch {
          // Keep logout resilient even if token cleanup fails.
        }
      }

      const { error } = await getSupabaseClient().auth.signOut({
        scope: "local",
      });
      if (error) {
        setLogoutError(
          getInlineErrorMessageOrToast(pushToast, {
            error,
            fallbackMessage:
              "We couldn't sign you out right now. Try again in a moment.",
          }),
        );
        return;
      }

      await handleExpiredMobileSession({ skipSignOut: true });
    } catch (error) {
      setLogoutError(
        getInlineErrorMessageOrToast(pushToast, {
          error,
          fallbackMessage:
            "We couldn't sign you out right now. Try again in a moment.",
        }),
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleSwitchWorkspace(input: {
    id: string;
    slug: string | null;
    isCurrent: boolean;
  }) {
    if (input.isCurrent || switchingWorkspaceId) {
      return;
    }

    setSwitchingWorkspaceId(input.id);
    setWorkspaceError(null);

    try {
      const supabase = getSupabaseClient();
      const workspaceClient = supabase as unknown as WorkspaceSwitchClient;
      const switchResult = await workspaceClient.rpc("switch_org", {
        target_org_id: input.id,
      });

      if (switchResult.error) {
        setWorkspaceError(
          getInlineErrorMessageOrToast(pushToast, {
            error: switchResult.error,
            fallbackMessage: "We couldn't switch organizations right now.",
          }),
        );
        return;
      }

      const refreshResult = await supabase.auth.refreshSession();
      if (refreshResult.error || !refreshResult.data.session) {
        setWorkspaceError(
          getInlineErrorMessageOrToast(pushToast, {
            error: refreshResult.error,
            fallbackMessage:
              "We couldn't refresh your session after switching organizations.",
          }),
        );
        return;
      }

      await saveLastWorkspaceSlug(input.slug);
      await queryClient.invalidateQueries({ queryKey: ["mobile"] });
      await Promise.all([profileQuery.refetch(), bootstrapQuery.refetch()]);
      setIsSwitchModalVisible(false);
    } catch (error) {
      setWorkspaceError(
        getInlineErrorMessageOrToast(pushToast, {
          error,
          fallbackMessage: "We couldn't switch organizations right now.",
        }),
      );
    } finally {
      setSwitchingWorkspaceId(null);
    }
  }

  function confirmProfileAction() {
    const action = pendingConfirmation;
    setPendingConfirmation(null);
    if (!action) return;

    if (action.kind === "logout") {
      void handleLogout();
    } else {
      void handleSwitchWorkspace(action.membership);
    }
  }

  const confirmationTitle =
    pendingConfirmation?.kind === "switchWorkspace"
      ? "Switch organization?"
      : pendingConfirmation?.force
        ? "Force sign out?"
        : "Sign out?";
  const confirmationBody =
    pendingConfirmation?.kind === "switchWorkspace"
      ? `Switch this mobile session to ${pendingConfirmation.membership.name ?? "this organization"}?`
      : pendingConfirmation?.force
        ? "Force this mobile session to sign out now?"
        : "Sign out of this mobile session?";
  const confirmationLabel =
    pendingConfirmation?.kind === "switchWorkspace" ? "Switch" : "Sign Out";

  return (
    <Screen
      bottomPaddingMode="tabbed"
      title="Profile"
      subtitle="Profile"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      {contentState.kind === "loading" ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingTitle}>Loading profile</Text>
          <DetailSkeleton sections={3} />
        </View>
      ) : contentState.kind === "error" ? (
        <>
          <StatusBanner
            actionLabel="Try Again"
            body={contentState.message}
            title="Could not load profile"
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
          body="We couldn't build your account summary from the current mobile session."
          iconName="person-circle-outline"
          title="Profile unavailable"
        />
      ) : (
        <>
          <ProfileHero
            badge={roleLabel}
            initials={getProfileInitials(displayName)}
            title={displayName}
            subtitle={profile.user.email || "No email on file"}
          >
            <ProfileHeroMeta label="Organization" value={profile.currentOrg.name} />
            <ProfileHeroMeta
              label="Phone"
              value={formatProfileValue(profile.linkedEmployee?.phone)}
            />
            <ProfileHeroMeta
              label="Member since"
              value={formatDate(profile.user.createdAt)}
            />
            <ProfileHeroMeta
              label="Last sign in"
              value={formatDate(profile.user.lastSignInAt)}
            />
          </ProfileHero>

          {profile.pendingProfileChangeRequest ? (
            <StatusBanner
              body={PENDING_PROFILE_CHANGE_MESSAGE}
              title="Request pending"
            />
          ) : null}
          {profile.pendingAccountDeletionRequest ? (
            <StatusBanner
              body={PENDING_ACCOUNT_DELETION_MESSAGE}
              title="Request pending"
            />
          ) : null}

          <ProfileSection title="Organization details">
            <ProfileList>
              <ProfileInfoRow
                iconName="business-outline"
                label="Organization"
                value={profile.currentOrg.name}
              />
              <ProfileInfoRow
                iconName="compass-outline"
                label="Workspace"
                value={formatProfileValue(profile.currentOrg.slug)}
              />
              <ProfileInfoRow
                iconName="shield-checkmark-outline"
                label="Role"
                value={roleLabel}
              />
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
                    value={
                      focusAreaNames.length > 0
                        ? focusAreaNames.join(", ")
                        : "Not set"
                    }
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
                label="Account details"
                onPress={() => router.push("/(tabs)/profile/account")}
              />
              <ProfileNavRow
                iconName="briefcase-outline"
                label="Work profile"
                onPress={() => router.push("/(tabs)/profile/work")}
              />
              <ProfileNavRow
                iconName="lock-closed-outline"
                isLast
                label="Security & sessions"
                onPress={() => router.push("/(tabs)/profile/security")}
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
                    setWorkspaceError(null);
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
            presentationStyle={
              Platform.OS === "ios" ? "pageSheet" : "fullScreen"
            }
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
              {workspaceError ? (
                <StatusBanner
                  body={workspaceError}
                  title="Could not switch organization"
                />
              ) : null}
              <ProfileSection title="Organizations">
                <ProfileList>
                  {memberships.map((membership, index) => (
                    <WorkspaceOptionRow
                      key={membership.id}
                      isLast={index === memberships.length - 1}
                      membership={membership}
                      switching={switchingWorkspaceId === membership.id}
                      onPress={() => {
                        setPendingConfirmation({
                          kind: "switchWorkspace",
                          membership,
                        });
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
        confirmTone={
          pendingConfirmation?.kind === "switchWorkspace"
            ? "primary"
            : "dangerFilled"
        }
        loading={isSigningOut || switchingWorkspaceId != null}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={confirmProfileAction}
        title={confirmationTitle}
        visible={pendingConfirmation != null}
      />
    </Screen>
  );
}

function WorkspaceOptionRow({
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
        styles.workspaceOptionRow,
        !isLast && styles.workspaceOptionDivider,
        membership.isCurrent && styles.workspaceOptionCurrent,
        pressed && !disabled && styles.workspaceOptionPressed,
      ]}
    >
      <View style={styles.workspaceOptionIcon}>
        <Ionicons
          color={
            membership.isCurrent ? mobileColors.brand : mobileColors.textSecondary
          }
          name={membership.isCurrent ? "checkmark" : "business-outline"}
          size={18}
        />
      </View>
      <View style={styles.workspaceOptionCopy}>
        <Text style={styles.workspaceOptionName}>
          {membership.name ?? "Organization"}
        </Text>
        <Text style={styles.workspaceOptionMeta}>
          {membership.slug ?? "workspace"} - {membership.orgRole ?? "user"}
        </Text>
      </View>
      <Text style={styles.workspaceOptionStatus}>{statusLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    gap: 14,
  },
  loadingTitle: {
    ...mobileText.screenTitle,
    color: mobileColors.textPrimary,
  },
  workspaceOptionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 70,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  workspaceOptionCurrent: {
    backgroundColor: mobileColors.surfaceSecondary,
  },
  workspaceOptionPressed: {
    opacity: 0.64,
  },
  workspaceOptionDivider: {
    borderBottomColor: mobileColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  workspaceOptionIcon: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  workspaceOptionCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  workspaceOptionName: {
    ...mobileText.cardTitle,
    color: mobileColors.textPrimary,
  },
  workspaceOptionMeta: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  workspaceOptionStatus: {
    ...mobileText.caption,
    color: mobileColors.textSubtle,
    fontWeight: "600",
  },
});
