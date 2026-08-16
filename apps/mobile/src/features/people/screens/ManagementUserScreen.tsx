import { useMemo, useState } from "react";
import { Linking, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrgRoleLabel } from "@dubgrid/domain";
import type { MobileManagementUser } from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  getManagementUsers,
  removeMobileManagementUser,
  updateMobileManagementUser,
  updateMobileManagementUserInvitation,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { mobileIconToneColor } from "../../../shared/theme/tokens";
import { HeaderTitle } from "../../../shared/navigation/HeaderTitle";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  ProfileHero,
  ProfileHeroMeta,
  ProfileInfoRow,
  ProfileList,
  ProfileSection,
} from "../../profile/components/ProfilePrimitives";
import { ProfileSkeleton } from "../../profile/components/ProfileSkeleton";
import { ManagementUserAccessSheet } from "../components/ManagementUserAccessSheet";

type InvitationConfirmAction = "resend" | "revoke" | null;

function getFullName(managementUser: MobileManagementUser): string {
  return (
    `${managementUser.firstName} ${managementUser.lastName}`.trim() ||
    managementUser.email ||
    "Unnamed person"
  );
}

export default function ManagementUserScreen() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const params = useLocalSearchParams<{ personId?: string }>();
  const personId = Array.isArray(params.personId) ? params.personId[0] : params.personId;
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [showAccessSheet, setShowAccessSheet] = useState(false);
  const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);
  const [invitationConfirmAction, setInvitationConfirmAction] =
    useState<InvitationConfirmAction>(null);

  const managementUsersQuery = useQuery({
    queryKey: ["mobile", "management-users", accessToken],
    queryFn: () => getManagementUsers(accessToken!),
    enabled: Boolean(accessToken),
  });
  const manualRefresh = useManualRefresh(() =>
    Promise.all([managementUsersQuery.refetch(), bootstrapQuery.refetch()]),
  );

  const managementUser =
    managementUsersQuery.data?.managementUsers.find((candidate) => candidate.id === personId) ??
    null;
  const canManageManagementAccess = Boolean(
    bootstrapQuery.data?.permissions.canManageManagementAccess,
  );
  const currentUserId = bootstrapQuery.data?.user?.id ?? null;
  const isSelf = Boolean(
    currentUserId && managementUser?.userId && managementUser.userId === currentUserId,
  );
  const departmentLabel = bootstrapQuery.data?.currentOrg.labels.department ?? "Departments";
  const managementDepartments = (bootstrapQuery.data?.departments ?? []).filter(
    (department) => department.type === "management",
  );
  const departmentNames = (managementUser?.managementDepartmentIds ?? [])
    .map(
      (departmentId) =>
        managementDepartments.find((department) => department.id === departmentId)?.name ?? null,
    )
    .filter((value): value is string => Boolean(value));

  const contentState = useMobileContentState({
    // Bootstrap is in both halves: the permission it carries decides which
    // actions render, so clearing on the roster alone paints a read-only page
    // that then grows buttons.
    hasData: managementUsersQuery.data !== undefined && bootstrapQuery.data !== undefined,
    isLoading: managementUsersQuery.isLoading || bootstrapQuery.isLoading,
    error: managementUsersQuery.error ?? bootstrapQuery.error,
  });

  function invalidateRoster() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "management-users"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "people"] }),
    ]);
  }

  const accessMutation = useMutation({
    mutationFn: async (
      input:
        | { orgRole: MobileManagementUser["orgRole"]; managementDepartmentIds: number[] }
        | { remove: true },
    ) => {
      if (!managementUser) throw new Error("Management user unavailable");
      if ("remove" in input) {
        return removeMobileManagementUser(accessToken!, managementUser.id, {
          expectedUpdatedAt: managementUser.updatedAt,
        });
      }
      return updateMobileManagementUser(accessToken!, managementUser.id, {
        orgRole: input.orgRole ?? "user",
        managementDepartmentIds: input.managementDepartmentIds,
        expectedUpdatedAt: managementUser.updatedAt,
      });
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update management access",
        fallbackMessage: "We couldn't update their management access right now.",
      });
    },
    onSuccess: async (result) => {
      setShowAccessSheet(false);
      setShowRemoveConfirmation(false);
      await invalidateRoster();
      pushToast({
        tone: "success",
        title:
          result.result === "access_removed"
            ? "Management access removed"
            : "Management access updated",
        message: "Their management access was updated.",
      });
      // Nothing left on this page once they're off the roster.
      if (result.result === "access_removed") router.back();
    },
  });

  const invitationMutation = useMutation({
    mutationFn: async (action: "resend" | "revoke") => {
      if (!managementUser) throw new Error("Management user unavailable");
      return updateMobileManagementUserInvitation(accessToken!, managementUser.id, {
        action,
        expectedUpdatedAt: managementUser.updatedAt,
      });
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update invitation",
        fallbackMessage: "We couldn't update that invitation right now.",
      });
    },
    onSuccess: async (result) => {
      setInvitationConfirmAction(null);
      await invalidateRoster();
      pushToast({
        tone: "success",
        title: result.result === "invitation_revoked" ? "Invitation revoked" : "Invitation resent",
        message: "Their management invitation was updated.",
      });
      if (result.result === "invitation_revoked") router.back();
    },
  });

  if (contentState.kind === "loading") {
    return (
      <Screen
        bottomPaddingMode="tabbed"
        onRefresh={manualRefresh.refresh}
        refreshing={manualRefresh.isRefreshing}
      >
        <HeaderTitle title="" />
        {contentState.showSkeleton ? (
          <ProfileSkeleton
            metaItems={3}
            rowsPerSection={3}
            sections={2}
            showHeroIdentity={false}
            showTitle
          />
        ) : null}
      </Screen>
    );
  }

  if (contentState.kind === "error") {
    return (
      <Screen
        bottomPaddingMode="tabbed"
        onRefresh={manualRefresh.refresh}
        refreshing={manualRefresh.isRefreshing}
      >
        <HeaderTitle title="Management" />
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load management access"
          variant="centered"
          onAction={() => {
            void managementUsersQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  if (!managementUser) {
    return (
      <Screen
        bottomPaddingMode="tabbed"
        onRefresh={manualRefresh.refresh}
        refreshing={manualRefresh.isRefreshing}
      >
        <HeaderTitle title="Management" />
        <EmptyStateCard
          fillScreen
          body="This teammate isn't on the management roster anymore."
          iconName="people-outline"
          title="Management user not found"
        />
      </Screen>
    );
  }

  const fullName = getFullName(managementUser);
  const isPendingInvite = managementUser.source === "pending_invite";

  return (
    <Screen
      bottomPaddingMode="tabbed"
      onRefresh={manualRefresh.refresh}
      refreshing={manualRefresh.isRefreshing}
    >
      <HeaderTitle title={fullName} />

      <ProfileHero>
        <ProfileHeroMeta label="Access" value={getOrgRoleLabel(managementUser.orgRole)} />
        <ProfileHeroMeta
          label="App account"
          value={isPendingInvite ? "Invitation pending" : "Active app account"}
        />
        <ProfileHeroMeta
          label="On schedule"
          value={managementUser.employeeId ? "Yes" : "Management only"}
        />
      </ProfileHero>

      <View>
        <ProfileSection title="Contact">
          <ProfileList>
            <ProfileInfoRow
              iconName="mail-outline"
              label="Email"
              value={managementUser.email || "No email on file"}
            />
            <ProfileInfoRow
              iconName="call-outline"
              isLast
              label="Phone"
              value={managementUser.phone || "No phone on file"}
            />
          </ProfileList>
        </ProfileSection>

        <ProfileSection title="Management access">
          <ProfileList>
            <ProfileInfoRow
              iconName="business-outline"
              label={`Management ${departmentLabel}`}
              value={departmentNames.join(", ") || "None"}
            />
            <ProfileInfoRow
              iconName="shield-checkmark-outline"
              isLast
              label="Access level"
              value={getOrgRoleLabel(managementUser.orgRole)}
            />
          </ProfileList>
        </ProfileSection>

        {managementUser.email || managementUser.phone ? (
          <ProfileSection title="Quick actions">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Button
                compact
                disabled={!managementUser.phone}
                label="Call"
                leadingAccessory={
                  <Ionicons color={mobileIconToneColor("green", isDark)} name="call" size={18} />
                }
                onPress={() => {
                  if (managementUser.phone) void Linking.openURL(`tel:${managementUser.phone}`);
                }}
                tone="plain"
              />
              <Button
                compact
                disabled={!managementUser.email}
                label="Email"
                leadingAccessory={
                  <Ionicons color={mobileIconToneColor("blue", isDark)} name="mail" size={18} />
                }
                onPress={() => {
                  if (managementUser.email) void Linking.openURL(`mailto:${managementUser.email}`);
                }}
                tone="plain"
              />
              {managementUser.employeeId ? (
                <Button
                  compact
                  label="Staff Profile"
                  leadingAccessory={
                    <Ionicons
                      color={mobileIconToneColor("orange", isDark)}
                      name="person"
                      size={18}
                    />
                  }
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/people/[id]",
                      params: { id: managementUser.employeeId! },
                    })
                  }
                  tone="plain"
                />
              ) : null}
            </View>
          </ProfileSection>
        ) : null}

        {canManageManagementAccess && !isSelf ? (
          <ProfileSection title="Actions">
            <View style={{ gap: 8 }}>
              {isPendingInvite ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button
                    compact
                    disabled={invitationMutation.isPending}
                    label={invitationMutation.isPending ? "Sending..." : "Reinvite"}
                    onPress={() => setInvitationConfirmAction("resend")}
                    tone="link"
                  />
                  <Button
                    compact
                    disabled={invitationMutation.isPending}
                    label="Revoke"
                    onPress={() => setInvitationConfirmAction("revoke")}
                    tone="danger"
                  />
                </View>
              ) : null}
              <Button
                compact
                disabled={accessMutation.isPending}
                label="Edit Management Access"
                onPress={() => setShowAccessSheet(true)}
                tone="secondary"
              />
              <Button
                compact
                disabled={accessMutation.isPending}
                label="Remove from Management"
                onPress={() => setShowRemoveConfirmation(true)}
                tone="danger"
              />
            </View>
          </ProfileSection>
        ) : null}
      </View>

      <ManagementUserAccessSheet
        departmentLabel={departmentLabel}
        isPending={accessMutation.isPending}
        managementDepartments={managementDepartments}
        managementUser={managementUser}
        onDismiss={() => setShowAccessSheet(false)}
        onSubmit={(draft) => accessMutation.mutate(draft)}
        visible={showAccessSheet}
      />

      <ConfirmationModal
        body="They'll come off the management roster. Any staff profile and schedule stay exactly as they are."
        confirmLabel="Remove Access"
        confirmTone="danger"
        loading={accessMutation.isPending}
        onCancel={() => setShowRemoveConfirmation(false)}
        onConfirm={() => accessMutation.mutate({ remove: true })}
        title={`Remove ${fullName} from management?`}
        visible={showRemoveConfirmation}
      />

      <ConfirmationModal
        body={
          invitationConfirmAction === "resend"
            ? `The current invitation for ${managementUser.email} will be canceled and a new one sent.`
            : `The current invite link for ${managementUser.email} will stop working.`
        }
        confirmLabel={
          invitationConfirmAction === "resend" ? "Reissue Invitation" : "Revoke Invitation"
        }
        confirmTone={invitationConfirmAction === "revoke" ? "danger" : "primary"}
        loading={invitationMutation.isPending}
        onCancel={() => setInvitationConfirmAction(null)}
        onConfirm={() => {
          if (invitationConfirmAction) invitationMutation.mutate(invitationConfirmAction);
        }}
        title={invitationConfirmAction === "resend" ? "Reissue invitation?" : "Revoke invitation?"}
        visible={invitationConfirmAction != null}
      />
    </Screen>
  );
}
