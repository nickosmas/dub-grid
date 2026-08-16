import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonCircle,
  SkeletonGroup,
  SkeletonIcon,
  SkeletonLine,
  SkeletonPill,
  skeletonRows,
} from "../../../shared/components/skeleton";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileSpacing, type MobileColors } from "../../../shared/theme/tokens";

/** `avatar` in ProfilePrimitives. */
const AVATAR_SIZE = 64;
/** `iconBadge` in ProfilePrimitives. */
const ICON_BADGE_SIZE = 32;

/** The row shapes the profile screens build their framed lists from. */
type ProfileRowVariant =
  /** ProfileInfoRow: icon badge, small label above a value. */
  | "info"
  /** ProfileNavRow: icon badge, single label, trailing chevron. */
  | "nav"
  /** A settings toggle: title and caption with a switch on the right. */
  | "toggle";

function ProfileRow({ variant }: { variant: ProfileRowVariant }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  if (variant === "toggle") {
    return (
      <View style={styles.toggleRow}>
        <View style={styles.rowCopy}>
          <SkeletonLine variant="cardTitle" width="58%" />
          <SkeletonLine variant="caption" width="82%" />
        </View>
        {/* The Switch primitive's track. */}
        <SkeletonPill height={31} width={51} />
      </View>
    );
  }

  if (variant === "nav") {
    return (
      <View style={[styles.row, styles.navRow]}>
        <SkeletonIcon size={ICON_BADGE_SIZE} />
        <View style={styles.rowCopy}>
          <SkeletonLine variant="cardTitle" width="52%" />
        </View>
        <SkeletonLine variant="body" width={12} />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <SkeletonIcon size={ICON_BADGE_SIZE} />
      <View style={styles.rowCopy}>
        <SkeletonLine variant="caption" width="34%" />
        <SkeletonLine variant="rowTitle" width="64%" />
      </View>
    </View>
  );
}

/** The hero: avatar, name, badge, subtitle and the wrapped meta grid. */
function ProfileHeroSkeleton({
  metaItems,
  showIdentity,
  showTitle,
}: {
  metaItems: number;
  showIdentity: boolean;
  showTitle: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.hero}>
      {showTitle ? <SkeletonLine variant="screenTitle" width="56%" /> : null}
      {showIdentity ? (
        <View style={styles.heroTop}>
          <SkeletonCircle size={AVATAR_SIZE} />
          <View style={styles.heroCopy}>
            <View style={styles.heroTitleRow}>
              <SkeletonLine variant="screenTitle" width="52%" />
              <SkeletonPill height={26} width={62} />
            </View>
            <SkeletonLine variant="body" width="64%" />
          </View>
        </View>
      ) : null}
      {metaItems > 0 ? (
        <View style={styles.heroDetail}>
          {skeletonRows(metaItems, (index) => (
            <View key={`profile-meta-${index}`} style={styles.heroMetaItem}>
              <SkeletonLine variant="caption" width="56%" />
              <SkeletonLine variant="rowTitle" width="78%" />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The placeholder every profile-shaped screen uses: the user's own profile,
 * a teammate's detail page, and the three profile settings screens.
 *
 * Built from the same vocabulary as `ProfilePrimitives` — a 64pt avatar hero,
 * a wrapped meta grid, then framed 16-radius lists of 66pt rows — because that
 * is what actually replaces it. The generic detail skeleton it supersedes drew
 * none of the frames and sized the avatar as a 56×64 rectangle.
 */
export function ProfileSkeleton({
  sections = 3,
  rowsPerSection = 3,
  metaItems = 4,
  showHero = true,
  showHeroIdentity = true,
  showTitle = false,
  showQuickActions = false,
  rowVariant = "info",
}: {
  sections?: number;
  rowsPerSection?: number;
  metaItems?: number;
  showHero?: boolean;
  /**
   * Off for a screen whose `ProfileHero` is the meta grid alone — the person
   * detail page passes no `initials`, `title` or `badge`, so drawing an avatar
   * and a name here would promise a block that never arrives.
   */
  showHeroIdentity?: boolean;
  /**
   * Stands in for a native header title that is itself data.
   *
   * The platform's title is a string on the navigation item, not a view, so a
   * placeholder cannot be drawn in the bar — the page draws it instead, and the
   * screen leaves the real title empty until the name resolves.
   */
  showTitle?: boolean;
  showQuickActions?: boolean;
  rowVariant?: ProfileRowVariant;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <SkeletonGroup style={styles.page}>
      {showHero ? (
        <ProfileHeroSkeleton
          metaItems={metaItems}
          showIdentity={showHeroIdentity}
          showTitle={showTitle}
        />
      ) : null}
      {showQuickActions ? (
        <View style={styles.quickActions}>
          <SkeletonPill height={36} width={112} />
          <SkeletonPill height={36} width={96} />
          <SkeletonPill height={36} width={88} />
        </View>
      ) : null}
      {skeletonRows(sections, (sectionIndex) => (
        <View key={`profile-section-${sectionIndex}`} style={styles.section}>
          <SkeletonLine variant="label" width="26%" />
          <View style={styles.list}>
            {skeletonRows(rowsPerSection, (rowIndex) => (
              <View
                key={`profile-row-${sectionIndex}-${rowIndex}`}
                style={rowIndex < rowsPerSection - 1 ? styles.rowDivider : null}
              >
                <ProfileRow variant={rowVariant} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    page: {
      gap: mobileSpacing.sectionGap,
    },
    hero: {
      gap: 14,
      paddingTop: 4,
    },
    heroTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 14,
    },
    heroCopy: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    heroTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      minWidth: 0,
    },
    heroDetail: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    heroMetaItem: {
      flex: 1,
      gap: 3,
      minWidth: 120,
    },
    quickActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      paddingBottom: 16,
    },
    section: {
      gap: 10,
    },
    list: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      overflow: "hidden",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      minHeight: 66,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    navRow: {
      minHeight: 70,
    },
    toggleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 16,
      justifyContent: "space-between",
      padding: 16,
    },
    rowDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowCopy: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
  });
