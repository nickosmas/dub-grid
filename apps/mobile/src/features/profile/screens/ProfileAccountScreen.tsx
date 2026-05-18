import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";
import {
  getRequiredStaffEmailError,
  getOptionalUsPhoneError,
  getStaffNameError,
  getStaffNotesError,
  normalizeOptionalUsPhone,
  normalizeRequiredStaffEmail,
  normalizeStaffName,
  normalizeStaffNotes,
} from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { DetailSkeleton } from "../../../shared/components/Skeleton";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  createProfileChangeRequest,
  getProfile,
  updateProfileAccount,
  updateProfilePhone,
} from "../../../shared/lib/api";
import {
  getInlineErrorMessageOrToast,
} from "../../../shared/lib/errors";
import { queryClient } from "../../../shared/lib/query-client";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  ProfileInfoRow,
  ProfileList,
  ProfilePanel,
  ProfileSection,
  ProfileTextInput,
} from "../components/ProfilePrimitives";

const PENDING_PROFILE_CHANGE_MESSAGE =
  "A profile change request is pending admin review.";

export default function ProfileAccountScreen() {
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [requestedFirstName, setRequestedFirstName] = useState("");
  const [requestedLastName, setRequestedLastName] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [showNameRequestConfirmation, setShowNameRequestConfirmation] =
    useState(false);
  const [focusedField, setFocusedField] = useState<
    | "firstName"
    | "lastName"
    | "email"
    | "phone"
    | "requestedFirstName"
    | "requestedLastName"
    | "requestNote"
    | null
  >(null);
  const profileQuery = useQuery({
    queryKey: ["mobile", "profile", accessToken],
    queryFn: () => getProfile(accessToken!),
    enabled: Boolean(accessToken),
  });
  const bootstrapQuery = useBootstrap(accessToken);
  const manualRefresh = useManualRefresh(() => profileQuery.refetch());
  const profile = profileQuery.data ?? null;
  const canEditProfileDirectly = Boolean(
    bootstrapQuery.data?.permissions.canManageEmployees,
  );
  const savedFirstName = profile?.user.firstName ?? "";
  const savedLastName = profile?.user.lastName ?? "";
  const savedEmail = profile?.user.email ?? "";
  const savedPhone = profile?.linkedEmployee?.phone ?? "";
  const firstNameError = canEditProfileDirectly
    ? getStaffNameError(firstName, "First name")
    : null;
  const lastNameError = canEditProfileDirectly
    ? getStaffNameError(lastName, "Last name")
    : null;
  const emailError = getRequiredStaffEmailError(email);
  const phoneError = profile?.linkedEmployee
    ? getOptionalUsPhoneError(phone)
    : null;
  const requestNoteError = getStaffNotesError(requestNote);
  const normalizedFirstName =
    canEditProfileDirectly && !firstNameError
      ? normalizeStaffName(firstName)
      : firstName.trim();
  const normalizedLastName =
    canEditProfileDirectly && !lastNameError
      ? normalizeStaffName(lastName)
      : lastName.trim();
  const normalizedEmail = emailError
    ? email.trim().toLowerCase()
    : normalizeRequiredStaffEmail(email);
  const normalizedPhone = phoneError
    ? phone.trim()
    : normalizeOptionalUsPhone(phone);
  const hasNameChanges =
    canEditProfileDirectly &&
    (normalizedFirstName !== savedFirstName ||
      normalizedLastName !== savedLastName);
  const hasEmailChanges = normalizedEmail !== savedEmail.trim().toLowerCase();
  const hasPhoneChanges =
    Boolean(profile?.linkedEmployee) && normalizedPhone !== savedPhone;
  const requestedFirstNamePreview = requestedFirstName
    .trim()
    .replace(/\s+/g, " ");
  const requestedLastNamePreview = requestedLastName.trim().replace(/\s+/g, " ");
  const hasRequestedFirstNameChange =
    requestedFirstNamePreview !== savedFirstName;
  const hasRequestedLastNameChange =
    requestedLastNamePreview !== savedLastName;
  const hasRequestedNameChanges =
    !canEditProfileDirectly &&
    (hasRequestedFirstNameChange || hasRequestedLastNameChange);
  const requestedFirstNameError =
    !canEditProfileDirectly && hasRequestedFirstNameChange
      ? getStaffNameError(requestedFirstName, "First name")
      : null;
  const requestedLastNameError =
    !canEditProfileDirectly && hasRequestedLastNameChange
      ? getStaffNameError(requestedLastName, "Last name")
      : null;
  const normalizedRequestedFirstName = requestedFirstNameError
    ? requestedFirstNamePreview
    : requestedFirstNamePreview
      ? normalizeStaffName(requestedFirstName)
      : requestedFirstNamePreview;
  const normalizedRequestedLastName = requestedLastNameError
    ? requestedLastNamePreview
    : requestedLastNamePreview
      ? normalizeStaffName(requestedLastName)
      : requestedLastNamePreview;
  const saveMutation = useMutation({
    mutationFn: async () => {
      setAccountError(null);
      if (!accessToken || !profile) {
        return;
      }

      if (hasEmailChanges) {
        const result = await getSupabaseClient().auth.updateUser({
          email: normalizedEmail,
        });
        if (result.error) {
          throw result.error;
        }
      }

      if (hasNameChanges) {
        await updateProfileAccount(accessToken, {
          firstName: normalizedFirstName || null,
          lastName: normalizedLastName || null,
        });
      }

      if (hasPhoneChanges && profile.linkedEmployee) {
        await updateProfilePhone(accessToken, {
          phone: normalizedPhone,
          expectedVersion: profile.linkedEmployee.version,
        });
      }

      await Promise.all([
        profileQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["mobile", "bootstrap"] }),
      ]);
    },
    onError: (error) => {
      setAccountError(
        getInlineErrorMessageOrToast(pushToast, {
          error,
          fallbackMessage: "We couldn't save your account details right now.",
        }),
      );
    },
    onSuccess: () => {
      pushToast({
        tone: "success",
        title: "Account updated",
        message: hasEmailChanges
          ? "Check your email to confirm the new address."
          : "Your account details were updated.",
      });
    },
  });
  const nameRequestMutation = useMutation({
    mutationFn: () => {
      const requestedChanges: Record<string, string> = {};
      if (hasRequestedFirstNameChange) {
        requestedChanges.firstName = normalizedRequestedFirstName;
      }
      if (hasRequestedLastNameChange) {
        requestedChanges.lastName = normalizedRequestedLastName;
      }

      return createProfileChangeRequest(accessToken!, {
        type: "profile_update",
        requestedChanges,
        requestNote: normalizeStaffNotes(requestNote),
      });
    },
    onSuccess: async () => {
      setRequestNote("");
      await profileQuery.refetch();
      pushToast({
        tone: "success",
        title: "Request sent",
        message: "Your name change request was sent.",
      });
    },
    onError: (error) => {
      setAccountError(
        getInlineErrorMessageOrToast(pushToast, {
          error,
          fallbackMessage: "We couldn't send your name change request right now.",
        }),
      );
    },
  });
  const contentState = getMobileQueryContentState({
    hasData: Boolean(profile),
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
  });

  useEffect(() => {
    if (!profile) {
      return;
    }

    setEmail(profile.user.email ?? "");
    setPhone(profile.linkedEmployee?.phone ?? "");
    setFirstName(profile.user.firstName ?? "");
    setLastName(profile.user.lastName ?? "");
    setRequestedFirstName(profile.user.firstName ?? "");
    setRequestedLastName(profile.user.lastName ?? "");
  }, [profile]);

  function confirmSaveChanges() {
    if (firstNameError || lastNameError || emailError || phoneError) {
      pushToast({
        tone: "warning",
        title: "Check account details",
        message: firstNameError ?? lastNameError ?? emailError ?? phoneError ?? "",
      });
      return;
    }
    setShowSaveConfirmation(true);
  }

  function confirmNameRequest() {
    if (requestedFirstNameError || requestedLastNameError || requestNoteError) {
      pushToast({
        tone: "warning",
        title: "Check name request",
        message:
          requestedFirstNameError ??
          requestedLastNameError ??
          requestNoteError ??
          "",
      });
      return;
    }

    if (!hasRequestedNameChanges) {
      return;
    }

    setShowNameRequestConfirmation(true);
  }

  return (
    <Screen
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      {contentState.kind === "loading" ? (
        <DetailSkeleton sections={2} />
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load account"
          variant="centered"
          onAction={() => {
            void profileQuery.refetch();
          }}
        />
      ) : !profile ? (
        <StatusBanner
          body="We couldn't build your account details from the current mobile session."
          fillScreen
          title="Account unavailable"
          variant="centered"
        />
      ) : (
        <>
          {accountError ? (
            <StatusBanner body={accountError} title="Could not save account" />
          ) : null}
          {profile.pendingProfileChangeRequest ? (
            <StatusBanner
              body={PENDING_PROFILE_CHANGE_MESSAGE}
              title="Request pending"
            />
          ) : null}
          {!canEditProfileDirectly ? (
            <ProfileSection title="Account details">
              <ProfileList>
                <ProfileInfoRow
                  iconName="person-circle-outline"
                  isLast
                  label="Name"
                  value={
                    [profile.user.firstName, profile.user.lastName]
                      .filter(Boolean)
                      .join(" ")
                      .trim() || "Not set"
                  }
                />
              </ProfileList>
            </ProfileSection>
          ) : null}

          <ProfileSection title="Edit account">
            <ProfilePanel>
              {canEditProfileDirectly ? (
                <>
                  <ProfileTextInput
                    accessibilityLabel="First name"
                    error={firstNameError}
                    focused={focusedField === "firstName"}
                    label="First name"
                    placeholder="First name"
                    value={firstName}
                    onChangeText={setFirstName}
                    onBlur={() => {
                      if (!firstNameError && firstName.trim()) {
                        setFirstName(normalizedFirstName);
                      }
                      setFocusedField(null);
                    }}
                    onFocus={() => setFocusedField("firstName")}
                  />
                  <ProfileTextInput
                    accessibilityLabel="Last name"
                    error={lastNameError}
                    focused={focusedField === "lastName"}
                    label="Last name"
                    placeholder="Last name"
                    value={lastName}
                    onChangeText={setLastName}
                    onBlur={() => {
                      if (!lastNameError && lastName.trim()) {
                        setLastName(normalizedLastName);
                      }
                      setFocusedField(null);
                    }}
                    onFocus={() => setFocusedField("lastName")}
                  />
                </>
              ) : null}
              <ProfileTextInput
                accessibilityLabel="Email"
                autoCapitalize="none"
                error={emailError}
                focused={focusedField === "email"}
                label="Email"
                keyboardType="email-address"
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                onBlur={() => {
                  if (!emailError) {
                    setEmail(normalizedEmail);
                  }
                  setFocusedField(null);
                }}
                onFocus={() => setFocusedField("email")}
              />
              {profile.linkedEmployee ? (
                <ProfileTextInput
                  accessibilityLabel="Phone"
                  error={phoneError}
                  focused={focusedField === "phone"}
                  keyboardType="phone-pad"
                  label="Phone"
                  placeholder="Phone"
                  value={phone}
                  onChangeText={setPhone}
                  onBlur={() => {
                    if (!phoneError && phone.trim()) {
                      setPhone(normalizedPhone);
                    }
                    setFocusedField(null);
                  }}
                  onFocus={() => setFocusedField("phone")}
                />
              ) : null}
            </ProfilePanel>
            <View style={styles.actionsRow}>
              <Button
                compact
                disabled={
                  saveMutation.isPending ||
                  (!hasEmailChanges && !hasNameChanges && !hasPhoneChanges) ||
                  Boolean(firstNameError) ||
                  Boolean(lastNameError) ||
                  Boolean(emailError) ||
                  Boolean(phoneError)
                }
                label={saveMutation.isPending ? "Saving..." : "Save changes"}
                onPress={confirmSaveChanges}
              />
              <Button
                compact
                disabled={saveMutation.isPending}
                label="Discard"
                onPress={() => {
                  setEmail(savedEmail);
                  setPhone(savedPhone);
                  setFirstName(savedFirstName);
                  setLastName(savedLastName);
                  setAccountError(null);
                }}
                tone="neutral"
              />
            </View>
          </ProfileSection>

          {!canEditProfileDirectly ? (
            <ProfileSection title="Request name change">
              <ProfilePanel>
                <ProfileTextInput
                  accessibilityLabel="Requested first name"
                  autoCapitalize="words"
                  error={requestedFirstNameError}
                  focused={focusedField === "requestedFirstName"}
                  label="First name"
                  placeholder="First name"
                  value={requestedFirstName}
                  onBlur={() => {
                    if (!requestedFirstNameError && requestedFirstName.trim()) {
                      setRequestedFirstName(normalizedRequestedFirstName);
                    }
                    setFocusedField(null);
                  }}
                  onChangeText={setRequestedFirstName}
                  onFocus={() => setFocusedField("requestedFirstName")}
                />
                <ProfileTextInput
                  accessibilityLabel="Requested last name"
                  autoCapitalize="words"
                  error={requestedLastNameError}
                  focused={focusedField === "requestedLastName"}
                  label="Last name"
                  placeholder="Last name"
                  value={requestedLastName}
                  onBlur={() => {
                    if (!requestedLastNameError && requestedLastName.trim()) {
                      setRequestedLastName(normalizedRequestedLastName);
                    }
                    setFocusedField(null);
                  }}
                  onChangeText={setRequestedLastName}
                  onFocus={() => setFocusedField("requestedLastName")}
                />
                <ProfileTextInput
                  accessibilityLabel="Note for admins"
                  error={requestNoteError}
                  focused={focusedField === "requestNote"}
                  label="Note for admins"
                  multiline
                  placeholder="Note for admins"
                  value={requestNote}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={setRequestNote}
                  onFocus={() => setFocusedField("requestNote")}
                />
              </ProfilePanel>
              <Button
                compact
                disabled={
                  nameRequestMutation.isPending ||
                  profile.pendingProfileChangeRequest ||
                  !hasRequestedNameChanges ||
                  Boolean(
                    requestedFirstNameError ||
                      requestedLastNameError ||
                      requestNoteError,
                  )
                }
                label={
                  nameRequestMutation.isPending ? "Sending..." : "Request change"
                }
                onPress={confirmNameRequest}
              />
            </ProfileSection>
          ) : null}
        </>
      )}
      <ConfirmationModal
        body="Your account and contact details will be updated."
        confirmLabel="Save"
        loading={saveMutation.isPending}
        onCancel={() => setShowSaveConfirmation(false)}
        onConfirm={() => {
          setShowSaveConfirmation(false);
          saveMutation.mutate();
        }}
        title="Save these changes?"
        visible={showSaveConfirmation}
      />
      <ConfirmationModal
        body="Your admin will review your name change."
        confirmLabel="Send"
        loading={nameRequestMutation.isPending}
        onCancel={() => setShowNameRequestConfirmation(false)}
        onConfirm={() => {
          setShowNameRequestConfirmation(false);
          nameRequestMutation.mutate();
        }}
        title="Send this request?"
        visible={showNameRequestConfirmation}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});
