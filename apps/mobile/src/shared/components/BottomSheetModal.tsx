import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { mobileRadii, type MobileColors } from "../theme/tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";

const SHEET_BOTTOM_PADDING = Platform.OS === "ios" ? 40 : 24;
const SHEET_TRAVEL = Dimensions.get("window").height;
const MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.92);

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
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const translateY = useRef(new Animated.Value(SHEET_TRAVEL)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : SHEET_TRAVEL,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, translateY]);

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
      <View style={styles.root}>
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
      </View>
    </Modal>
  );
}

const createStyles = (mobileColors: MobileColors) => StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: mobileColors.overlay,
  },
  sheet: {
    width: "100%",
    maxHeight: MAX_HEIGHT,
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
    paddingBottom: SHEET_BOTTOM_PADDING,
    gap: 16,
  },
  bodyWithFooter: {
    paddingBottom: 16,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: SHEET_BOTTOM_PADDING,
  },
});
