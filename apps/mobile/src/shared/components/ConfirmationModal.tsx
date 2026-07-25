import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, type ButtonTone } from "./Button";
import { hapticImpact } from "../lib/haptics";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileText, type MobileColors } from "../theme/tokens";

const SHEET_BOTTOM_PADDING = Platform.OS === "ios" ? 40 : 24;
const SHEET_TRAVEL = Dimensions.get("window").height;

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
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const isDestructive = confirmTone === "danger" || confirmTone === "dangerFilled";

  const handleConfirm = () => {
    if (isDestructive) {
      hapticImpact("medium");
    }
    onConfirm();
  };

  const handleCancel = () => {
    if (loading) return;
    onCancel();
  };

  const translateY = useRef(new Animated.Value(SHEET_TRAVEL)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : SHEET_TRAVEL,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, translateY]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={handleCancel}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Dismiss"
          style={StyleSheet.absoluteFill}
          onPress={handleCancel}
        />
        <Animated.View
          accessibilityRole="alert"
          style={[styles.sheet, { transform: [{ translateY }] }]}
        >
          <View style={styles.grabber} />
          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            {body ? <Text style={styles.body}>{body}</Text> : null}
            {children}
          </View>
          <View style={styles.actions}>
            <Button disabled={loading} label={cancelLabel} onPress={handleCancel} tone="neutral" />
            <Button
              label={confirmLabel}
              loading={loading}
              onPress={handleConfirm}
              tone={confirmTone}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: mobileColors.overlay,
    },
    sheet: {
      width: "100%",
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: SHEET_BOTTOM_PADDING,
      gap: 20,
      shadowColor: mobileColors.textPrimary,
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: Platform.OS === "ios" ? 0.18 : 0,
      shadowRadius: 28,
      elevation: 16,
    },
    grabber: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.border,
      marginBottom: 6,
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
      gap: 10,
    },
  });
