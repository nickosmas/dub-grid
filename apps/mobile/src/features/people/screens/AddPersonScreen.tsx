import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOptionalStaffEmailError,
  getStaffNameError,
  normalizeOptionalStaffEmail,
  normalizeStaffName,
} from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { createMobilePerson, createMobilePersonInvitation } from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useToast } from "../../../shared/providers/ToastProvider";
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

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [employmentType, setEmploymentType] = useState<"full_time" | "part_time">("full_time");
  const [certificationId, setCertificationId] = useState<number | null>(null);
  const [focusAreaIds, setFocusAreaIds] = useState<number[]>([]);
  const [focusedField, setFocusedField] = useState<"firstName" | "lastName" | "email" | null>(null);

  const focusAreaLabel = bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Areas";
  const certificationLabel =
    bootstrapQuery.data?.currentOrg.labels.certification ?? "Certification";
  const focusAreas = bootstrapQuery.data?.focusAreas ?? [];
  const certifications = bootstrapQuery.data?.certifications ?? [];

  const fieldErrors = {
    firstName: firstName.trim().length > 0 ? getStaffNameError(firstName, "First name") : null,
    lastName: lastName.trim().length > 0 ? getStaffNameError(lastName, "Last name") : null,
    email: email.trim().length > 0 ? getOptionalStaffEmailError(email) : null,
    focusAreaIds:
      focusAreaIds.length === 0 && (firstName.trim().length > 0 || lastName.trim().length > 0)
        ? `Select at least one ${focusAreaLabel}`
        : null,
  };
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    focusAreaIds.length > 0 &&
    !fieldErrors.firstName &&
    !fieldErrors.lastName &&
    !fieldErrors.email;

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

      if (normalizedEmail) {
        try {
          await createMobilePersonInvitation(accessToken!, result.person.id, {
            email: normalizedEmail,
          });
        } catch {
          // The person was created; a failed invite send isn't fatal here —
          // an admin can resend it from the person's detail screen.
        }
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile", "people"] });
      pushToast({
        tone: "success",
        title: "Person added",
        message: `${firstName} ${lastName} was added to your roster.`,
      });
      router.back();
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not add person",
        fallbackMessage: "We couldn't add that person right now.",
      });
    },
  });

  function toggleFocusArea(id: number) {
    setFocusAreaIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <Screen>
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
            onChangeText={setFirstName}
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
            onChangeText={setLastName}
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
        <ProfilePanel>
          <ProfileChoiceGroup
            items={[
              { id: 0, name: "Full-time" },
              { id: 1, name: "Part-time" },
            ]}
            label="Employment"
            selectedIds={[employmentType === "part_time" ? 1 : 0]}
            onToggle={(id) => setEmploymentType(id === 1 ? "part_time" : "full_time")}
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
            selectedIds={certificationId == null ? [-1] : [certificationId]}
            onToggle={(id) => setCertificationId(id === -1 ? null : id)}
          />
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Assignments">
        <ProfilePanel>
          <ProfileChoiceGroup
            error={fieldErrors.focusAreaIds}
            items={focusAreas.map((item) => ({ id: item.id, name: item.name }))}
            label={focusAreaLabel}
            selectedIds={focusAreaIds}
            onToggle={toggleFocusArea}
          />
        </ProfilePanel>
      </ProfileSection>

      {createMutation.isError ? (
        <StatusBanner body="We couldn't add that person right now." title="Could not add person" />
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          disabled={!canSubmit || createMutation.isPending}
          label={createMutation.isPending ? "Adding..." : "Add person"}
          onPress={() => createMutation.mutate()}
        />
        <Button
          disabled={createMutation.isPending}
          label="Cancel"
          onPress={() => router.back()}
          tone="neutral"
        />
      </View>
    </Screen>
  );
}
