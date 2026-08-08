import { useMemo, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { Button, type ButtonTone } from "./Button";
import { hapticImpact } from "../lib/haptics";
import { useSheetDragToDismiss } from "../hooks/useSheetDragToDismiss";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileText, type MobileColors } from "../theme/tokens";

const SHEET_BOTTOM_PADDING = Platform.OS === "ios" ? 40 : 24;

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
  // Read live rather than at module scope: a module-scope `Dimensions.get`
  // snapshot goes stale on rotation and on foldables.
  const { height: windowHeight } = useWindowDimensions();
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

  const { backdropStyle, gesture, sheetStyle } = useSheetDragToDismiss({
    // A pending confirmation can't be dragged away, same as tapping outside.
    enabled: !loading,
    onDismiss: handleCancel,
    travel: windowHeight,
    visible,
  });

  return (
    <Modal
      animationType="fade"
      onRequestClose={handleCancel}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      {/* A Modal renders in its own native view hierarchy, which sits outside
          the root provider, so gesture-handler needs its own root in here. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <KeyboardAvoidingView
          // Callers may render a TextInput via `children` (e.g. the People
          // status-change reason), and this sheet is vertically centered — with
          // no avoidance the keyboard covers the field and both buttons.
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.root}
        >
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
          />
          <Pressable
            accessibilityLabel="Dismiss"
            style={StyleSheet.absoluteFill}
            onPress={handleCancel}
          />
          <GestureDetector gesture={gesture}>
            <Animated.View accessibilityRole="alert" style={[styles.sheet, sheetStyle]}>
              <View style={styles.grabberArea}>
                <View style={styles.grabber} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.title}>{title}</Text>
                {body ? <Text style={styles.body}>{body}</Text> : null}
                {children}
              </View>
              <View style={styles.actions}>
                <Button
                  disabled={loading}
                  label={cancelLabel}
                  onPress={handleCancel}
                  tone="neutral"
                />
                <Button
                  label={confirmLabel}
                  loading={loading}
                  onPress={handleConfirm}
                  tone={confirmTone}
                />
              </View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    gestureRoot: {
      flex: 1,
    },
    root: {
      flex: 1,
      justifyContent: "flex-end",
    },
    // Split out of `root` so it can fade with the sheet as it is dragged down.
    backdrop: {
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
      paddingBottom: SHEET_BOTTOM_PADDING,
      gap: 20,
      shadowColor: mobileColors.textPrimary,
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: Platform.OS === "ios" ? 0.18 : 0,
      shadowRadius: 28,
      elevation: 16,
    },
    // Carries the sheet's top padding so the visual spacing is unchanged now
    // that the grabber sits in its own row.
    grabberArea: {
      alignItems: "center",
      paddingBottom: 6,
      paddingTop: 10,
    },
    grabber: {
      width: 40,
      height: 4,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.border,
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
