import { useMemo, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
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

/** Padding below the sheet content, inside the sheet's own edge. */
const SHEET_CONTENT_BOTTOM_PADDING = mobileSpace["2xl"];

/**
 * Breathing room left above a full-height sheet, below the status bar. The
 * sheet has no margins of its own: it spans the full width and runs off the
 * bottom edge, so this is the only side it is ever held back from.
 */
const SHEET_TOP_GAP = mobileSpace.md;

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

export function BottomSheetModal({
  visible,
  onDismiss,
  backdrop = "scrim",
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
  /**
   * Every way out of the sheet — the drag, the outside tap and the Android back
   * gesture — funnels through here, so a sheet holding unsaved input can route
   * this into a discard confirmation instead of closing. Leaving `visible` true
   * settles a dragged sheet back into place rather than stranding it off-screen.
   */
  onDismiss: () => void;
  /**
   * `"scrim"` dims the app behind the sheet. `"cover"` paints it out entirely,
   * for the app lock, where the whole point is that the content underneath must
   * not be readable — a translucent scrim there would leak it to whoever picked
   * the phone up.
   */
  backdrop?: "scrim" | "cover";
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
  // The sheet runs to the screen's bottom edge, so nothing lifts its content
  // clear of the system bars any more — that falls back to the content padding.
  const bottomPadding = SHEET_CONTENT_BOTTOM_PADDING + insets.bottom;
  // Measured against the space that actually exists, not a share of the window.
  // Once the modal started drawing under the system bars, a percentage of the
  // full window ran off the top on a tall sheet — grabber, header and all —
  // with the status bar over whatever was left.
  const maxHeight = windowHeight - insets.top - SHEET_TOP_GAP;
  const isDark = useIsDarkMode();
  const styles = useMemo(
    () => createStyles(mobileColors, isDark, maxHeight, bottomPadding, backdrop),
    [mobileColors, isDark, maxHeight, bottomPadding, backdrop],
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
      {...MODAL_EDGE_TO_EDGE_PROPS}
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
  maxHeight: number,
  bottomPadding: number,
  backdrop: "scrim" | "cover",
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
      backgroundColor: backdrop === "cover" ? mobileColors.surface : mobileColors.overlay,
    },
    sheet: {
      maxHeight,
      // No margins and no width of its own: the sheet stretches to the full
      // screen width by default and meets the bottom edge, so the top two
      // corners are its only edges ever in view.
      borderTopLeftRadius: SHEET_CORNER_RADIUS,
      borderTopRightRadius: SHEET_CORNER_RADIUS,
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
 * The canonical sheet title, for `BottomSheetModal`'s `header` slot.
 *
 * Every sheet used to answer this for itself and none of them agreed: the title
 * was `heroMetric` (24), `screenTitle` (22) or `sectionTitle` (16) depending on
 * the screen, and half of them rendered it inside the scrolling body, where it
 * scrolls out of view and isn't part of the drag region. One component, one
 * step on the ramp, always in the header.
 */
export function SheetHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const mobileColors = useMobileColors();

  return (
    <View style={sheetHeaderStyles.root}>
      {icon ? <Ionicons color={mobileColors.brand} name={icon} size={28} /> : null}
      <AppText variant="screenTitle">{title}</AppText>
      {subtitle ? (
        <AppText tone="secondary" variant="body">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const sheetHeaderStyles = StyleSheet.create({
  root: {
    gap: mobileSpace.xs,
  },
});

/**
 * Body copy + optional link, as used by the blocking consent and terms sheets.
 * Extracted because those two were byte-for-byte copies of each other's chrome
 * and copy layout. The title belongs in `SheetHeader`, not here.
 */
export function SheetCopy({
  body,
  linkLabel,
  onLinkPress,
  error,
}: {
  body: string;
  linkLabel?: string;
  onLinkPress?: () => void;
  error?: string | null;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createCopyStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.copy}>
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
