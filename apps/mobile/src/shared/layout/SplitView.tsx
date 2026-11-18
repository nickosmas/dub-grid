import { useMemo, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { getSplitLayout, type SplitLayout } from "./split-layout";
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
}: {
  layout: SplitLayout;
  list: ReactNode;
  detail: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const insets = useSafeAreaInsets();
  const listInsets = useMemo(() => ({ ...insets, right: 0 }), [insets]);
  const detailInsets = useMemo(() => ({ ...insets, left: 0 }), [insets]);

  return (
    <View style={styles.row}>
      <View style={{ width: layout.listWidth }}>
        <SafeAreaInsetsContext.Provider value={listInsets}>{list}</SafeAreaInsetsContext.Provider>
      </View>
      <View style={[styles.divider, { backgroundColor: mobileColors.borderSubtle }]} />
      <View style={styles.detail}>
        <SafeAreaInsetsContext.Provider value={detailInsets}>
          {detail}
        </SafeAreaInsetsContext.Provider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
