import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { PaneEdge } from "../../../modules/hinge";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileTypography } from "../theme/tokens";
import {
  DetailBarClearanceContext,
  DetailPaneContext,
  HeaderAbovePanesContext,
  PaneTopInsetContext,
} from "./DetailPaneContext";
import { PaneHeaderContext, type PaneHeader } from "./paneHeader";

/**
 * A split view's pane with its own native navigation bar, as each column of
 * Mail or Settings on an iPad has: the pane's large title shrinks into its own
 * bar as its page scrolls, under the system's scroll edge effect. One bar
 * spanning both panes couldn't do that: its title sat over the list's rows.
 */
export function PaneStack({
  id,
  title = "",
  largeTitle = true,
  collapsedTitle = true,
  children,
}: {
  id: string;
  title?: string;
  largeTitle?: boolean;
  /**
   * False for a split's detail pane: the row picked in the list beside it
   * already names the page, so its title doesn't settle into the bar as the
   * page scrolls; the bar keeps only its scroll edge.
   */
  collapsedTitle?: boolean;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  // Loaded only once a pane renders, so screens that import a split view
  // still load in tests, which can't parse react-native-screens' source.
  const { ScreenStack, ScreenStackItem } =
    require("react-native-screens") as typeof import("react-native-screens");
  // A title the page inside names wins over the pane's own; React runs the
  // page's effect before this pane's, so the two can't share one state.
  const [pageHeader, setPageHeader] = useState<PaneHeader | null>(null);
  const header = {
    title: pageHeader?.title ?? title,
    large: pageHeader?.large ?? largeTitle,
  };
  const setPaneHeader = useMemo(
    () => (next: PaneHeader | null) =>
      setPageHeader((current) =>
        current?.title === next?.title && current?.large === next?.large ? current : next,
      ),
    [],
  );
  return (
    <ScreenStack style={styles.fill}>
      <ScreenStackItem
        activityState={2}
        headerConfig={{
          title: header.title,
          largeTitle: header.large,
          // iOS 26 draws no large title over a bar with a background color.
          backgroundColor: "transparent",
          hideBackButton: true,
          hideShadow: true,
          largeTitleHideShadow: true,
          translucent: true,
          titleColor: collapsedTitle ? mobileColors.textPrimary : "transparent",
          titleFontFamily: mobileTypography.fontFamily.bold,
          largeTitleColor: mobileColors.textPrimary,
          largeTitleFontFamily: mobileTypography.fontFamily.bold,
        }}
        screenId={id}
        style={StyleSheet.absoluteFill}
      >
        {/* Under its own bar the page takes UIKit's insets, as any page does. */}
        <PaneHeaderContext.Provider value={setPaneHeader}>
          <DetailPaneContext.Provider value={false}>
            <DetailBarClearanceContext.Provider value={0}>
              <PaneTopInsetContext.Provider value={0}>
                <HeaderAbovePanesContext.Provider value={false}>
                  {/* Names the page's scroll view to this pane's screen, so its bar
                      follows the page and not the one beside it. */}
                  {PaneEdge ? <PaneEdge style={styles.fill}>{children}</PaneEdge> : children}
                </HeaderAbovePanesContext.Provider>
              </PaneTopInsetContext.Provider>
            </DetailBarClearanceContext.Provider>
          </DetailPaneContext.Provider>
        </PaneHeaderContext.Provider>
      </ScreenStackItem>
    </ScreenStack>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
