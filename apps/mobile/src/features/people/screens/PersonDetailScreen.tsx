import { getOrgRoleLabel } from "@dubgrid/domain";
import { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapResponse,
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
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import {
  createMobilePersonInvitation,
  getMobilePerson,
  parseMobileAccountLinkChallenge,
  resendMobilePersonInvitation,
  revokeMobilePersonInvitation,
  updateMobilePerson,
  updateMobilePersonStatus,
  type MobileAccountLinkChallenge,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { singularLabelNoun } from "../../../shared/lib/labels";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileIconToneColor,
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { HeaderTitle } from "../../../shared/navigation/HeaderTitle";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  ProfileChoiceGroup,
  ProfileHero,
  ProfileHeroMeta,
  ProfileInfoRow,
  ProfileList,
  ProfilePanel,
  ProfileSection,
  ProfileTextInput,
} from "../../profile/components/ProfilePrimitives";
import { ProfileSkeleton } from "../../profile/components/ProfileSkeleton";

type ConfirmAction = "deactivate" | "activate" | "remove" | null;
type InvitationConfirmAction = "create" | "resend" | "revoke" | null;

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

export default function PersonDetailScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const isDark = useIsDarkMode();
  const params = useLocalSearchParams<{ id?: string }>();
  const personId = Array.isArray(params.id) ? params.id[0] : params.id;
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  /** The person the draft was last built from, so the sync below runs once. */
  const [draftSource, setDraftSource] = useState<MobilePerson | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [invitationConfirmAction, setInvitationConfirmAction] =
    useState<InvitationConfirmAction>(null);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [showDiscardCancelConfirmation, setShowDiscardCancelConfirmation] = useState(false);
  const [inactiveNote, setInactiveNote] = useState("");
  const [accountLinkChallenge, setAccountLinkChallenge] =
    useState<MobileAccountLinkChallenge | null>(null);

  const personQuery = useQuery({
    queryKey: ["mobile", "person", accessToken, personId],
    queryFn: () => getMobilePerson(accessToken!, personId!),
    enabled: Boolean(accessToken && personId),
  });
  const manualRefresh = useManualRefresh(() =>
    Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]),
  );
  const canManageEmployees = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);
  const currentUserId = bootstrapQuery.data?.user?.id ?? null;
  const rawPerson = personQuery.data?.person ?? null;
  const person =
    rawPerson && (canManageEmployees || rawPerson.status === "active") ? rawPerson : null;
  const isSelf = Boolean(currentUserId && person?.userId && person.userId === currentUserId);
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

  function handleSave() {
    if (!person || !draft) return;
    const firstNameError = getStaffNameError(draft.firstName, "First name");
    const lastNameError = getStaffNameError(draft.lastName, "Last name");
    const emailError = getOptionalStaffEmailError(draft.email);
    const phoneError = getOptionalUsPhoneError(draft.phone);
    const notesError = getStaffNotesError(draft.contactNotes);
    if (
      firstNameError ||
      lastNameError ||
      emailError ||
      phoneError ||
      notesError ||
      draft.focusAreaIds.length === 0
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
          <ProfileSkeleton rowsPerSection={4} sections={3} showQuickActions />
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
  const focusAreaNames = formatIdList(person.focusAreaIds, maps.focusAreas);
  const scheduledDepartmentNames = formatIdList(
    getScheduledDepartmentIds(person.focusAreaIds, bootstrapQuery.data),
    maps.departments,
  );
  const roleNames = formatIdList(person.roleIds, maps.roles);
  const certificationName =
    person.certificationId != null
      ? (maps.certifications.get(person.certificationId) ?? "Unknown")
      : "None";
  const employmentLabel = person.employmentType === "part_time" ? "Part-time" : "Full-time";
  const fullName = getFullName(person);
  const accessLevelText = getOrgRoleLabel(person.orgRole);
  const accessText = person.userId
    ? "Active app account"
    : person.pendingInvitation
      ? "Invitation pending"
      : "No app invitation sent";

  function confirmStatusAction() {
    if (!confirmAction || !person) return;

    statusMutation.mutate({
      action: confirmAction,
      expectedVersion: person.version,
      note:
        confirmAction === "deactivate" || confirmAction === "remove"
          ? inactiveNote.trim() || undefined
          : undefined,
    });
  }

  function confirmInvitationAction() {
    if (!invitationConfirmAction) return;
    invitationMutation.mutate({ action: invitationConfirmAction });
  }

  const statusConfirmationTitle =
    confirmAction === "deactivate"
      ? `Mark ${getFullName(person)} inactive?`
      : confirmAction === "activate"
        ? `Activate ${getFullName(person)}?`
        : `Remove ${getFullName(person)}?`;
  const statusConfirmationBody =
    confirmAction === "deactivate"
      ? "They'll be hidden from active scheduling and shift requests. Their history stays intact."
      : confirmAction === "activate"
        ? "They'll return to active staff lists and scheduling."
        : "They'll lose access and be removed from active staff lists. Their history stays intact.";
  const statusConfirmationLabel =
    confirmAction === "deactivate"
      ? "Mark Inactive"
      : confirmAction === "activate"
        ? "Activate"
        : "Remove";
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

  return (
    <Screen
      bottomPaddingMode="tabbed"
      onRefresh={manualRefresh.refresh}
      refreshing={manualRefresh.isRefreshing}
    >
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

      {/* The native header names the page, and every part of the identity
          block under it repeated something: the avatar and badge restated the
          name and the status, and the email has its own row in Contact. What's
          left is the meta grid. */}
      <HeaderTitle title={fullName} />

      <ProfileHero>
        <ProfileHeroMeta label={roleLabel} value={roleNames} />
        <ProfileHeroMeta label={focusAreaLabel} value={focusAreaNames} />
        <ProfileHeroMeta label="Employment" value={employmentLabel} />
        {/* The org role had no home but the badge, so it moved here rather than
            leaving with it. Web's People table calls the tier "Access" too. */}
        <ProfileHeroMeta label="Access" value={accessLevelText} />
        <ProfileHeroMeta label="App account" value={accessText} />
      </ProfileHero>

      {!editing ? (
        <View style={styles.quickActions}>
          {/*
           * Plain white pills: the colour lives in the icon, so three adjacent
           * actions read as one set instead of three competing fills.
           */}
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
        </View>
      ) : null}

      {editing ? (
        <EditPanel
          certificationLabel={certificationLabel}
          certifications={bootstrapQuery.data?.certifications ?? []}
          disabled={updateMutation.isPending}
          draft={draft}
          focusAreaLabel={focusAreaLabel}
          focusAreas={bootstrapQuery.data?.focusAreas ?? []}
          onCancel={() => {
            setEditing(false);
            setDraft(makeDraft(person));
          }}
          onCancelWithChanges={() => setShowDiscardCancelConfirmation(true)}
          onChange={setDraft}
          onDiscard={() => setDraft(makeDraft(person))}
          onSave={handleSave}
          original={person}
          roleLabel={roleLabel}
          roles={bootstrapQuery.data?.roles ?? []}
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

          <ProfileSection title="Staff profile">
            <ProfileList>
              <ProfileInfoRow iconName="person-circle-outline" label="Name" value={fullName} />
              <ProfileInfoRow
                iconName="pulse-outline"
                label="Status"
                value={formatStatusLabel(person.status)}
              />
              <ProfileInfoRow
                iconName="briefcase-outline"
                label="Employment"
                value={employmentLabel}
              />
              <ProfileInfoRow
                iconName="people-circle-outline"
                label={roleLabel}
                value={roleNames}
              />
              <ProfileInfoRow
                iconName="ribbon-outline"
                label={certificationLabel}
                value={certificationName}
              />
              <ProfileInfoRow
                iconName="albums-outline"
                isLast={!canManageEmployees || (!person.statusChangedAt && !person.statusNote)}
                label={focusAreaLabel}
                value={focusAreaNames}
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
                  label="Note"
                  value={person.statusNote}
                />
              ) : null}
            </ProfileList>
          </ProfileSection>

          <ProfileSection title="Assignments">
            <ProfileList>
              <ProfileInfoRow
                iconName="business-outline"
                label={departmentLabel}
                value={scheduledDepartmentNames}
              />
              <ProfileInfoRow
                iconName="albums-outline"
                isLast
                label={focusAreaLabel}
                value={focusAreaNames}
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

      {canManageEmployees && !editing ? (
        <ProfileSection title="Actions">
          <View style={styles.actionStack}>
            {person.status === "active" ? (
              <Button
                compact
                disabled={statusMutation.isPending || isSelf}
                label="Mark Inactive"
                onPress={() => setConfirmAction("deactivate")}
                tone="warning"
              />
            ) : null}
            {person.status !== "active" ? (
              <Button
                compact
                disabled={statusMutation.isPending || isSelf}
                label={statusMutation.isPending ? "Updating..." : "Activate"}
                onPress={() => setConfirmAction("activate")}
                tone="success"
              />
            ) : null}
            {person.status !== "removed" ? (
              <Button
                compact
                disabled={statusMutation.isPending || isSelf}
                label="Remove"
                onPress={() => setConfirmAction("remove")}
                tone="danger"
              />
            ) : null}
            {!person.userId && person.status !== "removed" && person.email ? (
              person.pendingInvitation ? (
                <View style={styles.actionRow}>
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
              ) : (
                <Button
                  compact
                  disabled={invitationMutation.isPending}
                  label={invitationMutation.isPending ? "Sending..." : "Send Invitation"}
                  onPress={() => setInvitationConfirmAction("create")}
                  tone="link"
                />
              )
            ) : null}
          </View>
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
      <ConfirmationModal
        body="Your edits will be lost."
        confirmLabel="Discard"
        confirmTone="danger"
        onCancel={() => setShowDiscardCancelConfirmation(false)}
        onConfirm={() => {
          setShowDiscardCancelConfirmation(false);
          setEditing(false);
          setDraft(makeDraft(person));
        }}
        title="Discard unsaved changes?"
        visible={showDiscardCancelConfirmation}
      />
      <ConfirmationModal
        body={statusConfirmationBody}
        confirmLabel={statusConfirmationLabel}
        confirmTone={
          confirmAction === "deactivate"
            ? "warning"
            : confirmAction === "activate"
              ? "primary"
              : "danger"
        }
        loading={statusMutation.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmStatusAction}
        title={statusConfirmationTitle}
        visible={confirmAction != null}
      >
        {confirmAction === "deactivate" || confirmAction === "remove" ? (
          <TextInput
            onChangeText={setInactiveNote}
            placeholder={
              confirmAction === "remove"
                ? "Reason (optional) - e.g. Left the company"
                : "Reason (optional) - e.g. On leave until June"
            }
            placeholderTextColor={mobileColors.textSubtle}
            style={styles.input}
            value={inactiveNote}
          />
        ) : null}
      </ConfirmationModal>
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
          label={
            isPending ? "Linking..." : isMismatch ? "Use Account Name" : "Link Existing Account"
          }
          onPress={onConfirm}
          tone="secondary"
        />
        <Button disabled={isPending} label="Cancel" onPress={onCancel} tone="neutral" />
      </View>
    </BottomSheetModal>
  );
}

function buildLookupMaps(data: MobileBootstrapResponse | undefined) {
  return {
    focusAreas: new Map((data?.focusAreas ?? []).map((item) => [item.id, item.name])),
    roles: new Map((data?.roles ?? []).map((item) => [item.id, item.name])),
    certifications: new Map((data?.certifications ?? []).map((item) => [item.id, item.name])),
    departments: new Map((data?.departments ?? []).map((item) => [item.id, item.name])),
  };
}

function getScheduledDepartmentIds(
  focusAreaIds: number[],
  data: MobileBootstrapResponse | undefined,
): number[] {
  const selectedFocusAreas = new Set(focusAreaIds);
  const seen = new Set<number>();
  const departmentIds: number[] = [];

  for (const focusArea of data?.focusAreas ?? []) {
    if (
      !selectedFocusAreas.has(focusArea.id) ||
      focusArea.departmentId == null ||
      seen.has(focusArea.departmentId)
    ) {
      continue;
    }

    seen.add(focusArea.departmentId);
    departmentIds.push(focusArea.departmentId);
  }

  return departmentIds;
}

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function formatIdList(ids: number[], map: Map<number, string>): string {
  const values = ids.map((id) => map.get(id)).filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(", ") : "None";
}

function EditPanel({
  draft,
  disabled,
  focusAreaLabel,
  focusAreas,
  certificationLabel,
  certifications,
  roleLabel,
  roles,
  original,
  onChange,
  onCancel,
  onCancelWithChanges,
  onDiscard,
  onSave,
}: {
  draft: EditDraft;
  disabled: boolean;
  focusAreaLabel: string;
  focusAreas: MobileFocusArea[];
  certificationLabel: string;
  certifications: MobileNamedItem[];
  roleLabel: string;
  roles: MobileNamedItem[];
  original: MobilePerson;
  onChange: (draft: EditDraft) => void;
  onCancel: () => void;
  onCancelWithChanges: () => void;
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
      draft.focusAreaIds.length === 0
        ? `Select at least one ${singularLabelNoun(focusAreaLabel)}`
        : null,
  };
  const hasValidationErrors = Object.values(fieldErrors).some(Boolean);
  const hasChanges =
    draft.firstName.trim() !== original.firstName ||
    draft.lastName.trim() !== original.lastName ||
    draft.employmentType !== original.employmentType ||
    draft.phone.trim() !== original.phone ||
    draft.email.trim() !== original.email ||
    draft.contactNotes !== original.contactNotes ||
    draft.certificationId !== original.certificationId ||
    !sameIds(draft.focusAreaIds, original.focusAreaIds) ||
    !sameIds(draft.roleIds, original.roleIds) ||
    !sameIds(draft.departmentIds, original.departmentIds);
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
            editable={!disabled}
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
            editable={!disabled}
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
            editable={!disabled}
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
            editable={!disabled}
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
                name: item.name,
                abbr: item.abbr || item.name,
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
            items={roles.map((item) => ({
              id: item.id,
              name: item.name,
              abbr: item.abbr || item.name,
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
            editable={!disabled}
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
          disabled={disabled || !hasChanges || hasValidationErrors}
          label={disabled ? "Saving..." : "Save changes"}
          onPress={onSave}
        />
        <Button
          compact
          disabled={disabled || !hasChanges}
          label="Discard"
          onPress={onDiscard}
          tone="neutral"
        />
        <Button
          compact
          disabled={disabled}
          label="Cancel"
          onPress={hasChanges ? onCancelWithChanges : onCancel}
          tone="ghost"
        />
      </View>
    </>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    quickActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      paddingBottom: 16,
    },
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
    actionStack: {
      gap: 10,
      paddingTop: 12,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
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
