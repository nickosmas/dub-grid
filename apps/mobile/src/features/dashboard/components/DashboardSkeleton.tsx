import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonCardSurface,
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  SkeletonPill,
  skeletonRows,
} from "../../../shared/components/skeleton";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileElevation,
  mobileListRow,
  mobileRadii,
  mobileRadius,
  mobileSpace,
  mobileSpacing,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * Row shapes the dashboard cards actually use. Each card renders one of these
 * repeatedly through `ExpandableList` at its 10pt gap.
 */
type DashboardRowVariant =
  /** ActionQueueCard: leading count badge, two stacked lines. */
  | "badgeLead"
  /** CoverageBySectionCard: label row above a 6pt progress track. */
  | "meter"
  /** OpenShiftsCard and StaffHoursCard: copy left, badges right. */
  | "trailingBadges"
  /** ActivityFeedCard: badge + timestamp header, then a body line. */
  | "feed";

function DashboardRow({ variant }: { variant: DashboardRowVariant }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (variant === "meter") {
    return (
      <View style={styles.meterRow}>
        <View style={styles.meterHeader}>
          <SkeletonLine variant="body" width="46%" />
          <SkeletonLine variant="caption" width={52} />
        </View>
        <View style={styles.meterTrack} />
      </View>
    );
  }

  if (variant === "feed") {
    return (
      <View style={styles.feedRow}>
        <View style={styles.feedHeader}>
          <SkeletonPill height={20} width={72} />
          <SkeletonLine variant="caption" width={64} />
        </View>
        <SkeletonLine variant="body" width="88%" />
      </View>
    );
  }

  if (variant === "badgeLead") {
    return (
      <View style={styles.badgeLeadRow}>
        <SkeletonPill height={22} width={34} />
        <View style={styles.rowCopy}>
          <SkeletonLine variant="body" width="70%" />
          <SkeletonLine variant="caption" width="45%" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.trailingBadgesRow}>
      <View style={styles.rowCopy}>
        <SkeletonLine variant="body" width="76%" />
        <SkeletonLine variant="caption" width="52%" />
      </View>
      <SkeletonPill height={22} width={44} />
    </View>
  );
}

/**
 * One dashboard card: the title above the surface, then N rows inside it.
 *
 * Mirrors the shared `Card`, whose header now sits above the white surface
 * rather than inside it.
 */
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

  return (
    <View style={styles.cardGroup}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderCopy}>
          <SkeletonLine variant="title" width={titleWidth} />
        </View>
        <SkeletonLine variant="label" width={52} />
      </View>
      <SkeletonCardSurface>
        <View>
          {skeletonRows(rows, (index) => (
            <View key={`dashboard-row-${index}`}>
              {index > 0 ? <View style={styles.rowDivider} /> : null}
              <DashboardRow variant={variant} />
            </View>
          ))}
        </View>
      </SkeletonCardSurface>
    </View>
  );
}

/** The hero card: status pill, headline, the coverage figure over its meter, two chips. */
function DashboardHeroSkeleton() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.heroCard}>
      <View style={styles.heroCopy}>
        <SkeletonPill height={24} width={92} />
        <SkeletonLine variant="title" width={200} />
      </View>
      <View style={styles.heroCoverage}>
        <View style={styles.heroFigureRow}>
          <SkeletonLine variant="display" width={84} />
          <View style={styles.rowCopy}>
            <SkeletonLine variant="label" width={72} />
            <SkeletonLine variant="caption" width={140} />
          </View>
        </View>
        <View style={styles.heroTrack} />
      </View>
      <View style={styles.heroChipRow}>
        <SkeletonPill height={36} width={128} />
        <SkeletonPill height={36} width={160} />
      </View>
    </View>
  );
}

/** The horizontally scrolling day strip inside "Your schedule". */
function MyScheduleSkeleton() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.cardGroup}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderCopy}>
          <SkeletonLine variant="title" width="42%" />
        </View>
        {/* ExpandButton: iconOnly Button at size="sm" — 36pt circle. */}
        <SkeletonCircle size={36} />
      </View>
      <SkeletonCardSurface>
        <View style={styles.dayStrip}>
          {skeletonRows(3, (index) => (
            <View key={`schedule-day-${index}`} style={styles.dayCard}>
              <SkeletonLine variant="label" width="70%" />
              <View style={styles.shiftPill} />
            </View>
          ))}
        </View>
      </SkeletonCardSurface>
    </View>
  );
}

/**
 * The admin dashboard's placeholder, card for card.
 *
 * The greeting header is included because the real screen renders it in the
 * sticky header slot; the old skeleton dropped it, so the header appeared to
 * fly in after the rest of the page.
 */
export function DashboardSkeleton({
  showActionQueue = true,
  showMySchedule = true,
}: {
  showActionQueue?: boolean;
  showMySchedule?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <SkeletonGroup style={styles.page}>
      {/* PeriodToggle is a SegmentedControl at size="sm" — 36pt, pill. */}
      <SkeletonPill height={36} width={180} />
      <DashboardHeroSkeleton />
      {showActionQueue ? <DashboardCardSkeleton rows={3} variant="badgeLead" /> : null}
      {showMySchedule ? <MyScheduleSkeleton /> : null}
      <DashboardCardSkeleton rows={3} variant="meter" />
      <DashboardCardSkeleton rows={3} variant="trailingBadges" />
      <DashboardCardSkeleton rows={3} variant="trailingBadges" />
      <DashboardCardSkeleton rows={3} variant="feed" />
    </SkeletonGroup>
  );
}

/** The greeting block that sits in the screen's sticky header slot. */
export function DashboardHeaderSkeleton() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.header}>
      <SkeletonLine variant="display" width="58%" />
      <SkeletonLine variant="meta" width="74%" />
    </View>
  );
}

/**
 * The expanded single-metric routes under `home/`: a filter header, then a
 * borderless list at the real 16pt gap.
 */
export function DashboardListSkeleton({
  rows = 4,
  showFilterHeader = true,
  variant = "trailingBadges",
}: {
  rows?: number;
  showFilterHeader?: boolean;
  variant?: DashboardRowVariant;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <SkeletonGroup style={styles.expandedPage}>
      {showFilterHeader ? (
        <View style={styles.filterHeader}>
          <SkeletonLine variant="label" width={96} />
          <SkeletonPill height={36} width={112} />
        </View>
      ) : null}
      <View style={styles.expandedList}>
        {skeletonRows(rows, (index) => (
          <DashboardRow key={`expanded-row-${index}`} variant={variant} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    page: {
      gap: mobileSpacing.sectionGap,
    },
    header: {
      gap: mobileSpace.xs,
    },
    // Same geometry as DashboardHeroCard's own surface.
    heroCard: {
      backgroundColor: isDark ? mobileColors.surfaceSecondary : mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: isDark ? 1 : 0,
      gap: mobileSpace.lg,
      padding: mobileSpace.lg,
      ...mobileElevation("card", isDark),
    },
    heroCopy: {
      gap: mobileSpace.sm,
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
    heroChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: mobileSpace.sm,
    },
    cardGroup: {
      gap: mobileSpace.sm,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
    },
    cardHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
    },
    cardHeaderCopy: {
      flex: 1,
      justifyContent: "center",
    },
    rowCopy: {
      flex: 1,
      gap: mobileListRow.titleGap,
    },
    // Every row variant sits at the real rows' vertical padding, so the
    // placeholder list is as tall as the list it stands in for.
    badgeLeadRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.sm,
      paddingVertical: mobileListRow.paddingVertical,
    },
    trailingBadgesRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.sm,
      justifyContent: "space-between",
      paddingVertical: mobileListRow.paddingVertical,
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
    feedHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.sm,
      justifyContent: "space-between",
    },
    dayStrip: {
      flexDirection: "row",
      gap: 10,
      overflow: "hidden",
    },
    // Borderless, matching MyScheduleCard's day cards.
    dayCard: {
      gap: 8,
      minWidth: 124,
    },
    shiftPill: {
      backgroundColor: mobileColors.skeletonBase,
      borderRadius: mobileRadius.md,
      minHeight: 71,
      width: 124,
    },
    expandedPage: {
      gap: 14,
    },
    filterHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      paddingBottom: 4,
      paddingTop: 12,
    },
    expandedList: {
      gap: 16,
    },
  });
