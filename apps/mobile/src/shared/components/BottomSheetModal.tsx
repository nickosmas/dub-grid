import { useMemo, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileRadii, mobileSpace, type MobileColors } from "../theme/tokens";
import { useSheetDragToDismiss } from "../hooks/useSheetDragToDismiss";
import { useMobileColors } from "../providers/ThemeModeProvider";

/** Padding below the sheet content, on top of the device's own bottom inset. */
const SHEET_CONTENT_BOTTOM_PADDING = mobileSpace["2xl"];

export function BottomSheetModal({
  visible,
  onDismiss,
  dismissDisabled = false,
  scrollable = false,
  accessibilityLabel = "Dismiss",
  footer,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  dismissDisabled?: boolean;
  scrollable?: boolean;
  accessibilityLabel?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const insets = useSafeAreaInsets();
  // Read live rather than at module scope: a module-scope `Dimensions.get`
  // snapshot goes stale on rotation and on foldables.
  const { height: windowHeight } = useWindowDimensions();
  const bottomPadding = SHEET_CONTENT_BOTTOM_PADDING + insets.bottom;
  const styles = useMemo(
    () => createStyles(mobileColors, windowHeight, bottomPadding),
    [mobileColors, windowHeight, bottomPadding],
  );
  const handleDismiss = () => {
    if (dismissDisabled) return;
    onDismiss();
  };
  const { backdropStyle, gesture, scrollHandler, scrollRef, sheetStyle } = useSheetDragToDismiss({
    enabled: !dismissDisabled,
    onDismiss: handleDismiss,
    scrollable,
    travel: windowHeight,
    visible,
  });

  return (
    <Modal
      animationType="fade"
      onRequestClose={handleDismiss}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      {/* A Modal renders in its own native view hierarchy, which sits outside
          the root provider, so gesture-handler needs its own root in here. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.root}
        >
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
          />
          <Pressable
            accessibilityLabel={accessibilityLabel}
            style={StyleSheet.absoluteFill}
            onPress={handleDismiss}
          />
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.sheet, sheetStyle]}>
              <View style={styles.grabberArea}>
                <View style={styles.grabber} />
              </View>
              {scrollable ? (
                <Animated.ScrollView
                  ref={scrollRef}
                  // No rubber-banding at the top edge: that bounce is where the
                  // sheet drag takes over, and the two fighting reads as jitter.
                  bounces={false}
                  contentContainerStyle={[styles.body, footer ? styles.bodyWithFooter : null]}
                  onScroll={scrollHandler}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  style={styles.scrollArea}
                >
                  {children}
                </Animated.ScrollView>
              ) : (
                <View style={[styles.body, footer ? styles.bodyWithFooter : null]}>{children}</View>
              )}
              {footer ? <View style={styles.footer}>{footer}</View> : null}
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const createStyles = (mobileColors: MobileColors, windowHeight: number, bottomPadding: number) =>
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
      maxHeight: Math.round(windowHeight * 0.92),
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
      shadowColor: mobileColors.textPrimary,
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: Platform.OS === "ios" ? 0.18 : 0,
      shadowRadius: 28,
      elevation: 16,
    },
    // Full-width so the grabber is comfortable to catch, and it carries the
    // sheet's top padding so the visual spacing is unchanged.
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
    scrollArea: {
      flexShrink: 1,
    },
    body: {
      paddingHorizontal: 20,
      paddingBottom: bottomPadding,
      gap: mobileSpace.lg,
    },
    bodyWithFooter: {
      paddingBottom: mobileSpace.lg,
    },
    footer: {
      flexDirection: "row",
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: bottomPadding,
    },
  });
