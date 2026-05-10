import type { ReactNode } from "react";
import { Modal, Platform, StyleSheet, Text, View } from "react-native";
import { Button, type ButtonTone } from "./Button";
import { mobileColors, mobileRadii, mobileText } from "../theme/tokens";

type ConfirmationTone = Extract<
  ButtonTone,
  "primary" | "secondary" | "neutral" | "danger" | "dangerFilled" | "warningFilled"
>;

export function ConfirmationModal({
  visible,
  title,
  body,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmTone = "primary",
  loading = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: ConfirmationTone;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill} />
        <View
          accessibilityRole="alert"
          style={styles.dialog}
        >
          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            {body ? <Text style={styles.body}>{body}</Text> : null}
            {children}
          </View>
          <View style={styles.actions}>
            <Button
              compact
              disabled={loading}
              label={cancelLabel}
              onPress={onCancel}
              tone="neutral"
            />
            <Button
              compact
              label={confirmLabel}
              loading={loading}
              onPress={onConfirm}
              tone={confirmTone}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.36)",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surface,
    padding: 18,
    gap: 18,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: Platform.OS === "ios" ? 0.18 : 0,
    shadowRadius: 28,
    elevation: 12,
  },
  copy: {
    gap: 8,
  },
  title: {
    ...mobileText.sectionTitle,
    color: mobileColors.textPrimary,
  },
  body: {
    ...mobileText.body,
    color: mobileColors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 10,
  },
});
