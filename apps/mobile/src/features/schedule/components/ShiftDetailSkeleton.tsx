import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  SkeletonPill,
  skeletonRows,
} from "../../../shared/components/skeleton";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpacing, type MobileColors } from "../../../shared/theme/tokens";
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
  shiftmates = 3,
}: {
  infoRows?: number;
  shiftmates?: number;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const detailStyles = useMemo(
    () => createShiftDetailStyles(mobileColors, isDark),
    [mobileColors, isDark],
  );
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <SkeletonGroup style={styles.page}>
      <View style={detailStyles.shiftDetailSkeletonCard}>
        <View style={detailStyles.detailHeroHeader}>
          <View style={detailStyles.detailHeroCopy}>
            <SkeletonPill height={16} width={92} />
            <SkeletonLine variant="heroMetric" width="72%" />
            <SkeletonLine variant="body" width="52%" />
          </View>
          <SkeletonBlock height={68} radius={16} width={58} />
        </View>
        <View style={detailStyles.detailHeroContextGroup}>
          {skeletonRows(infoRows, (index) => (
            <View key={`detail-info-${index}`} style={detailStyles.detailHeroAreaRow}>
              <SkeletonCircle size={18} />
              <View style={styles.infoCopy}>
                <SkeletonLine variant={index === 0 ? "rowTitle" : "sectionTitle"} width="58%" />
              </View>
            </View>
          ))}
          <SkeletonBlock height={7} radius={999} width="100%" />
        </View>
        <View style={detailStyles.detailActionsRow}>
          <SkeletonPill height={48} style={styles.action} />
          <SkeletonPill height={48} style={styles.action} />
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
          {skeletonRows(shiftmates, (index) => (
            <View
              key={`shiftmate-skeleton-${index}`}
              style={[
                detailStyles.shiftmateRow,
                index > 0 ? detailStyles.shiftmateRowBorder : null,
              ]}
            >
              <SkeletonCircle size={42} />
              <View style={detailStyles.shiftmateContent}>
                <SkeletonLine variant="rowTitle" width="54%" />
                <SkeletonLine variant="caption" width="36%" />
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
      gap: 3,
      minWidth: 0,
    },
    action: {
      flex: 1,
    },
  });
