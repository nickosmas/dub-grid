import { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapResponse,
  MobileFocusArea,
  MobileNamedItem,
  MobilePerson,
  MobilePersonUpdateBody,
} from "@dubgrid/contracts";
import {
  getRequiredStaffEmailError,
  getStaffNameError,
  getStaffNotesError,
  getOptionalUsPhoneError,
  normalizeOptionalUsPhone,
  normalizeRequiredStaffEmail,
  normalizeStaffName,
  normalizeStaffNotes,
} from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { ModalHeader } from "../../../shared/components/ModalHeader";
import { ListSkeleton } from "../../../shared/components/Skeleton";
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
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileColors,
  mobileRadii,
  mobileText,
} from "../../../shared/theme/tokens";
import { createDetailStackOptions } from "../../../shared/navigation/top-level-stack";
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

type ConfirmAction = "bench" | "activate" | "terminate" | null;
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
  return (
    `${person.firstName} ${person.lastName}`.trim() ||
    person.email ||
    "Unnamed person"
  );
}

function formatStatusLabel(status: MobilePerson["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
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
    backgroundColor: `hsl(${hue}, 70%, 92%)`,
    borderColor: `hsl(${hue}, 70%, 85%)`,
    color: `hsl(${hue}, 70%, 35%)`,
  };
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
  const params = useLocalSearchParams<{ id?: string }>();
  const personId = Array.isArray(params.id) ? params.id[0] : params.id;
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [invitationConfirmAction, setInvitationConfirmAction] =
    useState<InvitationConfirmAction>(null);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [benchNote, setBenchNote] = useState("");
  const [showCollapsedHeader, setShowCollapsedHeader] = useState(false);
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
  const canManageEmployees = Boolean(
    bootstrapQuery.data?.permissions.canManageEmployees,
  );
  const rawPerson = personQuery.data?.person ?? null;
  const person =
    rawPerson && (canManageEmployees || rawPerson.status === "active")
      ? rawPerson
      : null;
  const canEdit = canManageEmployees && person?.status !== "terminated";
  const contentState = getMobileQueryContentState({
    hasData: personQuery.data !== undefined,
    isLoading: personQuery.isLoading || bootstrapQuery.isLoading,
    error: personQuery.error ?? bootstrapQuery.error,
  });

  useEffect(() => {
    if (person && !editing) {
      setDraft(makeDraft(person));
      setBenchNote(person.statusNote);
    }
  }, [editing, person]);

  const maps = useMemo(
    () => buildLookupMaps(bootstrapQuery.data),
    [bootstrapQuery.data],
  );

  function updateCachedPerson(nextPerson: MobilePerson) {
    queryClient.setQueryData(["mobile", "person", accessToken, nextPerson.id], {
      person: nextPerson,
    });
    queryClient.setQueryData(
      ["mobile", "people", accessToken],
      (current: { people: MobilePerson[] } | undefined) =>
        current
          ? {
              people: current.people.map((item) =>
                item.id === nextPerson.id ? nextPerson : item,
              ),
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
      action: "bench" | "activate" | "terminate";
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
      setBenchNote("");
      await Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]);
      pushToast({
        tone: "success",
        title:
          variables.action === "activate"
            ? "Person activated"
            : variables.action === "bench"
              ? "Person benched"
              : "Person terminated",
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
    const emailError = getRequiredStaffEmailError(draft.email);
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
          "Select at least one focus area.",
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
      email: normalizeRequiredStaffEmail(draft.email),
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
        <View style={styles.loadingState}>
          <Text style={styles.loadingTitle}>Loading profile</Text>
          <ListSkeleton rows={4} showSectionHeader={false} />
        </View>
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
          actionLabel="Try Again"
          body={contentState.message}
          title="Could not load person"
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
          body="This person is no longer available in the mobile directory."
          iconName="person-outline"
          title="Person not found"
        />
      </Screen>
    );
  }

  const focusAreaLabel =
    bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Areas";
  const roleLabel = bootstrapQuery.data?.currentOrg.labels.role ?? "Roles";
  const certificationLabel =
    bootstrapQuery.data?.currentOrg.labels.certification ?? "Certification";
  const departmentLabel =
    bootstrapQuery.data?.currentOrg.labels.department ?? "Departments";
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
  const employmentLabel =
    person.employmentType === "part_time" ? "Part-time" : "Full-time";
  const avatarTone = getAvatarTone(person.id);
  const fullName = getFullName(person);
  const accessText = person.userId
    ? "Active app account"
    : person.pendingInvitation
      ? "Invitation pending"
      : "No app invitation sent";

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const shouldShowHeader = event.nativeEvent.contentOffset.y > 88;
    setShowCollapsedHeader((current) =>
      current === shouldShowHeader ? current : shouldShowHeader,
    );
  }

  function confirmStatusAction() {
    if (!confirmAction || !person) return;

    statusMutation.mutate({
      action: confirmAction,
      expectedVersion: person.version,
      note: confirmAction === "bench" ? benchNote.trim() : undefined,
    });
  }

  function confirmInvitationAction() {
    if (!invitationConfirmAction) return;
    invitationMutation.mutate({ action: invitationConfirmAction });
  }

  const statusConfirmationTitle =
    confirmAction === "bench"
      ? `Bench ${getFullName(person)}?`
      : confirmAction === "activate"
        ? `Activate ${getFullName(person)}?`
        : `Terminate ${getFullName(person)}?`;
  const statusConfirmationBody =
    confirmAction === "bench"
      ? "They will be hidden from active scheduling and shift requests."
      : confirmAction === "activate"
        ? "They will return to active staff lists and scheduling."
        : "They will be archived from active staff lists and scheduling.";
  const statusConfirmationLabel =
    confirmAction === "bench"
      ? "Bench"
      : confirmAction === "activate"
        ? "Activate"
        : "Terminate";
  const invitationConfirmationTitle =
    invitationConfirmAction === "create"
      ? "Send invitation?"
      : invitationConfirmAction === "resend"
        ? "Reissue invitation?"
        : "Revoke invitation?";
  const invitationConfirmationBody =
    invitationConfirmAction === "create"
      ? `Send an app invitation to ${person.email}?`
      : invitationConfirmAction === "resend"
        ? `Revoke the existing invitation for ${person.email} and send a new one?`
        : `Revoke the pending invitation for ${person.email}? The current invite link will stop working.`;
  const invitationConfirmationLabel =
    invitationConfirmAction === "create"
      ? "Send Invitation"
      : invitationConfirmAction === "resend"
        ? "Reissue Invitation"
        : "Revoke Invitation";

  return (
    <Screen
      bottomPaddingMode="tabbed"
      onScroll={handleScroll}
      onRefresh={manualRefresh.refresh}
      refreshing={manualRefresh.isRefreshing}
      scrollEventThrottle={16}
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

      <Stack.Screen
        options={createDetailStackOptions(showCollapsedHeader ? fullName : "")}
      />

      <ProfileHero
        avatarStyle={{
          backgroundColor: avatarTone.backgroundColor,
          borderColor: avatarTone.borderColor,
          borderWidth: 1,
        }}
        avatarTextStyle={{ color: avatarTone.color }}
        badge={formatStatusLabel(person.status)}
        initials={getInitials(person)}
        subtitle={person.email || "No email on file"}
        title={fullName}
      >
        <ProfileHeroMeta label={roleLabel} value={roleNames} />
        <ProfileHeroMeta label={focusAreaLabel} value={focusAreaNames} />
        <ProfileHeroMeta label="Employment" value={employmentLabel} />
        <ProfileHeroMeta label="Access" value={accessText} />
      </ProfileHero>

      {!editing ? (
        <View style={styles.quickActions}>
          <Button
            compact
            disabled={!person.phone}
            label="Call"
            onPress={() => {
              if (person.phone) void Linking.openURL(`tel:${person.phone}`);
            }}
            tone="neutral"
          />
          <Button
            compact
            disabled={!person.email}
            label="Email"
            onPress={() => {
              if (person.email) void Linking.openURL(`mailto:${person.email}`);
            }}
            tone="neutral"
          />
          {canEdit ? (
            <Button
              compact
              label="Edit"
              onPress={() => {
                setEditing(true);
                setDraft(makeDraft(person));
              }}
              tone="secondary"
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
          onChange={setDraft}
          onCancel={() => {
            setEditing(false);
            setDraft(makeDraft(person));
          }}
          onSave={handleSave}
          roleLabel={roleLabel}
          roles={bootstrapQuery.data?.roles ?? []}
        />
      ) : (
        <>
          <ProfileSection title="Staff profile">
            <ProfileList>
              <ProfileInfoRow
                iconName="person-circle-outline"
                label="Name"
                value={fullName}
              />
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
                isLast={
                  !canManageEmployees ||
                  (!person.statusChangedAt && !person.statusNote)
                }
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

          {canManageEmployees && !person.userId ? (
            <ProfileSection title="Account access">
              <ProfileList>
                {person.pendingInvitation ? (
                  <>
                    <ProfileInfoRow
                      iconName="mail-unread-outline"
                      label="Invitation"
                      value={`Pending for ${person.pendingInvitation.email}`}
                    />
                    <ProfileInfoRow
                      iconName="time-outline"
                      isLast
                      label="Expires"
                      value={formatDate(person.pendingInvitation.expiresAt)}
                    />
                  </>
                ) : (
                  <ProfileInfoRow
                    iconName="key-outline"
                    isLast
                    label="Access"
                    value="No app invitation sent"
                  />
                )}
              </ProfileList>
            </ProfileSection>
          ) : null}

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
                disabled={statusMutation.isPending}
                label="Bench"
                onPress={() => setConfirmAction("bench")}
                tone="warningFilled"
              />
            ) : null}
            {person.status !== "active" ? (
              <Button
                compact
                disabled={statusMutation.isPending}
                label={statusMutation.isPending ? "Updating..." : "Activate"}
                onPress={() => setConfirmAction("activate")}
                tone="success"
              />
            ) : null}
            {person.status !== "terminated" ? (
              <Button
                compact
                disabled={statusMutation.isPending}
                label="Terminate"
                onPress={() => setConfirmAction("terminate")}
                tone="dangerFilled"
              />
            ) : null}
            {!person.userId &&
            person.status !== "terminated" &&
            person.email ? (
              person.pendingInvitation ? (
                <View style={styles.actionRow}>
                  <Button
                    compact
                    disabled={invitationMutation.isPending}
                    label={
                      invitationMutation.isPending ? "Sending..." : "Reinvite"
                    }
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
                  label={
                    invitationMutation.isPending
                      ? "Sending..."
                      : "Send Invitation"
                  }
                  onPress={() => setInvitationConfirmAction("create")}
                  tone="link"
                />
              )
            ) : null}
          </View>
        </ProfileSection>
      ) : null}
      <ConfirmationModal
        body="Save these staff profile changes?"
        confirmLabel="Save"
        loading={updateMutation.isPending}
        onCancel={() => setShowSaveConfirmation(false)}
        onConfirm={confirmSave}
        title="Save person?"
        visible={showSaveConfirmation}
      />
      <ConfirmationModal
        body={statusConfirmationBody}
        confirmLabel={statusConfirmationLabel}
        confirmTone={
          confirmAction === "bench"
            ? "warningFilled"
            : confirmAction === "activate"
              ? "primary"
              : "dangerFilled"
        }
        loading={statusMutation.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmStatusAction}
        title={statusConfirmationTitle}
        visible={confirmAction != null}
      >
        {confirmAction === "bench" ? (
          <TextInput
            onChangeText={setBenchNote}
            placeholder="Reason (optional)"
            placeholderTextColor={mobileColors.textSubtle}
            style={styles.input}
            value={benchNote}
          />
        ) : null}
      </ConfirmationModal>
      <ConfirmationModal
        body={invitationConfirmationBody}
        confirmLabel={invitationConfirmationLabel}
        confirmTone={
          invitationConfirmAction === "revoke" ? "dangerFilled" : "primary"
        }
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
  if (!challenge) {
    return null;
  }

  const accountName =
    `${challenge.details.accountFirstName} ${challenge.details.accountLastName}`.trim() ||
    "this account";
  const employeeName =
    `${challenge.details.employeeFirstName} ${challenge.details.employeeLastName}`.trim() ||
    "this staff profile";
  const isMismatch = challenge.kind === "name_mismatch";
  const title = isMismatch ? "Name mismatch found" : "Account found";

  return (
    <Modal
      animationType="slide"
      allowSwipeDismissal
      onRequestClose={() => {
        if (!isPending) {
          onCancel();
        }
      }}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      visible
    >
      <Screen
        bottomPaddingMode="modal"
        stickyHeader={
          <ModalHeader
            closeDisabled={isPending}
            subtitle={
              isMismatch
                ? "Review the existing account before linking it."
                : "Confirm that this is the right app account."
            }
            title={title}
            onClose={onCancel}
          />
        }
        stickyHeaderTopPadding={15}
      >
        <View style={styles.modalBody}>
          <View style={styles.modalInfoPanel}>
            <Text style={styles.modalInfoTitle}>
              {isMismatch
                ? "The account name is different"
                : "Existing app account found"}
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
                isPending
                  ? "Linking..."
                  : isMismatch
                    ? "Use Account Name"
                    : "Link Existing Account"
              }
              onPress={onConfirm}
              tone="secondary"
            />
            <Button
              disabled={isPending}
              label="Cancel"
              onPress={onCancel}
              tone="neutral"
            />
          </View>
        </View>
      </Screen>
    </Modal>
  );
}

function buildLookupMaps(data: MobileBootstrapResponse | undefined) {
  return {
    focusAreas: new Map(
      (data?.focusAreas ?? []).map((item) => [item.id, item.name]),
    ),
    roles: new Map((data?.roles ?? []).map((item) => [item.id, item.name])),
    certifications: new Map(
      (data?.certifications ?? []).map((item) => [item.id, item.name]),
    ),
    departments: new Map(
      (data?.departments ?? []).map((item) => [item.id, item.name]),
    ),
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

function formatIdList(ids: number[], map: Map<number, string>): string {
  const values = ids
    .map((id) => map.get(id))
    .filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(", ") : "None";
}

function getInitials(person: MobilePerson): string {
  const initials = [person.firstName, person.lastName]
    .map((part) => part.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join("");
  return initials || "?";
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
  onChange,
  onCancel,
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
  onChange: (draft: EditDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [focusedField, setFocusedField] = useState<
    "firstName" | "lastName" | "phone" | "email" | "contactNotes" | null
  >(null);
  const fieldErrors = {
    firstName: getStaffNameError(draft.firstName, "First name"),
    lastName: getStaffNameError(draft.lastName, "Last name"),
    phone: getOptionalUsPhoneError(draft.phone),
    email: getRequiredStaffEmailError(draft.email),
    contactNotes: getStaffNotesError(draft.contactNotes),
    focusAreaIds:
      draft.focusAreaIds.length === 0 ? "Select at least one focus area" : null,
  };
  const hasValidationErrors = Object.values(fieldErrors).some(Boolean);
  const setField = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };
  const toggle = (key: "focusAreaIds" | "roleIds", id: number) => {
    const current = draft[key];
    setField(
      key,
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
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
            onToggle={(id) =>
              setField("employmentType", id === 1 ? "part_time" : "full_time")
            }
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
            selectedIds={
              draft.certificationId == null ? [-1] : [draft.certificationId]
            }
            onToggle={(id) =>
              setField("certificationId", id === -1 ? null : id)
            }
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
          disabled={disabled || hasValidationErrors}
          label={disabled ? "Saving..." : "Save changes"}
          onPress={onSave}
        />
        <Button
          compact
          disabled={disabled}
          label="Discard"
          onPress={onCancel}
          tone="neutral"
        />
      </View>
    </>
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
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
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
    ...mobileText.sectionTitle,
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
  modalBody: {
    gap: 16,
  },
  modalInfoPanel: {
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  modalInfoTitle: {
    ...mobileText.rowTitle,
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
