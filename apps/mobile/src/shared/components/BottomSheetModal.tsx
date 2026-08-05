import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileRadii, mobileSpace, type MobileColors } from "../theme/tokens";
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
  const translateY = useRef(new Animated.Value(windowHeight)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : windowHeight,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, translateY, windowHeight]);

  const handleDismiss = () => {
    if (dismissDisabled) return;
    onDismiss();
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={handleDismiss}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.root}
      >
        <Pressable
          accessibilityLabel={accessibilityLabel}
          style={StyleSheet.absoluteFill}
          onPress={handleDismiss}
        />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.grabber} />
          {scrollable ? (
            <ScrollView
              contentContainerStyle={[styles.body, footer ? styles.bodyWithFooter : null]}
              showsVerticalScrollIndicator={false}
              style={styles.scrollArea}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.body, footer ? styles.bodyWithFooter : null]}>{children}</View>
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (mobileColors: MobileColors, windowHeight: number, bottomPadding: number) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "flex-end",
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
      paddingTop: 10,
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
