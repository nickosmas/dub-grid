import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  skeletonRows,
  useSkeletonFillCount,
} from "../../../shared/components/skeleton";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { type MobileColors, mobileSpace } from "../../../shared/theme/tokens";

/** `personAvatar` in PeopleScreen. */
const AVATAR_SIZE = 44;

/**
 * The people directory list.
 *
 * Rows sit on the page background rather than in a card, lead with a 44pt
 * avatar and carry the name over its focus areas, with a chevron at the end,
 * at the same 76pt minimum height the real row uses so nothing shifts on
 * arrival.
 */
export function PersonListSkeleton({ rows }: { rows?: number }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  // The row's 76pt minimum; reserved for the large title and search row.
  const fillRows = useSkeletonFillCount(76, 220);
  const rowCount = rows ?? fillRows;

  return (
    <SkeletonGroup style={styles.list}>
      {skeletonRows(rowCount, (index) => (
        <View
          key={`person-skeleton-${index}`}
          style={[styles.row, index < rowCount - 1 ? styles.rowDivider : null]}
        >
          <SkeletonCircle size={AVATAR_SIZE} />
          <View style={styles.copy}>
            <SkeletonLine variant="cardTitle" width={index % 2 === 0 ? "52%" : "60%"} />
            <SkeletonLine variant="body" width={index % 2 === 0 ? "44%" : "70%"} />
          </View>
          <SkeletonBlock height={16} radius={2} width={8} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    list: {
      gap: 0,
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.sm,
      minHeight: 76,
      paddingVertical: 12,
    },
    rowDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    copy: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 0,
    },
  });
