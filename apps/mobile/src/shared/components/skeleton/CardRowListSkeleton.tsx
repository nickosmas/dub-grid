import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useIsDarkMode, useMobileColors } from "../../providers/ThemeModeProvider";
import {
  mobileControl,
  mobileElevation,
  mobileRadii,
  mobileSpace,
  type MobileColors,
} from "../../theme/tokens";
import { SkeletonGroup, SkeletonLine, SkeletonPill, skeletonRows } from "./primitives";

/**
 * The request card list, as the Requests tabs and a shift's own request list
 * draw it: a 16-radius card whose header carries the title with a status
 * chip at the far end, two lines of detail, then a hairline and one control
 * (Volunteer, Approve). One placeholder for every tab so none drifts.
 */
export function CardRowListSkeleton({
  rows = 4,
  showActions = true,
}: {
  rows?: number;
  showActions?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <SkeletonGroup style={styles.list}>
      {skeletonRows(rows, (index) => (
        <View key={`card-row-skeleton-${index}`} style={styles.card}>
          <View style={styles.header}>
            <SkeletonLine variant="cardTitle" width={index % 2 === 0 ? "44%" : "56%"} />
            <SkeletonPill height={24} width={88} />
          </View>
          <SkeletonLine variant="body" width="46%" />
          <SkeletonLine variant="meta" width="64%" />
          {showActions ? (
            <View style={styles.actions}>
              <SkeletonPill height={mobileControl.md} width={128} />
            </View>
          ) : null}
        </View>
      ))}
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    list: {
      gap: mobileSpace.md,
    },
    card: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: mobileSpace.md,
      padding: mobileSpace.lg,
      ...mobileElevation("card", isDark),
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      justifyContent: "space-between",
    },
    actions: {
      borderTopColor: mobileColors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: mobileSpace.md,
    },
  });
