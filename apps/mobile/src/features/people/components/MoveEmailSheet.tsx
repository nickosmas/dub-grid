import { useState } from "react";
import { View } from "react-native";
import { getRequiredStaffEmailError } from "@dubgrid/contracts";
import { AppText } from "../../../shared/components/AppText";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { ConfirmSummaryBox } from "../../../shared/components/ConfirmSummaryBox";
import { InlineError } from "../../../shared/components/InlineError";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import { mobileSpace } from "../../../shared/theme/tokens";
import { ProfileTextInput } from "../../profile/components/ProfilePrimitives";

export const MOVE_EMAIL_POINTS = [
  "Their current sign-in email loses access to this organization.",
  "An invite goes to the new email, with the same access role.",
  "Their staff record, shifts and history stay as they are.",
];

/**
 * Web's Move to a new email, for a joined person who lost their mailbox: the
 * same warning, field, points and Move and invite. `onMove` runs through the
 * page's step-up, so a stale session asks for a password or code first.
 */
export function MoveEmailSheet({
  visible,
  hidden = false,
  personName,
  isPending,
  error,
  onDismiss,
  onMove,
}: {
  visible: boolean;
  /** Steps aside, keeping what was typed, while the identity check is up. */
  hidden?: boolean;
  personName: string;
  isPending: boolean;
  /** Why the last move failed, shown above the actions. */
  error?: string | null;
  onDismiss: () => void;
  onMove: (email: string) => Promise<unknown> | void;
}) {
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);

  // Each opening starts empty.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setEmail("");
  }

  const emailError = email.trim() ? getRequiredStaffEmailError(email) : null;
  const guard = useUnsavedChangesGuard({
    isDirty: email.trim().length > 0,
    disabled: isPending,
    onClose: onDismiss,
  });

  return (
    <BottomSheetModal
      dismissDisabled={isPending}
      hasUnsavedChanges={guard.isDirty}
      overlay={<ConfirmationModal presentation="inline" {...guard.confirmationProps} />}
      footer={
        <>
          {error ? <InlineError message={error} /> : null}
          <SheetActions
            primaryAction={
              <Button
                disabled={isPending || !email.trim() || Boolean(emailError)}
                label="Move and invite"
                loading={isPending}
                onPress={() => onMove(email)}
                tone="warning"
              />
            }
          >
            <Button
              disabled={isPending}
              label="Cancel"
              onPress={guard.requestClose}
              tone="neutral"
            />
          </SheetActions>
        </>
      }
      header={<SheetHeader subtitle={personName} title="Move to a new email" />}
      scrollable
      visible={visible && !hidden}
      onDismiss={guard.requestClose}
    >
      <View style={{ gap: mobileSpace.lg }}>
        <AppText tone="secondary" variant="body">
          Use this only if they can&apos;t get into this email anymore. If they still can, ask them
          to change it on their profile.
        </AppText>
        <ProfileTextInput
          accessibilityLabel="New email"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          autoFocus
          editable={!isPending}
          error={emailError}
          focused={focused}
          keyboardType="email-address"
          label="New email"
          value={email}
          onBlur={() => setFocused(false)}
          onChangeText={setEmail}
          onFocus={() => setFocused(true)}
        />
        <ConfirmSummaryBox summary={{ points: MOVE_EMAIL_POINTS }} />
      </View>
    </BottomSheetModal>
  );
}
