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
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileElevation,
  mobileRadii,
  mobileSpacing,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";
import type { ProfileHeroAlign } from "./ProfilePrimitives";

/** `avatar` in ProfilePrimitives. */
const AVATAR_SIZE = 64;
/** `avatar` + `avatarLarge`, the size a centered hero's avatar takes. */
const CENTERED_AVATAR_SIZE = 96;
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
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

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
  align,
  chips,
  metaItems,
  subtitle,
}: {
  align: ProfileHeroAlign;
  chips: number;
  metaItems: number;
  subtitle: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const isCentered = align === "center";

  return (
    <View style={[styles.hero, isCentered && styles.heroCentered]}>
      {isCentered ? (
        <>
          <SkeletonCircle size={CENTERED_AVATAR_SIZE} />
          <SkeletonLine variant="screenTitle" width="54%" />
          {subtitle ? <SkeletonLine variant="body" width="46%" /> : null}
        </>
      ) : (
        <View style={styles.heroTop}>
          <SkeletonCircle size={AVATAR_SIZE} />
          <View style={styles.heroCopy}>
            <View style={styles.heroTitleRow}>
              <SkeletonLine variant="screenTitle" width="52%" style={styles.grow} />
              <SkeletonPill height={26} width={62} />
            </View>
            <SkeletonLine variant="body" width="64%" />
          </View>
        </View>
      )}
      {chips > 0 ? (
        <View style={styles.heroChips}>
          {skeletonRows(chips, (index) => (
            <SkeletonPill
              height={26}
              key={`profile-chip-${index}`}
              width={index === 0 ? 104 : 136}
            />
          ))}
        </View>
      ) : null}
      {metaItems > 0 ? (
        <View style={[styles.heroDetail, isCentered && styles.heroDetailCentered]}>
          {skeletonRows(metaItems, (index) => (
            <View
              key={`profile-meta-${index}`}
              style={[styles.heroMetaItem, isCentered && styles.heroMetaItemCentered]}
            >
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
 * Built from the same vocabulary as `ProfilePrimitives` — a 64pt avatar hero
 * (96pt where the real one is centered), a wrapped meta grid, then framed
 * 16-radius lists of 66pt rows — because that is what actually replaces it. The
 * generic detail skeleton it supersedes drew none of the frames and sized the
 * avatar as a 56×64 rectangle.
 */
export function ProfileSkeleton({
  sections = 3,
  rowsPerSection = 3,
  metaItems = 4,
  heroAlign = "row",
  heroChips = 0,
  heroSubtitle = false,
  showHero = true,
  showQuickActions = false,
  rowVariant = "info",
}: {
  sections?: number;
  rowsPerSection?: number;
  metaItems?: number;
  /** Match the screen's own `ProfileHero`, or the silhouette shifts on load. */
  heroAlign?: ProfileHeroAlign;
  /** Chips the hero prints under the name, drawn as a centered pill row. */
  heroChips?: number;
  /** On where the centered hero carries a subtitle under the name. */
  heroSubtitle?: boolean;
  showHero?: boolean;
  showQuickActions?: boolean;
  rowVariant?: ProfileRowVariant;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <SkeletonGroup style={styles.page}>
      {showHero ? (
        <ProfileHeroSkeleton
          align={heroAlign}
          chips={heroChips}
          metaItems={metaItems}
          subtitle={heroSubtitle}
        />
      ) : null}
      {showQuickActions ? (
        <View style={[styles.quickActions, heroAlign === "center" && styles.quickActionsCentered]}>
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
    hero: {
      gap: mobileSpace.md,
      paddingTop: 4,
    },
    heroCentered: {
      alignItems: "center",
      paddingTop: 8,
    },
    heroChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "center",
    },
    heroTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
    },
    heroCopy: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 0,
    },
    heroTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      minWidth: 0,
    },
    heroDetail: {
      alignSelf: "stretch",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: mobileSpace.md,
    },
    heroDetailCentered: {
      justifyContent: "center",
    },
    heroMetaItem: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 120,
    },
    heroMetaItemCentered: {
      alignItems: "center",
    },
    quickActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: mobileSpace.md,
      paddingBottom: 16,
    },
    quickActionsCentered: {
      justifyContent: "center",
    },
    section: {
      gap: mobileSpace.md,
    },
    list: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      overflow: "hidden",
      ...mobileElevation("card", isDark),
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
      gap: mobileSpace.xs,
      minWidth: 0,
    },
  });
