import { useEffect, useRef, useState } from "react";
import { mobileSpace } from "../../../shared/theme/tokens";
import { useMutation, useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type {
  MobileFocusArea,
  MobileBootstrapRole,
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
import { getMobileEditorDismissLabel } from "@dubgrid/design-tokens";
import { Button } from "../../../shared/components/Button";
import { InlineError } from "../../../shared/components/InlineError";
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
import { getClientFriendlyErrorMessage } from "../../../shared/lib/errors";
import { singularLabelNoun } from "../../../shared/lib/labels";
import { queryClient } from "../../../shared/lib/query-client";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { ManagementAccessSheet } from "../../people/components/ManagementAccessSheet";
import { SectionNotice } from "../../people/components/SectionNotice";
import type { ManagementAccessSubject } from "../../people/lib/managementAccess";
import {
  ProfileChoiceGroup,
  ProfileInfoRow,
  ProfileList,
  ProfileNavRow,
  ProfilePanel,
  ProfileSection,
  ProfileTextInput,
  formatProfileStatus,
} from "../components/ProfilePrimitives";
import { isRoleCertificationBlocked } from "../lib/role-certification";
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
  contactNotes: string;
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
    contactNotes: linkedEmployee?.contactNotes ?? "",
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
        !arrayEqual(draft.roleIds, saved.roleIds) ||
        draft.contactNotes.trim() !== saved.contactNotes.trim()))
  );
}

/**
 * Field-level validation for the edit form.
 *
 * Module scope, same reasoning as `profileDraftHasChanges` above: the footer
 * Save button's `disabled` state and the panel's inline per-field errors both
 * need this, and computing it twice by hand risks the two disagreeing about
 * whether the draft is actually valid.
 */
function getProfileEditFieldErrors(
  draft: ProfileDraft,
  {
    canEditProfileDirectly,
    hasLinkedEmployee,
    isManagementUser,
    focusAreaLabel,
  }: {
    canEditProfileDirectly: boolean;
    hasLinkedEmployee: boolean;
    /**
     * Someone with management departments can come off the schedule without
     * being orphaned, the same allowance the person page and web's editor
     * make; for anyone else an empty set is a missing answer.
     */
    isManagementUser: boolean;
    focusAreaLabel: string;
  },
) {
  return {
    firstName: getStaffNameError(draft.firstName, "First name"),
    lastName: getStaffNameError(draft.lastName, "Last name"),
    email: getRequiredStaffEmailError(draft.email),
    phone: hasLinkedEmployee ? getOptionalUsPhoneError(draft.phone) : null,
    contactNotes: getStaffNotesError(draft.contactNotes),
    requestNote: getStaffNotesError(draft.requestNote),
    focusAreaIds:
      canEditProfileDirectly &&
      hasLinkedEmployee &&
      !isManagementUser &&
      draft.focusAreaIds.length === 0
        ? `Select at least one ${singularLabelNoun(focusAreaLabel)}.`
        : null,
  };
}

export default function ProfileWorkScreen() {
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const seededIdentityRef = useRef<string | null>(null);
  const draftTouchedRef = useRef(false);
  // Only the save confirmation now: the discard half belongs to the guard,
  // which has to answer to back navigation as well as to the Cancel button.
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const profileQuery = useQuery({
    queryKey: mobileQueryKeys.profile(accessToken),
    queryFn: ({ signal }) => getProfile(accessToken!, signal),
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
  const hasEmailChange = Boolean(
    profile &&
    draft &&
    draft.email.trim().toLowerCase() !== (profile.user.email ?? "").trim().toLowerCase(),
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
  const useCompactRoleCertificationLabels =
    bootstrapQuery.data?.currentOrg?.useCompactRoleCertificationLabels ?? false;
  const departmentNames = getScheduledDepartmentNames(
    linkedEmployee?.focusAreaIds ?? [],
    focusAreas,
    bootstrapQuery.data?.departments,
  );
  const managementDepartmentNames = getDepartmentNames(
    profile?.managementDepartmentIds ?? [],
    bootstrapQuery.data?.departments,
  );
  const isManagementUser = (profile?.managementDepartmentIds.length ?? 0) > 0;
  // Super-admin/gridmaster only, the same bar web holds management access
  // behind on its profile page: the row below opens the same sheet a manager
  // uses on a teammate, aimed at your own membership.
  const canManageManagementAccess = Boolean(
    bootstrapQuery.data?.permissions.canManageManagementAccess,
  );
  const managementDepartments = (bootstrapQuery.data?.departments ?? []).filter(
    (department) => department.type === "management",
  );
  const [showManagementAccess, setShowManagementAccess] = useState(false);
  const managementSubject: ManagementAccessSubject | null =
    profile && linkedEmployee
      ? {
          id: linkedEmployee.id,
          firstName: linkedEmployee.firstName,
          lastName: linkedEmployee.lastName,
          email: linkedEmployee.email,
          orgRole: profile.currentMembership.orgRole,
          userId: profile.user.id,
          membershipUpdatedAt: profile.membershipUpdatedAt,
          managementDepartmentIds: profile.managementDepartmentIds,
          pendingInvitation: null,
        }
      : null;
  useEffect(() => {
    if (!profile) return;
    const identityKey = `${accessToken ?? "anonymous"}:${profile.user.id}:${linkedEmployee?.id ?? "no-employee"}`;
    if (seededIdentityRef.current === identityKey && draftTouchedRef.current) return;
    seededIdentityRef.current = identityKey;
    setDraft(makeDraft(profile, linkedEmployee));
  }, [accessToken, profile, linkedEmployee]);

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
          !arrayEqual(draft.roleIds, linkedEmployee?.roleIds ?? []) ||
          draft.contactNotes.trim() !== (linkedEmployee?.contactNotes ?? "").trim());

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
            contactNotes: normalizeStaffNotes(draft.contactNotes),
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

      let emailFailure: string | null = null;
      if (emailChanged) {
        const result = await getSupabaseClient().auth.updateUser({
          email: normalizedEmail,
        });
        if (result.error) {
          emailFailure =
            nameChanged || phoneChanged || workChanged
              ? "Your profile was saved, but we couldn't start the email change. Try the email again."
              : "We couldn't start the email change. Try again.";
        }
      }

      return {
        emailChanged,
        emailFailure,
        nameChanged,
        requestedNameChange: !canEditProfileDirectly && nameChanged,
      };
    },
    onMutate: () => setSaveError(null),
    onError: (error) => {
      setSaveError(
        getClientFriendlyErrorMessage(error, "We couldn't save your profile right now."),
      );
    },
    onSuccess: async (result) => {
      setShowSaveConfirmation(false);
      const [profileResult] = await Promise.all([
        profileQuery.refetch(),
        bootstrapQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["mobile", "people"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "person"] }),
      ]);
      if (profileResult.data) {
        draftTouchedRef.current = false;
        setDraft(makeDraft(profileResult.data, profileResult.data.linkedEmployee ?? null));
      }
      if (result.emailFailure) {
        pushToast({
          tone: "warning",
          title: result.emailChanged ? "Email not changed" : "Profile updated",
          message: result.emailFailure,
        });
        return;
      }
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

  function discardChanges() {
    draftTouchedRef.current = false;
    if (profile) {
      setDraft(makeDraft(profile, linkedEmployee));
    }
  }

  const hasChanges = Boolean(
    profile && draft && profileDraftHasChanges(draft, profile, linkedEmployee),
  );
  // No `onClose`: unlike PersonDetailScreen there is no view mode to fall back
  // to, so nothing here calls `requestClose`. Leaving is `router.back()`, and
  // `useNavigationDiscardGuard` below is what puts the confirmation in front of
  // it. `hasChanges` alone is a tight enough flag on a screen that is only ever
  // the editor: on iOS the whole surface is a back-swipe target, so a guard
  // keyed on anything looser would interrupt an ordinary swipe back.
  const guard = useUnsavedChangesGuard({
    isDirty: hasChanges,
    disabled: saveMutation.isPending,
    onDiscard: discardChanges,
  });
  // Header back, Android hardware back and the iOS back swipe ask too, through
  // this same confirmation rather than a second one of their own.
  useNavigationDiscardGuard(guard);

  const editFieldErrors =
    draft && profile
      ? getProfileEditFieldErrors(draft, {
          canEditProfileDirectly,
          hasLinkedEmployee: Boolean(linkedEmployee),
          isManagementUser,
          focusAreaLabel: profile.currentOrg.labels.focusArea,
        })
      : null;
  const hasValidationErrors = editFieldErrors
    ? Object.values(editFieldErrors).some(Boolean)
    : false;

  function handleSave() {
    if (!profile || !draft || !editFieldErrors) return;
    const firstError =
      editFieldErrors.firstName ??
      editFieldErrors.lastName ??
      editFieldErrors.email ??
      editFieldErrors.phone ??
      editFieldErrors.requestNote ??
      editFieldErrors.focusAreaIds;
    if (firstError) {
      pushToast({
        tone: "warning",
        title: "Check profile",
        message: firstError,
      });
      return;
    }
    if (isNameRequest || hasEmailChange) {
      setShowSaveConfirmation(true);
      return;
    }
    return saveMutation.mutateAsync();
  }

  const footer =
    draft && profile ? (
      <View style={styles.actionsRow}>
        <View style={styles.actionButton}>
          <Button
            compact
            disabled={saveMutation.isPending}
            // Same tri-state web uses. Discard resets the fields and stays on
            // the screen; leaving with edits in hand is the back gesture, which
            // `useNavigationDiscardGuard` already routes through a confirmation.
            label={getMobileEditorDismissLabel({ hasUnsavedChanges: hasChanges })}
            onPress={hasChanges ? discardChanges : () => router.back()}
            tone="plain"
          />
        </View>
        <View style={styles.actionButton}>
          <Button
            compact
            disabled={saveMutation.isPending || !hasChanges || hasValidationErrors}
            label={isNameRequest ? "Send request" : "Save changes"}
            loading={saveMutation.isPending}
            onPress={handleSave}
          />
        </View>
      </View>
    ) : null;

  return (
    <Screen
      bottomPaddingMode="tabbed"
      footer={footer}
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      // A skeleton is a placeholder, not content: it must not scroll, and there
      // is nothing to pull-to-refresh while the thing is already loading.
      // Everything else scrolls — `Screen`'s `flexGrow: 1` gives a `fillScreen`
      // state real space to centre in without leaving scroll mode.
      scrollEnabled={contentState.kind !== "loading"}
    >
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ProfileSkeleton
            // The staff record (status, department, focus area) only for a
            // member the organization schedules; the account fields for all.
            sections={
              bootstrapQuery.data?.linkedEmployee ? [{ rows: 3 }, { rows: 4 }] : [{ rows: 4 }]
            }
            showHero={false}
          />
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
          {saveError && !showSaveConfirmation ? <InlineError message={saveError} /> : null}
          {draft ? (
            <>
              {linkedEmployee ? (
                <ProfileSection title="Staff profile">
                  <ProfileList>
                    <ProfileInfoRow
                      iconName="pulse-outline"
                      label="Status"
                      value={formatProfileStatus(linkedEmployee.status)}
                    />
                    {linkedEmployee.employeeNumber != null ? (
                      <ProfileInfoRow
                        iconName="card-outline"
                        label="Employee ID"
                        value={`#${linkedEmployee.employeeNumber}`}
                      />
                    ) : null}
                    <ProfileInfoRow
                      iconName="business-outline"
                      isLast={!canManageManagementAccess && managementDepartmentNames.length === 0}
                      label={profile.currentOrg.labels.department}
                      value={departmentNames.length > 0 ? departmentNames.join(", ") : "Not set"}
                    />
                    {/* Your own management departments, editable where web
                        lets a super admin edit them, from the same sheet a
                        manager gets on a teammate. Clearing every department
                        there is how management access is given up. */}
                    {canManageManagementAccess && managementSubject ? (
                      <ProfileNavRow
                        iconName="briefcase-outline"
                        isLast
                        label={MANAGEMENT_DEPARTMENT_LABELS.plural}
                        value={
                          managementDepartmentNames.length > 0
                            ? managementDepartmentNames.join(", ")
                            : "Not in management"
                        }
                        onPress={() => setShowManagementAccess(true)}
                      />
                    ) : managementDepartmentNames.length > 0 ? (
                      <ProfileInfoRow
                        iconName="briefcase-outline"
                        isLast
                        label={MANAGEMENT_DEPARTMENT_LABELS.plural}
                        value={managementDepartmentNames.join(", ")}
                      />
                    ) : null}
                  </ProfileList>
                </ProfileSection>
              ) : null}
              <EditPanel
                canEditProfileDirectly={canEditProfileDirectly}
                certificationLabel={profile.currentOrg.labels.certification}
                certifications={certifications}
                draft={draft}
                focusAreaLabel={profile.currentOrg.labels.focusArea}
                focusAreas={focusAreas}
                hasLinkedEmployee={Boolean(linkedEmployee)}
                isManagementUser={isManagementUser}
                isNameRequest={isNameRequest}
                onChange={(nextDraft) => {
                  draftTouchedRef.current = true;
                  setDraft(nextDraft);
                }}
                roleLabel={profile.currentOrg.labels.role}
                roles={roles}
                useCompactRoleCertificationLabels={useCompactRoleCertificationLabels}
                saving={saveMutation.isPending}
              />
            </>
          ) : null}
        </>
      )}
      <ConfirmationModal
        body={[
          isNameRequest
            ? hasOtherChanges
              ? "Your new name will be sent to an admin for review. Your other edits will be saved."
              : "Your new name will be sent to an admin for review."
            : null,
          hasEmailChange
            ? `Request a sign-in email change to ${draft?.email.trim()}. Check your email to confirm the change.`
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        error={saveError}
        confirmLabel={hasEmailChange ? "Request changes" : "Send request"}
        loading={saveMutation.isPending}
        onCancel={() => {
          setSaveError(null);
          setShowSaveConfirmation(false);
        }}
        onConfirm={() => saveMutation.mutateAsync()}
        title={hasEmailChange ? "Change your sign-in email?" : "Send name change request?"}
        visible={showSaveConfirmation}
      />
      <ConfirmationModal {...guard.confirmationProps} />
      {canManageManagementAccess && managementSubject ? (
        <ManagementAccessSheet
          isSelf
          managementDepartments={managementDepartments}
          onDismiss={() => setShowManagementAccess(false)}
          person={managementSubject}
          visible={showManagementAccess}
        />
      ) : null}
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
  hasLinkedEmployee,
  isManagementUser,
  isNameRequest,
  onChange,
  roleLabel,
  roles,
  useCompactRoleCertificationLabels,
  saving,
}: {
  canEditProfileDirectly: boolean;
  certificationLabel: string;
  certifications: MobileNamedItem[];
  draft: ProfileDraft;
  focusAreaLabel: string;
  focusAreas: MobileFocusArea[];
  hasLinkedEmployee: boolean;
  isManagementUser: boolean;
  isNameRequest: boolean;
  onChange: (draft: ProfileDraft) => void;
  roleLabel: string;
  roles: MobileBootstrapRole[];
  useCompactRoleCertificationLabels: boolean;
  saving: boolean;
}) {
  const [focusedField, setFocusedField] = useState<
    "firstName" | "lastName" | "email" | "phone" | "contactNotes" | "requestNote" | null
  >(null);

  const fieldErrors = getProfileEditFieldErrors(draft, {
    canEditProfileDirectly,
    hasLinkedEmployee,
    isManagementUser,
    focusAreaLabel,
  });
  // Raised once for the whole section, the way the person page does: only a
  // management user can come off the schedule at all, and for them an empty
  // set is a consequence of saving rather than a missing answer.
  const assignmentNotices =
    isManagementUser && draft.focusAreaIds.length === 0
      ? ["Saving now removes you from the schedule. You'll keep management access."]
      : [];

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
            autoComplete="email"
            autoCorrect={false}
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
              autoComplete="tel"
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
            <ProfileChoiceGroup
              items={[
                { id: 0, name: "Full-time" },
                { id: 1, name: "Part-time" },
              ]}
              label="Employment"
              selection="single"
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
              selection="single"
              selectedIds={draft.certificationId == null ? [-1] : [draft.certificationId]}
              onToggle={(id) => setField("certificationId", id === -1 ? null : id)}
            />
          </ProfileSection>

          <ProfileSection title="Assignments">
            <SectionNotice messages={assignmentNotices} />
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
          </ProfileSection>

          <ProfileSection title="Notes">
            <ProfilePanel>
              <ProfileTextInput
                accessibilityLabel="Contact notes"
                editable={!saving}
                error={fieldErrors.contactNotes}
                focused={focusedField === "contactNotes"}
                label="Contact notes"
                multiline
                placeholder="Add notes"
                value={draft.contactNotes}
                onBlur={() => setFocusedField(null)}
                onChangeText={(value) => setField("contactNotes", value)}
                onFocus={() => setFocusedField("contactNotes")}
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
    </>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
    gap: mobileSpace.md,
  },
  actionButton: {
    flex: 1,
  },
});
