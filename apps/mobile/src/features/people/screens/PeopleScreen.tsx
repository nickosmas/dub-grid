import { type ReactNode, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MobileDepartment,
  MobilePerson,
  MobileProfileChangeRequest,
} from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { ModalHeader } from "../../../shared/components/ModalHeader";
import { ListSkeleton } from "../../../shared/components/Skeleton";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  getAdminProfileChangeRequests,
  getPeople,
  updateProfileChangeRequest,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileColors,
  mobileRadii,
  mobileText,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";

type StatusFilter = "active" | "inactive";
type SortMode = "seniority" | "alphabetical";
type ProfileRequestConfirmation = {
  request: MobileProfileChangeRequest;
  action: "approve" | "reject";
} | null;

function getFullName(person: MobilePerson): string {
  return `${person.firstName} ${person.lastName}`.trim() || person.email || "Unnamed person";
}

function formatStatusLabel(status: MobilePerson["status"]): string {
  return status === "active" ? "Active" : "Inactive";
}

function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function getAvatarTone(seed: string) {
  const hue = hashCode(seed) % 360;
  return {
    backgroundColor: `hsl(${hue}, 70%, 94%)`,
    borderColor: `hsl(${hue}, 70%, 86%)`,
    color: `hsl(${hue}, 70%, 34%)`,
  };
}

export default function PeopleScreen() {
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const bootstrapQuery = useBootstrap(accessToken);
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sortMode, setSortMode] = useState<SortMode>("seniority");
  const [focusFilterId, setFocusFilterId] = useState<number | "all">("all");
  const [managementDepartmentFilterId, setManagementDepartmentFilterId] =
    useState<number | "all">("all");
  const [isRefineModalVisible, setIsRefineModalVisible] = useState(false);
  const [profileRequestConfirmation, setProfileRequestConfirmation] =
    useState<ProfileRequestConfirmation>(null);
  const canManageEmployees = Boolean(
    bootstrapQuery.data?.permissions.canManageEmployees,
  );
  const peopleQuery = useQuery({
    queryKey: ["mobile", "people", accessToken],
    queryFn: () => getPeople(accessToken!),
    enabled: Boolean(accessToken),
  });
  const profileRequestsQuery = useQuery({
    queryKey: ["mobile", "profile-change-requests", "admin", accessToken],
    queryFn: () => getAdminProfileChangeRequests(accessToken!),
    enabled: Boolean(accessToken) && canManageEmployees,
  });
  const resolveRequestMutation = useMutation({
    mutationFn: ({
      requestId,
      action,
    }: {
      requestId: string;
      action: "approve" | "reject";
    }) => updateProfileChangeRequest(accessToken!, requestId, { action }),
    onSuccess: async (_, variables) => {
      await Promise.all([profileRequestsQuery.refetch(), peopleQuery.refetch()]);
      pushToast({
        tone: "success",
        title:
          variables.action === "approve" ? "Request approved" : "Request rejected",
        message: "The profile request was updated.",
      });
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update request",
        fallbackMessage: "We couldn't update that profile request right now.",
      });
    },
  });
  const manualRefresh = useManualRefresh(() =>
    Promise.all([
      peopleQuery.refetch(),
      bootstrapQuery.refetch(),
      profileRequestsQuery.refetch(),
    ]),
  );
  function confirmProfileRequestAction() {
    if (!profileRequestConfirmation) return;

    resolveRequestMutation.mutate({
      requestId: profileRequestConfirmation.request.id,
      action: profileRequestConfirmation.action,
    });
    setProfileRequestConfirmation(null);
  }

  const focusAreaMap = useMemo(
    () =>
      new Map(
        (bootstrapQuery.data?.focusAreas ?? []).map((focusArea) => [
          focusArea.id,
          focusArea.name,
        ]),
      ),
    [bootstrapQuery.data?.focusAreas],
  );
  const people = peopleQuery.data?.people ?? [];
  const profileRequests = profileRequestsQuery.data?.requests ?? [];
  const focusAreas = bootstrapQuery.data?.focusAreas ?? [];
  const managementDepartments = useMemo(
    () =>
      (bootstrapQuery.data?.departments ?? []).filter(
        (department) => department.type === "management",
      ),
    [bootstrapQuery.data?.departments],
  );
  const filteredPeople = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    return people
      .filter((person) => {
        if (!canManageEmployees && person.status !== "active") {
          return false;
        }

        const fullName = getFullName(person).toLowerCase();
        const matchesSearch =
          !normalizedSearch ||
          fullName.includes(normalizedSearch) ||
          person.email.toLowerCase().includes(normalizedSearch) ||
          person.phone.toLowerCase().includes(normalizedSearch);

        const matchesStatus =
          !canManageEmployees
            ? true
            : statusFilter === "active"
              ? person.status === "active"
              : person.status !== "active";

        const matchesFocus =
          focusFilterId === "all" ? true : person.focusAreaIds.includes(focusFilterId);
        const matchesManagementDepartment =
          managementDepartmentFilterId === "all"
            ? true
            : getPersonManagementDepartmentIds(person).includes(
                managementDepartmentFilterId,
              );

        return (
          matchesSearch &&
          matchesStatus &&
          matchesFocus &&
          matchesManagementDepartment
        );
      })
      .sort((left, right) => {
        if (sortMode === "alphabetical") {
          return getFullName(left).localeCompare(getFullName(right));
        }

        const seniorityComparison = left.seniority - right.seniority;
        if (seniorityComparison !== 0) {
          return seniorityComparison;
        }

        return getFullName(left).localeCompare(getFullName(right));
      });
  }, [
    canManageEmployees,
    focusFilterId,
    managementDepartmentFilterId,
    people,
    searchValue,
    sortMode,
    statusFilter,
  ]);
  const visiblePeople = useMemo(
    () =>
      canManageEmployees
        ? people
        : people.filter((person) => person.status === "active"),
    [canManageEmployees, people],
  );
  const activeCount = visiblePeople.filter((person) => person.status === "active").length;
  const inactiveCount = visiblePeople.length - activeCount;
  const activeRefinementCount =
    (focusFilterId === "all" ? 0 : 1) +
    (managementDepartmentFilterId === "all" ? 0 : 1) +
    (canManageEmployees && statusFilter === "inactive" ? 1 : 0) +
    (sortMode === "alphabetical" ? 1 : 0);
  const peopleError = peopleQuery.error ?? bootstrapQuery.error;
  const contentState = getMobileQueryContentState({
    hasData: peopleQuery.data !== undefined,
    isLoading: peopleQuery.isLoading || bootstrapQuery.isLoading,
    error: peopleError,
  });

  return (
    <Screen
      bottomPaddingMode="tabbed"
      title="People"
      subtitle="People"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      <Modal
        animationType="slide"
        allowSwipeDismissal
        onRequestClose={() => setIsRefineModalVisible(false)}
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        visible={isRefineModalVisible}
      >
        <Screen
          bottomPaddingMode="modal"
          stickyHeader={
            <ModalHeader
              title="Refine directory"
              onClose={() => setIsRefineModalVisible(false)}
            />
          }
          stickyHeaderTopPadding={15}
        >
          <View style={styles.modalContent}>
            <SelectionSection label="Focus area">
              <SelectionRow
                label="All focus areas"
                onPress={() => setFocusFilterId("all")}
                selected={focusFilterId === "all"}
              />
              {focusAreas.map((focusArea) => (
                <SelectionRow
                  key={focusArea.id}
                  label={focusArea.name}
                  onPress={() => setFocusFilterId(focusArea.id)}
                  selected={focusFilterId === focusArea.id}
                />
              ))}
            </SelectionSection>

            {canManageEmployees && managementDepartments.length > 0 ? (
              <SelectionSection label="Management departments">
                <SelectionRow
                  label="All management departments"
                  onPress={() => setManagementDepartmentFilterId("all")}
                  selected={managementDepartmentFilterId === "all"}
                />
                {managementDepartments.map((department) => (
                  <SelectionRow
                    key={department.id}
                    detail={`${countPeopleInManagementDepartment(
                      visiblePeople,
                      department.id,
                    )} people`}
                    label={department.name}
                    onPress={() => setManagementDepartmentFilterId(department.id)}
                    selected={managementDepartmentFilterId === department.id}
                  />
                ))}
              </SelectionSection>
            ) : null}

            {canManageEmployees ? (
              <SelectionSection label="Status">
                <SelectionRow
                  detail={`${activeCount} people`}
                  label="Active staff"
                  onPress={() => setStatusFilter("active")}
                  selected={statusFilter === "active"}
                />
                <SelectionRow
                  detail={`${inactiveCount} people`}
                  label="Inactive staff"
                  onPress={() => setStatusFilter("inactive")}
                  selected={statusFilter === "inactive"}
                />
              </SelectionSection>
            ) : null}

            <SelectionSection label="Sort by">
              <SelectionRow
                label="Seniority"
                onPress={() => setSortMode("seniority")}
                selected={sortMode === "seniority"}
              />
              <SelectionRow
                label="Alphabetical"
                onPress={() => setSortMode("alphabetical")}
                selected={sortMode === "alphabetical"}
              />
            </SelectionSection>
          </View>
        </Screen>
      </Modal>

      <View style={styles.section}>
        <View style={styles.searchBarRow}>
          <View style={styles.searchField}>
            <Ionicons color={mobileColors.textSubtle} name="search" size={18} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setSearchValue}
              placeholder="Search people"
              placeholderTextColor={mobileColors.textSubtle}
              style={styles.searchInput}
              value={searchValue}
            />
          </View>
          <Pressable
            accessibilityLabel="Open people filters and sort"
            accessibilityRole="button"
            accessibilityState={{ expanded: isRefineModalVisible }}
            android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
            onPress={() => setIsRefineModalVisible(true)}
            style={[
              styles.refineButton,
              activeRefinementCount > 0 && styles.refineButtonActive,
            ]}
          >
            <Ionicons
              color={
                activeRefinementCount > 0
                  ? mobileColors.textInverse
                  : mobileColors.textSecondary
              }
              name="options-outline"
              size={16}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.refineButtonText,
                activeRefinementCount > 0 && styles.refineButtonTextActive,
              ]}
            >
              Refine
            </Text>
          </Pressable>
        </View>
      </View>

      {canManageEmployees && profileRequests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>People requests</Text>
          <View style={styles.linkList}>
            {profileRequests.map((request: MobileProfileChangeRequest, index: number) => (
              <View
                key={request.id}
                style={[
                  styles.requestRow,
                  index < profileRequests.length - 1 && styles.rowDivider,
                ]}
              >
                <View style={styles.requestCopy}>
                  <Text style={styles.personName}>{request.requesterName}</Text>
                  <Text style={styles.personSubtitle}>
                    {request.type === "account_deletion"
                      ? "Account deletion"
                      : "Profile update"}
                  </Text>
                </View>
                <View style={styles.requestActions}>
                  <Button
                    compact
                    disabled={resolveRequestMutation.isPending}
                    label="Approve"
                    onPress={() => {
                      setProfileRequestConfirmation({
                        request,
                        action: "approve",
                      });
                    }}
                  />
                  <Button
                    compact
                    disabled={resolveRequestMutation.isPending}
                    label="Reject"
                    onPress={() => {
                      setProfileRequestConfirmation({
                        request,
                        action: "reject",
                      });
                    }}
                    tone="neutral"
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {contentState.kind === "loading" ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingTitle}>Loading directory</Text>
          <ListSkeleton rows={4} showSectionHeader={false} />
        </View>
      ) : contentState.kind === "error" &&
        contentState.reason === "unauthorized" ? (
        <StatusBanner
          body="Your current role does not include mobile staff visibility for this workspace."
          tone="warning"
          title="Directory unavailable"
        />
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try Again"
          body={contentState.message}
          title="Could not load people"
          onAction={() => {
            void peopleQuery.refetch();
          }}
        />
      ) : visiblePeople.length === 0 ? (
        <EmptyStateCard
          body="No teammates are available in this workspace yet."
          iconName="people-outline"
          title="No teammates yet"
        />
      ) : filteredPeople.length === 0 ? (
        <EmptyStateCard
          body="Try a different name, email, phone number, focus area, or management department."
          iconName="search-outline"
          title="No matches"
        />
      ) : (
        <View style={styles.section}>
          <View style={styles.linkList}>
            {filteredPeople.map((person, index) => {
              const focusAreasForPerson = person.focusAreaIds
                .map((focusAreaId) => focusAreaMap.get(focusAreaId) ?? null)
                .filter((value): value is string => Boolean(value));
              const subtitle =
                focusAreasForPerson.length > 0
                  ? focusAreasForPerson.join(", ")
                  : person.email || person.phone || "No contact on file";
              const accessHint = person.pendingInvitation
                ? "Invitation pending"
                : person.userId
                  ? "App access"
                  : "No app access";

              return (
                <PersonRow
                  key={person.id}
                  accessHint={canManageEmployees ? accessHint : null}
                  id={person.id}
                  employmentType={person.employmentType}
                  isLast={index === filteredPeople.length - 1}
                  name={getFullName(person)}
                  onPress={() => {
                    router.push({
                      pathname: "/(tabs)/people/[id]",
                      params: { id: person.id },
                    });
                  }}
                  showStatus={canManageEmployees}
                  status={person.status}
                  subtitle={subtitle}
                />
              );
            })}
          </View>
        </View>
      )}
      <ConfirmationModal
        body={
          profileRequestConfirmation?.request.type === "account_deletion" &&
          profileRequestConfirmation.action === "approve"
            ? "Approve this account deletion request? The account deletion safeguards will run before access is removed."
            : profileRequestConfirmation?.action === "approve"
              ? "Approve this profile change request?"
              : "Reject this profile change request?"
        }
        confirmLabel={
          profileRequestConfirmation?.action === "approve" ? "Approve" : "Reject"
        }
        confirmTone={
          profileRequestConfirmation?.request.type === "account_deletion" &&
          profileRequestConfirmation.action === "approve"
            ? "dangerFilled"
            : profileRequestConfirmation?.action === "reject"
              ? "danger"
              : "primary"
        }
        loading={resolveRequestMutation.isPending}
        onCancel={() => setProfileRequestConfirmation(null)}
        onConfirm={confirmProfileRequestAction}
        title={
          profileRequestConfirmation?.action === "approve"
            ? "Approve request?"
            : "Reject request?"
        }
        visible={profileRequestConfirmation != null}
      />
    </Screen>
  );
}

function getPersonManagementDepartmentIds(person: MobilePerson): number[] {
  return person.managementDepartmentIds ?? [];
}

function countPeopleInManagementDepartment(
  people: MobilePerson[],
  departmentId: MobileDepartment["id"],
): number {
  return people.filter((person) =>
    getPersonManagementDepartmentIds(person).includes(departmentId),
  ).length;
}

function SelectionSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      <View style={styles.selectionList}>{children}</View>
    </View>
  );
}

function SelectionRow({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectionRow,
        pressed && styles.selectionRowPressed,
      ]}
    >
      <View style={styles.selectionRowCopy}>
        <Text style={styles.selectionRowTitle}>{label}</Text>
        {detail ? <Text style={styles.selectionRowDetail}>{detail}</Text> : null}
      </View>
      {selected ? (
        <Ionicons color={mobileColors.brand} name="checkmark" size={20} />
      ) : null}
    </Pressable>
  );
}

function PersonRow({
  id,
  employmentType,
  name,
  subtitle,
  status,
  accessHint,
  showStatus,
  isLast,
  onPress,
}: {
  id: string;
  employmentType: MobilePerson["employmentType"];
  name: string;
  subtitle: string;
  status: MobilePerson["status"];
  accessHint: string | null;
  showStatus: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const secondaryDetail = [
    employmentType === "part_time" ? "PT" : "FT",
    accessHint,
    showStatus ? formatStatusLabel(status) : null,
  ]
    .filter(Boolean)
    .join(" - ");
  const avatarTone = getAvatarTone(id);
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?";

  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="button"
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.personRow,
        !isLast && styles.personRowDivider,
        pressed && styles.personRowPressed,
      ]}
    >
      <View
        style={[
          styles.personAvatar,
          {
            backgroundColor: avatarTone.backgroundColor,
            borderColor: avatarTone.borderColor,
          },
        ]}
      >
        <Text style={[styles.personAvatarText, { color: avatarTone.color }]}>
          {initials}
        </Text>
      </View>
      <View style={styles.personCopy}>
        <Text numberOfLines={1} style={styles.personName}>
          {name}
        </Text>
        <Text numberOfLines={1} style={styles.personSubtitle}>
          {subtitle}
        </Text>
        {secondaryDetail ? (
          <Text numberOfLines={1} style={styles.personAccess}>
            {secondaryDetail}
          </Text>
        ) : null}
      </View>
      <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={22} />
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
  section: {
    gap: 10,
  },
  sectionTitle: {
    ...mobileText.label,
    color: mobileColors.textSubtle,
    textTransform: "uppercase",
  },
  modalContent: {
    gap: 16,
    paddingBottom: 12,
  },
  searchBarRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  searchField: {
    minHeight: 46,
    alignItems: "center",
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.control,
    borderWidth: 1,
    flexDirection: "row",
    flex: 1,
    gap: 9,
    paddingHorizontal: 14,
  },
  searchInput: {
    ...mobileText.sectionTitle,
    fontWeight: "400",
    color: mobileColors.textPrimary,
    flex: 1,
    paddingVertical: 12,
  },
  refineButton: {
    minHeight: 46,
    alignItems: "center",
    backgroundColor: mobileColors.surface,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  refineButtonActive: {
    backgroundColor: mobileColors.brand,
    borderColor: mobileColors.brand,
  },
  refineButtonText: {
    color: mobileColors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  refineButtonTextActive: {
    color: mobileColors.textInverse,
  },
  selectionList: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    overflow: "hidden",
  },
  selectionRow: {
    minHeight: 58,
    alignItems: "center",
    borderBottomColor: mobileColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selectionRowPressed: {
    opacity: 0.64,
  },
  selectionRowCopy: {
    flex: 1,
    gap: 2,
  },
  selectionRowTitle: {
    ...mobileText.body,
    color: mobileColors.textPrimary,
  },
  selectionRowDetail: {
    ...mobileText.caption,
    color: mobileColors.textMuted,
  },
  linkList: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    overflow: "hidden",
  },
  personRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  personRowDivider: {
    borderBottomColor: mobileColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowDivider: {
    borderBottomColor: mobileColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  requestRow: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  requestCopy: {
    gap: 3,
  },
  requestActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  personRowPressed: {
    opacity: 0.62,
  },
  personAvatar: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  personAvatarText: {
    ...mobileText.bodyStrong,
  },
  personCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  personName: {
    ...mobileText.cardTitle,
    color: mobileColors.textPrimary,
  },
  personSubtitle: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  personAccess: {
    ...mobileText.caption,
    color: mobileColors.textMuted,
  },
});
