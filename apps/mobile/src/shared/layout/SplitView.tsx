import { useEffect, useMemo, type ReactNode } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { mobileElevation, mobileRadii, mobileSpace } from "../theme/tokens";
import { WindowInsetsContext } from "../navigation/useHasSideColumn";
import { getSplitLayout, getStackedListHeight, type SplitLayout } from "./split-layout";
import {
  DetailBarClearanceContext,
  DetailPaneContext,
  PaneTopInsetContext,
} from "./DetailPaneContext";
import { TransparentPaneContext, useTransparentPane } from "./TransparentPaneContext";
import { useHingeStatus } from "./useHingeStatus";
import { PaneEdge, hingeModule } from "../../../modules/hinge";
import { FOLD_FADE_MS, type useFoldEntering } from "./FoldFade";
import { PaneStack } from "./PaneStack";

const IS_IOS = Platform.OS === "ios";

/** The current split, or null when the screen shows one page at a time. */
export function useSplitLayout(): SplitLayout | null {
  const { width, height } = useWindowDimensions();
  const hinge = useHingeStatus();
  // Once the layout for a new size has been drawn, the hinge module's cover
  // over the resizing window can fade.
  useEffect(() => {
    const frame = requestAnimationFrame(() => hingeModule?.settle?.());
    return () => cancelAnimationFrame(frame);
  }, [width, height]);
  return useMemo(() => getSplitLayout({ width, height, hinge }), [width, height, hinge]);
}

/**
 * Where a stacking list pane ends in the window: the screen's foot beside its
 * detail, or held tall, just above the fold.
 */
export function useListPaneBottom(layout: SplitLayout | null): number {
  const { height } = useWindowDimensions();
  return layout?.tall ? getStackedListHeight(height) - LIST_CARD_INSET : height;
}

/**
 * A list beside its detail. Each pane gets the safe-area insets of the edges
 * it actually touches, so the list doesn't keep room for the side column on
 * the far edge and the detail doesn't pad for the leading edge.
 */
export function SplitView({
  layout,
  list,
  detail,
  background,
  listCard = false,
  entering,
  detailBarHeight = 0,
  stackWhenTall = false,
  sidebar = false,
  listTitle,
  listLargeTitle = true,
  detailBar = false,
}: {
  layout: SplitLayout;
  list: ReactNode;
  detail: ReactNode;
  /** Painted once behind both panes, whose pages then leave their ground transparent. */
  background?: ReactNode;
  /**
   * The list as a card floating over `background`, its leading corners
   * concentric with the display's and its trailing ones a control's.
   */
  listCard?: boolean;
  /** A native bar's height over the panes, which the detail's page is padded below. */
  detailBarHeight?: number;
  /** The fade from `useFoldEntering`, as the page arrives from one pane. */
  entering?: ReturnType<typeof useFoldEntering>;
  /** Held tall, the list sits over the detail, above the fold, as Calendar puts its month. */
  stackWhenTall?: boolean;
  /** Calendar's panes: the list on a sidebar gray, the detail on the content color. */
  sidebar?: boolean;
  /**
   * The list page's title, as the large title of the list pane's own native
   * bar. One bar across both panes can't fold a title into itself, so each
   * pane has its own, as each column of Mail does.
   */
  listTitle?: string;
  /** False for a list page whose bar title is compact, as Profile's name is. */
  listLargeTitle?: boolean;
  /** The detail pane gets its own native bar too, named by the page's `PaneTitle`. */
  detailBar?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const insets = useSafeAreaInsets();
  // A page that already paints one background behind the split (Home's wash
  // under its full-width header on the iPhone Duo) keeps its panes clear.
  const inheritedTransparent = useTransparentPane();
  const { height } = useWindowDimensions();
  const stacked = stackWhenTall && layout.tall;
  const listInsets = useMemo(
    () => (stacked ? { ...insets, bottom: 0 } : { ...insets, right: 0 }),
    [insets, stacked],
  );
  const detailInsets = useMemo(
    () => (stacked ? { ...insets, top: 0 } : { ...insets, left: 0 }),
    [insets, stacked],
  );
  // Opening flat from partly folded, or the other way, the list slides to
  // its new width instead of jumping there.
  const listWidth = useSharedValue(layout.listWidth);
  useEffect(() => {
    listWidth.value = withTiming(layout.listWidth, LIST_WIDTH_TIMING);
  }, [layout.listWidth, listWidth]);
  // Reanimated keeps the last size it set, so the stacked size comes from the
  // same animated style rather than replacing it.
  const stackedHeight = getStackedListHeight(height);
  const listSizeStyle = useAnimatedStyle(
    () =>
      stacked
        ? { width: "100%", height: stackedHeight }
        : { width: listWidth.value, height: "100%" },
    [stacked, stackedHeight],
  );

  return (
    <WindowInsetsContext.Provider value={insets}>
      <TransparentPaneContext.Provider
        value={background != null || inheritedTransparent || sidebar}
      >
        {background != null ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.background,
              { backgroundColor: mobileColors.background },
            ]}
          >
            {background}
          </View>
        ) : null}
        <Animated.View entering={entering} style={stacked ? styles.column : styles.row}>
          <Animated.View
            style={[listSizeStyle, sidebar && { backgroundColor: mobileColors.sidebarBackground }]}
          >
            <SafeAreaInsetsContext.Provider value={listInsets}>
              {listCard ? (
                <View
                  style={[
                    styles.listCard,
                    stacked && styles.listCardStacked,
                    { backgroundColor: mobileColors.surface },
                    mobileElevation("float", isDark),
                  ]}
                >
                  {/* Clipped inside, so the shadow outside isn't. */}
                  <View style={[styles.listCardClip, stacked && styles.listCardStacked]}>
                    <TransparentPaneContext.Provider value={true}>
                      <PaneTopInsetContext.Provider value={LIST_CARD_INSET}>
                        {list}
                      </PaneTopInsetContext.Provider>
                    </TransparentPaneContext.Provider>
                  </View>
                </View>
              ) : listTitle != null && IS_IOS ? (
                <PaneStack id="split-list" largeTitle={listLargeTitle} title={listTitle}>
                  {list}
                </PaneStack>
              ) : (
                list
              )}
            </SafeAreaInsetsContext.Provider>
          </Animated.View>
          {listCard ? null : (
            <View
              style={[
                stacked ? styles.dividerStacked : styles.divider,
                { backgroundColor: mobileColors.borderSubtle },
              ]}
            />
          )}
          <View
            style={[
              styles.detail,
              sidebar && {
                backgroundColor: isDark ? mobileColors.background : mobileColors.surface,
              },
            ]}
          >
            <SafeAreaInsetsContext.Provider value={detailInsets}>
              {detailBar && IS_IOS ? (
                <PaneStack collapsedTitle={false} id="split-detail">
                  {detail}
                </PaneStack>
              ) : (
                <DetailBarClearanceContext.Provider value={detailBarHeight}>
                  <DetailPaneContext.Provider value={true}>
                    {PaneEdge ? <PaneEdge style={styles.detail}>{detail}</PaneEdge> : detail}
                  </DetailPaneContext.Provider>
                </DetailBarClearanceContext.Provider>
              )}
            </SafeAreaInsetsContext.Provider>
          </View>
        </Animated.View>
      </TransparentPaneContext.Provider>
    </WindowInsetsContext.Provider>
  );
}

const LIST_WIDTH_TIMING = { duration: FOLD_FADE_MS, easing: Easing.out(Easing.cubic) };

/** The open iPhone Duo's display corner radius, which the card's corners follow. */
const DISPLAY_CORNER_RADIUS = 55;
/** The card's gap from the screen's edges; its corners stay concentric with the display's. */
const LIST_CARD_INSET = mobileSpace.sm;
const LIST_CARD_LEADING_RADIUS = DISPLAY_CORNER_RADIUS - LIST_CARD_INSET;

const styles = StyleSheet.create({
  listCard: {
    flex: 1,
    margin: LIST_CARD_INSET,
    borderTopLeftRadius: LIST_CARD_LEADING_RADIUS,
    borderBottomLeftRadius: LIST_CARD_LEADING_RADIUS,
    borderTopRightRadius: mobileRadii.control,
    borderBottomRightRadius: mobileRadii.control,
    borderCurve: "continuous",
  },
  listCardClip: {
    flex: 1,
    borderTopLeftRadius: LIST_CARD_LEADING_RADIUS,
    borderBottomLeftRadius: LIST_CARD_LEADING_RADIUS,
    borderTopRightRadius: mobileRadii.control,
    borderBottomRightRadius: mobileRadii.control,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  background: {
    pointerEvents: "none",
  },
  // Stacked, the card's top corners follow the display's and its bottom ones,
  // over the detail, are a control's.
  listCardStacked: {
    borderTopLeftRadius: LIST_CARD_LEADING_RADIUS,
    borderTopRightRadius: LIST_CARD_LEADING_RADIUS,
    borderBottomLeftRadius: mobileRadii.control,
    borderBottomRightRadius: mobileRadii.control,
  },
  row: {
    flex: 1,
    flexDirection: "row",
  },
  column: {
    flex: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
  },
  dividerStacked: {
    height: StyleSheet.hairlineWidth,
  },
  detail: {
    flex: 1,
  },
});
