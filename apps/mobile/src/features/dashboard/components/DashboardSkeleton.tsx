import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonCardSurface,
  SkeletonGroup,
  SkeletonLine,
  skeletonRows,
  useSkeletonFillCount,
} from "../../../shared/components/skeleton";
import { IS_NATIVE_LIST } from "../../../shared/lib/native-list";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { ScheduleMeSkeleton } from "../../schedule/components/ScheduleSkeleton";
import {
  mobileListRow,
  mobileRadii,
  mobileSpace,
  mobileSpacing,
  type MobileColors,
  mobileText,
} from "../../../shared/theme/tokens";

/**
 * Row shapes the dashboard cards actually use. Each card renders one of these
 * through `DashboardRowList`, a hairline between rows, and the full-page
 * screen behind the card renders the same rows.
 */
type DashboardRowVariant =
  /** ActionQueueCard: two stacked lines, a chevron. */
  | "text"
  /** CoverageSectionRow: label row above a 6pt progress track. */
  | "meter"
  /** StaffHoursCard: two lines, a figure with its label, a chevron. */
  | "figure"
  /** ActivityFeedCard: a typed line over a description, nothing at the end. */
  | "feed";

function DashboardRow({ variant }: { variant: DashboardRowVariant }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (variant === "meter") {
    return (
      <View style={styles.meterRow}>
        <View style={styles.meterHeader}>
          <SkeletonLine variant="body" width="46%" style={styles.grow} />
          <SkeletonLine variant="caption" width={52} />
        </View>
        <View style={styles.meterTrack} />
      </View>
    );
  }

  if (variant === "feed") {
    return (
      <View style={styles.feedRow}>
        <SkeletonLine variant="body" width="82%" />
        <SkeletonLine variant="meta" width="64%" />
      </View>
    );
  }

  if (variant === "text") {
    return (
      <View style={styles.textRow}>
        <View style={styles.rowCopy}>
          <SkeletonLine variant="body" width="58%" />
          <SkeletonLine variant="caption" width="46%" />
        </View>
        <View style={styles.chevron} />
      </View>
    );
  }

  return (
    <View style={styles.textRow}>
      <View style={styles.rowCopy}>
        <SkeletonLine variant="body" width="52%" />
        <SkeletonLine variant="caption" width="66%" />
      </View>
      <View style={styles.figure}>
        <SkeletonLine variant="title" width={24} />
        <SkeletonLine variant="caption" width={48} />
      </View>
      <View style={styles.chevron} />
    </View>
  );
}

function DashboardCardSkeleton({
  rows,
  variant,
  titleWidth = "48%",
}: {
  rows: number;
  variant: DashboardRowVariant;
  titleWidth?: `${number}%`;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  // The heading over its surface with See all beside it, as `DashboardCard`
  // draws it.
  return (
    <View style={styles.cardGroup}>
      <View style={styles.cardTitleRow}>
        <SkeletonLine variant="cardTitle" width={titleWidth} style={styles.grow} />
        <SkeletonLine variant="label" width={52} />
      </View>
      <SkeletonCardSurface>
        {skeletonRows(rows, (index) => (
          <View key={`dashboard-row-${index}`}>
            {index > 0 ? <View style={styles.rowDivider} /> : null}
            <DashboardRow variant={variant} />
          </View>
        ))}
      </SkeletonCardSurface>
    </View>
  );
}

/** The Coverage card: the figure over its meter, three focus-area meters, two stats. */
function DashboardHeroSkeleton() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.cardGroup}>
      <View style={styles.cardTitleRow}>
        <SkeletonLine variant="cardTitle" width={88} />
      </View>
      <SkeletonCardSurface>
        <View style={styles.heroCoverage}>
          <View style={styles.heroFigureRow}>
            <SkeletonLine variant="display" width={84} />
            <SkeletonLine variant="meta" width={56} />
          </View>
          <View style={styles.heroTrack} />
        </View>
        <View style={styles.heroBreakdown}>
          {skeletonRows(3, (index) => (
            <View key={`hero-section-${index}`}>
              {index > 0 ? <View style={styles.rowDivider} /> : null}
              <DashboardRow variant="meter" />
            </View>
          ))}
        </View>
        <View style={styles.heroStatRow}>
          <View style={styles.heroStat}>
            <SkeletonLine variant="title" width={28} />
            <SkeletonLine variant="caption" width={72} />
          </View>
          <View style={styles.heroStat}>
            <SkeletonLine variant="title" width={28} />
            <SkeletonLine variant="caption" width={110} />
          </View>
        </View>
      </SkeletonCardSurface>
    </View>
  );
}

/**
 * The admin Home's placeholder, card for card, for the view the switch is on:
 * the admin's own week, or the team's cards.
 */
export function DashboardSkeleton({ view }: { view: "mine" | "team" }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <SkeletonGroup style={styles.page}>
      {view === "mine" ? (
        <ScheduleMeSkeleton inGroup />
      ) : (
        <>
          <DashboardHeroSkeleton />
          <DashboardCardSkeleton rows={3} variant="text" />
          <DashboardCardSkeleton rows={3} variant="figure" />
          <DashboardCardSkeleton rows={3} variant="feed" />
        </>
      )}
    </SkeletonGroup>
  );
}

/**
 * The expanded single-metric routes under `home/`, as `DashboardListSection`
 * draws them: a count caption over one grouped card of hairline-split rows.
 * Their filter lives in the navigation bar, so nothing stands in for it here.
 */
export function DashboardListSkeleton({
  rows,
  variant = "figure",
}: {
  /** Defaults to enough rows to reach the bottom of the screen. */
  rows?: number;
  variant?: DashboardRowVariant;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  // Two lines at the list row's padding; the reserved height is the native
  // header and the caption above the card.
  const fillRows = useSkeletonFillCount(
    mobileListRow.paddingVertical * 2 + mobileText.body.lineHeight + mobileText.caption.lineHeight,
    160,
  );
  const rowCount = rows ?? fillRows;

  return (
    <SkeletonGroup style={styles.expandedPage}>
      <SkeletonLine style={styles.expandedCaption} variant="meta" width={72} />
      <View style={styles.expandedSurface}>
        {skeletonRows(rowCount, (index) => (
          <View key={`expanded-row-${index}`}>
            {index > 0 ? <View style={styles.rowDivider} /> : null}
            <DashboardRow variant={variant} />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    // A percentage-wide line inside a row has no width of its own to take a
    // percentage of; growing the wrapper gives it the row's free space.
    grow: {
      flex: 1,
    },
    page: {
      gap: mobileSpacing.sectionGap,
    },
    cardGroup: {
      gap: mobileSpace.sm,
    },
    // Inset to the card's text on device, as `DashboardCard`'s header is.
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: mobileSpace.md,
      paddingHorizontal: IS_NATIVE_LIST ? mobileSpace.lg : 0,
    },
    heroCoverage: {
      gap: mobileSpace.sm,
    },
    heroFigureRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: mobileSpace.md,
    },
    heroTrack: {
      height: 8,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.skeletonBase,
    },
    heroStatRow: {
      flexDirection: "row",
      gap: mobileSpace.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: mobileSpace.lg,
    },
    heroStat: {
      flex: 1,
      alignItems: "center",
      gap: mobileSpace.xs,
    },
    heroBreakdown: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: mobileSpace.xs,
      marginBottom: -mobileSpace.sm,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
    },
    rowCopy: {
      flex: 1,
      gap: mobileListRow.titleGap,
    },
    // Every row variant sits at the real rows' vertical padding, so the
    // placeholder list is as tall as the list it stands in for.
    textRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.sm,
      paddingVertical: mobileListRow.paddingVertical,
    },
    figure: {
      alignItems: "flex-end",
      gap: mobileSpace.xs,
    },
    chevron: {
      backgroundColor: mobileColors.skeletonBase,
      borderRadius: 2,
      height: 16,
      width: 8,
    },
    meterRow: {
      gap: mobileSpace.sm,
      paddingVertical: mobileListRow.paddingVertical,
    },
    meterHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.sm,
      justifyContent: "space-between",
    },
    meterTrack: {
      backgroundColor: mobileColors.skeletonBase,
      borderRadius: mobileRadii.pill,
      height: 6,
    },
    feedRow: {
      gap: mobileListRow.titleGap,
      paddingVertical: mobileListRow.paddingVertical,
    },
    // `DashboardListSection`'s group, caption and surface.
    expandedPage: {
      gap: mobileSpace.sm,
      paddingTop: mobileSpace.md,
    },
    expandedCaption: {
      marginHorizontal: mobileSpace.lg,
    },
    expandedSurface: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: mobileSpace.lg,
      overflow: "hidden",
    },
  });
