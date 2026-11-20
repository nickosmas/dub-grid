import { useMemo, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { mobileElevation, mobileSpace } from "../theme/tokens";
import { WindowInsetsContext } from "../navigation/useHasSideColumn";
import { getSplitLayout, type SplitLayout } from "./split-layout";
import { DetailPaneContext, PaneTopInsetContext } from "./DetailPaneContext";
import { TransparentPaneContext } from "./TransparentPaneContext";
import { useHingeStatus } from "./useHingeStatus";

/** The current split, or null when the screen shows one page at a time. */
export function useSplitLayout(): SplitLayout | null {
  const { width, height } = useWindowDimensions();
  const hinge = useHingeStatus();
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
}: {
  layout: SplitLayout;
  list: ReactNode;
  detail: ReactNode;
  /** Painted once behind both panes, whose pages then leave their ground transparent. */
  background?: ReactNode;
  /**
   * The list as a card floating over `background`, its leading corners
   * concentric with the display's and its trailing ones square.
   */
  listCard?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const insets = useSafeAreaInsets();
  const listInsets = useMemo(() => ({ ...insets, right: 0 }), [insets]);
  const detailInsets = useMemo(() => ({ ...insets, left: 0 }), [insets]);

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
        <View style={styles.row}>
          <View style={{ width: layout.listWidth }}>
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
          </View>
          {listCard ? null : (
            <View style={[styles.divider, { backgroundColor: mobileColors.borderSubtle }]} />
          )}
          <View style={styles.detail}>
            <SafeAreaInsetsContext.Provider value={detailInsets}>
              <DetailPaneContext.Provider value={true}>{detail}</DetailPaneContext.Provider>
            </SafeAreaInsetsContext.Provider>
          </View>
        </View>
      </TransparentPaneContext.Provider>
    </WindowInsetsContext.Provider>
  );
}

/** The open iPhone Duo's display corner radius, which the card's corners follow. */
const DISPLAY_CORNER_RADIUS = 55;
/** The card's gap from the screen's edges; its corners stay concentric with the display's. */
const LIST_CARD_INSET = mobileSpace.lg;
const LIST_CARD_LEADING_RADIUS = DISPLAY_CORNER_RADIUS - LIST_CARD_INSET;

const styles = StyleSheet.create({
  listCard: {
    flex: 1,
    margin: LIST_CARD_INSET,
    borderTopLeftRadius: LIST_CARD_LEADING_RADIUS,
    borderBottomLeftRadius: LIST_CARD_LEADING_RADIUS,
    borderCurve: "continuous",
  },
  listCardClip: {
    flex: 1,
    borderTopLeftRadius: LIST_CARD_LEADING_RADIUS,
    borderBottomLeftRadius: LIST_CARD_LEADING_RADIUS,
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
