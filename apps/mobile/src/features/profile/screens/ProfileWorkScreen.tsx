import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import type {
  MobilePersonUpdateBody,
  MobileProfileResponse,
} from "@dubgrid/contracts";
import { normalizeStaffName } from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { DetailSkeleton } from "../../../shared/components/Skeleton";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { getProfile, updateMobilePerson } from "../../../shared/lib/api";
import { queryClient } from "../../../shared/lib/query-client";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  ProfileChoiceGroup,
  ProfileInfoRow,
  ProfileList,
  ProfilePanel,
  ProfileSection,
  formatProfileStatus,
  formatProfileValue,
} from "../components/ProfilePrimitives";

const PENDING_PROFILE_CHANGE_MESSAGE =
  "A profile change request is pending admin review.";

type LinkedEmployee = NonNullable<MobileProfileResponse["linkedEmployee"]>;
type WorkDraft = {
  employmentType: LinkedEmployee["employmentType"];
  certificationId: number | null;
  focusAreaIds: number[];
  roleIds: number[];
  departmentIds: number[];
};

function makeWorkDraft(employee: LinkedEmployee): WorkDraft {
  return {
    employmentType: employee.employmentType,
    certificationId: employee.certificationId,
    focusAreaIds: employee.focusAreaIds,
    roleIds: employee.roleIds,
    departmentIds: employee.departmentIds,
  };
}

function arrayEqual(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export default function ProfileWorkScreen() {
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [workDraft, setWorkDraft] = useState<WorkDraft | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<
    "directEdit" | null
  >(null);
  const profileQuery = useQuery({
    queryKey: ["mobile", "profile", accessToken],
    queryFn: () => getProfile(accessToken!),
    enabled: Boolean(accessToken),
  });
  const bootstrapQuery = useBootstrap(accessToken);
  const manualRefresh = useManualRefresh(() => profileQuery.refetch());
  const profile = profileQuery.data ?? null;
  const contentState = getMobileQueryContentState({
    hasData: Boolean(profile),
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
  });
  const focusAreaNames =
    profile?.linkedEmployee?.focusAreaIds
      .map(
        (id) =>
          profile.focusAreas.find((focusArea) => focusArea.id === id)?.name,
      )
      .filter((value): value is string => Boolean(value)) ?? [];
  const linkedEmployee = profile?.linkedEmployee ?? null;
  const canEditProfileDirectly = Boolean(
    bootstrapQuery.data?.permissions.canManageEmployees,
  );
  const focusAreas =
    bootstrapQuery.data?.focusAreas ?? profile?.focusAreas ?? [];
  const roles = bootstrapQuery.data?.roles ?? [];
  const roleNames =
    linkedEmployee?.roleIds
      .map((id) => roles.find((role) => role.id === id)?.name)
      .filter((value): value is string => Boolean(value)) ?? [];
  const certifications = bootstrapQuery.data?.certifications ?? [];
  const directFocusAreaError =
    workDraft && workDraft.focusAreaIds.length === 0
      ? `Select at least one ${profile?.currentOrg.labels.focusArea ?? "focus area"}.`
      : null;
  const hasDirectChanges =
    Boolean(linkedEmployee && workDraft) &&
    (workDraft?.employmentType !== linkedEmployee?.employmentType ||
      workDraft?.certificationId !== linkedEmployee?.certificationId ||
      !arrayEqual(
        workDraft?.focusAreaIds ?? [],
        linkedEmployee?.focusAreaIds ?? [],
      ) ||
      !arrayEqual(workDraft?.roleIds ?? [], linkedEmployee?.roleIds ?? []));
  const directUpdateMutation = useMutation({
    mutationFn: () => {
      if (!accessToken || !linkedEmployee || !workDraft) {
        throw new Error("Profile unavailable");
      }

      const body: MobilePersonUpdateBody = {
        expectedVersion: linkedEmployee.version,
        firstName: normalizeStaffName(linkedEmployee.firstName),
        lastName: normalizeStaffName(linkedEmployee.lastName),
        employmentType: workDraft.employmentType,
        phone: linkedEmployee.phone,
        email: linkedEmployee.email,
        contactNotes: linkedEmployee.contactNotes,
        certificationId: workDraft.certificationId,
        focusAreaIds: workDraft.focusAreaIds,
        roleIds: workDraft.roleIds,
        departmentIds: workDraft.departmentIds,
      };

      return updateMobilePerson(accessToken, linkedEmployee.id, body);
    },
    onSuccess: async () => {
      await Promise.all([
        profileQuery.refetch(),
        bootstrapQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["mobile", "people"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "person"] }),
      ]);
      pushToast({
        tone: "success",
        title: "Profile updated",
        message: "Your staff profile was updated.",
      });
    },
    onError: () => {
      pushToast({
        tone: "error",
        title: "Could not update profile",
        message: "Refresh and try again.",
      });
    },
  });

  useEffect(() => {
    setWorkDraft(linkedEmployee ? makeWorkDraft(linkedEmployee) : null);
  }, [linkedEmployee?.id, linkedEmployee?.version]);

  function setWorkDraftField<K extends keyof WorkDraft>(
    key: K,
    value: WorkDraft[K],
  ) {
    setWorkDraft((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  }

  function toggleWorkDraftId(key: "focusAreaIds" | "roleIds", id: number) {
    setWorkDraft((current) => {
      if (!current) return current;
      const values = current[key];
      return {
        ...current,
        [key]: values.includes(id)
          ? values.filter((value) => value !== id)
          : [...values, id],
      };
    });
  }

  function confirmDirectEditSave() {
    if (directFocusAreaError) {
      pushToast({
        tone: "warning",
        title: "Check staff profile",
        message: directFocusAreaError,
      });
      return;
    }

    setPendingConfirmation("directEdit");
  }

  return (
    <Screen
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      {contentState.kind === "loading" ? (
        <DetailSkeleton sections={2} />
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try Again"
          body={contentState.message}
          title="Could not load work profile"
          onAction={() => {
            void profileQuery.refetch();
          }}
        />
      ) : !profile?.linkedEmployee ? (
        <EmptyStateCard
          body="This account is not linked to a staff profile in this organization."
          iconName="person-circle-outline"
          title="No linked staff profile"
        />
      ) : (
        <>
          {profile.pendingProfileChangeRequest ? (
            <StatusBanner
              body={PENDING_PROFILE_CHANGE_MESSAGE}
              title="Request pending"
            />
          ) : null}

          <ProfileSection title="Organization">
            <ProfileList>
              <ProfileInfoRow
                iconName="business-outline"
                label="Organization"
                value={profile.currentOrg.name}
              />
              <ProfileInfoRow
                iconName="compass-outline"
                isLast
                label="Workspace"
                value={formatProfileValue(profile.currentOrg.slug)}
              />
            </ProfileList>
          </ProfileSection>

          <ProfileSection title="Staff profile">
            <ProfileList>
              <ProfileInfoRow
                iconName="person-circle-outline"
                label="Name"
                value={`${profile.linkedEmployee.firstName} ${profile.linkedEmployee.lastName}`.trim()}
              />
              <ProfileInfoRow
                iconName="pulse-outline"
                label="Status"
                value={formatProfileStatus(profile.linkedEmployee.status)}
              />
              <ProfileInfoRow
                iconName="people-circle-outline"
                label={profile.currentOrg.labels.role}
                value={roleNames.length > 0 ? roleNames.join(", ") : "Not set"}
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
            </ProfileList>
          </ProfileSection>

          {canEditProfileDirectly && workDraft ? (
            <ProfileSection title="Edit staff profile">
              <ProfilePanel>
                <ProfileChoiceGroup
                  items={[
                    { id: 0, name: "Full-time" },
                    { id: 1, name: "Part-time" },
                  ]}
                  label="Employment"
                  selectedIds={[workDraft.employmentType === "part_time" ? 1 : 0]}
                  onToggle={(id) =>
                    setWorkDraftField(
                      "employmentType",
                      id === 1 ? "part_time" : "full_time",
                    )
                  }
                />
                <ProfileChoiceGroup
                  items={[
                    { id: -1, name: "None" },
                    ...certifications.map((item) => ({
                      id: item.id,
                      name: item.abbr || item.name,
                    })),
                  ]}
                  label={profile.currentOrg.labels.certification}
                  selectedIds={
                    workDraft.certificationId == null
                      ? [-1]
                      : [workDraft.certificationId]
                  }
                  onToggle={(id) =>
                    setWorkDraftField("certificationId", id === -1 ? null : id)
                  }
                />
                <ProfileChoiceGroup
                  error={directFocusAreaError}
                  items={focusAreas.map((item) => ({
                    id: item.id,
                    name: item.name,
                  }))}
                  label={profile.currentOrg.labels.focusArea}
                  selectedIds={workDraft.focusAreaIds}
                  onToggle={(id) => toggleWorkDraftId("focusAreaIds", id)}
                />
                <ProfileChoiceGroup
                  items={roles.map((item) => ({
                    id: item.id,
                    name: item.abbr || item.name,
                  }))}
                  label={profile.currentOrg.labels.role}
                  selectedIds={workDraft.roleIds}
                  onToggle={(id) => toggleWorkDraftId("roleIds", id)}
                />
              </ProfilePanel>
              <View style={styles.actionsRow}>
                <Button
                  compact
                  disabled={
                    directUpdateMutation.isPending ||
                    !hasDirectChanges ||
                    Boolean(directFocusAreaError)
                  }
                  label={
                    directUpdateMutation.isPending ? "Saving..." : "Save changes"
                  }
                  onPress={confirmDirectEditSave}
                />
                <Button
                  compact
                  disabled={directUpdateMutation.isPending}
                  label="Discard"
                  onPress={() => {
                    if (linkedEmployee) {
                      setWorkDraft(makeWorkDraft(linkedEmployee));
                    }
                  }}
                  tone="neutral"
                />
              </View>
            </ProfileSection>
          ) : null}
        </>
      )}
      <ConfirmationModal
        body="Confirm that you want to save these staff profile changes."
        confirmLabel="Save"
        loading={directUpdateMutation.isPending}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={() => {
          const action = pendingConfirmation;
          setPendingConfirmation(null);
          if (action === "directEdit") {
            directUpdateMutation.mutate();
          }
        }}
        title="Save staff profile?"
        visible={pendingConfirmation != null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});
