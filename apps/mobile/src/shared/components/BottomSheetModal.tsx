import { createContext, useContext, useMemo, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { Pressable } from "./Pressable";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileElevation, mobileRadii, mobileSpace, type MobileColors } from "../theme/tokens";
import { AppText } from "./AppText";
import { SHEET_OVERDRAG_LIMIT, useSheetDragToDismiss } from "../hooks/useSheetDragToDismiss";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";

/**
 * Whether the subtree is rendered inside a sheet.
 *
 * A sheet is already the elevated thing on screen, so nothing inside it may
 * cast a shadow of its own: stacking a card shadow on a sheet reads as grubby
 * rather than as depth, and the sheet's own surface is what separates its
 * content from the page. Shared surfaces (`ProfilePanel`, `ProfileList`) are
 * used on both pages and sheets, so they read this rather than taking a prop —
 * a prop is something a call site can forget, and this cannot be.
 */
const InsideSheetContext = createContext(false);

/** True when the caller is somewhere beneath a `BottomSheetModal`. */
export function useIsInsideSheet(): boolean {
  return useContext(InsideSheetContext);
}

/** Padding below the sheet content, inside the sheet's own edge. */
const SHEET_CONTENT_BOTTOM_PADDING = mobileSpace["2xl"];

/**
 * Space between the sheet's top edge and the first thing inside it, whether that
 * is the grabber or the header. The same step as the padding under the last
 * thing, so the surface is inset by one number on both ends: at a 40pt corner
 * radius, a title closer than this reads as crowded by the curve.
 */
const SHEET_CONTENT_TOP_PADDING = mobileSpace["3xl"];

/**
 * Where the grabber sits inside that padding, with the remainder falling below
 * it — so a sheet with a grabber and one without hold their header at the same
 * height. Both are derived rather than picked, which is what keeps them equal.
 */
const GRABBER_TOP_INSET = mobileSpace.md;
const GRABBER_HEIGHT = 4;

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

export function BottomSheetModal({
  visible,
  onDismiss,
  backdrop = "scrim",
  dismissDisabled = false,
  scrollable = false,
  accessibilityLabel = "Dismiss",
  accessibilityRole,
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
  // The sheet lifts itself over the keyboard rather than sitting in a
  // `KeyboardAvoidingView`, which would take the backdrop up with it and leave a
  // strip of undimmed app along the bottom.
  //
  // This value lives on the UI thread, so the lift is a real animation that
  // tracks the keyboard frame by frame. It used to be `useState` feeding a
  // `marginBottom` in `createStyles`, which rebuilt the entire StyleSheet on
  // every keyboard event and landed the new margin as one un-animated jump —
  // on iOS that jump raced the keyboard's own slide, which is what read as
  // jitter. Reanimated's keyboard height is negative (it is meant for
  // `translateY`), hence the negation.
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  // The sheet runs to the modal's bottom edge, so nothing lifts its content
  // clear of the system bars any more — that falls back to the content padding.
  const bottomPadding = SHEET_CONTENT_BOTTOM_PADDING + insets.bottom;
  const topGap = insets.top + SHEET_TOP_GAP;
  const isDark = useIsDarkMode();
  const styles = useMemo(
    () => createStyles(mobileColors, isDark, topGap, bottomPadding, backdrop),
    [mobileColors, isDark, topGap, bottomPadding, backdrop],
  );
  const keyboardStyle = useAnimatedStyle(() => ({
    marginBottom: -keyboardHeight.value - SHEET_OVERDRAG_LIMIT,
  }));
  const handleDismiss = () => {
    if (dismissDisabled) return;
    onDismiss();
  };
  const {
    backdropStyle,
    gesture,
    onScrollContentSizeChange,
    onScrollViewLayout,
    scrollHandler,
    scrollRef,
    sheetStyle,
  } = useSheetDragToDismiss({
    dismissible: !dismissDisabled,
    onDismiss: handleDismiss,
    scrollable,
    travel: windowHeight,
    visible,
  });

  return (
    // Both translucency props, always, and they only mean anything on Android.
    // The app itself is edge-to-edge and paints under the navigation bar, but a
    // modal is its own window and does not inherit that: React Native decides
    // per modal, from `statusBarTranslucent`, whether to set `fitsSystemWindows`
    // on the frame it wraps the React root in (`ReactModalHostView.contentView`).
    // Left false, that frame is padded by the system bar insets, so everything
    // React draws in the modal — the sheet *and* the backdrop that is supposed
    // to dim behind it — stops a navigation bar short of the bottom of the
    // screen, with the undimmed app showing through the strip underneath.
    //
    // They come as a pair. `navigationBarTranslucent` alone is the worse
    // version of the same bug (React Native warns about it): the dialog window
    // goes edge-to-edge while that frame keeps insetting the root, so the gap
    // grows to the full status-plus-navigation bar. `statusBarTranslucent`
    // alone drops the padding but leaves the window fitted to the system bars,
    // which just moves the same strip. Only both together give the sheet a
    // window that reaches the bottom edge and a root that fills it.
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={handleDismiss}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      {/* A Modal renders in its own native view hierarchy, which sits outside
          the root provider, so gesture-handler needs its own root in here. */}
      <InsideSheetContext.Provider value>
        <GestureHandlerRootView style={styles.gestureRoot}>
          <View style={styles.root}>
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
            />
            {/* Tapping outside dismisses, so there is nothing to tap when the
              sheet is blocking. */}
            {dismissDisabled ? null : (
              <Pressable
                accessibilityLabel={accessibilityLabel}
                accessibilityRole="button"
                style={StyleSheet.absoluteFill}
                onPress={handleDismiss}
              />
            )}
            <GestureDetector gesture={gesture}>
              <Animated.View
                accessibilityRole={accessibilityRole}
                style={[styles.sheet, keyboardStyle, sheetStyle]}
              >
                {/* The drag region. Deliberately tall and outside the ScrollView:
                  a touch starting here can never be claimed by the scrolling
                  body, so the sheet always drags — without the user having to
                  hit the 40x4 handle itself. */}
                <View style={styles.dragRegion}>
                  {/* Every sheet carries the handle, blocking ones included: it is
                    what marks the top of the sheet as the thing you grab, and a
                    blocking sheet answers that grab by following the finger a
                    little and settling back rather than by not moving. */}
                  <View style={styles.grabberArea}>
                    <View style={styles.grabber} />
                  </View>
                  {header ? <View style={styles.header}>{header}</View> : null}
                </View>
                {scrollable ? (
                  <Animated.ScrollView
                    ref={scrollRef}
                    // No rubber-banding at either edge: both are where the sheet's
                    // own drag takes over, and the two fighting reads as jitter.
                    // `bounces` is the iOS half of that, `overScrollMode` Android's.
                    bounces={false}
                    overScrollMode="never"
                    contentContainerStyle={[styles.body, footer ? styles.bodyWithFooter : null]}
                    // Without this the list defaults to `"never"`, so the first
                    // tap on a sheet's submit button while a field is focused was
                    // swallowed dismissing the keyboard, and the user had to tap
                    // twice. Every sheet with a form sits in here.
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                    // The two together say whether the list has anywhere left to
                    // scroll, which is what decides who owns an upward drag.
                    onContentSizeChange={onScrollContentSizeChange}
                    onLayout={onScrollViewLayout}
                    onScroll={scrollHandler}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    style={styles.scrollArea}
                  >
                    {children}
                  </Animated.ScrollView>
                ) : (
                  <View style={[styles.body, footer ? styles.bodyWithFooter : null]}>
                    {children}
                  </View>
                )}
                {footer ? <View style={styles.footer}>{footer}</View> : null}
              </Animated.View>
            </GestureDetector>
          </View>
        </GestureHandlerRootView>
      </InsideSheetContext.Provider>
    </Modal>
  );
}

const createStyles = (
  mobileColors: MobileColors,
  isDark: boolean,
  topGap: number,
  bottomPadding: number,
  backdrop: "scrim" | "cover",
) =>
  StyleSheet.create({
    gestureRoot: {
      flex: 1,
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
      // The height a tall sheet is held to, expressed against the box the modal
      // actually got rather than a measurement of the window: those two differ
      // whenever the modal's window and the app's window are inset differently,
      // and the sheet then either runs off the top or stops short of the bottom.
      // The margin is what a full-height sheet leaves clear of the status bar,
      // and `flexShrink` is what makes it a ceiling rather than an overflow.
      marginTop: topGap,
      flexShrink: 1,
      // Surface enough to cover an upward overdrag, hanging off the bottom of the
      // screen: the padding adds it, the negative margin keeps the content where
      // it was. Without it, lifting the sheet slides its square bottom corners
      // into view over a strip of dimmed page, when what should read is a sheet
      // pinned to the edge with only its top moving.
      paddingBottom: SHEET_OVERDRAG_LIMIT,
      // `marginBottom` is deliberately absent: it is animated, and lives in
      // `keyboardStyle` on the component so the keyboard lift runs on the UI
      // thread instead of rebuilding this StyleSheet on every keyboard event.
      // No side margins and no width of its own: the sheet stretches to the full
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
      paddingTop: GRABBER_TOP_INSET,
      paddingBottom: SHEET_CONTENT_TOP_PADDING - GRABBER_TOP_INSET - GRABBER_HEIGHT,
    },
    grabber: {
      width: 40,
      height: GRABBER_HEIGHT,
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
