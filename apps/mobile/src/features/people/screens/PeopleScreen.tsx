import { ActionButtons } from "../../../shared/components/ActionButtons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MobileDepartment,
  MobileManagementUser,
  MobileManagementUserInviteBody,
  MobilePerson,
  MobileProfileChangeRequest,
} from "@dubgrid/contracts";
import {
  ORG_ROLE_PRIVILEGE_ORDER,
  getEffectiveOrgRole,
  getOrgRolePrivilegeRank,
} from "@dubgrid/domain";
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
import { usePressAnimation } from "../../../shared/motion/usePressAnimation";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Screen } from "../../../shared/components/Screen";
import { getScreenGutter } from "../../../shared/components/screen-layout";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { SegmentedControl } from "../../../shared/components/SegmentedControl";
import {
  getAdminProfileChangeRequests,
  getManagementUsers,
  getPeople,
  inviteMobileManagementUser,
  updateProfileChangeRequest,
} from "../../../shared/lib/api";
import { getAvatarTone, resolveAvatarSeed } from "../../../shared/lib/avatar-tone";
import { getDepartmentNames } from "../../../shared/lib/departments";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import {
  getClientFriendlyErrorMessage,
  pushClientFriendlyErrorToast,
} from "../../../shared/lib/errors";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import {
  useIsDarkMode,
  useMobileColors,
  useThemeMode,
} from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileAvatarText,
  mobileElevation,
  mobileMotion,
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { ManagementUserActionsSheet } from "../components/ManagementUserActionsSheet";
import { ManagementUserInviteSheet } from "../components/ManagementUserInviteSheet";
import { PersonListSkeleton } from "../components/PersonListSkeleton";
import { ORG_ROLE_LABELS, getMobileOrgRoleBadge } from "../lib/orgRoleBadges";
import { useAsyncAction } from "../../../shared/hooks/useAsyncAction";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type StatusFilter = "active" | "inactive";
/** Which half of the directory the list is showing, mirroring web's toggle. */
type RosterTab = "schedule" | "management";
type SortMode = "seniority" | "alphabetical" | "access";
type MobileOrgRole = "super_admin" | "admin" | "user" | null;
/** The three access states a staff row's hint prints, as a filter value. */
type PersonAppAccess = "has_access" | "invited" | "none";
type ManagementSortMode = "alphabetical" | "access";

/**
 * The two halves of the directory are different populations, so each carries
 * its own filters. Staff rows have focus areas, a certification, an employment
 * type and an active/inactive status; management rows have management
 * departments, an access level and an invitation that may still be pending.
 * Neither set says anything about the other list, so the sheet swaps with the
 * tab rather than offering filters the visible roster can't answer.
 */
type StaffFilters = {
  focusAreaId: number | "all";
  certificationId: number | "all";
  roleId: number | "all";
  employmentType: "all" | MobilePerson["employmentType"];
  appAccess: "all" | PersonAppAccess;
  orgRole: "all" | NonNullable<MobileOrgRole>;
  status: StatusFilter;
  sort: SortMode;
};

type ManagementFilters = {
  departmentId: number | "all";
  orgRole: "all" | NonNullable<MobileOrgRole>;
  invitation: "all" | MobileManagementUser["source"];
  sort: ManagementSortMode;
};

const STAFF_FILTER_DEFAULTS: StaffFilters = {
  focusAreaId: "all",
  certificationId: "all",
  roleId: "all",
  employmentType: "all",
  appAccess: "all",
  orgRole: "all",
  status: "active",
  sort: "seniority",
};

const MANAGEMENT_FILTER_DEFAULTS: ManagementFilters = {
  departmentId: "all",
  orgRole: "all",
  invitation: "all",
  sort: "alphabetical",
};

/** How many of a tab's filters sit away from their default, for the badge. */
function countActiveFilters<Filters extends object>(filters: Filters, defaults: Filters): number {
  return (Object.keys(defaults) as (keyof Filters)[]).filter(
    (key) => filters[key] !== defaults[key],
  ).length;
}
type ProfileRequestConfirmation = {
  request: MobileProfileChangeRequest;
  action: "approve" | "reject";
} | null;

function getFullName(person: MobilePerson): string {
  return `${person.firstName} ${person.lastName}`.trim() || person.email || "Unnamed person";
}

function getManagementUserName(managementUser: MobileManagementUser): string {
  return (
    `${managementUser.firstName} ${managementUser.lastName}`.trim() ||
    managementUser.email ||
    "Unnamed person"
  );
}

/** The same three states a staff row's access hint prints. */
function getPersonAppAccess(person: MobilePerson): PersonAppAccess {
  if (person.pendingInvitation) return "invited";
  return person.userId ? "has_access" : "none";
}

function countManagementUsersWithRole(
  managementUsers: MobileManagementUser[],
  role: NonNullable<MobileOrgRole>,
): number {
  return managementUsers.filter(
    (managementUser) => getEffectiveOrgRole(managementUser.orgRole) === role,
  ).length;
}

function countPeopleWithRole(people: MobilePerson[], role: NonNullable<MobileOrgRole>): number {
  return people.filter((person) => getEffectiveOrgRole(person.orgRole) === role).length;
}

type RosterItem =
  { kind: "management"; user: MobileManagementUser } | { kind: "person"; person: MobilePerson };

export default function PeopleScreen() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const bootstrapQuery = useBootstrap(accessToken);
  const [searchValue, setSearchValue] = useState("");
  const [staffFilters, setStaffFilters] = useState<StaffFilters>(STAFF_FILTER_DEFAULTS);
  const [managementFilters, setManagementFilters] = useState<ManagementFilters>(
    MANAGEMENT_FILTER_DEFAULTS,
  );
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [rosterTab, setRosterTab] = useState<RosterTab>("schedule");
  const [showInviteManagementUser, setShowInviteManagementUser] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  /** The roster row whose actions sheet is open, for rows with no staff profile. */
  const [managementUserActions, setManagementUserActions] = useState<MobileManagementUser | null>(
    null,
  );
  const [profileRequestConfirmation, setProfileRequestConfirmation] =
    useState<ProfileRequestConfirmation>(null);
  const canManageEmployees = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);
  const regularUserMode = !canManageEmployees;
  const canManageManagementAccess = Boolean(
    bootstrapQuery.data?.permissions.canManageManagementAccess,
  );
  const peopleQuery = useQuery({
    queryKey: mobileQueryKeys.people(accessToken),
    queryFn: ({ signal }) => getPeople(accessToken!, signal),
    enabled: Boolean(accessToken),
  });
  // The roster is a different union from the staff directory: it includes
  // people with no `employees` row at all, who the people endpoint can't see.
  const managementUsersQuery = useQuery({
    queryKey: mobileQueryKeys.managementUsers(accessToken),
    queryFn: ({ signal }) => getManagementUsers(accessToken!, signal),
    enabled: Boolean(accessToken) && (canManageManagementAccess || canManageEmployees),
  });
  const profileRequestsQuery = useQuery({
    queryKey: mobileQueryKeys.adminProfileChangeRequests(accessToken),
    queryFn: ({ signal }) => getAdminProfileChangeRequests(accessToken!, signal),
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
  const inviteManagementUserMutation = useMutation({
    mutationFn: (body: MobileManagementUserInviteBody) =>
      inviteMobileManagementUser(accessToken!, body),
    onSuccess: async () => {
      setShowInviteManagementUser(false);
      await managementUsersQuery.refetch();
      pushToast({
        tone: "success",
        title: "Management invitation sent",
        message: "They'll join management once they accept.",
      });
    },
    // Inline: the invite sheet stays open on failure, and it is a `<Modal>` —
    // its own native window — so a toast renders behind it and is never seen.
    onMutate: () => setInviteError(null),
    onError: (error) => {
      setInviteError(
        getClientFriendlyErrorMessage(
          error,
          "We couldn't send that management invitation right now.",
        ),
      );
    },
  });
  const manualRefresh = useManualRefresh(() =>
    Promise.all([
      peopleQuery.refetch(),
      bootstrapQuery.refetch(),
      profileRequestsQuery.refetch(),
      managementUsersQuery.refetch(),
    ]),
  );
  /** Clears the half you're looking at; the other keeps its own filters. */
  function clearFilters() {
    if (isManagementTab) {
      setManagementFilters(MANAGEMENT_FILTER_DEFAULTS);
      return;
    }
    setStaffFilters(STAFF_FILTER_DEFAULTS);
  }

  function setStaffFilter<Key extends keyof StaffFilters>(key: Key, value: StaffFilters[Key]) {
    setStaffFilters((current) => ({ ...current, [key]: value }));
  }

  function setManagementFilter<Key extends keyof ManagementFilters>(
    key: Key,
    value: ManagementFilters[Key],
  ) {
    setManagementFilters((current) => ({ ...current, [key]: value }));
  }

  function confirmProfileRequestAction(): Promise<void> | undefined {
    if (!profileRequestConfirmation) return;

    const input = {
      requestId: profileRequestConfirmation.request.id,
      action: profileRequestConfirmation.action,
    };
    setProfileRequestConfirmation(null);
    return new Promise<void>((resolve) => {
      resolveRequestMutation.mutate(input, { onSettled: () => resolve() });
    });
  }

  const focusAreaMap = useMemo(
    () =>
      new Map(
        (bootstrapQuery.data?.focusAreas ?? []).map((focusArea) => [focusArea.id, focusArea.name]),
      ),
    [bootstrapQuery.data?.focusAreas],
  );
  const certificationSearchTextById = useMemo(
    () =>
      new Map(
        (bootstrapQuery.data?.certifications ?? []).map((certification) => [
          certification.id,
          `${certification.name} ${certification.abbr}`.toLowerCase(),
        ]),
      ),
    [bootstrapQuery.data?.certifications],
  );
  const roleSearchTextById = useMemo(
    () =>
      new Map(
        (bootstrapQuery.data?.roles ?? []).map((role) => [
          role.id,
          `${role.name} ${role.abbr}`.toLowerCase(),
        ]),
      ),
    [bootstrapQuery.data?.roles],
  );
  const people = peopleQuery.data?.people ?? [];
  const profileRequests = profileRequestsQuery.data?.requests ?? [];
  const focusAreas = bootstrapQuery.data?.focusAreas ?? [];
  const certifications = bootstrapQuery.data?.certifications ?? [];
  const roles = bootstrapQuery.data?.roles ?? [];
  const useCompactRoleCertificationLabels =
    bootstrapQuery.data?.currentOrg?.useCompactRoleCertificationLabels ?? false;
  const managementDepartments = useMemo(
    () =>
      (bootstrapQuery.data?.departments ?? []).filter(
        (department) => department.type === "management",
      ),
    [bootstrapQuery.data?.departments],
  );
  // The toggle only appears where there is a second half to switch to: web
  // hides it for orgs with no management departments for the same reason.
  const canSeeManagementRoster =
    (canManageManagementAccess || canManageEmployees) && managementDepartments.length > 0;
  const managementUsers = managementUsersQuery.data?.managementUsers ?? [];
  const isManagementTab = rosterTab === "management" && canSeeManagementRoster;
  const currentUserId = bootstrapQuery.data?.user?.id ?? null;
  const currentEmployeeId = bootstrapQuery.data?.linkedEmployee?.id ?? null;
  const visiblePeople = useMemo(
    () =>
      people.filter((person) => {
        if (!canManageEmployees && person.status !== "active") return false;
        if (!regularUserMode) return true;
        return !(
          (currentEmployeeId !== null && person.id === currentEmployeeId) ||
          (currentUserId !== null && person.userId === currentUserId)
        );
      }),
    [canManageEmployees, currentEmployeeId, currentUserId, people, regularUserMode],
  );
  const filteredPeople = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    return visiblePeople
      .filter((person) => {
        const fullName = getFullName(person).toLowerCase();
        const visibleDirectoryText = [
          fullName,
          ...person.focusAreaIds.map((id) => focusAreaMap.get(id) ?? ""),
          person.certificationId == null
            ? ""
            : (certificationSearchTextById.get(person.certificationId) ?? ""),
          ...person.roleIds.map((id) => roleSearchTextById.get(id) ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        const matchesSearch = regularUserMode
          ? !normalizedSearch || visibleDirectoryText.includes(normalizedSearch)
          : !normalizedSearch ||
            fullName.includes(normalizedSearch) ||
            person.email.toLowerCase().includes(normalizedSearch) ||
            person.phone.toLowerCase().includes(normalizedSearch);

        const matchesStatus = !canManageEmployees
          ? true
          : staffFilters.status === "active"
            ? person.status === "active"
            : person.status !== "active";

        const matchesFocus =
          staffFilters.focusAreaId === "all"
            ? true
            : person.focusAreaIds.includes(staffFilters.focusAreaId);
        const matchesCertification =
          staffFilters.certificationId === "all"
            ? true
            : person.certificationId === staffFilters.certificationId;
        const matchesRole =
          staffFilters.roleId === "all" ? true : person.roleIds.includes(staffFilters.roleId);
        const matchesEmploymentType =
          regularUserMode || staffFilters.employmentType === "all"
            ? true
            : person.employmentType === staffFilters.employmentType;
        // App access is an admin-only column on the row, and an admin-only
        // filter with it: nobody else is shown the hint it filters on.
        const matchesAppAccess =
          !canManageEmployees || staffFilters.appAccess === "all"
            ? true
            : getPersonAppAccess(person) === staffFilters.appAccess;
        // Access level is admin-only for the same reason as app access above:
        // the tier it narrows on is never printed on a regular user's rows.
        // Staff with no account count as Users, so picking that tier returns
        // everyone but the admins.
        const matchesOrgRole =
          !canManageEmployees || staffFilters.orgRole === "all"
            ? true
            : getEffectiveOrgRole(person.orgRole) === staffFilters.orgRole;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesFocus &&
          matchesCertification &&
          matchesRole &&
          matchesEmploymentType &&
          matchesAppAccess &&
          matchesOrgRole
        );
      })
      .sort((left, right) => {
        if (staffFilters.sort === "alphabetical") {
          return getFullName(left).localeCompare(getFullName(right));
        }

        if (staffFilters.sort === "access") {
          const rankComparison =
            getOrgRolePrivilegeRank(left.orgRole) - getOrgRolePrivilegeRank(right.orgRole);
          if (rankComparison !== 0) {
            return rankComparison;
          }

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
    certificationSearchTextById,
    focusAreaMap,
    regularUserMode,
    roleSearchTextById,
    searchValue,
    staffFilters,
    visiblePeople,
  ]);
  const activeCount = visiblePeople.filter((person) => person.status === "active").length;
  const inactiveCount = visiblePeople.length - activeCount;
  const peopleError = peopleQuery.error ?? bootstrapQuery.error;
  const filteredManagementUsers = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    return managementUsers
      .filter((managementUser) => {
        const fullName = getManagementUserName(managementUser).toLowerCase();
        const matchesSearch =
          !normalizedSearch ||
          fullName.includes(normalizedSearch) ||
          managementUser.email.toLowerCase().includes(normalizedSearch) ||
          managementUser.phone.toLowerCase().includes(normalizedSearch);
        const matchesDepartment =
          managementFilters.departmentId === "all"
            ? true
            : managementUser.managementDepartmentIds.includes(managementFilters.departmentId);
        const matchesOrgRole =
          managementFilters.orgRole === "all"
            ? true
            : getEffectiveOrgRole(managementUser.orgRole) === managementFilters.orgRole;
        const matchesInvitation =
          managementFilters.invitation === "all"
            ? true
            : managementUser.source === managementFilters.invitation;
        return matchesSearch && matchesDepartment && matchesOrgRole && matchesInvitation;
      })
      .sort((left, right) => {
        if (managementFilters.sort === "access") {
          const rankComparison =
            getOrgRolePrivilegeRank(left.orgRole) - getOrgRolePrivilegeRank(right.orgRole);
          if (rankComparison !== 0) {
            return rankComparison;
          }
        }

        return getManagementUserName(left).localeCompare(getManagementUserName(right));
      });
  }, [managementFilters, managementUsers, searchValue]);
  // The badge counts the filters the sheet is currently showing, so it never
  // reports a count against a list those filters aren't touching.
  const activeFilterCount = isManagementTab
    ? countActiveFilters(managementFilters, MANAGEMENT_FILTER_DEFAULTS)
    : regularUserMode
      ? [
          staffFilters.focusAreaId !== "all",
          staffFilters.certificationId !== "all",
          staffFilters.roleId !== "all",
          staffFilters.sort !== STAFF_FILTER_DEFAULTS.sort,
        ].filter(Boolean).length
      : countActiveFilters(staffFilters, STAFF_FILTER_DEFAULTS);
  const contentState = useMobileContentState({
    // Bootstrap is in both halves. `canManageEmployees` decides which people
    // are visible at all, so clearing the skeleton on the people query alone
    // shows a list that then rewrites itself when bootstrap lands.
    //
    // The roster is folded in the same way, but only once bootstrap says the
    // viewer can see it — naming a disabled query here unconditionally would
    // pin `hasData` false forever, since a disabled query never resolves.
    hasData:
      peopleQuery.data !== undefined &&
      bootstrapQuery.data !== undefined &&
      (!canSeeManagementRoster || managementUsersQuery.data !== undefined),
    isLoading: peopleQuery.isLoading || bootstrapQuery.isLoading || managementUsersQuery.isLoading,
    error: peopleError,
  });

  // The roster is virtualized (F-04): rows mount only near the viewport
  // instead of the whole organization at once. Both tabs share one list;
  // the search, filters, tab strip and requests stay as the list header.
  const rosterItems = useMemo<RosterItem[]>(() => {
    if (contentState.kind !== "ready") return [];
    return isManagementTab
      ? filteredManagementUsers.map((user) => ({ kind: "management" as const, user }))
      : filteredPeople.map((person) => ({ kind: "person" as const, person }));
  }, [contentState.kind, filteredManagementUsers, filteredPeople, isManagementTab]);

  const renderRosterItem = (item: RosterItem, index: number) => {
    const isLast = index === rosterItems.length - 1;
    if (item.kind === "management") {
      const managementUser = item.user;
      const isSelf = Boolean(
        currentUserId && managementUser.userId && managementUser.userId === currentUserId,
      );
      const departmentNames = getDepartmentNames(
        managementUser.managementDepartmentIds,
        managementDepartments,
      );
      return (
        <View style={styles.rosterRow}>
          <PersonRow
            id={managementUser.id}
            avatarSeed={resolveAvatarSeed({
              userId: managementUser.userId,
              id: managementUser.id,
            })}
            isLast={isLast}
            name={getManagementUserName(managementUser)}
            navigable
            orgRole={managementUser.orgRole}
            onPress={() => {
              // Every row opens the one profile page there is. Your own goes
              // to the profile tab, which owns the only page that can edit
              // you; everyone else's opens their staff profile, which carries
              // their management access along with the rest of their record.
              if (isSelf) {
                router.push("/(tabs)/profile");
                return;
              }
              if (managementUser.employeeId) {
                router.push({
                  pathname: "/person/[id]",
                  params: { id: managementUser.employeeId },
                });
                return;
              }
              // No staff profile to open: a management-only invitation has no
              // `employees` row until it is accepted. Its actions come up here.
              setManagementUserActions(managementUser);
            }}
            subtitle={departmentNames.join(", ") || managementUser.email || "No departments"}
          />
        </View>
      );
    }
    const person = item.person;
    const focusAreasForPerson = person.focusAreaIds
      .map((focusAreaId) => focusAreaMap.get(focusAreaId) ?? null)
      .filter((value): value is string => Boolean(value));
    const subtitle =
      focusAreasForPerson.length > 0
        ? focusAreasForPerson.join(", ")
        : canManageEmployees
          ? person.email || person.phone || "No contact on file"
          : "No focus area";
    const isSelf =
      (currentEmployeeId !== null && person.id === currentEmployeeId) ||
      (currentUserId !== null && person.userId !== null && person.userId === currentUserId);
    // Management users' profile view is manager-only; their rows stay visible
    // but don't navigate for everyone else.
    const navigable = isSelf || canManageEmployees || !person.managementDepartmentIds?.length;
    return (
      <View style={styles.rosterRow}>
        <PersonRow
          id={person.id}
          avatarSeed={resolveAvatarSeed(person)}
          isLast={isLast}
          name={getFullName(person)}
          navigable={navigable}
          orgRole={person.orgRole}
          onPress={() => {
            if (isSelf) {
              router.push("/(tabs)/profile");
              return;
            }
            router.push({
              pathname: "/person/[id]",
              params: { id: person.id },
            });
          }}
          subtitle={subtitle}
        />
      </View>
    );
  };

  return (
    <Screen
      // The only field here is the search bar at the top, which the keyboard
      // never covers. Insetting for it just collapses the large title and
      // jumps the page open.
      adjustsForKeyboard={false}
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      // A skeleton is a placeholder, not content: it must not scroll. Empty and
      // error states stay scrollable so the large title can still collapse and
      // pull-to-refresh keeps working.
      scrollEnabled={contentState.kind !== "loading"}
      list={{
        data: rosterItems,
        keyExtractor: (item) => (item.kind === "management" ? `m-${item.user.id}` : item.person.id),
        renderItem: renderRosterItem,
      }}
    >
      <FilterSheet
        clearDisabled={activeFilterCount === 0}
        title={isManagementTab ? "Filter management" : "Filter staff"}
        onClearAll={clearFilters}
        onDismiss={() => setIsFilterModalVisible(false)}
        onDone={() => setIsFilterModalVisible(false)}
        visible={isFilterModalVisible}
      >
        {canSeeManagementRoster ? (
          <View style={styles.rosterTabs}>
            <SegmentedControl
              accessibilityLabel="Directory section"
              onChange={setRosterTab}
              options={[
                { value: "schedule", label: "Schedule", count: visiblePeople.length },
                { value: "management", label: "Management", count: managementUsers.length },
              ]}
              value={rosterTab}
            />
          </View>
        ) : null}
        {isManagementTab ? (
          <>
            <SelectionSection label="Management department">
              <SelectionRow
                label="All management departments"
                onPress={() => setManagementFilter("departmentId", "all")}
                selected={managementFilters.departmentId === "all"}
              />
              {managementDepartments.map((department) => (
                <SelectionRow
                  key={department.id}
                  detail={`${countManagementUsersInDepartment(managementUsers, department.id)} people`}
                  label={department.name}
                  onPress={() => setManagementFilter("departmentId", department.id)}
                  selected={managementFilters.departmentId === department.id}
                />
              ))}
            </SelectionSection>

            <SelectionSection label="Access level">
              <SelectionRow
                label="All access levels"
                onPress={() => setManagementFilter("orgRole", "all")}
                selected={managementFilters.orgRole === "all"}
              />
              {ORG_ROLE_PRIVILEGE_ORDER.map((role) => (
                <SelectionRow
                  key={role}
                  detail={`${countManagementUsersWithRole(managementUsers, role)} people`}
                  label={ORG_ROLE_LABELS[role]}
                  onPress={() => setManagementFilter("orgRole", role)}
                  selected={managementFilters.orgRole === role}
                />
              ))}
            </SelectionSection>

            <SelectionSection label="Invitation">
              <SelectionRow
                label="Everyone"
                onPress={() => setManagementFilter("invitation", "all")}
                selected={managementFilters.invitation === "all"}
              />
              <SelectionRow
                label="Has access"
                onPress={() => setManagementFilter("invitation", "member")}
                selected={managementFilters.invitation === "member"}
              />
              <SelectionRow
                label="Invitation pending"
                onPress={() => setManagementFilter("invitation", "pending_invite")}
                selected={managementFilters.invitation === "pending_invite"}
              />
            </SelectionSection>

            <SelectionSection label="Sort by">
              <SelectionRow
                label="Alphabetical"
                onPress={() => setManagementFilter("sort", "alphabetical")}
                selected={managementFilters.sort === "alphabetical"}
              />
              <SelectionRow
                label="Access level"
                onPress={() => setManagementFilter("sort", "access")}
                selected={managementFilters.sort === "access"}
              />
            </SelectionSection>
          </>
        ) : (
          <>
            <SelectionSection label="Focus area">
              <SelectionRow
                label="All focus areas"
                onPress={() => setStaffFilter("focusAreaId", "all")}
                selected={staffFilters.focusAreaId === "all"}
              />
              {focusAreas.map((focusArea) => (
                <SelectionRow
                  key={focusArea.id}
                  label={focusArea.name}
                  onPress={() => setStaffFilter("focusAreaId", focusArea.id)}
                  selected={staffFilters.focusAreaId === focusArea.id}
                />
              ))}
            </SelectionSection>

            {certifications.length > 0 ? (
              <SelectionSection label="Certification">
                <SelectionRow
                  label="All certifications"
                  onPress={() => setStaffFilter("certificationId", "all")}
                  selected={staffFilters.certificationId === "all"}
                />
                {certifications.map((certification) => (
                  <SelectionRow
                    key={certification.id}
                    label={
                      useCompactRoleCertificationLabels
                        ? certification.abbr || certification.name
                        : certification.name
                    }
                    onPress={() => setStaffFilter("certificationId", certification.id)}
                    selected={staffFilters.certificationId === certification.id}
                  />
                ))}
              </SelectionSection>
            ) : null}

            {regularUserMode && roles.length > 0 ? (
              <SelectionSection label="Role">
                <SelectionRow
                  label="All roles"
                  onPress={() => setStaffFilter("roleId", "all")}
                  selected={staffFilters.roleId === "all"}
                />
                {roles.map((role) => (
                  <SelectionRow
                    key={role.id}
                    label={useCompactRoleCertificationLabels ? role.abbr || role.name : role.name}
                    onPress={() => setStaffFilter("roleId", role.id)}
                    selected={staffFilters.roleId === role.id}
                  />
                ))}
              </SelectionSection>
            ) : null}

            {canManageEmployees ? (
              <SelectionSection label="Employment type">
                <SelectionRow
                  label="All employment types"
                  onPress={() => setStaffFilter("employmentType", "all")}
                  selected={staffFilters.employmentType === "all"}
                />
                <SelectionRow
                  label="Full-time"
                  onPress={() => setStaffFilter("employmentType", "full_time")}
                  selected={staffFilters.employmentType === "full_time"}
                />
                <SelectionRow
                  label="Part-time"
                  onPress={() => setStaffFilter("employmentType", "part_time")}
                  selected={staffFilters.employmentType === "part_time"}
                />
              </SelectionSection>
            ) : null}

            {canManageEmployees ? (
              <SelectionSection label="App access">
                <SelectionRow
                  label="All access"
                  onPress={() => setStaffFilter("appAccess", "all")}
                  selected={staffFilters.appAccess === "all"}
                />
                <SelectionRow
                  label="Has app access"
                  onPress={() => setStaffFilter("appAccess", "has_access")}
                  selected={staffFilters.appAccess === "has_access"}
                />
                <SelectionRow
                  label="Invitation pending"
                  onPress={() => setStaffFilter("appAccess", "invited")}
                  selected={staffFilters.appAccess === "invited"}
                />
                <SelectionRow
                  label="No app access"
                  onPress={() => setStaffFilter("appAccess", "none")}
                  selected={staffFilters.appAccess === "none"}
                />
              </SelectionSection>
            ) : null}

            {canManageEmployees ? (
              <SelectionSection label="Access level">
                <SelectionRow
                  label="All access levels"
                  onPress={() => setStaffFilter("orgRole", "all")}
                  selected={staffFilters.orgRole === "all"}
                />
                {ORG_ROLE_PRIVILEGE_ORDER.map((role) => (
                  <SelectionRow
                    key={role}
                    detail={`${countPeopleWithRole(visiblePeople, role)} people`}
                    label={ORG_ROLE_LABELS[role]}
                    onPress={() => setStaffFilter("orgRole", role)}
                    selected={staffFilters.orgRole === role}
                  />
                ))}
              </SelectionSection>
            ) : null}

            {canManageEmployees ? (
              <SelectionSection label="Status">
                <SelectionRow
                  detail={`${activeCount} people`}
                  label="Active staff"
                  onPress={() => setStaffFilter("status", "active")}
                  selected={staffFilters.status === "active"}
                />
                <SelectionRow
                  detail={`${inactiveCount} people`}
                  label="Inactive staff"
                  onPress={() => setStaffFilter("status", "inactive")}
                  selected={staffFilters.status === "inactive"}
                />
              </SelectionSection>
            ) : null}

            <SelectionSection label="Sort by">
              <SelectionRow
                label="Seniority"
                onPress={() => setStaffFilter("sort", "seniority")}
                selected={staffFilters.sort === "seniority"}
              />
              <SelectionRow
                label="Alphabetical"
                onPress={() => setStaffFilter("sort", "alphabetical")}
                selected={staffFilters.sort === "alphabetical"}
              />
              {canManageEmployees ? (
                <SelectionRow
                  label="Access level"
                  onPress={() => setStaffFilter("sort", "access")}
                  selected={staffFilters.sort === "access"}
                />
              ) : null}
            </SelectionSection>
          </>
        )}
      </FilterSheet>

      <View style={styles.section}>
        <View style={styles.searchBarRow}>
          <SearchBar
            accessibilityLabel="Search people"
            onChangeText={setSearchValue}
            placeholder={isManagementTab ? "Search management" : "Search people"}
            value={searchValue}
          />
          <FilterButton
            accessibilityLabel="Open people filters and sort"
            activeCount={activeFilterCount}
            expanded={isFilterModalVisible}
            onPress={() => setIsFilterModalVisible(true)}
          />
          {isManagementTab ? (
            canManageManagementAccess ? (
              <AddPersonButton
                accessibilityLabel="Invite management user"
                onPress={() => setShowInviteManagementUser(true)}
              />
            ) : null
          ) : canManageEmployees ? (
            <AddPersonButton
              accessibilityLabel="Add person"
              onPress={() => router.push("/people/add")}
            />
          ) : null}
        </View>
      </View>

      {canManageEmployees && profileRequests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>People requests</Text>
          <View style={styles.linkList}>
            <View style={styles.linkListClip}>
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
                      {request.type === "account_deletion" ? "Account deletion" : "Profile update"}
                    </Text>
                  </View>
                  <ActionButtons
                    primaryAction={
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
                    }
                    style={styles.requestActions}
                  >
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
                  </ActionButtons>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <PersonListSkeleton />
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
      ) : isManagementTab ? (
        managementUsers.length === 0 ? (
          <EmptyStateCard
            fillScreen
            body="Nobody has management access yet. Invite someone, or add a teammate to management from their staff profile."
            iconName="briefcase-outline"
            title="No management users yet"
          />
        ) : filteredManagementUsers.length === 0 ? (
          <EmptyStateCard
            fillScreen
            body="Try a different name, email, department, or access level."
            iconName="search-outline"
            title="No matches"
          />
        ) : null
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
          body={
            regularUserMode
              ? "Try a different name, focus area, certification, or role."
              : "Try a different name, email, phone, focus area, certification, or role."
          }
          iconName="search-outline"
          title="No matches"
        />
      ) : null}
      <ManagementUserActionsSheet
        managementDepartments={managementDepartments}
        managementUser={managementUserActions}
        onDismiss={() => setManagementUserActions(null)}
      />

      <ManagementUserInviteSheet
        error={inviteError}
        isPending={inviteManagementUserMutation.isPending}
        managementDepartments={managementDepartments}
        onDismiss={() => {
          setInviteError(null);
          setShowInviteManagementUser(false);
        }}
        onSubmit={(body) =>
          new Promise<void>((resolve) => {
            inviteManagementUserMutation.mutate(body, { onSettled: () => resolve() });
          })
        }
        visible={showInviteManagementUser}
      />
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

function countManagementUsersInDepartment(
  managementUsers: MobileManagementUser[],
  departmentId: MobileDepartment["id"],
): number {
  return managementUsers.filter((managementUser) =>
    managementUser.managementDepartmentIds.includes(departmentId),
  ).length;
}

/**
 * A circle rather than the shared `<Button iconOnly>`, which caps at 44 and
 * would sit two points shorter than the search field it lines up with.
 */
function AddPersonButton({
  accessibilityLabel,
  onPress,
}: {
  accessibilityLabel: string;
  onPress: () => unknown;
}) {
  // Latched like every other press handler, so this stays safe if it is ever
  // pointed at something that files a request rather than opening a screen.
  const action = useAsyncAction(onPress);
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const { animatedStyle, pressHandlers, androidRipple } = usePressAnimation({
    rippleBorderless: true,
    rippleColor: mobileColors.ripplePrimary,
    scale: mobileMotion.press.iconOnlyScale,
  });

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={androidRipple}
      onPress={action.run}
      {...pressHandlers}
      style={[styles.addPersonButton, animatedStyle]}
    >
      <Ionicons color={mobileColors.textInverse} name="person-add-outline" size={18} />
    </AnimatedPressable>
  );
}

function PersonRow({
  id,
  avatarSeed,
  name,
  navigable,
  orgRole,
  subtitle,
  isLast,
  onPress,
}: {
  id: string;
  /** Prefers the linked account id, so a person keeps one color across apps. */
  avatarSeed: string;
  name: string;
  navigable: boolean;
  orgRole: MobileOrgRole;
  subtitle: string;
  isLast: boolean;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const { resolvedTheme } = useThemeMode();
  const avatarTone = getAvatarTone(avatarSeed, resolvedTheme === "dark");
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
        <Text fit="fixed" style={[styles.personAvatarText, { color: avatarTone.textColor }]}>
          {initials}
        </Text>
      </View>
      <View style={styles.personCopy}>
        <View style={styles.personNameRow}>
          <Text numberOfLines={1} style={styles.personName}>
            {name}
          </Text>
          {orgRoleBadge ? (
            <View style={orgRoleBadge.containerStyle}>
              <MaterialCommunityIcons
                color={orgRoleBadge.textStyle.color}
                name={orgRoleBadge.icon === "crown" ? "crown" : "star"}
                size={13}
              />
              <Text fit="compact" style={orgRoleBadge.textStyle}>
                {orgRoleBadge.label}
              </Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.personSubtitle}>
          {subtitle}
        </Text>
      </View>
      {navigable ? (
        <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={22} />
      ) : null}
    </PressableRow>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    section: {
      gap: mobileSpace.md,
    },
    // The directory sits straight on the page background: no card surface,
    // rows aligned with the screen gutters (list items sit outside the
    // header's padded content, so each row pads itself).
    rosterRow: {
      paddingHorizontal: getScreenGutter(),
    },
    sectionTitle: {
      ...mobileTextWeighted("sectionTitle", "medium"),
      color: mobileColors.textSubtle,
      paddingHorizontal: mobileSpace.lg,
      // Air above a title that follows another section's card; the card's
      // own gap below the title stays at the section's `gap`.
      paddingTop: mobileSpace.sm,
    },
    searchBarRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
    },
    rosterTabs: {
      // The control sizes to its own labels, so it needs a start-aligned row
      // rather than stretching across the gutter. The sheet body's own `gap`
      // spaces it from the sections below.
      alignItems: "flex-start",
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
    // The clip sits on an inner view: iOS drops a view's own shadow when the
    // same view clips its children.
    linkList: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      ...mobileElevation("card", isDark),
    },
    linkListClip: {
      overflow: "hidden",
      borderRadius: mobileRadii.card - 1,
    },
    personRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
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
      paddingVertical: mobileSpace.md,
    },
    requestCopy: {
      gap: mobileSpace.xs,
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
      ...mobileAvatarText(44),
    },
    personCopy: {
      flex: 1,
      gap: mobileSpace.xs,
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
  });
