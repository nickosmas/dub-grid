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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileElevation,
  mobileRadii,
  mobileSpace,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../theme/tokens";

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
    padding: mobileSpace.xl,
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
  scrollViewRef?: RefObject<ScreenScrollHandle | null>;
  refreshing?: boolean;
  onRefresh?: () => void;
  onScroll?: ScreenScrollViewProps["onScroll"];
  scrollEventThrottle?: number;
  /**
   * Set false on a screen whose only input sits at the *top* — a search field
   * above a list. Keyboard insetting exists to lift fields off the keyboard,
   * and a field at the top never needed lifting, so all it does there is cost:
   * see the note on `automaticallyAdjustKeyboardInsets` below.
   */
  adjustsForKeyboard?: boolean;
  bottomPaddingMode?: ScreenBottomPaddingMode;
  /**
   * Set false for content that is never taller than the screen and must
   * never scroll — a full-page error or empty state. Swaps the `ScrollView`
   * for a plain `flex: 1` `View`, so a `fillScreen` `StatusBanner` or
   * `EmptyStateCard` inside it can center with a bare `flex: 1,
   * justifyContent: "center"` and land exactly right, no viewport-height
   * measuring required. `stickyHeader` still renders (in normal flow, not
   * floating) so a screen that shows one above its data — a calendar strip,
   * a search bar — keeps it above the error/empty state too. `onRefresh`,
   * `onScroll`, and `scrollViewRef` do nothing in this mode — pull-to-refresh
   * needs a real scroll gesture to hang off of, and a page that never
   * scrolls has no scroll position to track or restore.
   */
  scrollEnabled?: boolean;
}>) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const insets = useSafeAreaInsets();
  const resolvedBottomPadding = getScreenBottomPadding(bottomPaddingMode, insets.bottom);
  const internalScrollViewRef = useRef<ScrollView>(null);
  // Mirrors stickyHeaderHeight so the translating scroll handle below can
  // always read the *current* height at call time, not whatever it was
  // when the handle was created.
  const stickyHeaderHeightRef = useRef(0);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const overlay = renderOverlay?.({ stickyHeaderHeight });
  const useNativeContentInsets = !stickyHeader;
  const shouldExposeNativeScrollRoot = !stickyHeader && !renderOverlay;
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
  const scrollView = (
    <ScrollView
      ref={internalScrollViewRef}
      automaticallyAdjustContentInsets={useNativeContentInsets}
      // iOS does not inset a ScrollView for the software keyboard on its own,
      // so form fields and submit buttons near the bottom of a screen sat
      // behind it. Android resizes the window instead (`adjustResize`), where
      // this prop is ignored.
      //
      // It is opt-out because it is not free on a `headerLargeTitle` screen:
      // the inset (and the offset RN writes alongside it) makes UIKit
      // re-evaluate the large title, which collapses, and the whole page
      // visibly jumps the instant the keyboard opens. UIScrollView does no
      // first-responder scrolling of its own, so a screen that turns this off
      // simply does not move on focus.
      automaticallyAdjustKeyboardInsets={adjustsForKeyboard}
      automaticallyAdjustsScrollIndicatorInsets={useNativeContentInsets}
      contentContainerStyle={{
        paddingTop: stickyHeader ? (isIosStickyHeader ? 0 : stickyHeaderHeight) : 0,
        paddingBottom: resolvedBottomPadding,
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
    </ScrollView>
  );
  const overlayLayer = (
    <View pointerEvents="box-none" style={styles.overlayLayer}>
      {overlay}
    </View>
  );

  if (!scrollEnabled) {
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
            styles.contentDefault,
            styles.nonScrollContent,
            { paddingBottom: resolvedBottomPadding },
          ]}
        >
          {children}
        </View>
      </View>
    );
  }

  if (shouldExposeNativeScrollRoot) {
    return scrollView;
  }

  return (
    <View style={styles.root}>
      {stickyHeader ? (
        <View
          style={[
            styles.stickyHeaderShell,
            stickyHeaderShellStyle,
            { paddingTop: resolvedStickyHeaderTopPadding },
          ]}
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
          {stickyHeader}
        </View>
      ) : null}
      {scrollView}
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
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {headerAccessory ? <View style={styles.cardHeaderAccessory}>{headerAccessory}</View> : null}
      </View>
      <View style={styles.card}>
        {body ? <Text style={styles.cardBody}>{body}</Text> : null}
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
    stickyHeaderShell: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
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
      borderBottomWidth: 1,
      borderBottomColor: mobileColors.borderSubtle,
      // The level named for exactly this ("hairline lift: sticky headers once
      // the content scrolls under them"). The fill and the hairline do the
      // separating; the shadow only keeps the bar from looking pasted on.
      ...mobileElevation("raised", isDark),
      // ...but not its `elevation: 1`. On Android that number is also the draw
      // order, and the cards scrolling underneath sit at the `card` level's 2 —
      // at 1 the header would render *behind* them. This shell is an earlier
      // sibling than the scroll view, so it loses ties too, and has to clear
      // both outright.
      elevation: 4,
    },
    nonScrollStickyHeaderShell: {
      // Overrides `stickyHeaderShell`'s absolute positioning: nothing scrolls
      // under it in this mode, so it sits in normal flow instead of floating.
      position: "relative",
    },
    overlayLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      elevation: 20,
    },
    cardGroup: {
      gap: mobileSpace.md,
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
    cardTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    cardBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
  });
