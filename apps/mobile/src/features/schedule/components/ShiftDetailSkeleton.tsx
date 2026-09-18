import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  SkeletonPill,
  skeletonRows,
  useSkeletonFillCount,
} from "../../../shared/components/skeleton";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileControl,
  mobileSpacing,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";
import { createStyles as createShiftDetailStyles } from "../screens/shiftDetailScreenStyles";

/**
 * A single shift's detail page.
 *
 * Shiftmate rows are part of this placeholder rather than a second skeleton
 * that appeared after the card resolved: the screen now waits on the team
 * schedule too, so there is one skeleton and one swap.
 */
export function ShiftDetailSkeleton({
  infoRows = 2,
  shiftmates,
}: {
  infoRows?: number;
  /** Defaults to enough rows to reach the bottom of the screen under the card. */
  shiftmates?: number;
}) {
  // A 42pt avatar row at its padding; reserved for the header, the card and
  // the section title above the list.
  const fillShiftmates = useSkeletonFillCount(42 + mobileSpace.md * 2, 470);
  const shiftmateCount = shiftmates ?? fillShiftmates;
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const detailStyles = useMemo(
    () => createShiftDetailStyles(mobileColors, isDark),
    [mobileColors, isDark],
  );
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <SkeletonGroup style={styles.page}>
      <View style={detailStyles.shiftDetailCard}>
        <View style={detailStyles.detailSummaryRow}>
          <View style={detailStyles.detailSummaryContent}>
            <View style={detailStyles.detailHeroHeader}>
              <View style={detailStyles.detailHeroCopy}>
                <SkeletonLine variant="heroMetric" width="72%" />
                <SkeletonLine variant="body" width="52%" />
              </View>
            </View>
            <View style={detailStyles.detailInfoStack}>
              {skeletonRows(infoRows, (index) => (
                <View key={`detail-info-${index}`} style={detailStyles.detailInfoRow}>
                  <View style={detailStyles.detailInfoIcon}>
                    <SkeletonBlock height={16} radius={4} width={16} />
                  </View>
                  <View style={styles.infoCopy}>
                    <SkeletonLine variant={index === 0 ? "rowTitle" : "body"} width="58%" />
                  </View>
                </View>
              ))}
            </View>
          </View>
          <View style={detailStyles.detailDateTile}>
            <SkeletonLine variant="label" width={28} />
            <SkeletonLine variant="heroMetric" width={24} />
          </View>
        </View>
        <View style={detailStyles.detailActionsRow}>
          <SkeletonPill height={mobileControl.md} style={styles.action} />
          <SkeletonPill height={mobileControl.md} style={styles.action} />
        </View>
        <View style={detailStyles.detailPublishedFooter}>
          <SkeletonCircle size={16} />
          <View style={styles.infoCopy}>
            <SkeletonLine variant="meta" width="92%" />
          </View>
        </View>
      </View>

      <View style={detailStyles.sectionBlock}>
        <SkeletonLine variant="screenTitle" width="48%" />
        <View style={detailStyles.shiftmatesList}>
          {skeletonRows(shiftmateCount, (index) => (
            <View
              key={`shiftmate-skeleton-${index}`}
              style={[
                detailStyles.shiftmateRow,
                index > 0 ? detailStyles.shiftmateRowBorder : null,
              ]}
            >
              <SkeletonCircle size={42} />
              <View style={detailStyles.shiftmateContent}>
                <SkeletonLine variant="rowTitle" width={index % 2 === 0 ? "54%" : "42%"} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </SkeletonGroup>
  );
}

const createStyles = (_mobileColors: MobileColors) =>
  StyleSheet.create({
    page: {
      gap: mobileSpacing.sectionGap,
    },
    infoCopy: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 0,
    },
    action: {
      flex: 1,
    },
  });
