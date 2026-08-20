import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import type {
  MobileFocusArea,
  MobileNamedItem,
  MobilePersonUpdateBody,
  MobileProfileResponse,
} from "@dubgrid/contracts";
import {
  getOptionalUsPhoneError,
  getRequiredStaffEmailError,
  getStaffNameError,
  getStaffNotesError,
  normalizeOptionalUsPhone,
  normalizeRequiredStaffEmail,
  normalizeStaffName,
  normalizeStaffNotes,
} from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useNavigationDiscardGuard } from "../../../shared/hooks/useNavigationDiscardGuard";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import {
  createProfileChangeRequest,
  getProfile,
  updateMobilePerson,
  updateProfileAccount,
  updateProfilePhone,
} from "../../../shared/lib/api";
import {
  getDepartmentNames,
  getScheduledDepartmentNames,
  MANAGEMENT_DEPARTMENT_LABELS,
} from "../../../shared/lib/departments";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { singularLabelNoun } from "../../../shared/lib/labels";
import { queryClient } from "../../../shared/lib/query-client";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  ProfileChoiceGroup,
  ProfileInfoRow,
  ProfileList,
  ProfilePanel,
  ProfileSection,
  ProfileTextInput,
  formatProfileStatus,
} from "../components/ProfilePrimitives";
import { ProfileSkeleton } from "../components/ProfileSkeleton";

const PENDING_PROFILE_CHANGE_MESSAGE = "A profile change request is pending admin review.";

type LinkedEmployee = NonNullable<MobileProfileResponse["linkedEmployee"]>;

type ProfileDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  employmentType: LinkedEmployee["employmentType"];
  certificationId: number | null;
  focusAreaIds: number[];
  roleIds: number[];
  departmentIds: number[];
  requestNote: string;
};

function makeDraft(
  profile: MobileProfileResponse,
  linkedEmployee: LinkedEmployee | null,
): ProfileDraft {
  return {
    firstName: profile.user.firstName ?? "",
    lastName: profile.user.lastName ?? "",
    email: profile.user.email ?? "",
    phone: linkedEmployee?.phone ?? "",
    employmentType: linkedEmployee?.employmentType ?? "full_time",
    certificationId: linkedEmployee?.certificationId ?? null,
    focusAreaIds: linkedEmployee?.focusAreaIds ?? [],
    roleIds: linkedEmployee?.roleIds ?? [],
    departmentIds: linkedEmployee?.departmentIds ?? [],
    requestNote: "",
  };
}

function arrayEqual(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Whether the draft differs from what is saved.
 *
 * Module scope, and used by both the edit panel's buttons and the screen's
 * unsaved-changes guard. While this lived inside the panel the screen couldn't
 * see it, so back navigation had no idea there was anything to lose; computing
 * it twice would be worse still, because then Cancel and the back button could
 * disagree about whether to ask.
 *
 * `requestNote` deliberately doesn't count, matching the Save button: the note
 * only ever accompanies a change, so on its own there is nothing to send.
 */
function profileDraftHasChanges(
  draft: ProfileDraft,
  profile: MobileProfileResponse,
  linkedEmployee: LinkedEmployee | null,
): boolean {
  const saved = makeDraft(profile, linkedEmployee);

  return (
    draft.firstName.trim() !== saved.firstName.trim() ||
    draft.lastName.trim() !== saved.lastName.trim() ||
    draft.email.trim().toLowerCase() !== saved.email.trim().toLowerCase() ||
    (linkedEmployee != null &&
      (draft.phone.trim() !== saved.phone ||
        draft.employmentType !== saved.employmentType ||
        draft.certificationId !== saved.certificationId ||
        !arrayEqual(draft.focusAreaIds, saved.focusAreaIds) ||
        !arrayEqual(draft.roleIds, saved.roleIds)))
  );
}

export default function ProfileWorkScreen() {
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  // Only the save confirmation now: the discard half belongs to the guard,
  // which has to answer to back navigation as well as to the Cancel button.
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const profileQuery = useQuery({
    queryKey: ["mobile", "profile", accessToken],
    queryFn: () => getProfile(accessToken!),
    enabled: Boolean(accessToken),
  });
  const bootstrapQuery = useBootstrap(accessToken);
  const manualRefresh = useManualRefresh(() => profileQuery.refetch());
  const profile = profileQuery.data ?? null;
  const linkedEmployee = profile?.linkedEmployee ?? null;
  const canEditProfileDirectly = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);
  const isNameRequest = Boolean(
    !canEditProfileDirectly &&
    profile &&
    draft &&
    (draft.firstName.trim() !== (profile.user.firstName ?? "").trim() ||
      draft.lastName.trim() !== (profile.user.lastName ?? "").trim()),
  );
  const hasOtherChanges = Boolean(
    profile &&
    draft &&
    (draft.email.trim().toLowerCase() !== (profile.user.email ?? "").trim().toLowerCase() ||
      (linkedEmployee && draft.phone.trim() !== (linkedEmployee.phone ?? ""))),
  );
  const contentState = useMobileContentState({
    hasData: Boolean(profile),
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
  });
  const focusAreas = bootstrapQuery.data?.focusAreas ?? profile?.focusAreas ?? [];
  const roles = bootstrapQuery.data?.roles ?? [];
  const certifications = bootstrapQuery.data?.certifications ?? [];
  const focusAreaNames =
    linkedEmployee?.focusAreaIds
      .map((id) => focusAreas.find((focusArea) => focusArea.id === id)?.name)
      .filter((value): value is string => Boolean(value)) ?? [];
  const roleNames =
    linkedEmployee?.roleIds
      .map((id) => roles.find((role) => role.id === id)?.name)
      .filter((value): value is string => Boolean(value)) ?? [];
  const employmentLabel =
    linkedEmployee?.employmentType === "part_time" ? "Part-time" : "Full-time";
  const departmentNames = getScheduledDepartmentNames(
    linkedEmployee?.focusAreaIds ?? [],
    focusAreas,
    bootstrapQuery.data?.departments,
  );
  const managementDepartmentNames = getDepartmentNames(
    profile?.managementDepartmentIds ?? [],
    bootstrapQuery.data?.departments,
  );
  const certificationName = linkedEmployee
    ? linkedEmployee.certificationId == null
      ? "None"
      : (certifications.find((item) => item.id === linkedEmployee.certificationId)?.name ??
        "Not set")
    : "Not set";

  useEffect(() => {
    if (profile && !editing) {
      setDraft(makeDraft(profile, linkedEmployee));
    }
  }, [editing, profile, linkedEmployee?.id, linkedEmployee?.version]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken || !profile || !draft) {
        throw new Error("Profile unavailable");
      }

      const savedEmail = (profile.user.email ?? "").trim().toLowerCase();
      const normalizedEmail = normalizeRequiredStaffEmail(draft.email);
      const normalizedFirst = normalizeStaffName(draft.firstName);
      const normalizedLast = normalizeStaffName(draft.lastName);
      const normalizedPhone = normalizeOptionalUsPhone(draft.phone);

      const emailChanged = normalizedEmail !== savedEmail;
      const nameChanged =
        normalizedFirst !== (profile.user.firstName ?? "") ||
        normalizedLast !== (profile.user.lastName ?? "");
      const phoneChanged =
        Boolean(linkedEmployee) && normalizedPhone !== (linkedEmployee?.phone ?? "");
      const workChanged =
        Boolean(linkedEmployee) &&
        (draft.employmentType !== linkedEmployee?.employmentType ||
          draft.certificationId !== linkedEmployee?.certificationId ||
          !arrayEqual(draft.focusAreaIds, linkedEmployee?.focusAreaIds ?? []) ||
          !arrayEqual(draft.roleIds, linkedEmployee?.roleIds ?? []));

      if (emailChanged) {
        const result = await getSupabaseClient().auth.updateUser({
          email: normalizedEmail,
        });
        if (result.error) {
          throw result.error;
        }
      }

      if (canEditProfileDirectly) {
        if (nameChanged) {
          await updateProfileAccount(accessToken, {
            firstName: normalizedFirst || null,
            lastName: normalizedLast || null,
          });
        }

        if (linkedEmployee && (nameChanged || phoneChanged || workChanged)) {
          const body: MobilePersonUpdateBody = {
            expectedVersion: linkedEmployee.version,
            firstName: normalizedFirst,
            lastName: normalizedLast,
            employmentType: draft.employmentType,
            phone: normalizedPhone,
            email: linkedEmployee.email,
            contactNotes: linkedEmployee.contactNotes,
            certificationId: draft.certificationId,
            focusAreaIds: draft.focusAreaIds,
            roleIds: draft.roleIds,
            departmentIds: draft.departmentIds,
          };
          await updateMobilePerson(accessToken, linkedEmployee.id, body);
        }
      } else {
        if (phoneChanged && linkedEmployee) {
          await updateProfilePhone(accessToken, {
            phone: normalizedPhone,
            expectedVersion: linkedEmployee.version,
          });
        }

        if (nameChanged) {
          const requestedChanges: Record<string, string> = {};
          if (normalizedFirst !== (profile.user.firstName ?? "")) {
            requestedChanges.firstName = normalizedFirst;
          }
          if (normalizedLast !== (profile.user.lastName ?? "")) {
            requestedChanges.lastName = normalizedLast;
          }
          await createProfileChangeRequest(accessToken, {
            type: "profile_update",
            requestedChanges,
            requestNote: normalizeStaffNotes(draft.requestNote),
          });
        }
      }

      return {
        emailChanged,
        nameChanged,
        requestedNameChange: !canEditProfileDirectly && nameChanged,
      };
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not save profile",
        fallbackMessage: "We couldn't save your profile right now.",
      });
    },
    onSuccess: async (result) => {
      setEditing(false);
      await Promise.all([
        profileQuery.refetch(),
        bootstrapQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["mobile", "people"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "person"] }),
      ]);
      const message = result.requestedNameChange
        ? "Your changes were saved and a name change request was sent."
        : result.emailChanged
          ? "Check your email to confirm the new address."
          : "Your profile was updated.";
      pushToast({
        tone: "success",
        title: "Profile updated",
        message,
      });
    },
  });

  function startEditing() {
    if (!profile) return;
    setDraft(makeDraft(profile, linkedEmployee));
    setEditing(true);
  }

  function discardChanges() {
    if (profile) {
      setDraft(makeDraft(profile, linkedEmployee));
    }
  }

  const hasChanges = Boolean(
    profile && draft && profileDraftHasChanges(draft, profile, linkedEmployee),
  );
  // `editing && hasChanges`, not just `editing`: on iOS the whole screen is a
  // back-swipe target, so a guard that fired for an untouched open panel would
  // put a confirmation in front of an ordinary swipe back.
  const guard = useUnsavedChangesGuard({
    isDirty: editing && hasChanges,
    disabled: saveMutation.isPending,
    onDiscard: discardChanges,
    onClose: () => setEditing(false),
  });
  // Header back, Android hardware back and the iOS back swipe ask too, through
  // this same confirmation rather than a second one of their own.
  useNavigationDiscardGuard(guard);

  return (
    <Screen
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ProfileSkeleton rowsPerSection={3} sections={3} showHero={false} />
        ) : null
      ) : contentState.kind === "error" ? (
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
      ) : !profile ? (
        <EmptyStateCard
          fillScreen
          body="We couldn't load your profile."
          iconName="person-circle-outline"
          title="Profile unavailable"
        />
      ) : (
        <>
          {profile.pendingProfileChangeRequest ? (
            <StatusBanner body={PENDING_PROFILE_CHANGE_MESSAGE} title="Request pending" />
          ) : null}

          {/* No organization block here. This page is the account and staff
              record it can edit; which organization that record lives in is the
              profile hub's job, and printing it again above the editable fields
              made the first thing on "Profile details" the one thing on it that
              isn't a profile detail. */}
          {editing && draft ? (
            <EditPanel
              canEditProfileDirectly={canEditProfileDirectly}
              certificationLabel={profile.currentOrg.labels.certification}
              certifications={certifications}
              draft={draft}
              focusAreaLabel={profile.currentOrg.labels.focusArea}
              focusAreas={focusAreas}
              hasLinkedEmployee={Boolean(linkedEmployee)}
              isNameRequest={isNameRequest}
              hasChanges={hasChanges}
              onCancel={guard.requestClose}
              onChange={setDraft}
              onDiscard={discardChanges}
              onSave={() => {
                if (!profile || !draft) return;
                const firstNameError = getStaffNameError(draft.firstName, "First name");
                const lastNameError = getStaffNameError(draft.lastName, "Last name");
                const emailError = getRequiredStaffEmailError(draft.email);
                const phoneError = linkedEmployee ? getOptionalUsPhoneError(draft.phone) : null;
                const requestNoteError = getStaffNotesError(draft.requestNote);
                const focusAreaError =
                  canEditProfileDirectly && linkedEmployee && draft.focusAreaIds.length === 0
                    ? `Select at least one ${singularLabelNoun(profile.currentOrg.labels.focusArea)}.`
                    : null;
                const firstError =
                  firstNameError ??
                  lastNameError ??
                  emailError ??
                  phoneError ??
                  requestNoteError ??
                  focusAreaError;
                if (firstError) {
                  pushToast({
                    tone: "warning",
                    title: "Check profile",
                    message: firstError,
                  });
                  return;
                }
                setShowSaveConfirmation(true);
              }}
              roleLabel={profile.currentOrg.labels.role}
              roles={roles}
              saving={saveMutation.isPending}
            />
          ) : (
            <>
              <ProfileSection title="Account">
                <ProfileList>
                  <ProfileInfoRow
                    iconName="person-circle-outline"
                    label="Name"
                    value={
                      [profile.user.firstName, profile.user.lastName]
                        .filter(Boolean)
                        .join(" ")
                        .trim() || "Not set"
                    }
                  />
                  <ProfileInfoRow
                    iconName="mail-outline"
                    isLast={!linkedEmployee}
                    label="Email"
                    value={profile.user.email || "Not set"}
                  />
                  {linkedEmployee ? (
                    <ProfileInfoRow
                      iconName="call-outline"
                      isLast
                      label="Phone"
                      value={linkedEmployee.phone || "Not set"}
                    />
                  ) : null}
                </ProfileList>
              </ProfileSection>

              {linkedEmployee ? (
                <ProfileSection title="Staff profile">
                  <ProfileList>
                    <ProfileInfoRow
                      iconName="pulse-outline"
                      label="Status"
                      value={formatProfileStatus(linkedEmployee.status)}
                    />
                    {/* The number web prints beside your name on a staff
                        profile, and the one an admin will ask you for. */}
                    {linkedEmployee.employeeNumber != null ? (
                      <ProfileInfoRow
                        iconName="card-outline"
                        label="Employee ID"
                        value={`#${linkedEmployee.employeeNumber}`}
                      />
                    ) : null}
                    <ProfileInfoRow
                      iconName="briefcase-outline"
                      label="Employment"
                      value={employmentLabel}
                    />
                    <ProfileInfoRow
                      iconName="ribbon-outline"
                      label={profile.currentOrg.labels.certification}
                      value={certificationName}
                    />
                    <ProfileInfoRow
                      iconName="business-outline"
                      label={profile.currentOrg.labels.department}
                      value={departmentNames.length > 0 ? departmentNames.join(", ") : "Not set"}
                    />
                    {/* Its own row beside the scheduled one: where you are
                        scheduled and what you manage are different facts, and
                        a management-only account has the second without the
                        first. */}
                    {managementDepartmentNames.length > 0 ? (
                      <ProfileInfoRow
                        iconName="briefcase-outline"
                        label={MANAGEMENT_DEPARTMENT_LABELS.plural}
                        value={managementDepartmentNames.join(", ")}
                      />
                    ) : null}
                    <ProfileInfoRow
                      iconName="albums-outline"
                      label={profile.currentOrg.labels.focusArea}
                      value={focusAreaNames.length > 0 ? focusAreaNames.join(", ") : "Not set"}
                    />
                    <ProfileInfoRow
                      iconName="people-circle-outline"
                      isLast
                      label={profile.currentOrg.labels.role}
                      value={roleNames.length > 0 ? roleNames.join(", ") : "Not set"}
                    />
                  </ProfileList>
                </ProfileSection>
              ) : (
                <ProfileSection title="Staff profile">
                  <EmptyStateCard
                    body={
                      canEditProfileDirectly
                        ? "Open the People tab to link your account to a staff profile."
                        : "Ask an admin to link your account to a staff profile."
                    }
                    compact
                    iconName="person-circle-outline"
                    title="Not linked to a staff profile"
                  />
                </ProfileSection>
              )}

              <View style={styles.actionsRow}>
                <Button compact label="Edit" onPress={startEditing} tone="secondary" />
              </View>
            </>
          )}
        </>
      )}
      <ConfirmationModal
        body={
          isNameRequest
            ? hasOtherChanges
              ? "Your new name will be sent to an admin for review. Your other edits will be saved."
              : "Your new name will be sent to an admin for review."
            : canEditProfileDirectly
              ? "Your profile will be updated."
              : "Your changes will be saved."
        }
        confirmLabel={isNameRequest ? "Send request" : "Save"}
        confirmPendingLabel={isNameRequest ? "Sending" : "Saving"}
        loading={saveMutation.isPending}
        onCancel={() => setShowSaveConfirmation(false)}
        onConfirm={() => {
          setShowSaveConfirmation(false);
          saveMutation.mutate();
        }}
        title={isNameRequest ? "Send name change request?" : "Save these changes?"}
        visible={showSaveConfirmation}
      />
      <ConfirmationModal {...guard.confirmationProps} />
    </Screen>
  );
}

function EditPanel({
  canEditProfileDirectly,
  certificationLabel,
  certifications,
  draft,
  focusAreaLabel,
  focusAreas,
  hasChanges,
  hasLinkedEmployee,
  isNameRequest,
  onCancel,
  onChange,
  onDiscard,
  onSave,
  roleLabel,
  roles,
  saving,
}: {
  canEditProfileDirectly: boolean;
  certificationLabel: string;
  certifications: MobileNamedItem[];
  draft: ProfileDraft;
  focusAreaLabel: string;
  focusAreas: MobileFocusArea[];
  hasChanges: boolean;
  hasLinkedEmployee: boolean;
  isNameRequest: boolean;
  onCancel: () => void;
  onChange: (draft: ProfileDraft) => void;
  onDiscard: () => void;
  onSave: () => void;
  roleLabel: string;
  roles: MobileNamedItem[];
  saving: boolean;
}) {
  const [focusedField, setFocusedField] = useState<
    "firstName" | "lastName" | "email" | "phone" | "requestNote" | null
  >(null);

  const fieldErrors = {
    firstName: getStaffNameError(draft.firstName, "First name"),
    lastName: getStaffNameError(draft.lastName, "Last name"),
    email: getRequiredStaffEmailError(draft.email),
    phone: hasLinkedEmployee ? getOptionalUsPhoneError(draft.phone) : null,
    requestNote: getStaffNotesError(draft.requestNote),
    focusAreaIds:
      canEditProfileDirectly && hasLinkedEmployee && draft.focusAreaIds.length === 0
        ? `Select at least one ${singularLabelNoun(focusAreaLabel)}.`
        : null,
  };
  const hasValidationErrors = Object.values(fieldErrors).some(Boolean);

  const setField = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
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
      {!canEditProfileDirectly ? (
        <StatusBanner
          body="Name changes need admin review. Email and phone updates apply immediately."
          title="Editing your profile"
          tone="info"
        />
      ) : null}
      <ProfileSection title="Account">
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
          {hasLinkedEmployee ? (
            <ProfileTextInput
              accessibilityLabel="Phone"
              editable={!saving}
              error={fieldErrors.phone}
              focused={focusedField === "phone"}
              keyboardType="phone-pad"
              label="Phone"
              placeholder="Phone"
              value={draft.phone}
              onBlur={() => setFocusedField(null)}
              onChangeText={(value) => setField("phone", value)}
              onFocus={() => setFocusedField("phone")}
            />
          ) : null}
        </ProfilePanel>
      </ProfileSection>

      {hasLinkedEmployee && canEditProfileDirectly ? (
        <>
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
        </>
      ) : null}

      {isNameRequest ? (
        <ProfileSection
          description="You can't change your own name directly. Add an optional note and send the request to your admin for review."
          title="Name change request"
        >
          <ProfilePanel>
            <ProfileTextInput
              accessibilityLabel="Note for admins"
              editable={!saving}
              error={fieldErrors.requestNote}
              focused={focusedField === "requestNote"}
              label="Note for admins (optional)"
              multiline
              placeholder="Add context for your admin"
              value={draft.requestNote}
              onBlur={() => setFocusedField(null)}
              onChangeText={(value) => setField("requestNote", value)}
              onFocus={() => setFocusedField("requestNote")}
            />
          </ProfilePanel>
        </ProfileSection>
      ) : null}

      <View style={styles.actionsRow}>
        <Button
          compact
          disabled={saving || !hasChanges || hasValidationErrors}
          label={isNameRequest ? "Send request" : "Save changes"}
          loading={saving}
          loadingLabel={isNameRequest ? "Sending" : "Saving"}
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

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});
