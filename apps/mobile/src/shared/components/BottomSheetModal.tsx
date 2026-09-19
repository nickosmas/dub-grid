import { ActionButtons } from "./ActionButtons";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { Pressable } from "./Pressable";
import { createIconControlStyle, ICON_CONTROL_SIZE } from "./icon-control-style";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { registerModalPresentation } from "../lib/modal-presentation";
import {
  mobileElevation,
  mobileMotion,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../theme/tokens";
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
/**
 * Exported (not just the hook below) so `ConfirmationModal` can provide the
 * same signal from its own popup card: that surface is elevated too, and a
 * `ProfilePanel`/`ProfileList` nested in a confirmation's `children` needs the
 * same "don't cast your own shadow" answer it would get inside a sheet.
 */
export const InsideSheetContext = createContext(false);

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

/** Tap target for the close button, and the box centred on the title's line. */
const CLOSE_BUTTON_SIZE = ICON_CONTROL_SIZE;

/** What `SheetHeader` renders its title at, which is what the close button lines up with. */
const SHEET_TITLE_LINE_HEIGHT = mobileText.screenTitle.lineHeight ?? 28;

/** Centres the close button on the title's first line. */
const CLOSE_BUTTON_TOP =
  SHEET_CONTENT_TOP_PADDING + (SHEET_TITLE_LINE_HEIGHT - CLOSE_BUTTON_SIZE) / 2;

export function BottomSheetModal({
  visible,
  onDismiss,
  backdrop = "scrim",
  dismissDisabled = false,
  scrollable = false,
  accessibilityLabel = "Dismiss",
  accessibilityRole,
  debugName,
  presentationKind = "sheet",
  header,
  footer,
  overlay,
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
   * Names this sheet in a stacking violation. Diagnostics only, never rendered.
   * Worth setting on any sheet that shares a screen with others: without it the
   * report can only say "Dismiss", which is every sheet's backdrop label.
   */
  debugName?: string;
  /** Only required consent and app-lock gates may interrupt another task. */
  presentationKind?: "sheet" | "gate";
  /**
   * Rendered in the sheet's non-scrolling top region, which is also the drag
   * region. Put a sheet's title here rather than in `children` so the whole
   * header drags, not just the grabber.
   */
  header?: ReactNode;
  footer?: ReactNode;
  /**
   * Drawn over the whole sheet, backdrop included: a confirmation raised
   * from inside it. It cannot be a Modal of its own, because UIKit will not
   * present a second controller while this one is up.
   */
  overlay?: ReactNode;
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
  // Reports what this sheet is doing to the presentation tracker, which is the
  // only place that can see two sheets transitioning against each other. Keyed
  // on `visible` alone so it fires once per real transition, not per re-render.
  // The name is read through a ref so it stays out of the dependency list: a
  // sheet whose title changes while it is open (a confirmation reusing one slot
  // for two questions) would otherwise tear this down and re-run it, and report
  // itself as two sheets trading places.
  const presentationName = useRef(debugName ?? accessibilityLabel);
  presentationName.current = debugName ?? accessibilityLabel;
  useEffect(() => {
    if (!visible) return;
    const name = presentationName.current;
    return registerModalPresentation(presentationKind, name);
  }, [visible, presentationKind]);

  const handleDismiss = () => {
    if (dismissDisabled) return;
    onDismiss();
  };
  // A gate never shows the close button; a task sheet always does, and only
  // disables it while a request is in flight.
  const showsClose = presentationKind !== "gate";
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
            <Animated.View
              accessibilityRole={accessibilityRole}
              style={[styles.sheet, keyboardStyle, sheetStyle]}
            >
              <GestureDetector gesture={gesture}>
                <View style={styles.dragSurface}>
                  {/* The drag region. Deliberately tall and outside the ScrollView:
                  a touch starting here can never be claimed by the scrolling
                  body, so the sheet always drags — without the user having to
                  hit the 40x4 handle itself. */}
                  <View style={[styles.dragRegion, showsClose ? styles.dragRegionWithClose : null]}>
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
                </View>
              </GestureDetector>
              {/* The one *visible* way out. The drag, the outside tap and the
                Android back gesture all leave too, but a sheet holding unsaved
                input answers its own dismiss button with Discard, which resets
                rather than leaves — so without this there is no control on
                screen that closes it. Routed through `handleDismiss` like every
                other exit, so a guard still gets its say.

                A sibling of the pan detector, not a child: inside it, a thumb
                tap that slid past the pan's activation distance activated the
                drag, which cancelled the press, and the sheet wobbled instead
                of closing. Out here the pan cannot claim the touch at all.

                Kept mounted, disabled, while a task sheet is busy: a control
                that vanishes mid-request reads as the sheet having lost its
                exit. A gate is the exception, since it must not offer a way
                out it will then refuse. */}
              {showsClose ? (
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: dismissDisabled }}
                  android_ripple={
                    dismissDisabled
                      ? undefined
                      : { color: mobileColors.rippleNeutral, borderless: true }
                  }
                  disabled={dismissDisabled}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.closeButton,
                    dismissDisabled && styles.closeButtonDisabled,
                    pressed && !dismissDisabled && styles.closeButtonPressed,
                  ]}
                  onPress={handleDismiss}
                >
                  <Ionicons color={mobileColors.textPrimary} name="close" size={20} />
                </Pressable>
              ) : null}
            </Animated.View>
            {overlay}
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
    // The close button is absolutely positioned, so it adds no height of its
    // own: on a sheet whose header is a single-line title it ends 8pt below
    // that line, leaving the header's own `paddingBottom` as the only gap
    // before the body and the button crowding whatever came next. This floors
    // the region at the button's full extent plus real breathing room. A taller
    // header (a subtitle, a wrapped title) already clears it and is unaffected.
    dragRegionWithClose: {
      minHeight: CLOSE_BUTTON_TOP + CLOSE_BUTTON_SIZE + mobileSpace.lg,
    },
    // Absolute so it can't push the title off-centre or add height to the drag
    // region, and so a header that wraps to two lines keeps it pinned to the
    // first line rather than drifting to the middle of the block.
    closeButton: {
      // The same outlined chrome as the schedule header's week chevrons and
      // alerts bell, shared so the two cannot drift.
      ...createIconControlStyle(mobileColors, isDark),
      position: "absolute",
      // Centred on the title's first line. The grabber area is exactly
      // `SHEET_CONTENT_TOP_PADDING` tall and the header adds no padding of its
      // own, so that is where the title starts; the rest centres this button's
      // box on that line box rather than on the header as a whole.
      top: CLOSE_BUTTON_TOP,
      // Matches the header's own `paddingHorizontal`, so the gap to the right
      // edge is the gap the title keeps from the left.
      right: mobileSpace.xl,
      zIndex: 1,
    },
    closeButtonPressed: {
      transform: [{ scale: mobileMotion.press.iconOnlyScale }],
    },
    closeButtonDisabled: {
      opacity: 0.4,
    },
    // The pan detector needs one native view to attach to; this is that view,
    // holding the drag region and body while the close button sits beside it.
    dragSurface: {
      flexShrink: 1,
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
      paddingHorizontal: mobileSpace.xl,
      paddingBottom: bottomPadding,
      gap: mobileSpace.lg,
    },
    bodyWithFooter: {
      paddingBottom: mobileSpace.lg,
    },
    footer: {
      // Keep supporting errors and the action group at the full sheet width.
      gap: mobileSpace.md,
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingHorizontal: mobileSpace.xl,
      // The same step as the gap between the footer's own rows, so the divider
      // sits as far from the first button as the buttons sit from each other.
      paddingTop: mobileSpace.md,
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
      <AppText fit="fixed" variant="screenTitle">
        {title}
      </AppText>
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

/** Shared action layout for a sheet footer. */
export function SheetActions({
  children,
  primaryAction,
}: {
  children?: ReactNode;
  primaryAction?: ReactNode;
}) {
  return <ActionButtons primaryAction={primaryAction}>{children}</ActionButtons>;
}

const createCopyStyles = (_mobileColors: MobileColors) =>
  StyleSheet.create({
    copy: {
      gap: mobileSpace.sm,
    },
    link: {
      marginTop: mobileSpace.xs,
    },
  });
