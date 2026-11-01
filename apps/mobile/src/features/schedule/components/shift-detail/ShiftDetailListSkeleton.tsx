import { StyleSheet, View } from "react-native";
import {
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  skeletonRows,
  useSkeletonFillCount,
} from "../../../../shared/components/skeleton";
import { mobileSpace, mobileSpacing } from "../../../../shared/theme/tokens";
import { DETAIL_ROW_INSET, DetailGroup, DetailRowFrame } from "./DetailList";

/**
 * The shift detail's grouped list as it loads: the date over the shift's card,
 * Drop and Swap on the viewer's own shift, the publication row, and Working
 * with when the viewer can see the team schedule. One skeleton, one swap: the
 * screen waits on the team schedule too.
 */
export function ShiftDetailListSkeleton({
  showActions = true,
  showShiftmates = true,
}: {
  showActions?: boolean;
  showShiftmates?: boolean;
}) {
  // A 40pt avatar row at its padding; reserved for the groups above the list.
  const shiftmateCount = useSkeletonFillCount(40 + mobileSpace.md * 2, 520);

  return (
    <SkeletonGroup style={styles.page}>
      <View style={styles.group}>
        <View style={styles.header}>
          <SkeletonLine variant="sectionTitle" width="52%" />
        </View>
        <DetailGroup>
          <DetailRowFrame style={styles.heroRow}>
            <SkeletonLine variant="title" width="56%" />
          </DetailRowFrame>
          {skeletonRows(2, (index) => (
            <DetailRowFrame key={`detail-field-${index}`} style={styles.fieldRow}>
              <SkeletonLine variant="meta" width={index === 0 ? 68 : 80} />
              <SkeletonLine
                variant={index === 0 ? "rowTitle" : "body"}
                width={index === 0 ? "62%" : "40%"}
              />
            </DetailRowFrame>
          ))}
        </DetailGroup>
      </View>
      {showActions ? (
        <DetailGroup>
          <DetailRowFrame>
            <SkeletonLine variant="body" width={84} />
          </DetailRowFrame>
          <DetailRowFrame>
            <SkeletonLine variant="body" width={48} />
          </DetailRowFrame>
        </DetailGroup>
      ) : null}
      <DetailGroup>
        <DetailRowFrame>
          <SkeletonLine variant="body" width="88%" />
        </DetailRowFrame>
      </DetailGroup>
      {showShiftmates ? (
        <View style={styles.group}>
          <View style={styles.header}>
            <SkeletonLine variant="sectionTitle" width="36%" />
          </View>
          <DetailGroup separatorInset={DETAIL_ROW_INSET + 40 + mobileSpace.md}>
            {skeletonRows(shiftmateCount, (index) => (
              <DetailRowFrame key={`shiftmate-skeleton-${index}`} style={styles.shiftmateRow}>
                <SkeletonCircle size={40} />
                <SkeletonLine variant="body" width={index % 2 === 0 ? "54%" : "42%"} />
              </DetailRowFrame>
            ))}
          </DetailGroup>
        </View>
      ) : null}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: mobileSpacing.sectionGap,
  },
  group: {
    gap: mobileSpace.sm,
  },
  header: {
    paddingHorizontal: DETAIL_ROW_INSET,
  },
  heroRow: {
    paddingVertical: mobileSpace.lg,
  },
  fieldRow: {
    gap: mobileSpace.xs,
  },
  shiftmateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.md,
  },
});
