import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SkeletonLine } from "../../../shared/components/skeleton";
import { AlertsHeaderButton } from "../../../shared/navigation/AlertsHeaderButton";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace, type MobileColors } from "../../../shared/theme/tokens";

/** The greeting block that sits in the screen's sticky header slot. */
export function DashboardHeaderSkeleton() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  // The bell is the real control: it needs no dashboard data, and drawing it
  // now means it does not pop in beside the greeting when the page resolves.
  return (
    <View style={styles.headerRow}>
      <View style={styles.header}>
        <SkeletonLine variant="display" width="58%" />
        <SkeletonLine variant="meta" width="74%" />
      </View>
      <AlertsHeaderButton />
    </View>
  );
}

// Its own file, apart from the page skeletons: the bell brings expo-router
// with it, and the expanded routes that import the list skeleton must not.
const createStyles = (_mobileColors: MobileColors) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: mobileSpace.md,
    },
    header: {
      flex: 1,
      gap: mobileSpace.xs,
    },
  });
