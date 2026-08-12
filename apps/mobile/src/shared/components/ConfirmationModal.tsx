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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, type ButtonTone } from "./Button";
import { hapticImpact } from "../lib/haptics";
import { useSheetDragToDismiss } from "../hooks/useSheetDragToDismiss";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileElevation,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../theme/tokens";

/**
 * Padding below the actions, inside the sheet's own edge — the same rule
 * `BottomSheetModal` uses. It replaces a fixed 40/24 platform fork that stood
 * in for the device inset, which the sheet's bottom margin now carries.
 */
const SHEET_CONTENT_BOTTOM_PADDING = mobileSpace["2xl"];

/**
 * A sheet is a much bigger surface than a card, and the card radius reads
 * nearly square across that width — it wants its own step up, past anything on
 * the shared radius ramp. Sits in the range iOS gives its own sheets (~38-44).
 *
 * Top corners only: the bottom two run past the screen edge, where a radius
 * would cut two backdrop-coloured notches into the very bottom.
 */
const SHEET_CORNER_RADIUS = 40;

/**
 * A modal gets its own native window, which on Android is inset by the system
 * bars even when the app itself draws edge-to-edge. Translucent on both, so the
 * sheet's own margins are measured from the true screen edge rather than from
 * wherever the navigation bar happens to start.
 * `navigationBarTranslucent` requires `statusBarTranslucent`.
 */
const MODAL_EDGE_TO_EDGE_PROPS = {
  navigationBarTranslucent: true,
  statusBarTranslucent: true,
} as const;

type ConfirmationTone = Extract<
  ButtonTone,
  "primary" | "secondary" | "neutral" | "danger" | "warning"
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
  const isDark = useIsDarkMode();
  const insets = useSafeAreaInsets();
  // The sheet runs to the screen's bottom edge, so nothing lifts its actions
  // clear of the system bars any more — that falls back to the content padding.
  const bottomPadding = SHEET_CONTENT_BOTTOM_PADDING + insets.bottom;
  const styles = useMemo(
    () => createStyles(mobileColors, isDark, bottomPadding),
    [mobileColors, isDark, bottomPadding],
  );
  // Read live rather than at module scope: a module-scope `Dimensions.get`
  // snapshot goes stale on rotation and on foldables.
  const { height: windowHeight } = useWindowDimensions();
  const isDestructive = confirmTone === "danger";

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
      {...MODAL_EDGE_TO_EDGE_PROPS}
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

const createStyles = (mobileColors: MobileColors, isDark: boolean, bottomPadding: number) =>
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
      // No margins and no width of its own: the sheet stretches to the full
      // screen width by default and meets the bottom edge, so the top two
      // corners are its only edges ever in view.
      borderTopLeftRadius: SHEET_CORNER_RADIUS,
      borderTopRightRadius: SHEET_CORNER_RADIUS,
      backgroundColor: mobileColors.surface,
      paddingHorizontal: mobileSpace.xl,
      paddingBottom: bottomPadding,
      gap: mobileSpace.xl,
      ...mobileElevation("sheet", isDark),
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
