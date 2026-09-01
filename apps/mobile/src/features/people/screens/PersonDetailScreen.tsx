import { useEffect, useMemo, useState } from "react";
import {
  Linking,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapResponse,
  MobileBootstrapRole,
  MobileFocusArea,
  MobileNamedItem,
  MobilePerson,
  MobilePersonUpdateBody,
} from "@dubgrid/contracts";
import {
  getOptionalStaffEmailError,
  getStaffNameError,
  getStaffNotesError,
  getOptionalUsPhoneError,
  normalizeOptionalStaffEmail,
  normalizeOptionalUsPhone,
  normalizeStaffName,
  normalizeStaffNotes,
} from "@dubgrid/contracts";
import { BottomSheetModal, SheetHeader } from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { Chip } from "../../../shared/components/Chip";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { SelectionRow, SelectionSection } from "../../../shared/components/FilterSheet";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import {
  createMobilePersonInvitation,
  getMobilePerson,
  parseMobileAccountLinkChallenge,
  removeMobilePersonManagementAccess,
  resendMobilePersonInvitation,
  revokeMobilePersonInvitation,
  updateMobilePerson,
  updateMobilePersonManagementAccess,
  updateMobilePersonStatus,
  type MobileAccountLinkChallenge,
} from "../../../shared/lib/api";
import { getAvatarTone } from "../../../shared/lib/avatar-tone";
import {
  getDepartmentNames,
  getScheduledDepartmentNames,
  MANAGEMENT_DEPARTMENT_LABELS,
} from "../../../shared/lib/departments";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { singularLabelNoun } from "../../../shared/lib/labels";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useNavigationDiscardGuard } from "../../../shared/hooks/useNavigationDiscardGuard";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileIconToneColor,
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  mobileTypography,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  getProfileInitials,
  ProfileActionRow,
  ProfileActionStack,
  ProfileChoiceGroup,
  ProfileHero,
  ProfileHeroFacts,
  ProfileHeroFactsRow,
  ProfileInfoRow,
  ProfileList,
  ProfilePanel,
  ProfileQuickActions,
  ProfileSection,
  ProfileTextInput,
} from "../../profile/components/ProfilePrimitives";
import { isRoleCertificationBlocked } from "../../profile/lib/role-certification";
import { ProfileSkeleton } from "../../profile/components/ProfileSkeleton";
import { getMobileOrgRoleHeroBadge } from "../lib/orgRoleBadges";
import {
  hasManagementAccess,
  ManagementAccessSheet,
  type ManagementAccessDraft,
} from "../components/ManagementAccessSheet";

type ConfirmAction = "deactivate" | "activate" | "remove" | null;
type InvitationConfirmAction = "create" | "resend" | "revoke" | null;
/**
 * Which way the one Deactivate button ends up going. Web asks the same question
 * in the same place (EmployeeStatusActions' unified confirm) rather than
 * spending two peer buttons on it, and the primary action's verb and tone
 * follow the answer.
 */
type DeactivateOutcome = "inactive" | "remove";

type EditDraft = {
  firstName: string;
  lastName: string;
  employmentType: MobilePerson["employmentType"];
  phone: string;
  email: string;
  contactNotes: string;
  certificationId: number | null;
  focusAreaIds: number[];
  roleIds: number[];
  departmentIds: number[];
};

function getFullName(person: MobilePerson): string {
  return `${person.firstName} ${person.lastName}`.trim() || person.email || "Unnamed person";
}

function formatStatusLabel(status: MobilePerson["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function makeDraft(person: MobilePerson): EditDraft {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    employmentType: person.employmentType,
    phone: person.phone,
    email: person.email,
    contactNotes: person.contactNotes,
    certificationId: person.certificationId,
    focusAreaIds: person.focusAreaIds,
    roleIds: person.roleIds,
    departmentIds: person.departmentIds,
  };
}

/**
 * Whether the draft differs from the saved person.
 *
 * Module scope, and used by both the edit panel's buttons and the screen's
 * unsaved-changes guard. While this lived inside the panel the screen couldn't
 * see it, so back navigation had no idea there was anything to lose; computing
 * it twice would be worse still, because then Cancel and the back button could
 * disagree about whether to ask.
 */
function personDraftHasChanges(draft: EditDraft, person: MobilePerson): boolean {
  const saved = makeDraft(person);

  return (
    draft.firstName.trim() !== saved.firstName ||
    draft.lastName.trim() !== saved.lastName ||
    draft.employmentType !== saved.employmentType ||
    draft.phone.trim() !== saved.phone ||
    draft.email.trim() !== saved.email ||
    draft.contactNotes !== saved.contactNotes ||
    draft.certificationId !== saved.certificationId ||
    !sameIds(draft.focusAreaIds, saved.focusAreaIds) ||
    !sameIds(draft.roleIds, saved.roleIds) ||
    !sameIds(draft.departmentIds, saved.departmentIds)
  );
}

export default function PersonDetailScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const isDark = useIsDarkMode();
  const params = useLocalSearchParams<{ id?: string }>();
  const personId = Array.isArray(params.id) ? params.id[0] : params.id;
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const canManageEmployees = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);
  // A person's own employee record belongs to the Profile tab. Resolve that
  // from bootstrap before enabling this query so a pasted /person/[id] URL
  // cannot briefly fetch and render the duplicate teammate-profile surface.
  const currentEmployeeId = bootstrapQuery.data?.linkedEmployee?.id ?? null;
  const isSelfRoute = Boolean(personId && currentEmployeeId && personId === currentEmployeeId);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  /** The person the draft was last built from, so the sync below runs once. */
  const [draftSource, setDraftSource] = useState<MobilePerson | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [deactivateOutcome, setDeactivateOutcome] = useState<DeactivateOutcome>("inactive");
  const [invitationConfirmAction, setInvitationConfirmAction] =
    useState<InvitationConfirmAction>(null);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [inactiveNote, setInactiveNote] = useState("");
  const [accountLinkChallenge, setAccountLinkChallenge] =
    useState<MobileAccountLinkChallenge | null>(null);
  const [showManagementAccess, setShowManagementAccess] = useState(false);
  const [isCompactTitleVisible, setIsCompactTitleVisible] = useState(false);

  const personQuery = useQuery({
    queryKey: ["mobile", "person", accessToken, personId],
    queryFn: () => getMobilePerson(accessToken!, personId!),
    enabled: Boolean(accessToken && personId && bootstrapQuery.data && !isSelfRoute),
  });
  const manualRefresh = useManualRefresh(() =>
    Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]),
  );
  // Super-admin/gridmaster only, the same bar web holds management access
  // behind — it is not one of the admin permissions.
  const canManageManagementAccess = Boolean(
    bootstrapQuery.data?.permissions.canManageManagementAccess,
  );
  const currentUserId = bootstrapQuery.data?.user?.id ?? null;
  const rawPerson = personQuery.data?.person ?? null;
  const person =
    rawPerson && (canManageEmployees || rawPerson.status === "active") ? rawPerson : null;
  const isSelf =
    isSelfRoute || Boolean(currentUserId && person?.userId && person.userId === currentUserId);
  const canEdit = canManageEmployees && person?.status !== "removed";
  const contentState = useMobileContentState({
    // Bootstrap belongs in both halves, not just `isLoading`. `person` above is
    // gated on `canManageEmployees`, which comes from bootstrap: with only the
    // person query resolved, an inactive teammate reads as null and the screen
    // renders "Person not found" until bootstrap lands and corrects it.
    hasData: personQuery.data !== undefined && bootstrapQuery.data !== undefined,
    isLoading: personQuery.isLoading || bootstrapQuery.isLoading,
    error: personQuery.error ?? bootstrapQuery.error,
  });

  useEffect(() => {
    if (isSelf) {
      router.replace("/(tabs)/profile");
    }
  }, [isSelf]);

  // Adjusted during render, not in an effect. An effect runs *after* the
  // browser paints, so on the frame where `person` first arrived the draft was
  // still null and the screen below rendered "Person not found" before
  // correcting itself — a flash on every single load. Setting state during
  // render makes React discard this pass and re-run immediately, before
  // anything reaches the screen.
  //
  // Only keys off the person's identity: every path that leaves `editing`
  // (save, cancel, discard) already rebuilds the draft itself, so there is
  // nothing to re-sync on that transition.
  if (person && !editing && person !== draftSource) {
    setDraftSource(person);
    setDraft(makeDraft(person));
    setInactiveNote(person.statusNote);
  }

  const maps = useMemo(() => buildLookupMaps(bootstrapQuery.data), [bootstrapQuery.data]);
  const useCompactRoleCertificationLabels =
    bootstrapQuery.data?.currentOrg?.useCompactRoleCertificationLabels ?? false;
  // Declared up here rather than with the other labels below because
  // `handleSave` names it in a validation message.
  const focusAreaLabel = bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Areas";

  function updateCachedPerson(nextPerson: MobilePerson) {
    queryClient.setQueryData(["mobile", "person", accessToken, nextPerson.id], {
      person: nextPerson,
    });
    queryClient.setQueryData(
      ["mobile", "people", accessToken],
      (current: { people: MobilePerson[] } | undefined) =>
        current
          ? {
              people: current.people.map((item) => (item.id === nextPerson.id ? nextPerson : item)),
            }
          : current,
    );
  }

  const updateMutation = useMutation({
    mutationFn: async (body: MobilePersonUpdateBody) =>
      updateMobilePerson(accessToken!, personId!, body),
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not save person",
        fallbackMessage: "We couldn't save those staff details right now.",
      });
    },
    onSuccess: async (result) => {
      updateCachedPerson(result.person);
      setEditing(false);
      setDraft(makeDraft(result.person));
      await Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]);
      pushToast({
        tone: "success",
        title: "Person saved",
        message: "Staff details were updated.",
      });
    },
  });
  const statusMutation = useMutation({
    mutationFn: async (input: {
      action: "deactivate" | "activate" | "remove";
      note?: string;
      expectedVersion: number;
    }) =>
      updateMobilePersonStatus(accessToken!, personId!, {
        action: input.action,
        expectedVersion: input.expectedVersion,
        note: input.note,
      }),
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update status",
        fallbackMessage: "We couldn't update that teammate right now.",
      });
    },
    onSuccess: async (result, variables) => {
      updateCachedPerson(result.person);
      setConfirmAction(null);
      setDeactivateOutcome("inactive");
      setInactiveNote("");
      await Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]);
      pushToast({
        tone: "success",
        title:
          variables.action === "activate"
            ? "Person activated"
            : variables.action === "deactivate"
              ? "Person marked inactive"
              : "Person removed",
        message: "Staff status was updated.",
      });
    },
  });
  const invitationMutation = useMutation({
    mutationFn: async (input: {
      action: "create" | "resend" | "revoke";
      linkExistingAccount?: boolean;
      reconcileName?: boolean;
    }) => {
      if (!person) throw new Error("Person unavailable");
      if (input.action === "create") {
        return createMobilePersonInvitation(accessToken!, person.id, {
          email: person.email,
          linkExistingAccount: input.linkExistingAccount,
          reconcileName: input.reconcileName,
        });
      }
      if (!person.pendingInvitation) {
        throw new Error("Invitation unavailable");
      }
      const body = {
        invitationId: person.pendingInvitation.id,
        expectedUpdatedAt: person.pendingInvitation.updatedAt,
      };
      return input.action === "resend"
        ? resendMobilePersonInvitation(accessToken!, person.id, body)
        : revokeMobilePersonInvitation(accessToken!, person.id, body);
    },
    onError: (error) => {
      const challenge = parseMobileAccountLinkChallenge(error);
      if (challenge) {
        setInvitationConfirmAction(null);
        setAccountLinkChallenge(challenge);
        return;
      }
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update invitation",
        fallbackMessage: "We couldn't update that invitation right now.",
      });
    },
    onSuccess: async (result, variables) => {
      updateCachedPerson(result.person);
      setAccountLinkChallenge(null);
      setInvitationConfirmAction(null);
      await Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]);
      const title =
        result.result === "account_linked"
          ? "Account linked"
          : variables.action === "create"
            ? "Invitation sent"
            : variables.action === "resend"
              ? "Invitation resent"
              : "Invitation revoked";
      const message =
        result.result === "account_linked"
          ? "Existing app access was linked to this staff profile."
          : "Staff access was updated.";
      pushToast({
        tone: "success",
        title,
        message,
      });
    },
  });

  const managementAccessMutation = useMutation({
    mutationFn: async (input: { draft: ManagementAccessDraft } | { remove: true }) => {
      if (!person) throw new Error("Person unavailable");
      const guards = {
        expectedMembershipUpdatedAt: person.membershipUpdatedAt,
        expectedInvitationUpdatedAt: person.pendingInvitation?.updatedAt ?? null,
      };
      return "remove" in input
        ? removeMobilePersonManagementAccess(accessToken!, person.id, guards)
        : updateMobilePersonManagementAccess(accessToken!, person.id, {
            ...guards,
            orgRole: input.draft.orgRole,
            managementDepartmentIds: input.draft.managementDepartmentIds,
            email: person.email || undefined,
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
      updateCachedPerson(result.person);
      setShowManagementAccess(false);
      await Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]);
      pushToast({
        tone: "success",
        title:
          result.result === "access_removed"
            ? "Management access removed"
            : result.result === "invitation_sent"
              ? "Management invitation sent"
              : "Management access updated",
        message:
          result.result === "invitation_sent"
            ? "They'll join management once they accept."
            : "Their management access was updated.",
      });
    },
  });

  const hasChanges = Boolean(draft && person && personDraftHasChanges(draft, person));
  // `editing && hasChanges`, not just `editing`: on iOS the whole screen is a
  // back-swipe target, so a guard that fired for an untouched open panel would
  // put a confirmation in front of an ordinary swipe back.
  const guard = useUnsavedChangesGuard({
    isDirty: editing && hasChanges,
    disabled: updateMutation.isPending,
    onDiscard: () => {
      if (person) setDraft(makeDraft(person));
    },
    onClose: () => setEditing(false),
  });
  // Header back, Android hardware back and the iOS back swipe ask too, through
  // this same confirmation rather than a second one of their own.
  useNavigationDiscardGuard(guard);

  function handleSave() {
    if (!person || !draft) return;
    const firstNameError = getStaffNameError(draft.firstName, "First name");
    const lastNameError = getStaffNameError(draft.lastName, "Last name");
    const emailError = getOptionalStaffEmailError(draft.email);
    const phoneError = getOptionalUsPhoneError(draft.phone);
    const notesError = getStaffNotesError(draft.contactNotes);
    // Someone with management access doesn't need at least one focus area to
    // fall back on — they can come off the schedule entirely and keep managing.
    const hasManagementAccess = person.managementDepartmentIds.length > 0;
    if (
      firstNameError ||
      lastNameError ||
      emailError ||
      phoneError ||
      notesError ||
      (draft.focusAreaIds.length === 0 && !hasManagementAccess)
    ) {
      pushToast({
        title: "Check required fields",
        message:
          firstNameError ??
          lastNameError ??
          emailError ??
          phoneError ??
          notesError ??
          `Select at least one ${singularLabelNoun(focusAreaLabel)}.`,
        tone: "warning",
      });
      return;
    }

    setShowSaveConfirmation(true);
  }

  function confirmSave() {
    if (!person || !draft) return;

    setShowSaveConfirmation(false);
    updateMutation.mutate({
      expectedVersion: person.version,
      firstName: normalizeStaffName(draft.firstName),
      lastName: normalizeStaffName(draft.lastName),
      employmentType: draft.employmentType,
      phone: normalizeOptionalUsPhone(draft.phone),
      email: normalizeOptionalStaffEmail(draft.email),
      contactNotes: normalizeStaffNotes(draft.contactNotes),
      certificationId: draft.certificationId,
      focusAreaIds: draft.focusAreaIds,
      roleIds: draft.roleIds,
      departmentIds: draft.departmentIds,
    });
  }

  function handlePersonScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // Keep the hero as the identity at rest. Once it begins to pass under the
    // native bar, UIKit's scroll-edge effect takes over and the compact title
    // gives the page a stable identity. A small threshold prevents the title
    // flickering during the scroll view's elastic resting bounce.
    const nextVisible = event.nativeEvent.contentOffset.y > 12;
    setIsCompactTitleVisible((visible) => (visible === nextVisible ? visible : nextVisible));
  }

  if (isSelf) {
    return <Screen bottomPaddingMode="tabbed" scrollEnabled={false} />;
  }

  if (contentState.kind === "loading") {
    return (
      <Screen
        bottomPaddingMode="tabbed"
        onRefresh={manualRefresh.refresh}
        refreshing={manualRefresh.isRefreshing}
      >
        {/* Nothing at all for a blip: a skeleton that appears and vanishes
            inside a few frames reads as a glitch, not as loading. */}
        {contentState.showSkeleton ? (
          <ProfileSkeleton
            heroAlign="center"
            heroChips={2}
            metaItems={0}
            rowsPerSection={4}
            sections={3}
            showQuickActions
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
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load person"
          variant="centered"
          onAction={() => {
            void personQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  if (!person || !draft) {
    return (
      <Screen
        bottomPaddingMode="tabbed"
        onRefresh={manualRefresh.refresh}
        refreshing={manualRefresh.isRefreshing}
      >
        <EmptyStateCard
          fillScreen
          body="This teammate isn't in your directory anymore."
          iconName="person-outline"
          title="Person not found"
        />
      </Screen>
    );
  }

  const roleLabel = bootstrapQuery.data?.currentOrg.labels.role ?? "Roles";
  const certificationLabel =
    bootstrapQuery.data?.currentOrg.labels.certification ?? "Certification";
  const departmentLabel = bootstrapQuery.data?.currentOrg.labels.department ?? "Departments";
  const managementDepartments = (bootstrapQuery.data?.departments ?? []).filter(
    (department) => department.type === "management",
  );
  const focusAreaNames = formatIdList(person.focusAreaIds, maps.focusAreas);
  const scheduledDepartmentNames = formatNameList(
    getScheduledDepartmentNames(
      person.focusAreaIds,
      bootstrapQuery.data?.focusAreas,
      bootstrapQuery.data?.departments,
    ),
  );
  const roleNames = formatIdList(person.roleIds, maps.roles);
  const managementDepartmentNames = formatNameList(
    getDepartmentNames(person.managementDepartmentIds, bootstrapQuery.data?.departments),
  );
  const certificationName =
    person.certificationId != null
      ? (maps.certifications.get(person.certificationId) ?? "Unknown")
      : "None";
  const employmentLabel = person.employmentType === "part_time" ? "Part-time" : "Full-time";
  const fullName = getFullName(person);
  // Management-only people have a staff row but no focus areas, so they were
  // never on the grid — telling them they'll come "off the schedule" would be
  // describing something that never happened. Same split web makes.
  const isOnSchedule = person.focusAreaIds.length > 0;
  const orgRoleBadge = getMobileOrgRoleHeroBadge(person.orgRole);
  // The three app-account states, as one chip, in the same words the People
  // rows use. None of them says "Active": that word belongs to the staff-status
  // chip beside this one, and printing it twice made the pair read as two
  // answers to the same question rather than two different facts. Only the
  // middle state is one anyone has to act on, so it is the only one with colour.
  const accountChip = person.userId
    ? {
        label: "App access",
        tone: "neutral" as const,
        icon: "phone-portrait-outline" as const,
      }
    : person.pendingInvitation
      ? { label: "Invitation pending", tone: "warning" as const, icon: "mail-outline" as const }
      : {
          label: "No app access",
          tone: "neutral" as const,
          icon: "mail-open-outline" as const,
        };
  const avatarTone = getAvatarTone(person.id, isDark);

  // The Deactivate sheet carries both outcomes, so what the confirm actually
  // does comes from the selected option, not from which button opened it.
  const deactivateRemoves = confirmAction === "deactivate" && deactivateOutcome === "remove";
  const resolvedStatusAction =
    confirmAction === "deactivate" && deactivateRemoves ? "remove" : confirmAction;

  function confirmStatusAction(): Promise<void> | undefined {
    if (!resolvedStatusAction || !person) return;

    const input = {
      action: resolvedStatusAction,
      expectedVersion: person.version,
      note:
        resolvedStatusAction === "deactivate" || resolvedStatusAction === "remove"
          ? inactiveNote.trim() || undefined
          : undefined,
    };
    return new Promise<void>((resolve) => {
      statusMutation.mutate(input, { onSettled: () => resolve() });
    });
  }

  function closeStatusConfirmation() {
    setConfirmAction(null);
    setDeactivateOutcome("inactive");
    // The note is typed inside this modal and never survives it, so clearing it
    // here stops the next status change opening with the last one's reason.
    setInactiveNote("");
  }

  function confirmInvitationAction(): Promise<void> | undefined {
    if (!invitationConfirmAction) return;
    return new Promise<void>((resolve) => {
      invitationMutation.mutate(
        { action: invitationConfirmAction },
        { onSettled: () => resolve() },
      );
    });
  }

  const statusConfirmationTitle =
    confirmAction === "deactivate"
      ? `Deactivate ${getFullName(person)}?`
      : confirmAction === "activate"
        ? `Activate ${getFullName(person)}?`
        : `Remove ${getFullName(person)}?`;
  // The Deactivate sheet has no body of its own: the two options below carry
  // the copy, and a paragraph above them would only say it a third time.
  const statusConfirmationBody =
    confirmAction === "deactivate"
      ? undefined
      : confirmAction === "activate"
        ? "They'll return to active staff lists and scheduling."
        : "They'll lose access and be removed from active staff lists. Their history stays intact.";
  const statusConfirmationLabel =
    confirmAction === "deactivate"
      ? deactivateRemoves
        ? "Remove"
        : "Mark Inactive"
      : confirmAction === "activate"
        ? "Activate"
        : "Remove";
  const statusPendingLabel =
    confirmAction === "deactivate"
      ? deactivateRemoves
        ? "Removing"
        : "Updating"
      : confirmAction === "activate"
        ? "Activating"
        : "Removing";
  const invitationConfirmationTitle =
    invitationConfirmAction === "create"
      ? "Send invitation?"
      : invitationConfirmAction === "resend"
        ? "Reissue invitation?"
        : "Revoke invitation?";
  const invitationConfirmationBody =
    invitationConfirmAction === "create"
      ? `An app invitation will be sent to ${person.email}.`
      : invitationConfirmAction === "resend"
        ? `The current invitation for ${person.email} will be canceled and a new one will be sent.`
        : `The current invite link for ${person.email} will stop working.`;
  const invitationConfirmationLabel =
    invitationConfirmAction === "create"
      ? "Send Invitation"
      : invitationConfirmAction === "resend"
        ? "Reissue Invitation"
        : "Revoke Invitation";
  const invitationPendingLabel = invitationConfirmAction === "revoke" ? "Revoking" : "Sending";

  return (
    <Screen
      bottomPaddingMode="tabbed"
      onRefresh={manualRefresh.refresh}
      onScroll={handlePersonScroll}
      refreshing={manualRefresh.isRefreshing}
      scrollEventThrottle={16}
    >
      {/* The native inline header is deliberately the person, not "Staff
          Profile". It stays compact and gets UIKit's scroll-edge blur from the
          route while the hero below scrolls beneath it, the same pattern
          ProfileScreen uses for the signed-in user's own name. */}
      <Stack.Screen
        options={{
          title: fullName,
          headerTitleStyle: {
            color: isCompactTitleVisible ? mobileColors.textPrimary : "transparent",
            fontFamily: mobileTypography.fontFamily.bold,
          },
        }}
      />
      <AccountLinkChallengeModal
        challenge={accountLinkChallenge}
        isPending={invitationMutation.isPending}
        onCancel={() => setAccountLinkChallenge(null)}
        onConfirm={() =>
          invitationMutation.mutate({
            action: "create",
            linkExistingAccount: true,
            reconcileName: accountLinkChallenge?.kind === "name_mismatch",
          })
        }
      />

      {/* The hero carries the same three facts the old meta grid did, and no
          more: the org tier as its badge (web's People table calls it
          "Access" too), then status and where their app account stands. */}
      <ProfileHero
        align="center"
        badge={orgRoleBadge.label}
        badgeTone={orgRoleBadge.tone}
        avatarStyle={{
          backgroundColor: avatarTone.backgroundColor,
          borderColor: avatarTone.borderColor,
          borderWidth: 1,
        }}
        avatarTextStyle={{ color: avatarTone.textColor }}
        initials={getProfileInitials(fullName)}
        statusTone={person.status === "active" ? "success" : "muted"}
        title={fullName}
      >
        {/* Every chip on one line. The access tier is the hero's badge now,
            the same pill the profile tab and the People rows print, rather
            than a muted line of its own down here. */}
        <ProfileHeroFacts>
          <ProfileHeroFactsRow>
            <Chip
              label={formatStatusLabel(person.status)}
              tone={person.status === "active" ? "success" : "neutral"}
            />
            <Chip icon={accountChip.icon} label={accountChip.label} tone={accountChip.tone} />
          </ProfileHeroFactsRow>
        </ProfileHeroFacts>
      </ProfileHero>

      {!editing ? (
        <ProfileQuickActions>
          <Button
            compact
            disabled={!person.phone}
            label="Call"
            leadingAccessory={
              <Ionicons color={mobileIconToneColor("green", isDark)} name="call" size={18} />
            }
            onPress={() => {
              if (person.phone) void Linking.openURL(`tel:${person.phone}`);
            }}
            tone="plain"
          />
          <Button
            compact
            disabled={!person.email}
            label="Email"
            leadingAccessory={
              <Ionicons color={mobileIconToneColor("blue", isDark)} name="mail" size={18} />
            }
            onPress={() => {
              if (person.email) void Linking.openURL(`mailto:${person.email}`);
            }}
            tone="plain"
          />
          {canEdit ? (
            <Button
              compact
              label="Edit"
              leadingAccessory={
                <Ionicons color={mobileIconToneColor("orange", isDark)} name="create" size={18} />
              }
              onPress={() => {
                setEditing(true);
                setDraft(makeDraft(person));
              }}
              tone="plain"
            />
          ) : null}
        </ProfileQuickActions>
      ) : null}

      {editing ? (
        <EditPanel
          certificationLabel={certificationLabel}
          certifications={bootstrapQuery.data?.certifications ?? []}
          saving={updateMutation.isPending}
          draft={draft}
          focusAreaLabel={focusAreaLabel}
          focusAreas={bootstrapQuery.data?.focusAreas ?? []}
          hasChanges={hasChanges}
          hasManagementAccess={person.managementDepartmentIds.length > 0}
          onCancel={guard.requestClose}
          onChange={setDraft}
          onDiscard={guard.discard}
          onSave={handleSave}
          roleLabel={roleLabel}
          roles={bootstrapQuery.data?.roles ?? []}
          useCompactRoleCertificationLabels={useCompactRoleCertificationLabels}
        />
      ) : (
        <>
          <ProfileSection title="Contact">
            <ProfileList>
              <ProfileInfoRow
                iconName="mail-outline"
                label="Email"
                value={person.email || "No email on file"}
              />
              <ProfileInfoRow
                iconName="call-outline"
                isLast
                label="Phone"
                value={person.phone || "No phone on file"}
              />
            </ProfileList>
          </ProfileSection>

          {/* Split the way the edit panel below splits the same fields: what
              the person is hired as here, where they are placed under
              Assignments. The name row is gone with it, since the native header
              already carries it. */}
          <ProfileSection title="Staffing">
            <ProfileList>
              {/* Web prints this beside the name in its staff header, and it is
                  how people are identified in payroll conversations. */}
              <ProfileInfoRow
                iconName="card-outline"
                label="Employee ID"
                value={`#${person.employeeNumber}`}
              />
              <ProfileInfoRow
                iconName="briefcase-outline"
                label="Employment"
                value={employmentLabel}
              />
              <ProfileInfoRow
                iconName="ribbon-outline"
                isLast={!canManageEmployees || (!person.statusChangedAt && !person.statusNote)}
                label={certificationLabel}
                value={certificationName}
              />
              {canManageEmployees && person.statusChangedAt ? (
                <ProfileInfoRow
                  iconName="calendar-outline"
                  isLast={!person.statusNote}
                  label="Status updated"
                  value={formatDate(person.statusChangedAt)}
                />
              ) : null}
              {canManageEmployees && person.statusNote ? (
                <ProfileInfoRow
                  iconName="document-text-outline"
                  isLast
                  label="Status note"
                  value={person.statusNote}
                />
              ) : null}
            </ProfileList>
          </ProfileSection>

          <ProfileSection title="Assignments">
            <ProfileList>
              {/* The two kinds of department are different facts about a
                  person — where they are scheduled, and what they manage — so
                  they take a row each rather than one merged list. The
                  management row sits directly under its scheduled counterpart
                  instead of in a section of its own, which read as a second
                  Assignments block for anyone who had both. */}
              <ProfileInfoRow
                iconName="business-outline"
                label={departmentLabel}
                value={scheduledDepartmentNames}
              />
              {/* Gated on the departments themselves, not on
                  `hasManagementAccess`: that is also true for a plain staff app
                  invitation, and would print an empty row for one. */}
              {person.managementDepartmentIds.length > 0 ? (
                <ProfileInfoRow
                  iconName="briefcase-outline"
                  label={MANAGEMENT_DEPARTMENT_LABELS.plural}
                  value={managementDepartmentNames}
                />
              ) : null}
              <ProfileInfoRow
                iconName="albums-outline"
                label={focusAreaLabel}
                value={focusAreaNames}
              />
              <ProfileInfoRow
                iconName="people-circle-outline"
                isLast
                label={roleLabel}
                value={roleNames}
              />
            </ProfileList>
          </ProfileSection>

          {canManageEmployees && person.contactNotes ? (
            <ProfileSection title="Notes">
              <ProfilePanel>
                <Text style={styles.noteText}>{person.contactNotes}</Text>
              </ProfilePanel>
            </ProfileSection>
          ) : null}
        </>
      )}

      {/* The section is untitled: every button in here already names its own
          action, so a heading over them can only say "Actions" — the one word
          they have in common and the one that tells the reader nothing. */}
      {canManageEmployees && !editing ? (
        <ProfileSection>
          {/*
           * Access first, status last, the way web's staff panel orders them:
           * granting someone the app is the everyday action, and the one that
           * takes them off it sits at the bottom on its own.
           */}
          <ProfileActionStack>
            {!person.userId && person.status !== "removed" && person.email ? (
              person.pendingInvitation ? (
                <ProfileActionRow>
                  <Button
                    compact
                    label="Reinvite"
                    loading={invitationMutation.isPending}
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
                </ProfileActionRow>
              ) : (
                <Button
                  compact
                  label="Send Invitation"
                  loading={invitationMutation.isPending}
                  onPress={() => setInvitationConfirmAction("create")}
                  tone="link"
                />
              )
            ) : null}
            {canManageManagementAccess && person.status !== "removed" && !isSelf ? (
              <Button
                compact
                disabled={managementAccessMutation.isPending}
                label={hasManagementAccess(person) ? "Edit Management Access" : "Add to Management"}
                onPress={() => setShowManagementAccess(true)}
                tone="secondary"
              />
            ) : null}
            {person.status !== "active" ? (
              <Button
                compact
                disabled={statusMutation.isPending || isSelf}
                label="Activate"
                loading={statusMutation.isPending}
                onPress={() => setConfirmAction("activate")}
                tone="success"
              />
            ) : null}
            {person.status === "active" ? (
              <Button
                compact
                disabled={statusMutation.isPending || isSelf}
                label="Deactivate"
                onPress={() => {
                  setDeactivateOutcome("inactive");
                  setConfirmAction("deactivate");
                }}
                tone="warning"
              />
            ) : null}
            {/* Only reachable once someone is already inactive. While they're
                active, Remove is the second option inside Deactivate. */}
            {person.status === "inactive" ? (
              <Button
                compact
                disabled={statusMutation.isPending || isSelf}
                label="Remove"
                onPress={() => setConfirmAction("remove")}
                tone="danger"
              />
            ) : null}
          </ProfileActionStack>
        </ProfileSection>
      ) : null}
      <ConfirmationModal
        body="The staff profile will be updated."
        confirmLabel="Save"
        loading={updateMutation.isPending}
        onCancel={() => setShowSaveConfirmation(false)}
        onConfirm={confirmSave}
        title="Save these changes?"
        visible={showSaveConfirmation}
      />
      <ConfirmationModal {...guard.confirmationProps} />
      <ConfirmationModal
        body={statusConfirmationBody}
        confirmLabel={statusConfirmationLabel}
        confirmTone={
          confirmAction === "deactivate"
            ? deactivateRemoves
              ? "danger"
              : "warning"
            : confirmAction === "activate"
              ? "primary"
              : "danger"
        }
        loading={statusMutation.isPending}
        onCancel={closeStatusConfirmation}
        onConfirm={confirmStatusAction}
        title={statusConfirmationTitle}
        visible={confirmAction != null}
      >
        {confirmAction === "deactivate" ? (
          <SelectionSection label="What should happen">
            <SelectionRow
              detail={
                isOnSchedule
                  ? "They'll be temporarily off the schedule. You can reactivate them anytime."
                  : "They'll temporarily lose management access. You can reactivate them anytime."
              }
              label="Mark inactive"
              onPress={() => setDeactivateOutcome("inactive")}
              selected={!deactivateRemoves}
            />
            <SelectionRow
              detail="They'll lose access and won't appear in active staff. You can reactivate them later."
              label="Remove from staff"
              onPress={() => setDeactivateOutcome("remove")}
              selected={deactivateRemoves}
            />
          </SelectionSection>
        ) : null}
        {confirmAction === "deactivate" || confirmAction === "remove" ? (
          <TextInput
            onChangeText={setInactiveNote}
            placeholder={
              resolvedStatusAction === "remove"
                ? "Reason (optional) - e.g. Left the company"
                : "Reason (optional) - e.g. On leave until June"
            }
            placeholderTextColor={mobileColors.textSubtle}
            style={styles.input}
            value={inactiveNote}
          />
        ) : null}
      </ConfirmationModal>
      <ManagementAccessSheet
        isPending={managementAccessMutation.isPending}
        managementDepartments={managementDepartments}
        onDismiss={() => setShowManagementAccess(false)}
        onRemove={() =>
          new Promise<void>((resolve) => {
            managementAccessMutation.mutate({ remove: true }, { onSettled: () => resolve() });
          })
        }
        onSubmit={(nextDraft) =>
          new Promise<void>((resolve) => {
            managementAccessMutation.mutate({ draft: nextDraft }, { onSettled: () => resolve() });
          })
        }
        person={person}
        visible={showManagementAccess}
      />
      <ConfirmationModal
        body={invitationConfirmationBody}
        confirmLabel={invitationConfirmationLabel}
        confirmTone={invitationConfirmAction === "revoke" ? "danger" : "primary"}
        loading={invitationMutation.isPending}
        onCancel={() => setInvitationConfirmAction(null)}
        onConfirm={confirmInvitationAction}
        title={invitationConfirmationTitle}
        visible={invitationConfirmAction != null}
      />
    </Screen>
  );
}

function AccountLinkChallengeModal({
  challenge,
  isPending,
  onCancel,
  onConfirm,
}: {
  challenge: MobileAccountLinkChallenge | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [displayed, setDisplayed] = useState(challenge);

  useEffect(() => {
    if (challenge) setDisplayed(challenge);
  }, [challenge]);

  if (!displayed) return null;

  const accountName =
    `${displayed.details.accountFirstName} ${displayed.details.accountLastName}`.trim() ||
    "this account";
  const employeeName =
    `${displayed.details.employeeFirstName} ${displayed.details.employeeLastName}`.trim() ||
    "this staff profile";
  const isMismatch = displayed.kind === "name_mismatch";
  const title = isMismatch ? "Name mismatch found" : "Account found";
  const subtitle = isMismatch
    ? "Review the existing account before linking it."
    : "Confirm that this is the right app account.";

  return (
    <BottomSheetModal
      dismissDisabled={isPending}
      header={<SheetHeader subtitle={subtitle} title={title} />}
      onDismiss={onCancel}
      visible={challenge != null}
    >
      <View style={styles.modalInfoPanel}>
        <Text style={styles.modalInfoTitle}>
          {isMismatch ? "The account name is different" : "Existing app account found"}
        </Text>
        <Text style={styles.modalInfoText}>
          {isMismatch
            ? `The existing account is under ${accountName}. Link it and update ${employeeName} to match that account name?`
            : `An existing app account under ${accountName} matches this staff profile. Link it instead of sending a new invitation?`}
        </Text>
      </View>

      <ProfileList>
        <ProfileInfoRow label="Staff profile" value={employeeName} />
        <ProfileInfoRow isLast label="Account name" value={accountName} />
      </ProfileList>

      <View style={styles.modalActionStack}>
        <Button
          disabled={isPending}
          label={isMismatch ? "Use Account Name" : "Link Existing Account"}
          loading={isPending}
          onPress={onConfirm}
          tone="secondary"
        />
        <Button disabled={isPending} label="Cancel" onPress={onCancel} tone="neutral" />
      </View>
    </BottomSheetModal>
  );
}

function buildLookupMaps(data: MobileBootstrapResponse | undefined) {
  const useCompactLabels = data?.currentOrg?.useCompactRoleCertificationLabels ?? false;
  return {
    focusAreas: new Map((data?.focusAreas ?? []).map((item) => [item.id, item.name])),
    roles: new Map(
      (data?.roles ?? []).map((item) => [
        item.id,
        useCompactLabels ? item.abbr || item.name : item.name,
      ]),
    ),
    certifications: new Map(
      (data?.certifications ?? []).map((item) => [
        item.id,
        useCompactLabels ? item.abbr || item.name : item.name,
      ]),
    ),
  };
}

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function formatIdList(ids: number[], map: Map<number, string>): string {
  return formatNameList(
    ids.map((id) => map.get(id)).filter((value): value is string => Boolean(value)),
  );
}

function formatNameList(names: string[]): string {
  return names.length > 0 ? names.join(", ") : "None";
}

function EditPanel({
  draft,
  saving,
  focusAreaLabel,
  focusAreas,
  certificationLabel,
  certifications,
  roleLabel,
  roles,
  useCompactRoleCertificationLabels,
  hasChanges,
  hasManagementAccess,
  onChange,
  onCancel,
  onDiscard,
  onSave,
}: {
  draft: EditDraft;
  saving: boolean;
  focusAreaLabel: string;
  focusAreas: MobileFocusArea[];
  certificationLabel: string;
  certifications: MobileNamedItem[];
  roleLabel: string;
  hasManagementAccess: boolean;
  roles: MobileBootstrapRole[];
  useCompactRoleCertificationLabels: boolean;
  hasChanges: boolean;
  onChange: (draft: EditDraft) => void;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [focusedField, setFocusedField] = useState<
    "firstName" | "lastName" | "phone" | "email" | "contactNotes" | null
  >(null);
  const fieldErrors = {
    firstName: getStaffNameError(draft.firstName, "First name"),
    lastName: getStaffNameError(draft.lastName, "Last name"),
    phone: getOptionalUsPhoneError(draft.phone),
    email: getOptionalStaffEmailError(draft.email),
    contactNotes: getStaffNotesError(draft.contactNotes),
    focusAreaIds:
      draft.focusAreaIds.length === 0 && !hasManagementAccess
        ? `Select at least one ${singularLabelNoun(focusAreaLabel)}`
        : null,
  };
  const hasValidationErrors = Object.values(fieldErrors).some(Boolean);
  const setField = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };
  const toggle = (key: "focusAreaIds" | "roleIds", id: number) => {
    const current = draft[key];
    setField(
      key,
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  return (
    <>
      <ProfileSection title="Basic info">
        <ProfilePanel>
          <ProfileTextInput
            accessibilityLabel="First name"
            autoCapitalize="words"
            editable={!saving}
            error={fieldErrors.firstName}
            focused={focusedField === "firstName"}
            label="First name"
            placeholder="First name"
            value={draft.firstName}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => setField("firstName", value)}
            onFocus={() => setFocusedField("firstName")}
          />
          <ProfileTextInput
            accessibilityLabel="Last name"
            autoCapitalize="words"
            editable={!saving}
            error={fieldErrors.lastName}
            focused={focusedField === "lastName"}
            label="Last name"
            placeholder="Last name"
            value={draft.lastName}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => setField("lastName", value)}
            onFocus={() => setFocusedField("lastName")}
          />
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Contact">
        <ProfilePanel>
          <ProfileTextInput
            accessibilityLabel="Phone"
            editable={!saving}
            error={fieldErrors.phone}
            focused={focusedField === "phone"}
            keyboardType="phone-pad"
            label="Phone"
            placeholder="Phone"
            value={draft.phone}
            onBlur={() => {
              setFocusedField(null);
              if (!fieldErrors.phone && draft.phone.trim()) {
                setField("phone", normalizeOptionalUsPhone(draft.phone));
              }
            }}
            onChangeText={(value) => setField("phone", value)}
            onFocus={() => setFocusedField("phone")}
          />
          <ProfileTextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            editable={!saving}
            error={fieldErrors.email}
            focused={focusedField === "email"}
            keyboardType="email-address"
            label="Email"
            placeholder="Email"
            value={draft.email}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => setField("email", value)}
            onFocus={() => setFocusedField("email")}
          />
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Staffing">
        <ProfilePanel>
          <ProfileChoiceGroup
            items={[
              { id: 0, name: "Full-time" },
              { id: 1, name: "Part-time" },
            ]}
            label="Employment"
            selectedIds={[draft.employmentType === "part_time" ? 1 : 0]}
            onToggle={(id) => setField("employmentType", id === 1 ? "part_time" : "full_time")}
          />
          <ProfileChoiceGroup
            items={[
              { id: -1, name: "None" },
              ...certifications.map((item) => ({
                id: item.id,
                name: useCompactRoleCertificationLabels ? item.abbr || item.name : item.name,
              })),
            ]}
            label={certificationLabel}
            selectedIds={draft.certificationId == null ? [-1] : [draft.certificationId]}
            onToggle={(id) => setField("certificationId", id === -1 ? null : id)}
          />
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Assignments">
        <ProfilePanel>
          <ProfileChoiceGroup
            error={fieldErrors.focusAreaIds}
            items={focusAreas.map((item) => ({
              id: item.id,
              name: item.name,
            }))}
            label={focusAreaLabel}
            selectedIds={draft.focusAreaIds}
            onToggle={(id) => toggle("focusAreaIds", id)}
          />
          <ProfileChoiceGroup
            items={roles
              .filter(
                (item) =>
                  !isRoleCertificationBlocked({
                    role: item,
                    certificationId: draft.certificationId,
                    selectedRoleIds: draft.roleIds,
                    roleId: item.id,
                  }),
              )
              .map((item) => ({
                id: item.id,
                name: useCompactRoleCertificationLabels ? item.abbr || item.name : item.name,
              }))}
            label={roleLabel}
            selectedIds={draft.roleIds}
            onToggle={(id) => toggle("roleIds", id)}
          />
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Notes">
        <ProfilePanel>
          <ProfileTextInput
            accessibilityLabel="Internal notes"
            editable={!saving}
            error={fieldErrors.contactNotes}
            focused={focusedField === "contactNotes"}
            label="Internal notes"
            multiline
            placeholder="Internal notes"
            value={draft.contactNotes}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => setField("contactNotes", value)}
            onFocus={() => setFocusedField("contactNotes")}
          />
        </ProfilePanel>
      </ProfileSection>

      <View style={styles.actionsRow}>
        <Button
          compact
          disabled={saving || !hasChanges || hasValidationErrors}
          label="Save changes"
          loading={saving}
          onPress={onSave}
        />
        <Button
          compact
          disabled={saving || !hasChanges}
          label="Discard"
          onPress={onDiscard}
          tone="neutral"
        />
        <Button compact disabled={saving} label="Cancel" onPress={onCancel} tone="ghost" />
      </View>
    </>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    actionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    noteText: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    input: {
      // Explicit regular weight — don't spread `mobileText.sectionTitle`,
      // which carries a bold `fontFamily` that wins over `fontWeight: "400"`.
      // Omitting `fontFamily` also avoids the Android EditText
      // non-interactive bug when DM Sans hasn't loaded.
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "400",
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      color: mobileColors.textPrimary,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    modalInfoPanel: {
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: 8,
      padding: 16,
    },
    modalInfoTitle: {
      ...mobileTextWeighted("rowTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    modalInfoText: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    modalActionStack: {
      gap: 10,
      paddingTop: 4,
    },
  });
