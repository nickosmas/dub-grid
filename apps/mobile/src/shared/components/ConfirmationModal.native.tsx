import { useContext, useEffect, useRef } from "react";
import { Alert, StyleSheet, View, type AlertButton } from "react-native";
import { hapticImpact } from "../lib/haptics";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { mobileSpace } from "../theme/tokens";
import { AppText } from "./AppText";
import { BottomSheetModal, SheetActions, SheetHeader } from "./BottomSheetModal";
import { Button } from "./Button";
import { ConfirmSummaryBox, type ConfirmSummary } from "./ConfirmSummaryBox";
import { InlineError } from "./InlineError";
import type { ConfirmationModalProps } from "./ConfirmationModal";
import { AnchoredConfirmationContext } from "./anchored-confirmation";

export type { ConfirmationModalProps } from "./ConfirmationModal";

/**
 * A confirmation in each platform's own element: the system alert (UIKit's
 * alert on iOS, Material's AlertDialog on Android) when it is only words, and
 * a native sheet when it carries controls of its own, such as a choice to make
 * before confirming. The web and the tests keep the drawn card in
 * `ConfirmationModal.tsx`.
 */
export function ConfirmationModal(props: ConfirmationModalProps) {
  return props.children ? <ConfirmationSheet {...props} /> : <ConfirmationAlert {...props} />;
}

function summaryLines(summary: ConfirmSummary | undefined): string[] {
  if (!summary || summary.points.length === 0) return [];
  if (summary.points.length === 1 && !summary.title) return [summary.points[0]!];
  const bullets = summary.points.map((point) => `• ${point}`).join("\n");
  return [summary.title ? `${summary.title}\n${bullets}` : bullets];
}

function ConfirmationAlert(props: ConfirmationModalProps) {
  const { visible, error } = props;
  // Read at press time: the alert's buttons outlive the render that made them.
  const latest = useRef(props);
  latest.current = props;
  const shownRef = useRef(false);
  // A plain destructive question inside an iOS sheet opens from its close
  // button instead of the middle of the screen.
  const showAnchored = useContext(AnchoredConfirmationContext);
  const anchored =
    showAnchored != null &&
    props.confirmTone === "danger" &&
    !props.secondaryAction &&
    !props.summary;

  useEffect(() => {
    if (!anchored || !showAnchored) return;
    if (!visible) {
      showAnchored(null);
      return;
    }
    const current = latest.current;
    showAnchored({
      title: current.title,
      body: current.body,
      confirmLabel: current.confirmLabel,
      onConfirm: confirm,
      onCancel: () => latest.current.onCancel(),
    });
    return () => showAnchored(null);
  }, [anchored, showAnchored, visible]);

  const confirm = () => {
    const current = latest.current;
    if (current.confirmTone === "danger") hapticImpact("medium");
    void Promise.resolve()
      .then(() => current.onConfirm())
      // A failure is the caller's to report, through `error` or a toast.
      .catch(() => undefined);
  };

  useEffect(() => {
    if (anchored) return;
    if (!visible) {
      shownRef.current = false;
      return;
    }
    if (shownRef.current) return;
    shownRef.current = true;
    const current = latest.current;
    const buttons: AlertButton[] = [
      { text: current.cancelLabel ?? "Cancel", style: "cancel", onPress: current.onCancel },
    ];
    if (current.secondaryAction) {
      const secondary = current.secondaryAction;
      buttons.push({ text: secondary.label, onPress: () => void secondary.onPress() });
    }
    buttons.push({
      text: current.confirmLabel,
      style: current.confirmTone === "danger" ? "destructive" : "default",
      onPress: confirm,
    });
    const message = [current.body, ...summaryLines(current.summary)].filter(Boolean).join("\n\n");
    Alert.alert(current.title, message || undefined, buttons, {
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
          {secondaryAction ? (
            <Button
              disabled={isBusy}
              label={secondaryAction.label}
              onPress={secondaryAction.onPress}
              tone="neutral"
            />
          ) : (
            <Button disabled={isBusy} label={cancelLabel} onPress={onCancel} tone="plain" />
          )}
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
