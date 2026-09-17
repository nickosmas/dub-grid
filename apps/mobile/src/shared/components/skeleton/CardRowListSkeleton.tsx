import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useIsDarkMode, useMobileColors } from "../../providers/ThemeModeProvider";
import { mobileElevation, mobileRadii, mobileSpace, type MobileColors } from "../../theme/tokens";
import {
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  SkeletonPill,
  skeletonRows,
} from "./primitives";

/** Alert and request cards both lead with the same 32pt round icon. */
const ICON_SIZE = 32;
/** Their action strips both inset past that icon plus its 10pt gap. */
const ACTION_STRIP_INSET = ICON_SIZE + 10;

/**
 * The card-with-leading-icon list, shared by Alerts and Requests.
 *
 * Those two screens render structurally identical rows — a 16-radius card with
 * a 32pt icon, a title, message lines and a hairline-topped action strip inset
 * past the icon — so they get one placeholder rather than two that drift.
 */
export function CardRowListSkeleton({
  rows = 4,
  showActions = true,
  showUnreadDot = true,
}: {
  rows?: number;
  showActions?: boolean;
  showUnreadDot?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <SkeletonGroup style={styles.list}>
      {skeletonRows(rows, (index) => (
        <View key={`card-row-skeleton-${index}`} style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <SkeletonCircle size={ICON_SIZE} />
              <View style={styles.titleColumn}>
                <SkeletonLine variant="cardTitle" width="72%" />
                <SkeletonLine variant="body" width="94%" />
                <SkeletonLine variant="body" width="58%" />
              </View>
            </View>
            {showUnreadDot ? <View style={styles.unreadDot} /> : null}
          </View>
          {showActions ? (
            <View style={styles.actions}>
              <SkeletonPill height={36} width={104} />
              <SkeletonPill height={36} width={88} />
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
      gap: mobileSpace.sm,
    },
    // Not `getCardSurfaceStyle`: these two lists use a flatter card than the
    // dashboard's — same radius, but 16pt padding, a hairline in both themes,
    // and no shadow.
    card: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: mobileSpace.sm,
      padding: mobileSpace.lg,
      ...mobileElevation("card", isDark),
    },
    header: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: mobileSpace.md,
      justifyContent: "space-between",
    },
    titleRow: {
      alignItems: "flex-start",
      flex: 1,
      flexDirection: "row",
      gap: mobileSpace.sm,
    },
    titleColumn: {
      flex: 1,
      gap: 4,
    },
    unreadDot: {
      backgroundColor: mobileColors.skeletonBase,
      borderRadius: 999,
      height: 10,
      marginTop: mobileSpace.sm,
      width: 10,
    },
    actions: {
      alignItems: "center",
      borderTopColor: mobileColors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: mobileSpace.sm,
      marginLeft: ACTION_STRIP_INSET,
      paddingTop: mobileSpace.sm,
    },
  });
