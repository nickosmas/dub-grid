import { useEffect, useRef } from "react";
import { Alert, StyleSheet, View, type AlertButton } from "react-native";
import { hapticImpact } from "../lib/haptics";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { mobileSpace } from "../theme/tokens";
import { AppText } from "./AppText";
import { BottomSheetModal, SheetActions, SheetHeader } from "./BottomSheetModal";
import { Button } from "./Button";
import { ConfirmSummaryBox } from "./ConfirmSummaryBox";
import { confirmationAlertSpec } from "./confirmation-alert";
import { InlineError } from "./InlineError";
import type { ConfirmationModalProps } from "./ConfirmationModal";

export type { ConfirmationModalProps } from "./ConfirmationModal";

/**
 * A confirmation in each platform's own element: the system alert (UIKit's
 * alert on iOS, Material's AlertDialog on Android) when it is only words, and
 * a native sheet when it carries controls of its own, such as a choice to make
 * before confirming. The web keeps the drawn card in `ConfirmationModal.tsx`.
 */
export function ConfirmationModal(props: ConfirmationModalProps) {
  return props.children ? <ConfirmationSheet {...props} /> : <ConfirmationAlert {...props} />;
}

function ConfirmationAlert(props: ConfirmationModalProps) {
  const { visible, error } = props;
  // Read at press time: the alert's buttons outlive the render that made them.
  const latest = useRef(props);
  latest.current = props;
  const shownRef = useRef(false);
  const confirm = () => {
    const current = latest.current;
    if (current.confirmTone === "danger") hapticImpact("medium");
    void Promise.resolve()
      .then(() => current.onConfirm())
      // A failure is the caller's to report, through `error` or a toast.
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!visible) {
      shownRef.current = false;
      return;
    }
    if (shownRef.current) return;
    shownRef.current = true;
    const current = latest.current;
    const spec = confirmationAlertSpec(current);
    const buttons: AlertButton[] = spec.buttons.map((button) => ({
      text: button.text,
      style: button.style,
      onPress:
        button.kind === "cancel"
          ? current.onCancel
          : button.kind === "secondary"
            ? () => void current.secondaryAction?.onPress()
            : confirm,
    }));
    Alert.alert(spec.title, spec.message, buttons, {
      cancelable: true,
      onDismiss: () => latest.current.onCancel(),
    });
  }, [visible]);

  // The alert closed when it was answered; a failure comes back as `error`
  // while the caller still holds it open, so it gets an alert of its own.
  useEffect(() => {
    if (!visible || !error) return;
    const current = latest.current;
    Alert.alert(current.title, error, [
      { text: current.cancelLabel ?? "Cancel", style: "cancel", onPress: current.onCancel },
      { text: "Try again", onPress: confirm },
    ]);
  }, [visible, error]);

  return null;
}

function ConfirmationSheet({
  visible,
  title,
  body,
  children,
  summary,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmTone = "primary",
  error,
  loading,
  onCancel,
  onConfirm,
  secondaryAction,
}: ConfirmationModalProps) {
  const confirm = useAsyncAction(() => {
    if (confirmTone === "danger") hapticImpact("medium");
    return onConfirm();
  });
  const isBusy = Boolean(loading || confirm.isRunning);

  return (
    <BottomSheetModal
      dismissDisabled={isBusy}
      footer={
        <SheetActions
          primaryAction={
            <Button
              label={confirmLabel}
              loading={isBusy}
              onPress={confirm.run}
              tone={confirmTone}
            />
          }
        >
          {!secondaryAction || secondaryAction.keepsCancel ? (
            <Button disabled={isBusy} label={cancelLabel} onPress={onCancel} tone="plain" />
          ) : null}
          {secondaryAction ? (
            <Button
              disabled={isBusy}
              label={secondaryAction.label}
              onPress={secondaryAction.onPress}
              tone="neutral"
            />
          ) : null}
        </SheetActions>
      }
      header={<SheetHeader title={title} />}
      visible={visible}
      onDismiss={onCancel}
    >
      <View style={styles.body}>
        {body ? (
          <AppText tone="secondary" variant="body">
            {body}
          </AppText>
        ) : null}
        {children}
        {summary ? <ConfirmSummaryBox summary={summary} /> : null}
        {error ? <InlineError message={error} /> : null}
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: mobileSpace.md,
  },
});
