import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { AppText } from "../../../shared/components/AppText";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { InlineError } from "../../../shared/components/InlineError";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useNavigationDiscardGuard } from "../../../shared/hooks/useNavigationDiscardGuard";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import { updateMobilePerson } from "../../../shared/lib/api";
import { getClientFriendlyErrorMessage } from "../../../shared/lib/errors";
import { singularLabelNoun } from "../../../shared/lib/labels";
import { useToast } from "../../../shared/providers/ToastProvider";
import { mobileSpace } from "../../../shared/theme/tokens";
import {
  ProfileChoiceGroup,
  ProfilePanel,
  ProfileSection,
} from "../../profile/components/ProfilePrimitives";
import { isRoleCertificationBlocked } from "../../profile/lib/role-certification";
import { PersonFormSkeleton } from "../components/PersonFormSkeleton";
import { usePersonEditor } from "../hooks/usePersonEditor";

type ScheduleDraft = {
  certificationId: number | null;
  focusAreaIds: number[];
  roleIds: number[];
};

/**
 * Put a management-only person onto the schedule by giving them the scheduling
 * attributes they never had, the same thing web's
 * AddManagementUserToScheduleModal does. Coming back off the schedule is the
 * edit panel's job: clear every focus area there and save.
 *
 * A pushed screen rather than a sheet, for the same reason as management access:
 * it is a three-picker form, and stacking it over the person page put a third
 * modal on a stack iOS is unreliable about tearing down. Identity fields are
 * left out because the edit panel already owns them.
 */
export default function AddToScheduleScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const personId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { pushToast } = useToast();
  const { accessToken, bootstrapQuery, personQuery, person, contentState, updateCachedPerson } =
    usePersonEditor(personId);

  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [baselineSource, setBaselineSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seeded during render, keyed on the person, so the first painted frame shows
  // their current assignments and a background refetch can't wipe a selection.
  if (person && baselineSource !== person.id) {
    setBaselineSource(person.id);
    setDraft({
      certificationId: person.certificationId,
      focusAreaIds: [...person.focusAreaIds],
      roleIds: [...person.roleIds],
    });
  }

  const hasUnsavedChanges = Boolean(
    draft &&
    person &&
    (draft.certificationId !== person.certificationId ||
      draft.focusAreaIds.length !== person.focusAreaIds.length ||
      draft.roleIds.length !== person.roleIds.length),
  );

  const mutation = useMutation({
    mutationFn: async (scheduleDraft: ScheduleDraft) => {
      if (!person) throw new Error("Person unavailable");
      // The update contract wants the whole staff record, so everything this
      // form doesn't edit goes back exactly as it came.
      return updateMobilePerson(accessToken!, person.id, {
        expectedVersion: person.version,
        firstName: person.firstName,
        lastName: person.lastName,
        employmentType: person.employmentType,
        phone: person.phone,
        email: person.email,
        contactNotes: person.contactNotes,
        departmentIds: person.departmentIds,
        certificationId: scheduleDraft.certificationId,
        focusAreaIds: scheduleDraft.focusAreaIds,
        roleIds: scheduleDraft.roleIds,
      });
    },
    onMutate: () => setError(null),
    onError: (mutationError) => {
      setError(
        getClientFriendlyErrorMessage(
          mutationError,
          "We couldn't add them to the schedule right now.",
        ),
      );
    },
    onSuccess: async (result) => {
      updateCachedPerson(result.person);
      await Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]);
      pushToast({
        tone: "success",
        title: "Added to schedule",
        message: "They can be assigned shifts now.",
      });
      router.back();
    },
  });

  const guard = useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    disabled: mutation.isPending || mutation.isSuccess,
    title: "Discard these assignments?",
    body: "They won't be added to the schedule.",
  });
  useNavigationDiscardGuard(guard);

  if (contentState.kind === "loading") {
    return (
      <Screen bottomPaddingMode="tabbed" scrollEnabled={false}>
        {contentState.showSkeleton ? <PersonFormSkeleton /> : null}
      </Screen>
    );
  }

  if (contentState.kind === "error") {
    return (
      <Screen bottomPaddingMode="tabbed">
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load this form"
          variant="centered"
          onAction={() => {
            void personQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const canManageEmployees = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);

  if (!person || !draft || !canManageEmployees || person.status === "removed") {
    return (
      <Screen bottomPaddingMode="tabbed">
        <EmptyStateCard
          body={
            person && !canManageEmployees
              ? "You don't have permission to change staff assignments."
              : "This teammate isn't in your directory anymore."
          }
          fillScreen
          iconName="lock-closed-outline"
          title="Scheduling unavailable"
        />
      </Screen>
    );
  }

  const focusAreaLabel = bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Areas";
  const certificationLabel =
    bootstrapQuery.data?.currentOrg.labels.certification ?? "Certification";
  const roleLabel = bootstrapQuery.data?.currentOrg.labels.role ?? "Roles";
  const focusAreas = bootstrapQuery.data?.focusAreas ?? [];
  const certifications = bootstrapQuery.data?.certifications ?? [];
  const roles = bootstrapQuery.data?.roles ?? [];
  const useCompactRoleCertificationLabels =
    bootstrapQuery.data?.currentOrg?.useCompactRoleCertificationLabels ?? false;

  const focusAreaError =
    draft.focusAreaIds.length === 0
      ? `Select at least one ${singularLabelNoun(focusAreaLabel)}`
      : null;
  const canSubmit = !mutation.isPending && !focusAreaError && focusAreas.length > 0;

  const toggle = (key: "focusAreaIds" | "roleIds", id: number) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: current[key].includes(id)
              ? current[key].filter((value) => value !== id)
              : [...current[key], id],
          }
        : current,
    );
  };

  return (
    <Screen bottomPaddingMode="tabbed">
      {focusAreas.length === 0 ? (
        <EmptyStateCard
          body={`There are no ${focusAreaLabel.toLowerCase()} yet. Add one on the web app, under Settings, before putting anyone on the schedule.`}
          fillScreen
          iconName="albums-outline"
          title={`No ${focusAreaLabel.toLowerCase()}`}
        />
      ) : (
        <>
          <ProfileSection title="Assignments">
            <ProfilePanel>
              <AppText tone="secondary" variant="meta">
                They keep their management access either way. This is what puts them on the grid.
              </AppText>
              <ProfileChoiceGroup
                error={focusAreaError}
                items={focusAreas.map((item) => ({ id: item.id, name: item.name }))}
                label={focusAreaLabel}
                selectedIds={draft.focusAreaIds}
                onToggle={(id) => toggle("focusAreaIds", id)}
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
                onToggle={(id) =>
                  setDraft((current) =>
                    current ? { ...current, certificationId: id === -1 ? null : id } : current,
                  )
                }
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

          {error ? <InlineError message={error} /> : null}

          <View style={{ gap: mobileSpace.sm }}>
            <Button
              disabled={!canSubmit}
              label="Add to Schedule"
              loading={mutation.isPending}
              onPress={() => mutation.mutate(draft)}
              tone="primary"
            />
          </View>
        </>
      )}

      <ConfirmationModal {...guard.confirmationProps} />
    </Screen>
  );
}
