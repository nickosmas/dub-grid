import { useMemo, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace } from "../theme/tokens";
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
  detailBackground,
  listCard = false,
}: {
  layout: SplitLayout;
  list: ReactNode;
  detail: ReactNode;
  /** Painted once behind both panes, whose pages then leave their ground transparent. */
  background?: ReactNode;
  /** Painted behind the detail pane alone, whatever page it shows. */
  detailBackground?: ReactNode;
  /**
   * The list as a card inset from the screen, its leading corners following
   * the display's and square where it meets the detail, as Calendar draws
   * its month.
   */
  listCard?: boolean;
}) {
  const mobileColors = useMobileColors();
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
                <View style={[styles.listCard, { backgroundColor: mobileColors.surface }]}>
                  <TransparentPaneContext.Provider value={true}>
                    <PaneTopInsetContext.Provider value={LIST_CARD_INSET}>
                      {list}
                    </PaneTopInsetContext.Provider>
                  </TransparentPaneContext.Provider>
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
            {detailBackground != null ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  styles.background,
                  { backgroundColor: mobileColors.background },
                ]}
              >
                {detailBackground}
              </View>
            ) : null}
            <SafeAreaInsetsContext.Provider value={detailInsets}>
              <TransparentPaneContext.Provider
                value={background != null || detailBackground != null}
              >
                <DetailPaneContext.Provider value={true}>{detail}</DetailPaneContext.Provider>
              </TransparentPaneContext.Provider>
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
const LIST_CARD_INSET = mobileSpace.sm;

const styles = StyleSheet.create({
  listCard: {
    flex: 1,
    marginTop: LIST_CARD_INSET,
    marginLeft: LIST_CARD_INSET,
    marginBottom: LIST_CARD_INSET,
    borderTopLeftRadius: DISPLAY_CORNER_RADIUS - LIST_CARD_INSET,
    borderBottomLeftRadius: DISPLAY_CORNER_RADIUS - LIST_CARD_INSET,
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
