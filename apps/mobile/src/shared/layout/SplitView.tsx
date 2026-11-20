import { useMemo, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { WindowInsetsContext } from "../navigation/useHasSideColumn";
import { getSplitLayout, type SplitLayout } from "./split-layout";
import { DetailPaneContext } from "./DetailPaneContext";
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
}: {
  layout: SplitLayout;
  list: ReactNode;
  detail: ReactNode;
  /** Painted once behind both panes, whose pages then leave their ground transparent. */
  background?: ReactNode;
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
              {list}
            </SafeAreaInsetsContext.Provider>
          </View>
          <View style={[styles.divider, { backgroundColor: mobileColors.borderSubtle }]} />
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

const styles = StyleSheet.create({
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
