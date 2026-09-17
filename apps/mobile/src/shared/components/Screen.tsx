import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MutableRefObject,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
} from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Platform,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNativeTabBarPresence } from "../navigation/NativeTabBarPresence";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileElevation,
  mobileRadii,
  mobileSpace,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../theme/tokens";

/**
 * Breathing room left between a focused field and the top of the keyboard.
 */
const KEYBOARD_BOTTOM_OFFSET = 24;

/** Card header icon frame. Also the min height of the title and accessory
 * columns beside it, so a one-line title centres against the icon. */
export const CARD_ICON_FRAME_SIZE = 32;

/**
 * The card surface itself — fill, radius, padding, edge and shadow.
 *
 * Lives outside `createStyles` because the skeleton that stands in for a card
 * has to be the *same* surface, not a copy of its numbers. A copy drifts the
 * first time a padding changes and the placeholder silently stops matching
 * what replaces it.
 */
export function getCardSurfaceStyle(mobileColors: MobileColors, isDark: boolean): ViewStyle {
  return {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    // 16, not the 20 the page gutter uses: text inside a card already sits a
    // gutter in from the screen edge, and 40pt of combined inset on the iOS
    // gutter pushed every row's text past where a grouped list would start.
    padding: mobileSpace.lg,
    gap: mobileSpace.md,
    // Light mode carries depth with the shadow alone; a border on top of it
    // reads as an outline sticker. Dark mode keeps the hairline, because a
    // shadow against a near-black page is invisible and the edge is the only
    // thing separating the card from the page.
    borderWidth: isDark ? 1 : 0,
    borderColor: mobileColors.borderSubtle,
    ...mobileElevation("card", isDark),
  };
}

/** Still used by callers with their own icon-bearing tiles (e.g. the dashboard hero card's metric tiles). */
export type CardIconTone = "brand" | "warning" | "danger" | "success";
import {
  DEFAULT_SCREEN_BOTTOM_PADDING_MODE,
  getFooterBottomPadding,
  getScreenBottomPadding,
  getScreenGutter,
  type ScreenBottomPaddingMode,
} from "./screen-layout";

export type ScreenScrollHandle = ScrollView;
export type { ScreenBottomPaddingMode } from "./screen-layout";
type ScreenScrollViewProps = ComponentProps<typeof ScrollView>;

export function Screen({
  stickyHeader,
  stickyHeaderShellStyle,
  stickyHeaderTopPadding,
  renderOverlay,
  footer,
  scrollViewRef,
  children,
  refreshing = false,
  onRefresh,
  onScroll,
  scrollEventThrottle,
  adjustsForKeyboard = true,
  bottomPaddingMode = DEFAULT_SCREEN_BOTTOM_PADDING_MODE,
  scrollEnabled = true,
}: PropsWithChildren<{
  // No `title`/`subtitle` here on purpose. A page's title is the native header's
  // (`createTopLevelStackOptions` / `createDetailStackOptions` on its route), or
  // it belongs to a `stickyHeader` the screen builds itself. These props used to
  // exist and were silently discarded, so a screen could pass `title="People"`,
  // render nothing, and give no hint about where the real title comes from.
  stickyHeader?: ReactNode;
  stickyHeaderShellStyle?: StyleProp<ViewStyle>;
  stickyHeaderTopPadding?: number;
  renderOverlay?: (options: { stickyHeaderHeight: number }) => ReactNode;
  /**
   * A non-scrolling region pinned below the content, in normal flow rather
   * than absolutely positioned — mirrors `BottomSheetModal`'s `footer`. Put a
   * full-page form's primary action row here instead of as the last scrolled
   * child, so Save/Cancel never requires scrolling to reach.
   */
  footer?: ReactNode;
  scrollViewRef?: RefObject<ScreenScrollHandle | null>;
  refreshing?: boolean;
  onRefresh?: () => void;
  onScroll?: ScreenScrollViewProps["onScroll"];
  scrollEventThrottle?: number;
  /**
   * Set false on a screen whose only input sits at the *top* — a search field
   * above a list. Keyboard insetting exists to lift fields off the keyboard,
   * and a field at the top never needed lifting, so all it does there is cost:
   * see the note on the scroll view's `enabled` below.
   */
  adjustsForKeyboard?: boolean;
  bottomPaddingMode?: ScreenBottomPaddingMode;
  /**
   * Set false for a **skeleton**, and essentially nothing else.
   *
   * A placeholder standing in for content should not scroll, and there is
   * nothing to pull-to-refresh while the thing is still loading. Full-page
   * error and empty states deliberately do *not* use this: they keep the
   * scroll view, because `contentContainerStyle`'s `flexGrow: 1` already gives
   * a `fillScreen` child real space to claim, and leaving scroll mode costs an
   * iOS `headerLargeTitle` the ability to collapse (it sits permanently
   * expanded, pushing the page down) as well as pull-to-refresh itself.
   *
   * Swaps the `ScrollView` for a plain `flex: 1` `View`. `stickyHeader` still
   * renders, in normal flow rather than floating. `onRefresh`, `onScroll` and
   * `scrollViewRef` all do nothing here, and content taller than the viewport
   * is clipped rather than reachable — which is the intended trade for a
   * skeleton and the wrong one for anything else.
   */
  scrollEnabled?: boolean;
}>) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const insets = useSafeAreaInsets();
  const nativeTabBarVisible = useNativeTabBarPresence();
  const resolvedBottomPadding = getScreenBottomPadding(bottomPaddingMode, insets.bottom);
  const resolvedFooterBottomPadding = getFooterBottomPadding(
    bottomPaddingMode,
    insets.bottom,
    nativeTabBarVisible,
  );
  const internalScrollViewRef = useRef<ScrollView>(null);
  // Mirrors stickyHeaderHeight so the translating scroll handle below can
  // always read the *current* height at call time, not whatever it was
  // when the handle was created.
  const stickyHeaderHeightRef = useRef(0);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const overlay = renderOverlay?.({ stickyHeaderHeight });
  const useNativeContentInsets = !stickyHeader;
  const shouldExposeNativeScrollRoot = !stickyHeader && !renderOverlay && !footer;
  // iOS's native large-title collapse only tracks a scroll view that is a
  // shallow child of the screen, not one nested inside an extra wrapping
  // `View`. A footer alone doesn't need that wrapper — `styles.root`'s only
  // job is stacking children in a flex column, which the screen's own native
  // container already does — so it renders as a sibling of the scroll view
  // instead, keeping the scroll view shallow and the title collapsing.
  const shouldRenderFooterAsSibling = !stickyHeader && !renderOverlay && Boolean(footer);
  // A sticky header only exists on a route that hides the native header (the
  // dashboard and the schedule), so nothing above it clears the status bar on
  // its behalf: the shell pads itself by the safe-area inset whether it floats
  // over the scroll view or sits in normal flow above a skeleton. The two
  // branches used to disagree, with the non-scrolling one padding by 8pt on the
  // assumption that it was "already below the system bars", and every skeleton
  // drew under the Dynamic Island and then jumped down when its content landed.
  const resolvedStickyHeaderTopPadding = stickyHeaderTopPadding ?? Math.max(insets.top, 8);
  // Android's RefreshControl has progressViewOffset to push the pull-to-
  // refresh spinner below the floating sticky header; iOS has no such prop.
  // A JS-level paddingTop doesn't move the ScrollView's own frame origin
  // (what the native pull reveal is anchored to), so without this the
  // spinner renders directly behind the header instead of below it. Using a
  // native contentInset/contentOffset moves that origin for real.
  const isIosStickyHeader = Platform.OS === "ios" && Boolean(stickyHeader);
  const iosContentInset = useMemo(
    () =>
      isIosStickyHeader ? { top: stickyHeaderHeight, left: 0, bottom: 0, right: 0 } : undefined,
    [isIosStickyHeader, stickyHeaderHeight],
  );
  const iosContentOffset = useMemo(
    () => (isIosStickyHeader ? { x: 0, y: -stickyHeaderHeight } : undefined),
    [isIosStickyHeader, stickyHeaderHeight],
  );
  // `scrollViewRef` hands callers a *logical* content coordinate space —
  // y: 0 always means "the true top of my content" — rather than the raw
  // native ScrollView's contentOffset space. On iOS the floating sticky
  // header is implemented via contentInset (not padding), so native y: 0
  // actually sits behind the header, not below it; on Android the header's
  // height is already baked into contentContainerStyle's paddingTop, so
  // native y: 0 is already correct there. Without this translation, any
  // caller scrolling "to the top" (e.g. ScheduleScreen resetting scroll
  // position when the visible date range changes) would land content under
  // the header on iOS specifically.
  const scrollHandle = useMemo<ScreenScrollHandle>(
    () =>
      ({
        scrollTo: (options?: { x?: number; y?: number; animated?: boolean } | number) => {
          const target = typeof options === "number" ? { y: options } : (options ?? {});
          const y =
            isIosStickyHeader && typeof target.y === "number"
              ? target.y - stickyHeaderHeightRef.current
              : target.y;
          internalScrollViewRef.current?.scrollTo({ ...target, y });
        },
      }) as unknown as ScreenScrollHandle,
    [isIosStickyHeader],
  );
  useEffect(() => {
    if (scrollViewRef) {
      (scrollViewRef as MutableRefObject<ScreenScrollHandle | null>).current = scrollHandle;
    }
  }, [scrollViewRef, scrollHandle]);
  // `KeyboardAwareScrollView` wraps a real `ScrollView` and forwards every prop
  // below, ref included, so this is the same scroll view it always was plus
  // keyboard tracking. `enabled` turns that tracking off in place rather than
  // swapping in a plain `ScrollView`, which would remount the list — and its
  // scroll position with it — if the flag ever changed.
  //
  // This replaces `automaticallyAdjustKeyboardInsets`, which is iOS-only: on
  // Android nothing but the manifest's `adjustResize` ever moved a form field
  // off the keyboard, so a field low on a long screen simply sat behind it.
  //
  // It stays opt-out for the same reason that prop was. On a `headerLargeTitle`
  // screen, insetting for the keyboard makes UIKit re-evaluate the large title,
  // which collapses, and the whole page visibly jumps the instant the keyboard
  // opens. A screen whose only field is a search bar at the top never needed
  // lifting, so it turns this off and simply does not move on focus.
  const scrollView = (
    <KeyboardAwareScrollView
      ref={internalScrollViewRef}
      enabled={adjustsForKeyboard}
      // Breathing room between the focused field and the keyboard, so a field
      // scrolled into view isn't flush against its top edge.
      bottomOffset={KEYBOARD_BOTTOM_OFFSET}
      automaticallyAdjustContentInsets={useNativeContentInsets}
      automaticallyAdjustsScrollIndicatorInsets={useNativeContentInsets}
      contentContainerStyle={{
        paddingTop: stickyHeader ? (isIosStickyHeader ? 0 : stickyHeaderHeight) : 0,
        // A footer takes over clearing whatever floats at the bottom (the
        // floating tab bar, in `tabbed` mode) — content just needs a small
        // gap above the footer's divider, not the full clearance any more.
        paddingBottom: footer ? mobileSpace.lg : resolvedBottomPadding,
        // Makes the content container at least as tall as the viewport, so a
        // `flex: 1` child (a `fillScreen` empty or error state) has real space
        // to claim instead of collapsing to its own content height.
        //
        // Without this, centring a full-page state only worked by swapping the
        // whole ScrollView out for a plain View — which cost two things that
        // matter more than the swap saved: an iOS `headerLargeTitle` has
        // nothing left to collapse against, so it sits permanently expanded and
        // pushes the page down, and pull-to-refresh needs a scroll gesture to
        // hang off, so it vanished on exactly the screens most likely to want
        // a retry.
        flexGrow: 1,
      }}
      contentInset={iosContentInset}
      contentOffset={iosContentOffset}
      contentInsetAdjustmentBehavior={useNativeContentInsets ? "automatic" : "never"}
      // UIKit will otherwise let a mostly-vertical drag briefly rubber-band on
      // the horizontal axis. That exposes the navigation controller behind the
      // page as a white corner at the top-right of a light screen.
      alwaysBounceHorizontal={false}
      directionalLockEnabled={Platform.OS === "ios"}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={stickyHeader ? stickyHeaderHeight : 0}
            tintColor={mobileColors.brand}
            colors={[mobileColors.brand]}
          />
        ) : undefined
      }
      scrollEventThrottle={scrollEventThrottle}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
    >
      <View
        style={[
          styles.content,
          stickyHeader ? styles.contentWithStickyHeader : styles.contentDefault,
        ]}
      >
        {children}
      </View>
    </KeyboardAwareScrollView>
  );
  const overlayLayer = (
    <View pointerEvents="box-none" style={styles.overlayLayer}>
      {overlay}
    </View>
  );
  // The full clearance moves here from content once a footer is present —
  // this is a plain flex-column sibling of the `flex: 1` scroll view/content,
  // no absolute positioning needed, so it's pinned to the bottom for free.
  const footerBar = footer ? (
    <View style={[styles.footer, { paddingBottom: resolvedFooterBottomPadding }]}>{footer}</View>
  ) : null;

  if (!scrollEnabled) {
    // Without a sticky header this branch assumes a native header above it, and
    // every caller today has one. A headerless skeleton screen of its own would
    // need a sticky header, or `stickyHeaderTopPadding`, to clear the status bar.
    return (
      <View style={styles.root}>
        {stickyHeader ? (
          // Nothing scrolls under it here, so it needs none of the floating
          // shell's `position: absolute` and scroll-under chrome — just the
          // same fill, padding and hairline, in normal flow above the content.
          <View
            style={[
              styles.stickyHeaderShell,
              styles.nonScrollStickyHeaderShell,
              stickyHeaderShellStyle,
              { paddingTop: resolvedStickyHeaderTopPadding },
            ]}
          >
            {stickyHeader}
          </View>
        ) : null}
        <View
          style={[
            styles.content,
            // Same rule as the scrolling branch: content under a sticky header
            // is held off it by one section gap. Hardcoding `contentDefault`
            // here gave a skeleton no top padding at all, so it sat flush
            // against the header where the real content it stands in for is
            // inset — the placeholder has to occupy the same space, or the page
            // visibly shifts the moment it resolves.
            stickyHeader ? styles.contentWithStickyHeader : styles.contentDefault,
            styles.nonScrollContent,
            { paddingBottom: footer ? mobileSpace.lg : resolvedBottomPadding },
          ]}
        >
          {children}
        </View>
        {footerBar}
      </View>
    );
  }

  if (shouldExposeNativeScrollRoot) {
    return scrollView;
  }

  if (shouldRenderFooterAsSibling) {
    return (
      <>
        {scrollView}
        {footerBar}
      </>
    );
  }

  return (
    <View style={styles.root}>
      {stickyHeader ? (
        // The shadow lives on this outer wrapper, not the clipped shell
        // below: `overflow: "hidden"` on the same view as a shadow clips the
        // shadow itself on iOS (`clipsToBounds` cuts anything drawn outside
        // the view's own bounds, which is exactly where a shadow is drawn).
        // Android's `elevation` isn't affected the same way, which is why
        // this was invisible on iOS but fine on Android before the split.
        <View
          style={styles.stickyHeaderShadow}
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height;

            if (nextHeight !== stickyHeaderHeight) {
              // The header's height is unknown (0) until this very first
              // measurement lands. If a caller scrolled "to the top" via
              // scrollViewRef before this fires (e.g. on a warm cache, where
              // data — and so that scroll — can resolve in the same tick as
              // mount, ahead of this native layout callback), the translation
              // above had nothing to subtract yet and was a no-op, leaving
              // content sitting under the header with no visible correction.
              // Self-correct once, right here, the moment the real height is
              // known, regardless of what any caller already tried.
              if (isIosStickyHeader && stickyHeaderHeight === 0) {
                internalScrollViewRef.current?.scrollTo({ x: 0, y: -nextHeight, animated: false });
              }
              stickyHeaderHeightRef.current = nextHeight;
              setStickyHeaderHeight(nextHeight);
            }
          }}
        >
          <View
            style={[
              styles.stickyHeaderShell,
              stickyHeaderShellStyle,
              { paddingTop: resolvedStickyHeaderTopPadding },
            ]}
          >
            {stickyHeader}
          </View>
        </View>
      ) : null}
      {scrollView}
      {footerBar}
      {overlay == null ? null : overlayLayer}
    </View>
  );
}

export function Card({
  title,
  body,
  detail,
  headerAccessory,
}: {
  title: string;
  body?: string;
  detail?: ReactNode;
  headerAccessory?: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.cardGroup}>
      {/* The header sits on the page background, above the white surface —
          a section heading over its content rather than inside it. */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderCopy}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.cardTitle}>
            {title}
          </Text>
        </View>
        {headerAccessory ? <View style={styles.cardHeaderAccessory}>{headerAccessory}</View> : null}
      </View>
      <View style={styles.card}>
        {body ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.cardBody}>
            {body}
          </Text>
        ) : null}
        {detail}
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    scrollView: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    content: {
      paddingHorizontal: getScreenGutter(),
      gap: mobileSpacing.sectionGap,
    },
    contentDefault: {
      paddingTop: 0,
    },
    contentWithStickyHeader: {
      paddingTop: mobileSpacing.sectionGap,
    },
    nonScrollContent: {
      flex: 1,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.background,
      paddingHorizontal: getScreenGutter(),
      paddingTop: mobileSpace.md,
    },
    // Carries only the shadow, positioning, and stacking — see the JSX for
    // why this can't share a view with `stickyHeaderShell`'s `overflow:
    // "hidden"` on iOS.
    stickyHeaderShadow: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      ...mobileElevation("header", isDark),
    },
    stickyHeaderShell: {
      // The fill has to stay opaque: content scrolls under this shell and must
      // not show through. `overflow: hidden` clips whatever the header draws to
      // the shell's own bounds.
      overflow: "hidden",
      // Match native-stack headers and the page ground. This shell is visible
      // behind an interactive back swipe from a child route; using `surface`
      // here made that strip flash white while the destination was revealed.
      backgroundColor: mobileColors.background,
      paddingHorizontal: getScreenGutter(),
      paddingTop: mobileSpace.sm,
      paddingBottom: mobileSpace.lg,
      // No divider. The bar separates from the content scrolling under it by
      // shadow alone (`stickyHeaderShadow`, above), which is what the `header`
      // level exists for, and why it is heavier than the `raised` lift it
      // replaced, which only ever had to stop a bordered bar looking pasted
      // on. Its `elevation` also clears the `card`-level tiles beneath it on
      // Android, where that number doubles as draw order and this shell is
      // the earlier sibling, so it loses ties. The floating case gets its
      // shadow from the `stickyHeaderShadow` wrapper instead; putting it here
      // too would just be clipped by this view's own `overflow: "hidden"`.
    },
    nonScrollStickyHeaderShell: {
      // Nothing scrolls under this variant, so it sits in normal flow
      // instead of floating and carries its own (harmless, since nothing
      // passes beneath it) shadow directly rather than needing the floating
      // case's separate unclipped wrapper.
      position: "relative",
      ...mobileElevation("header", isDark),
    },
    overlayLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      elevation: 20,
    },
    cardGroup: {
      gap: mobileSpace.sm,
    },
    card: getCardSurfaceStyle(mobileColors, isDark),
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: mobileSpace.md,
    },
    cardHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    cardHeaderAccessory: {
      justifyContent: "center",
    },
    // `title`, one step under the screen's own heading: at `screenTitle` a
    // dashboard of six cards read as six page titles down one scroll.
    cardTitle: {
      ...mobileText.title,
      color: mobileColors.textPrimary,
    },
    cardBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
  });
