import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  skeletonRows,
} from "../../../shared/components/skeleton";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { type MobileColors, mobileSpace } from "../../../shared/theme/tokens";

/** `personAvatar` in PeopleScreen. */
const AVATAR_SIZE = 44;

/**
 * The people directory list.
 *
 * Rows sit on the page background rather than in a card, lead with a 44pt
 * avatar and carry three stacked lines — name, subtitle, access — at the same
 * 76pt minimum height the real row uses, so nothing shifts on arrival.
 */
export function PersonListSkeleton({ rows = 6 }: { rows?: number }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <SkeletonGroup style={styles.list}>
      {skeletonRows(rows, (index) => (
        <View
          key={`person-skeleton-${index}`}
          style={[styles.row, index < rows - 1 ? styles.rowDivider : null]}
        >
          <SkeletonCircle size={AVATAR_SIZE} />
          <View style={styles.copy}>
            <SkeletonLine variant="cardTitle" width="56%" />
            <SkeletonLine variant="body" width="72%" />
            <SkeletonLine variant="caption" width="38%" />
          </View>
          <SkeletonBlock height={22} radius={4} width={12} />
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
      gap: 12,
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
