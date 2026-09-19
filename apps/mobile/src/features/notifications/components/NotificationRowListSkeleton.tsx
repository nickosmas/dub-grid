import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  skeletonRows,
  useSkeletonFillCount,
} from "../../../shared/components/skeleton";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileListRow,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * The alerts list while it loads: mailbox rows at `NotificationRow`'s
 * metrics, an unread dot on most, the title with its time on one line, two
 * lines of message, a hairline between rows. Not cards: the list stopped
 * being cards, and a placeholder that still was announced the wrong screen.
 */
export function NotificationRowListSkeleton({ rows }: { rows?: number }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  // Title line, two message lines and the row padding; reserved for the
  // large title, search field, filter strip and unread row above the list.
  const fillRows = useSkeletonFillCount(
    mobileListRow.paddingVertical * 2 + mobileText.body.lineHeight + mobileText.meta.lineHeight * 2,
    300,
  );
  const rowCount = rows ?? fillRows;

  return (
    <SkeletonGroup>
      {skeletonRows(rowCount, (index) => (
        <View
          key={`alert-row-skeleton-${index}`}
          style={[styles.row, index < rowCount - 1 ? styles.rowDivider : null]}
        >
          <View style={styles.leading}>
            {index % 3 !== 2 ? <SkeletonCircle size={mobileSpace.sm} /> : null}
          </View>
          <View style={styles.copy}>
            <View style={styles.titleLine}>
              <SkeletonLine
                variant="body"
                width={index % 2 === 0 ? "62%" : "48%"}
                style={styles.grow}
              />
              <SkeletonLine variant="caption" width={52} />
            </View>
            <SkeletonLine variant="meta" width="96%" />
            <SkeletonLine variant="meta" width={index % 2 === 0 ? "58%" : "74%"} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // A percentage-wide line inside a row has no width of its own to take a
    // percentage of; growing the wrapper gives it the row's free space.
    grow: {
      flex: 1,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: mobileSpace.sm,
      paddingVertical: mobileListRow.paddingVertical,
    },
    rowDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    // The same fixed column the real row keeps for its dot.
    leading: {
      width: mobileSpace.lg,
      alignItems: "center",
      paddingTop: (mobileText.body.lineHeight - mobileSpace.sm) / 2,
    },
    copy: {
      flex: 1,
      gap: mobileListRow.titleGap,
    },
    titleLine: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: mobileSpace.xs,
    },
  });
