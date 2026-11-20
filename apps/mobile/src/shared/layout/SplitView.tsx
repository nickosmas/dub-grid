import { useEffect, useMemo, type ReactNode } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { mobileElevation, mobileRadii, mobileSpace } from "../theme/tokens";
import { WindowInsetsContext } from "../navigation/useHasSideColumn";
import { getSplitLayout, type SplitLayout } from "./split-layout";
import {
  DetailBarClearanceContext,
  DetailPaneContext,
  PaneTopInsetContext,
} from "./DetailPaneContext";
import { TransparentPaneContext } from "./TransparentPaneContext";
import { useHingeStatus } from "./useHingeStatus";
import { PaneEdge, hingeModule } from "../../../modules/hinge";
import { FOLD_FADE_MS, type useFoldEntering } from "./FoldFade";

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
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const insets = useSafeAreaInsets();
  const listInsets = useMemo(() => ({ ...insets, right: 0 }), [insets]);
  const detailInsets = useMemo(() => ({ ...insets, left: 0 }), [insets]);
  // Opening flat from partly folded, or the other way, the list slides to
  // its new width instead of jumping there.
  const listWidth = useSharedValue(layout.listWidth);
  useEffect(() => {
    listWidth.value = withTiming(layout.listWidth, LIST_WIDTH_TIMING);
  }, [layout.listWidth, listWidth]);
  const listWidthStyle = useAnimatedStyle(() => ({ width: listWidth.value }));

  return (
    <WindowInsetsContext.Provider value={insets}>
      <TransparentPaneContext.Provider value={background != null}>
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
        <Animated.View entering={entering} style={styles.row}>
          <Animated.View style={listWidthStyle}>
            <SafeAreaInsetsContext.Provider value={listInsets}>
              {listCard ? (
                <View
                  style={[
                    styles.listCard,
                    { backgroundColor: mobileColors.surface },
                    mobileElevation("float", isDark),
                  ]}
                >
                  {/* Clipped inside, so the shadow outside isn't. */}
                  <View style={styles.listCardClip}>
                    <TransparentPaneContext.Provider value={true}>
                      <PaneTopInsetContext.Provider value={LIST_CARD_INSET}>
                        {list}
                      </PaneTopInsetContext.Provider>
                    </TransparentPaneContext.Provider>
                  </View>
                </View>
              ) : (
                list
              )}
            </SafeAreaInsetsContext.Provider>
          </Animated.View>
          {listCard ? null : (
            <View style={[styles.divider, { backgroundColor: mobileColors.borderSubtle }]} />
          )}
          <View style={styles.detail}>
            <SafeAreaInsetsContext.Provider value={detailInsets}>
              <DetailBarClearanceContext.Provider value={detailBarHeight}>
                <DetailPaneContext.Provider value={true}>
                  {PaneEdge ? <PaneEdge style={styles.detail}>{detail}</PaneEdge> : detail}
                </DetailPaneContext.Provider>
              </DetailBarClearanceContext.Provider>
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
  row: {
    flex: 1,
    flexDirection: "row",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
  },
  detail: {
    flex: 1,
  },
});
