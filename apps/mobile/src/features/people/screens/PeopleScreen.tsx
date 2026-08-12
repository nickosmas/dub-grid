import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
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
import {
  FilterButton,
  FilterSheet,
  SelectionRow,
  SelectionSection,
} from "../../../shared/components/FilterSheet";
import { SearchBar } from "../../../shared/components/SearchBar";
import { AnimatedListItem } from "../../../shared/motion/AnimatedListItem";
import { usePressAnimation } from "../../../shared/motion/usePressAnimation";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  getAdminProfileChangeRequests,
  getPeople,
  updateProfileChangeRequest,
} from "../../../shared/lib/api";
import { getAvatarTone } from "../../../shared/lib/avatar-tone";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useMobileColors, useThemeMode } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileMotion,
  mobileRadii,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { PersonListSkeleton } from "../components/PersonListSkeleton";
import { getMobileOrgRoleBadge } from "../lib/orgRoleBadges";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type StatusFilter = "active" | "inactive";
type SortMode = "seniority" | "alphabetical";
type MobileOrgRole = "super_admin" | "admin" | "user" | null;
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

export default function PeopleScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const bootstrapQuery = useBootstrap(accessToken);
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sortMode, setSortMode] = useState<SortMode>("seniority");
  const [focusFilterId, setFocusFilterId] = useState<number | "all">("all");
  const [managementDepartmentFilterId, setManagementDepartmentFilterId] = useState<number | "all">(
    "all",
  );
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [profileRequestConfirmation, setProfileRequestConfirmation] =
    useState<ProfileRequestConfirmation>(null);
  const canManageEmployees = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);
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
    mutationFn: ({ requestId, action }: { requestId: string; action: "approve" | "reject" }) =>
      updateProfileChangeRequest(accessToken!, requestId, { action }),
    onSuccess: async (_, variables) => {
      await Promise.all([profileRequestsQuery.refetch(), peopleQuery.refetch()]);
      pushToast({
        tone: "success",
        title: variables.action === "approve" ? "Request approved" : "Request rejected",
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
    Promise.all([peopleQuery.refetch(), bootstrapQuery.refetch(), profileRequestsQuery.refetch()]),
  );
  function clearFilters() {
    setFocusFilterId("all");
    setManagementDepartmentFilterId("all");
    setStatusFilter("active");
    setSortMode("seniority");
  }

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
        (bootstrapQuery.data?.focusAreas ?? []).map((focusArea) => [focusArea.id, focusArea.name]),
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

        const matchesStatus = !canManageEmployees
          ? true
          : statusFilter === "active"
            ? person.status === "active"
            : person.status !== "active";

        const matchesFocus =
          focusFilterId === "all" ? true : person.focusAreaIds.includes(focusFilterId);
        const matchesManagementDepartment =
          managementDepartmentFilterId === "all"
            ? true
            : getPersonManagementDepartmentIds(person).includes(managementDepartmentFilterId);

        return matchesSearch && matchesStatus && matchesFocus && matchesManagementDepartment;
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
    () => (canManageEmployees ? people : people.filter((person) => person.status === "active")),
    [canManageEmployees, people],
  );
  const activeCount = visiblePeople.filter((person) => person.status === "active").length;
  const inactiveCount = visiblePeople.length - activeCount;
  const activeFilterCount =
    (focusFilterId === "all" ? 0 : 1) +
    (managementDepartmentFilterId === "all" ? 0 : 1) +
    (canManageEmployees && statusFilter === "inactive" ? 1 : 0) +
    (sortMode === "alphabetical" ? 1 : 0);
  const peopleError = peopleQuery.error ?? bootstrapQuery.error;
  const currentUserId = bootstrapQuery.data?.user?.id ?? null;
  const currentEmployeeId = bootstrapQuery.data?.linkedEmployee?.id ?? null;
  const contentState = useMobileContentState({
    // Bootstrap is in both halves. `canManageEmployees` decides which people
    // are visible at all, so clearing the skeleton on the people query alone
    // shows a list that then rewrites itself when bootstrap lands.
    hasData: peopleQuery.data !== undefined && bootstrapQuery.data !== undefined,
    isLoading: peopleQuery.isLoading || bootstrapQuery.isLoading,
    error: peopleError,
  });

  return (
    <Screen
      // The only field here is the search bar at the top, which the keyboard
      // never covers. Insetting for it just collapses the large title and
      // jumps the page open.
      adjustsForKeyboard={false}
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      <FilterSheet
        clearDisabled={activeFilterCount === 0}
        title="Filter directory"
        onClearAll={clearFilters}
        onDismiss={() => setIsFilterModalVisible(false)}
        onDone={() => setIsFilterModalVisible(false)}
        visible={isFilterModalVisible}
      >
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
                detail={`${countPeopleInManagementDepartment(visiblePeople, department.id)} people`}
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
      </FilterSheet>

      <View style={styles.section}>
        <View style={styles.searchBarRow}>
          <SearchBar
            accessibilityLabel="Search people"
            onChangeText={setSearchValue}
            placeholder="Search people"
            value={searchValue}
          />
          <FilterButton
            accessibilityLabel="Open people filters and sort"
            activeCount={activeFilterCount}
            expanded={isFilterModalVisible}
            onPress={() => setIsFilterModalVisible(true)}
          />
          {canManageEmployees ? (
            <AddPersonButton onPress={() => router.push("/people/add")} />
          ) : null}
        </View>
      </View>

      {canManageEmployees && profileRequests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>People requests</Text>
          <View style={styles.linkList}>
            {profileRequests.map((request: MobileProfileChangeRequest, index: number) => (
              <View
                key={request.id}
                style={[styles.requestRow, index < profileRequests.length - 1 && styles.rowDivider]}
              >
                <View style={styles.requestCopy}>
                  <Text style={styles.personName}>{request.requesterName}</Text>
                  <Text style={styles.personSubtitle}>
                    {request.type === "account_deletion" ? "Account deletion" : "Profile update"}
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
        contentState.showSkeleton ? (
          <PersonListSkeleton rows={6} />
        ) : null
      ) : contentState.kind === "error" && contentState.reason === "unauthorized" ? (
        <StatusBanner
          body="Your current role does not include mobile staff visibility for this organization."
          fillScreen
          tone="warning"
          title="Directory unavailable"
          variant="centered"
        />
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load people"
          variant="centered"
          onAction={() => {
            void peopleQuery.refetch();
          }}
        />
      ) : visiblePeople.length === 0 ? (
        <EmptyStateCard
          fillScreen
          body="Teammates will appear here once they're added to your organization."
          iconName="people-outline"
          title="No teammates yet"
        />
      ) : filteredPeople.length === 0 ? (
        <EmptyStateCard
          fillScreen
          body="Try a different name, email, phone, or focus area."
          iconName="search-outline"
          title="No matches"
        />
      ) : (
        <View style={styles.section}>
          {/* The directory sits straight on the page background: no card
              surface, rows aligned with the screen gutters. */}
          <View>
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
              const isSelf =
                (currentEmployeeId !== null && person.id === currentEmployeeId) ||
                (currentUserId !== null &&
                  person.userId !== null &&
                  person.userId === currentUserId);
              // Management users' profile view is manager-only; their rows stay
              // visible but don't navigate for everyone else.
              const navigable =
                isSelf || canManageEmployees || !person.managementDepartmentIds?.length;

              return (
                <AnimatedListItem index={index} key={person.id}>
                  <PersonRow
                    accessHint={canManageEmployees ? accessHint : null}
                    id={person.id}
                    employmentType={person.employmentType}
                    isLast={index === filteredPeople.length - 1}
                    name={getFullName(person)}
                    navigable={navigable}
                    orgRole={person.orgRole}
                    onPress={() => {
                      if (isSelf) {
                        router.push("/(tabs)/profile");
                        return;
                      }
                      router.push({
                        pathname: "/(tabs)/people/[id]",
                        params: { id: person.id },
                      });
                    }}
                    showStatus={canManageEmployees}
                    status={person.status}
                    subtitle={subtitle}
                  />
                </AnimatedListItem>
              );
            })}
          </View>
        </View>
      )}
      <ConfirmationModal
        body={
          profileRequestConfirmation?.request.type === "account_deletion" &&
          profileRequestConfirmation.action === "approve"
            ? "Safeguards will run before this account loses access."
            : profileRequestConfirmation?.action === "approve"
              ? "The change will be applied to this teammate's profile."
              : "The teammate's profile will stay as it is."
        }
        confirmLabel={profileRequestConfirmation?.action === "approve" ? "Approve" : "Reject"}
        confirmTone={
          profileRequestConfirmation?.request.type === "account_deletion" &&
          profileRequestConfirmation.action === "approve"
            ? "danger"
            : profileRequestConfirmation?.action === "reject"
              ? "danger"
              : "primary"
        }
        loading={resolveRequestMutation.isPending}
        onCancel={() => setProfileRequestConfirmation(null)}
        onConfirm={confirmProfileRequestAction}
        title={
          profileRequestConfirmation?.action === "approve" ? "Approve request?" : "Reject request?"
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
  return people.filter((person) => getPersonManagementDepartmentIds(person).includes(departmentId))
    .length;
}

/**
 * A circle rather than the shared `<Button iconOnly>`, which caps at 44 and
 * would sit two points shorter than the search field it lines up with.
 */
function AddPersonButton({ onPress }: { onPress: () => void }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { animatedStyle, pressHandlers, androidRipple } = usePressAnimation({
    rippleBorderless: true,
    rippleColor: mobileColors.ripplePrimary,
    scale: mobileMotion.press.iconOnlyScale,
  });

  return (
    <AnimatedPressable
      accessibilityLabel="Add person"
      accessibilityRole="button"
      android_ripple={androidRipple}
      onPress={onPress}
      {...pressHandlers}
      style={[styles.addPersonButton, animatedStyle]}
    >
      <Ionicons color={mobileColors.textInverse} name="person-add-outline" size={18} />
    </AnimatedPressable>
  );
}

function PersonRow({
  id,
  employmentType,
  name,
  navigable,
  orgRole,
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
  navigable: boolean;
  orgRole: MobileOrgRole;
  subtitle: string;
  status: MobilePerson["status"];
  accessHint: string | null;
  showStatus: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { resolvedTheme } = useThemeMode();
  const secondaryDetail = [
    employmentType === "part_time" ? "PT" : "FT",
    accessHint,
    showStatus ? formatStatusLabel(status) : null,
  ]
    .filter(Boolean)
    .join(" - ");
  const avatarTone = getAvatarTone(id, resolvedTheme === "dark");
  const orgRoleBadge = getMobileOrgRoleBadge(mobileColors, orgRole);
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?";

  return (
    <PressableRow
      accessibilityLabel={name}
      disabled={!navigable}
      onPress={onPress}
      style={[styles.personRow, !isLast && styles.personRowDivider]}
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
        <Text style={[styles.personAvatarText, { color: avatarTone.textColor }]}>{initials}</Text>
      </View>
      <View style={styles.personCopy}>
        <View style={styles.personNameRow}>
          <Text numberOfLines={1} style={styles.personName}>
            {name}
          </Text>
          {orgRoleBadge ? (
            <View style={orgRoleBadge.containerStyle}>
              <Text style={orgRoleBadge.textStyle}>{orgRoleBadge.label}</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.personSubtitle}>
          {subtitle}
        </Text>
        {secondaryDetail ? (
          <Text numberOfLines={1} style={styles.personAccess}>
            {secondaryDetail}
          </Text>
        ) : null}
      </View>
      {navigable ? (
        <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={22} />
      ) : null}
    </PressableRow>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    section: {
      gap: 10,
    },
    sectionTitle: {
      ...mobileText.label,
      color: mobileColors.textSubtle,
      textTransform: "uppercase",
    },
    searchBarRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    addPersonButton: {
      alignItems: "center",
      backgroundColor: mobileColors.brand,
      // Circular: 46 square at the pill radius, matching the search field's
      // height and the filter pill beside it.
      borderRadius: mobileRadii.pill,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    linkList: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      overflow: "hidden",
    },
    personRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: 76,
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
    personNameRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      minWidth: 0,
    },
    personName: {
      ...mobileText.cardTitle,
      color: mobileColors.textPrimary,
      flexShrink: 1,
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
