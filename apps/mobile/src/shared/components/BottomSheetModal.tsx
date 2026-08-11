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
import { mobileElevation, mobileRadii, mobileSpace, type MobileColors } from "../theme/tokens";
import { AppText } from "./AppText";
import { useSheetDragToDismiss } from "../hooks/useSheetDragToDismiss";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";

/** Padding below the sheet content, on top of the device's own bottom inset. */
const SHEET_CONTENT_BOTTOM_PADDING = mobileSpace["2xl"];

export function BottomSheetModal({
  visible,
  onDismiss,
  dismissDisabled = false,
  scrollable = false,
  accessibilityLabel = "Dismiss",
  accessibilityRole,
  showGrabber,
  header,
  footer,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  dismissDisabled?: boolean;
  scrollable?: boolean;
  accessibilityLabel?: string;
  /** Set "alert" for a blocking sheet the user must answer before continuing. */
  accessibilityRole?: "alert";
  /**
   * Defaults to hidden on a non-dismissable sheet: a grabber advertises "drag
   * me away", which is a lie when the sheet can't be dismissed.
   */
  showGrabber?: boolean;
  /**
   * Rendered in the sheet's non-scrolling top region, which is also the drag
   * region. Put a sheet's title here rather than in `children` so the whole
   * header drags, not just the grabber.
   */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const insets = useSafeAreaInsets();
  // Read live rather than at module scope: a module-scope `Dimensions.get`
  // snapshot goes stale on rotation and on foldables.
  const { height: windowHeight } = useWindowDimensions();
  const bottomPadding = SHEET_CONTENT_BOTTOM_PADDING + insets.bottom;
  const isDark = useIsDarkMode();
  const styles = useMemo(
    () => createStyles(mobileColors, isDark, windowHeight, bottomPadding),
    [mobileColors, isDark, windowHeight, bottomPadding],
  );
  const grabberVisible = showGrabber ?? !dismissDisabled;
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
          {/* Tapping outside dismisses, so there is nothing to tap when the
              sheet is blocking. */}
          {dismissDisabled ? null : (
            <Pressable
              accessibilityLabel={accessibilityLabel}
              style={StyleSheet.absoluteFill}
              onPress={handleDismiss}
            />
          )}
          <GestureDetector gesture={gesture}>
            <Animated.View accessibilityRole={accessibilityRole} style={[styles.sheet, sheetStyle]}>
              {/* The drag region. Deliberately tall and outside the ScrollView:
                  a touch starting here can never be claimed by the scrolling
                  body, so the sheet always drags — without the user having to
                  hit the 40x4 handle itself. */}
              <View style={styles.dragRegion}>
                {grabberVisible ? (
                  <View style={styles.grabberArea}>
                    <View style={styles.grabber} />
                  </View>
                ) : (
                  <View style={styles.grabberSpacer} />
                )}
                {header ? <View style={styles.header}>{header}</View> : null}
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

const createStyles = (
  mobileColors: MobileColors,
  isDark: boolean,
  windowHeight: number,
  bottomPadding: number,
) =>
  StyleSheet.create({
    gestureRoot: {
      flex: 1,
    },
    // Keeps the top inset consistent whether or not the grabber is drawn.
    grabberSpacer: {
      height: mobileSpace.lg,
    },
    // A comfortable drag target even on a sheet with no header. 44pt is the
    // minimum touch target, and the whole strip drags.
    dragRegion: {
      minHeight: 44,
      justifyContent: "center",
    },
    header: {
      paddingHorizontal: mobileSpace.xl,
      paddingBottom: mobileSpace.md,
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
      borderTopLeftRadius: mobileRadii.card + 8,
      borderTopRightRadius: mobileRadii.card + 8,
      // Dark mode keeps the hairline; its shadow is invisible against a
      // near-black page, so the edge is what separates sheet from backdrop.
      borderWidth: isDark ? 1 : 0,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
      ...mobileElevation("sheet", isDark),
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

/**
 * Title + body + optional link, as used by the blocking consent and terms
 * sheets. Extracted because those two were byte-for-byte copies of each other's
 * chrome and copy layout.
 */
export function SheetCopy({
  title,
  body,
  linkLabel,
  onLinkPress,
  error,
}: {
  title: string;
  body: string;
  linkLabel?: string;
  onLinkPress?: () => void;
  error?: string | null;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createCopyStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.copy}>
      <AppText variant="sectionTitle">{title}</AppText>
      <AppText tone="secondary" variant="body">
        {body}
      </AppText>
      {linkLabel && onLinkPress ? (
        <Pressable accessibilityRole="link" hitSlop={8} onPress={onLinkPress}>
          <AppText style={styles.link} tone="brand" variant="bodyStrong">
            {linkLabel}
          </AppText>
        </Pressable>
      ) : null}
      {error ? (
        <AppText tone="danger" variant="meta">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/** Stacked full-width actions, primary first. */
export function SheetActions({ children }: { children: ReactNode }) {
  return <View style={sheetActionStyles.actions}>{children}</View>;
}

const sheetActionStyles = StyleSheet.create({
  actions: {
    gap: mobileSpace.sm,
  },
});

const createCopyStyles = (_mobileColors: MobileColors) =>
  StyleSheet.create({
    copy: {
      gap: mobileSpace.sm,
    },
    link: {
      marginTop: mobileSpace.xs,
    },
  });
