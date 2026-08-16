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
import Ionicons from "@expo/vector-icons/Ionicons";
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

export type CardIconTone = "brand" | "warning" | "danger" | "success";

function createCardIconTone(
  mobileColors: MobileColors,
): Record<CardIconTone, { backgroundColor: string; borderColor: string; iconColor: string }> {
  return {
    brand: {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      iconColor: mobileColors.brand,
    },
    warning: {
      backgroundColor: mobileColors.warningSoft,
      borderColor: mobileColors.warningBorder,
      iconColor: mobileColors.warningText,
    },
    danger: {
      backgroundColor: mobileColors.dangerSoft,
      borderColor: mobileColors.dangerBorder,
      iconColor: mobileColors.dangerText,
    },
    success: {
      backgroundColor: mobileColors.successSoft,
      borderColor: mobileColors.successBorder,
      iconColor: mobileColors.successText,
    },
  };
}
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
}>) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const insets = useSafeAreaInsets();
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
        paddingBottom: getScreenBottomPadding(bottomPaddingMode, insets.bottom),
      }}
      contentInset={iosContentInset}
      contentOffset={iosContentOffset}
      contentInsetAdjustmentBehavior={useNativeContentInsets ? "automatic" : "never"}
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
  icon,
  iconTone = "brand",
}: {
  title: string;
  body?: string;
  detail?: ReactNode;
  headerAccessory?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTone?: CardIconTone;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const cardIconTone = useMemo(() => createCardIconTone(mobileColors), [mobileColors]);
  const tone = cardIconTone[iconTone];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {icon ? (
          <View
            style={[
              styles.cardIconFrame,
              { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor },
            ]}
          >
            <Ionicons color={tone.iconColor} name={icon} size={16} />
          </View>
        ) : null}
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {headerAccessory ? <View style={styles.cardHeaderAccessory}>{headerAccessory}</View> : null}
      </View>
      {body ? <Text style={styles.cardBody}>{body}</Text> : null}
      {detail}
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
      // `surface`, not `background` — this is the app bar on the only two
      // screens that have one (the dashboard and both schedule scopes; every
      // other screen takes the native header instead). White chrome over the
      // slate page reads as a bar sitting above the content rather than as more
      // page, and it matches the tab bar at the other end of the screen, which
      // is already `surface`. It also puts the status-bar strip on white, since
      // both of those routes run `headerShown: false` and this shell is what
      // reaches under the notch.
      backgroundColor: mobileColors.surface,
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
    overlayLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      elevation: 20,
    },
    card: getCardSurfaceStyle(mobileColors, isDark),
    cardHeader: {
      flexDirection: "row",
      // Stays flex-start so a title that wraps to two lines grows downward from
      // the icon's top rather than straddling it. Single-line titles are centred
      // by the minHeight below instead.
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: mobileSpace.md,
    },
    cardHeaderCopy: {
      flex: 1,
      minWidth: 0,
      // Matches the icon frame, so a one-line title sits optically centred
      // against the icon instead of pinned to its top edge. A 22pt line inside a
      // 32pt frame was reading as a 5pt upward offset.
      minHeight: CARD_ICON_FRAME_SIZE,
      justifyContent: "center",
    },
    cardHeaderAccessory: {
      minHeight: CARD_ICON_FRAME_SIZE,
      justifyContent: "center",
    },
    cardIconFrame: {
      width: CARD_ICON_FRAME_SIZE,
      height: CARD_ICON_FRAME_SIZE,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    cardTitle: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    cardBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
  });
