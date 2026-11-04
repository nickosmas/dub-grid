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
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Text } from "./Text";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller";
import { Pressable } from "./Pressable";
import { SectionHeading } from "./SectionHeading";
import { SafeAreaListener, useSafeAreaInsets } from "react-native-safe-area-context";
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

/**
 * A virtualized body. With `list` set, the screen renders a `FlatList` in
 * place of its scroll view: `children` become the list header (search,
 * filters, counts), each `data` item mounts only while it is near the
 * viewport, and `footer`-style trailing content goes in `listFooter`. Sticky
 * header, pull-to-refresh, bottom padding and the scroll handle all behave as
 * they do for the plain scroll view. There is no keyboard tracking in this
 * mode; a list screen's only field is its search bar at the top.
 */
export interface ScreenList<T> {
  data: ReadonlyArray<T>;
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T, index: number) => string;
  /** Rendered after the last item (a Load more button, say). */
  listFooter?: ReactNode;
  /** Rendered between items; the list itself adds no divider. */
  itemSeparator?: ReactNode;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  /**
   * Space between the header and the first row. Defaults to the page's
   * section gap; a screen whose header ends in a row of its own (a count and
   * an action) reads better with the compact `mobileSpace.md`.
   */
  headerGap?: number;
}

export function Screen<T = never>({
  stickyHeader,
  stickyHeaderShellStyle,
  stickyHeaderTopPadding,
  stickyHeaderBackground,
  pageBackground,
  renderOverlay,
  footer,
  scrollViewRef,
  children,
  refreshing = false,
  onRefresh,
  onScroll,
  onScrollBeginDrag,
  scrollEventThrottle,
  adjustsForKeyboard = true,
  bottomPaddingMode = DEFAULT_SCREEN_BOTTOM_PADDING_MODE,
  scrollEnabled = true,
  list,
}: PropsWithChildren<{
  list?: ScreenList<T>;
  // No `title`/`subtitle` here on purpose. A page's title is the native header's
  // (`createTopLevelStackOptions` / `createDetailStackOptions` on its route), or
  // it belongs to a `stickyHeader` the screen builds itself. These props used to
  // exist and were silently discarded, so a screen could pass `title="People"`,
  // render nothing, and give no hint about where the real title comes from.
  stickyHeader?: ReactNode;
  stickyHeaderShellStyle?: StyleProp<ViewStyle>;
  stickyHeaderTopPadding?: number;
  /**
   * Painted inside the sticky header's clipped shell, behind its content.
   * Pair it with `pageBackground`: render the same wash at the same height
   * and the header paints exactly the slice of it behind the header.
   */
  stickyHeaderBackground?: ReactNode;
  /**
   * A layer fixed behind everything, status bar to bottom edge: the scroll
   * view and the sticky header shell both go transparent over it. For a page
   * whose ground carries meaning (the dashboard's status wash).
   */
  pageBackground?: ReactNode;
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
  onScrollBeginDrag?: ScreenScrollViewProps["onScrollBeginDrag"];
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
   * error and empty states deliberately do *not* use this: `contentContainerStyle`'s
   * `flexGrow: 1` already gives a `fillScreen` child real space to claim.
   *
   * The `ScrollView` and everything inside it stay mounted either way. It
   * used to be swapped for a plain `View`, and on iOS that cost every screen
   * whose data arrived after it appeared its large title: UIKit binds the
   * title's collapse to the scroll view present when the screen appears, and
   * one mounted later is never tracked, so the title sat expanded for the
   * life of the screen (Alerts, every time). The pull-to-refresh control used
   * to come and go with this flag, which remounted the page's children each
   * time loading toggled (see `refreshControl` below). Now only scrolling,
   * bouncing and the pull switch off; the sticky header sits exactly as it
   * does once loaded, so nothing shifts when the content resolves.
   */
  scrollEnabled?: boolean;
}>) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const hasPageBackground = pageBackground != null;
  const styles = useMemo(
    () => createStyles(mobileColors, isDark, hasPageBackground),
    [mobileColors, isDark, hasPageBackground],
  );
  const insets = useSafeAreaInsets();
  const nativeTabBarVisible = useNativeTabBarPresence();
  const resolvedBottomPadding = getScreenBottomPadding(bottomPaddingMode, insets.bottom);
  const resolvedFooterBottomPadding = getFooterBottomPadding(
    bottomPaddingMode,
    insets.bottom,
    nativeTabBarVisible,
  );
  const internalScrollViewRef = useRef<KeyboardAwareScrollViewRef>(null);
  const internalListRef = useRef<FlatList<T>>(null);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const usesIosNativeInsets = Platform.OS === "ios" && !stickyHeader;
  // The height left between the native header and tab bar. Content only fills
  // that much, so a page that fits springs back when dragged, as a short page
  // does in any iOS app. Filling the whole scroll view left the header and tab
  // bar insets UIKit adds on top as room to scroll, and the page stayed where
  // it was let go. The header's tallest height is the one that counts: the
  // safe area shrinks as a large title folds away.
  const [visibleHeight, setVisibleHeight] = useState<number | null>(null);
  const tallestHeaderRef = useRef(0);
  const insetListener = usesIosNativeInsets ? (
    <SafeAreaListener
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onChange={({ insets: viewInsets, frame }) => {
        tallestHeaderRef.current = Math.max(tallestHeaderRef.current, viewInsets.top);
        const next = Math.max(frame.height - tallestHeaderRef.current - viewInsets.bottom, 0);
        setVisibleHeight((current) => (current === next ? current : next));
      }}
    />
  ) : null;
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
  // its behalf: the shell pads itself by the safe-area inset.
  const resolvedStickyHeaderTopPadding = stickyHeaderTopPadding ?? Math.max(insets.top, 8);
  const scrollHandle = useMemo<ScreenScrollHandle>(
    () =>
      ({
        scrollTo: (options?: { x?: number; y?: number; animated?: boolean } | number) => {
          const target = typeof options === "number" ? { y: options } : (options ?? {});
          if (internalListRef.current) {
            internalListRef.current.scrollToOffset({
              offset: target.y ?? 0,
              animated: target.animated ?? true,
            });
            return;
          }
          internalScrollViewRef.current?.scrollTo(target);
        },
      }) as unknown as ScreenScrollHandle,
    [],
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
  const contentContainerStyle = {
    paddingBottom: footer ? mobileSpace.lg : resolvedBottomPadding,
    ...(usesIosNativeInsets && visibleHeight !== null
      ? { minHeight: visibleHeight }
      : { flexGrow: 1 }),
  };
  // Mounted for the life of the screen once it can refresh, never only while
  // `scrollEnabled`: on iOS the control is the scroll view's first child, so
  // adding or removing it remounts the whole page under it (a sheet presented
  // from that page was torn down and presented again). The lock on the scroll
  // view stops the pull on iOS; Android's swipe layout needs `enabled`.
  const refreshControl = onRefresh ? (
    <RefreshControl
      enabled={scrollEnabled}
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={mobileColors.brand}
      colors={[mobileColors.brand]}
    />
  ) : undefined;
  const contentStyle = [
    styles.content,
    stickyHeader ? styles.contentWithStickyHeader : styles.contentDefault,
  ];
  const scrollView = list ? (
    <FlatList
      ref={internalListRef}
      data={list.data as T[]}
      renderItem={({ item, index }) => <>{list.renderItem(item, index)}</>}
      keyExtractor={list.keyExtractor}
      ListHeaderComponent={<View style={contentStyle}>{children}</View>}
      // With rows, the first one sits one section gap below the header, the
      // distance the page content keeps between its own sections. Without
      // rows the header is the whole page, and a `fillScreen` empty or error
      // state inside it needs the same room to centre in that the plain scroll
      // view's content gets from `flexGrow: 1`.
      ListHeaderComponentStyle={
        list.data.length === 0
          ? styles.emptyListHeader
          : { paddingBottom: list.headerGap ?? mobileSpacing.sectionGap }
      }
      ListFooterComponent={list.listFooter == null ? null : <>{list.listFooter}</>}
      ItemSeparatorComponent={list.itemSeparator == null ? null : () => <>{list.itemSeparator}</>}
      onEndReached={list.onEndReached}
      onEndReachedThreshold={list.onEndReachedThreshold ?? 0.5}
      automaticallyAdjustContentInsets={useNativeContentInsets}
      automaticallyAdjustsScrollIndicatorInsets={useNativeContentInsets}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior={useNativeContentInsets ? "automatic" : "never"}
      scrollEnabled={scrollEnabled}
      bounces={scrollEnabled}
      alwaysBounceHorizontal={false}
      directionalLockEnabled={Platform.OS === "ios"}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      refreshControl={refreshControl}
      scrollEventThrottle={scrollEventThrottle}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
    />
  ) : (
    <KeyboardAwareScrollView
      ref={internalScrollViewRef}
      enabled={adjustsForKeyboard}
      // Breathing room between the focused field and the keyboard, so a field
      // scrolled into view isn't flush against its top edge.
      bottomOffset={KEYBOARD_BOTTOM_OFFSET}
      automaticallyAdjustContentInsets={useNativeContentInsets}
      automaticallyAdjustsScrollIndicatorInsets={useNativeContentInsets}
      // paddingBottom: a footer takes over clearing whatever floats at the
      // bottom (the floating tab bar, in `tabbed` mode), so content just
      // needs a small gap above the footer's divider. flexGrow makes the
      // container at least viewport-tall, so a `flex: 1` child (a `fillScreen`
      // empty or error state) has real space to claim; without it, centring a
      // full-page state only worked by swapping the ScrollView for a View,
      // which lost the iOS large-title collapse and pull-to-refresh.
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior={useNativeContentInsets ? "automatic" : "never"}
      scrollEnabled={scrollEnabled}
      bounces={scrollEnabled}
      // UIKit will otherwise let a mostly-vertical drag briefly rubber-band on
      // the horizontal axis. That exposes the navigation controller behind the
      // page as a white corner at the top-right of a light screen.
      alwaysBounceHorizontal={false}
      directionalLockEnabled={Platform.OS === "ios"}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      // Mounted for the life of the screen once it can refresh, never only
      // while `scrollEnabled`. On iOS the control is the scroll view's first
      // child, so adding or removing it moves the content container to a
      // different child slot and React remounts the whole page under it: a
      // sheet presented from that page was torn down and presented again
      // (UIKit refused the second present when the first was still leaving,
      // which read as a dead button). The lock on the scroll view already
      // stops the pull on iOS; Android's swipe layout owns the gesture and
      // needs `enabled` to stand down.
      refreshControl={refreshControl}
      scrollEventThrottle={scrollEventThrottle}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
    >
      <View style={contentStyle}>{children}</View>
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

  if (shouldExposeNativeScrollRoot) {
    return (
      <>
        {scrollView}
        {insetListener}
      </>
    );
  }

  if (shouldRenderFooterAsSibling) {
    return (
      <>
        {scrollView}
        {insetListener}
        {footerBar}
      </>
    );
  }

  return (
    <View style={styles.root}>
      {pageBackground}
      {stickyHeader ? (
        // The shadow lives on this outer wrapper, not the clipped shell
        // below: `overflow: "hidden"` on the same view as a shadow clips the
        // shadow itself on iOS (`clipsToBounds` cuts anything drawn outside
        // the view's own bounds, which is exactly where a shadow is drawn).
        // Android's `elevation` isn't affected the same way, which is why
        // this was invisible on iOS but fine on Android before the split.
        <View
          style={styles.stickyHeaderShadow}
          onLayout={(event) => setStickyHeaderHeight(event.nativeEvent.layout.height)}
        >
          <View
            style={[
              styles.stickyHeaderShell,
              stickyHeaderShellStyle,
              { paddingTop: resolvedStickyHeaderTopPadding },
            ]}
          >
            {stickyHeaderBackground}
            {stickyHeader}
          </View>
        </View>
      ) : null}
      {scrollView}
      {insetListener}
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
  onSeeAll,
}: {
  title: string;
  body?: string;
  detail?: ReactNode;
  headerAccessory?: ReactNode;
  /**
   * Opens the full version of what the card previews, through the title
   * (`SectionHeading`), rather than a button under the list.
   */
  onSeeAll?: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark, false), [mobileColors, isDark]);

  return (
    <View style={styles.cardGroup}>
      {/* The header sits on the page background, above the white surface —
          a section heading over its content rather than inside it. */}
      <SectionHeading
        accessory={
          headerAccessory ? (
            <View style={styles.cardHeaderAccessory}>{headerAccessory}</View>
          ) : undefined
        }
        onOpen={onSeeAll}
        title={title}
        titleStyle={styles.cardTitle}
      />
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

const createStyles = (mobileColors: MobileColors, isDark: boolean, hasPageBackground: boolean) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    // Transparent over a page background, so the wash behind shows through;
    // the root above still carries the theme's ground under it.
    scrollView: {
      flex: 1,
      backgroundColor: hasPageBackground ? "transparent" : mobileColors.background,
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
    emptyListHeader: {
      flexGrow: 1,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.background,
      paddingHorizontal: getScreenGutter(),
      paddingTop: mobileSpace.md,
    },
    // Carries only the shadow and stacking; see the JSX for why this can't
    // share a view with `stickyHeaderShell`'s `overflow: "hidden"` on iOS.
    // No shadow over a page background: the wash runs through the header,
    // and a shadow band under the shell read as a hard seam in it. None on
    // iOS either, whose bars sit flush with the grouped page at rest.
    // It sits in the page's flow above the scroll view rather than floating
    // over it, so the page's top is right under the header from the first
    // frame. Floating needed a content inset that only landed once the header
    // had measured, and the page drew under the header until then.
    stickyHeaderShadow: {
      zIndex: 10,
      ...(hasPageBackground || Platform.OS === "ios" ? null : mobileElevation("header", isDark)),
    },
    stickyHeaderShell: {
      // `overflow: hidden` clips whatever the header draws to the shell's own
      // bounds.
      overflow: "hidden",
      // Match native-stack headers and the page ground. This shell is visible
      // behind an interactive back swipe from a child route; using `surface`
      // here made that strip flash white while the destination was revealed.
      // Over a page background the shell keeps this ground and paints
      // `stickyHeaderBackground` on top of it, so the header shows the same
      // ground-plus-wash the page shows behind it while staying opaque.
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
      // the earlier sibling, so it loses ties. The shell gets its
      // shadow from the `stickyHeaderShadow` wrapper instead; putting it here
      // too would just be clipped by this view's own `overflow: "hidden"`.
    },
    overlayLayer: {
      ...StyleSheet.absoluteFill,
      zIndex: 20,
      elevation: 20,
    },
    cardGroup: {
      gap: mobileSpace.sm,
    },
    card: getCardSurfaceStyle(mobileColors, isDark),
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
