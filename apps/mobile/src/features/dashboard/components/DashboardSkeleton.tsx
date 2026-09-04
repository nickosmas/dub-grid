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
  mobileRadii,
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
          <SkeletonLine variant="screenTitle" width={titleWidth} />
        </View>
      </View>
      <SkeletonCardSurface>
        <View style={styles.cardList}>
          {skeletonRows(rows, (index) => (
            <DashboardRow key={`dashboard-row-${index}`} variant={variant} />
          ))}
        </View>
      </SkeletonCardSurface>
    </View>
  );
}

/** The hero card: period toggle, headline, and the three metric tiles. */
function DashboardHeroSkeleton() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.heroCard}>
      <View style={styles.heroCopy}>
        <SkeletonPill height={22} width={92} />
        <SkeletonLine variant="sectionTitle" width={180} />
      </View>
      <View style={styles.tileRow}>
        {skeletonRows(3, (index) => (
          <View key={`hero-tile-${index}`} style={styles.tile}>
            <View style={styles.tileHeader}>
              <SkeletonLine variant="caption" width="64%" />
              <SkeletonCircle size={26} style={styles.tileIcon} />
            </View>
            <SkeletonLine variant="heroMetric" width="52%" />
            <SkeletonLine variant="caption" width="80%" />
          </View>
        ))}
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
          <SkeletonLine variant="screenTitle" width="42%" />
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
      {showActionQueue ? <DashboardCardSkeleton rows={2} variant="badgeLead" /> : null}
      {showMySchedule ? <MyScheduleSkeleton /> : null}
      <DashboardCardSkeleton rows={3} variant="meter" />
      <DashboardCardSkeleton rows={2} variant="trailingBadges" />
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
      <SkeletonLine variant="screenTitle" width="58%" />
      <SkeletonLine variant="body" width="74%" />
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
      gap: 4,
    },
    heroCard: {
      backgroundColor: isDark ? mobileColors.surfaceSecondary : mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: mobileSpace.lg,
      padding: mobileSpace.xl,
      ...mobileElevation("card", isDark),
    },
    heroCopy: {
      gap: 6,
    },
    tileRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    tile: {
      // Delineated by a hairline, not by a fill or a shadow. An inner section
      // still needs an edge to read as its own group, but it sits on a card
      // that is already lifted — a second shadow there muddies the first, and a
      // tinted fill puts grey back on a white card. `control` radius rather
      // than `card`: a nested corner needs a tighter curve than its container's
      // to read as concentric.
      flexBasis: "30%",
      flexGrow: 1,
      gap: 6,
      minWidth: 0,
      overflow: "hidden",
      padding: 12,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
    },
    tileHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 6,
      justifyContent: "space-between",
    },
    tileIcon: {
      marginRight: -4,
      marginTop: -4,
    },
    cardGroup: {
      gap: mobileSpace.md,
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
    cardList: {
      gap: 10,
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    badgeLeadRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    trailingBadgesRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    meterRow: {
      gap: 6,
    },
    meterHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    meterTrack: {
      backgroundColor: mobileColors.skeletonBase,
      borderRadius: 3,
      height: 6,
    },
    feedRow: {
      gap: 4,
    },
    feedHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    dayStrip: {
      flexDirection: "row",
      gap: 10,
      overflow: "hidden",
    },
    dayCard: {
      // Delineated by a hairline, not by a fill or a shadow. An inner section
      // still needs an edge to read as its own group, but it sits on a card
      // that is already lifted — a second shadow there muddies the first, and a
      // tinted fill puts grey back on a white card. `control` radius rather
      // than `card`: a nested corner needs a tighter curve than its container's
      // to read as concentric.
      gap: 8,
      minWidth: 124,
      padding: 12,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
    },
    shiftPill: {
      backgroundColor: mobileColors.skeletonBase,
      borderRadius: 6,
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
