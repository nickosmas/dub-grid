import { useEffect, useMemo, useState } from "react";
import { mobileSpace } from "../../../shared/theme/tokens";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOptionalStaffEmailError,
  getStaffNameError,
  normalizeOptionalStaffEmail,
  normalizeStaffName,
} from "@dubgrid/contracts";
import { getMobileEditorDismissLabel } from "@dubgrid/design-tokens";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import {
  checkMobilePersonContact,
  createMobilePerson,
  createMobilePersonInvitation,
  parseMobileContactConflict,
  parseMobileStaffFieldErrors,
  type MobileStaffField,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { singularLabelNoun } from "../../../shared/lib/labels";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useNavigationDiscardGuard } from "../../../shared/hooks/useNavigationDiscardGuard";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import { PersonFormSkeleton } from "../components/PersonFormSkeleton";
import { EMAIL_CONFLICT_MESSAGES } from "../lib/contactConflicts";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  ProfileChoiceGroup,
  ProfilePanel,
  ProfileSection,
  ProfileTextInput,
} from "../../profile/components/ProfilePrimitives";

export default function AddPersonScreen() {
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const bootstrapQuery = useBootstrap(accessToken);
  // Bootstrap is usually warm here — the tab that got you to this form already
  // read it — so the placeholder only paints if the wait is long enough to be
  // worth acknowledging. Routed through the shared content state, like every
  // other screen, so a failed bootstrap is a state of its own rather than
  // falling through to the form.
  const contentState = useMobileContentState({
    hasData: Boolean(bootstrapQuery.data),
    isLoading: bootstrapQuery.isLoading,
    error: bootstrapQuery.error,
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [employmentType, setEmploymentType] = useState<"full_time" | "part_time">("full_time");
  const [certificationId, setCertificationId] = useState<number | null>(null);
  const [focusAreaIds, setFocusAreaIds] = useState<number[]>([]);
  const [focusedField, setFocusedField] = useState<"firstName" | "lastName" | "email" | null>(null);
  /**
   * Field errors only the server can find, chiefly a duplicate email. Kept apart
   * from the format checks below so the two can't overwrite each other, and so
   * Save has one place to look before it opens.
   */
  const [serverFieldErrors, setServerFieldErrors] = useState<
    Partial<Record<MobileStaffField, string>>
  >({});

  // Anything typed or picked counts: this form starts empty, so any departure
  // from that is work the user did.
  const hasUnsavedChanges =
    firstName.trim() !== "" ||
    lastName.trim() !== "" ||
    email.trim() !== "" ||
    employmentType !== "full_time" ||
    certificationId !== null ||
    focusAreaIds.length > 0;

  const focusAreaLabel = bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Areas";
  const certificationLabel =
    bootstrapQuery.data?.currentOrg.labels.certification ?? "Certification";
  const focusAreas = bootstrapQuery.data?.focusAreas ?? [];
  const certifications = bootstrapQuery.data?.certifications ?? [];
  const useCompactRoleCertificationLabels =
    bootstrapQuery.data?.currentOrg?.useCompactRoleCertificationLabels ?? false;

  const emailFormatError = email.trim().length > 0 ? getOptionalStaffEmailError(email) : null;
  const fieldErrors = {
    firstName:
      (firstName.trim().length > 0 ? getStaffNameError(firstName, "First name") : null) ??
      serverFieldErrors.firstName,
    lastName:
      (lastName.trim().length > 0 ? getStaffNameError(lastName, "Last name") : null) ??
      serverFieldErrors.lastName,
    // Format first: an address that isn't valid was never checked for
    // uniqueness, so calling it taken would answer a question nobody asked.
    email: emailFormatError ?? serverFieldErrors.email,
    focusAreaIds:
      focusAreaIds.length === 0 && (firstName.trim().length > 0 || lastName.trim().length > 0)
        ? `Select at least one ${singularLabelNoun(focusAreaLabel)}`
        : null,
  };
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    focusAreaIds.length > 0 &&
    !fieldErrors.firstName &&
    !fieldErrors.lastName &&
    !fieldErrors.email;

  // Web debounces the same pre-flight at 400ms and soft-fails it. A flaky check
  // must never be what stops a legitimate save: the 409 the create returns is
  // still there as the real gate.
  const emailToCheck = emailFormatError ? "" : email.trim();
  useEffect(() => {
    if (!accessToken || !emailToCheck) {
      setServerFieldErrors((current) =>
        current.email ? { ...current, email: undefined } : current,
      );
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void checkMobilePersonContact(accessToken, { email: emailToCheck })
        .then((result) => {
          if (cancelled) return;
          setServerFieldErrors((current) => ({
            ...current,
            email: result.email?.conflict
              ? EMAIL_CONFLICT_MESSAGES[result.email.reason ?? "employee_duplicate"]
              : undefined,
          }));
        })
        .catch(() => {
          if (cancelled) return;
          setServerFieldErrors((current) => ({ ...current, email: undefined }));
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessToken, emailToCheck]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const normalizedEmail = normalizeOptionalStaffEmail(email);
      const result = await createMobilePerson(accessToken!, {
        firstName: normalizeStaffName(firstName),
        lastName: normalizeStaffName(lastName),
        employmentType,
        certificationId,
        focusAreaIds,
        email: normalizedEmail,
      });

      let invitationSent = true;

      if (normalizedEmail) {
        try {
          await createMobilePersonInvitation(accessToken!, result.person.id, {
            email: normalizedEmail,
          });
        } catch {
          // The person was created, so this isn't fatal and must not roll the
          // create back. It does have to be said out loud, though: silently
          // swallowing it leaves an admin believing an invite is on its way.
          invitationSent = false;
        }
      }

      return { ...result, invitationSent };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["mobile", "people"] });
      pushToast(
        result.invitationSent
          ? {
              tone: "success",
              title: "Person added",
              message: `${firstName} ${lastName} was added to your roster.`,
            }
          : {
              tone: "warning",
              title: "Person added, invitation not sent",
              message: `${firstName} ${lastName} is on your roster. Resend the invitation from their profile.`,
            },
      );
      router.back();
    },
    onError: (error) => {
      // A rejection the server pinned to a field belongs on that field. Left as
      // a toast alone, the input stayed unmarked and Add person stayed live to
      // fail on the same duplicate again.
      const conflict = parseMobileContactConflict(error);
      const fieldErrorsFromServer = conflict
        ? { [conflict.field]: conflict.message }
        : parseMobileStaffFieldErrors(error);
      if (fieldErrorsFromServer) {
        setServerFieldErrors((current) => ({ ...current, ...fieldErrorsFromServer }));
      }
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not add person",
        fallbackMessage: "We couldn't add that person right now.",
      });
    },
  });

  // Header back, Android hardware back, the iOS back swipe and the Cancel
  // button all reach the guard the same way: through the stack removal they
  // each dispatch. Cancel deliberately keeps its plain `router.back()` rather
  // than closing through the guard, which would ask, navigate, and be asked
  // again by this same hook.
  //
  // `isSuccess` disarms it, because the success handler navigates away with the
  // fields still filled in — without it a saved person would be met with
  // "discard your changes?" on the way out.
  const guard = useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    disabled: createMutation.isPending || createMutation.isSuccess,
    title: "Discard this staff profile?",
    body: "The details you filled in won't be saved.",
  });
  useNavigationDiscardGuard(guard);

  /**
   * Back to the empty form the screen opened with.
   *
   * Wired to the Discard button rather than the guard's `onDiscard`, which runs
   * on every exit through the guard: this screen unmounts when it is left, so
   * clearing there would only risk the fields being seen emptying on the way
   * out.
   */
  function resetDraft() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setEmploymentType("full_time");
    setCertificationId(null);
    setFocusAreaIds([]);
    setServerFieldErrors({});
  }

  /** A server verdict only holds for the value it was given. */
  function retireServerError(field: MobileStaffField) {
    setServerFieldErrors((current) =>
      current[field] ? { ...current, [field]: undefined } : current,
    );
  }

  function toggleFocusArea(id: number) {
    setFocusAreaIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  // Focus areas and certifications come from bootstrap. Rendering the form
  // before it resolves shows an empty Assignments picker next to a live
  // "Select at least one <focus area>" error, which reads as broken rather
  // than loading.
  if (contentState.kind === "loading") {
    return (
      <Screen bottomPaddingMode="tabbed" scrollEnabled={false}>
        {contentState.showSkeleton ? <PersonFormSkeleton /> : null}
      </Screen>
    );
  }

  // The same reasoning applies to a bootstrap that *failed*: gating on
  // `isLoading` alone let an error fall straight through to the form, with the
  // pickers empty and no way to retry. That is the state the comment above
  // describes as reading broken, so it needs saying out loud.
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
            void bootstrapQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      bottomPaddingMode="tabbed"
      footer={
        <View style={styles.actionsRow}>
          <View style={styles.actionButton}>
            <Button
              disabled={createMutation.isPending}
              // Same tri-state the edit surfaces use. Discard empties the form
              // and stays put; leaving with details filled in is the back
              // gesture, which `useNavigationDiscardGuard` already confirms.
              label={getMobileEditorDismissLabel({ hasUnsavedChanges })}
              onPress={hasUnsavedChanges ? resetDraft : () => router.back()}
              tone="neutral"
            />
          </View>
          <View style={styles.actionButton}>
            <Button
              disabled={!canSubmit || createMutation.isPending}
              label="Add person"
              loading={createMutation.isPending}
              onPress={() =>
                new Promise<void>((resolve) => {
                  createMutation.mutate(undefined, { onSettled: () => resolve() });
                })
              }
            />
          </View>
        </View>
      }
    >
      <ProfileSection title="Basic info">
        <ProfilePanel>
          <ProfileTextInput
            accessibilityLabel="First name"
            autoCapitalize="words"
            error={fieldErrors.firstName}
            focused={focusedField === "firstName"}
            label="First name"
            placeholder="First name"
            value={firstName}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => {
              setFirstName(value);
              retireServerError("firstName");
            }}
            onFocus={() => setFocusedField("firstName")}
          />
          <ProfileTextInput
            accessibilityLabel="Last name"
            autoCapitalize="words"
            error={fieldErrors.lastName}
            focused={focusedField === "lastName"}
            label="Last name"
            placeholder="Last name"
            value={lastName}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => {
              setLastName(value);
              retireServerError("lastName");
            }}
            onFocus={() => setFocusedField("lastName")}
          />
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Contact">
        <ProfilePanel>
          <ProfileTextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            error={fieldErrors.email}
            focused={focusedField === "email"}
            keyboardType="email-address"
            autoComplete="email"
            autoCorrect={false}
            label="Email (optional)"
            placeholder="name@example.com"
            value={email}
            onBlur={() => setFocusedField(null)}
            onChangeText={setEmail}
            onFocus={() => setFocusedField("email")}
          />
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Staffing">
        <ProfileChoiceGroup
          items={[
            { id: 0, name: "Full-time" },
            { id: 1, name: "Part-time" },
          ]}
          label="Employment"
          selection="single"
          selectedIds={[employmentType === "part_time" ? 1 : 0]}
          onToggle={(id) => setEmploymentType(id === 1 ? "part_time" : "full_time")}
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
          selectedIds={certificationId == null ? [-1] : [certificationId]}
          onToggle={(id) => setCertificationId(id === -1 ? null : id)}
        />
      </ProfileSection>

      <ProfileSection title="Assignments">
        <ProfileChoiceGroup
          error={fieldErrors.focusAreaIds}
          items={focusAreas.map((item) => ({ id: item.id, name: item.name }))}
          label={focusAreaLabel}
          selectedIds={focusAreaIds}
          onToggle={toggleFocusArea}
        />
      </ProfileSection>

      <ConfirmationModal {...guard.confirmationProps} />
    </Screen>
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
