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
import { ProfileQuickActions, type ProfileHeroAlign } from "./ProfilePrimitives";

/** `avatar` in ProfilePrimitives. */
const AVATAR_SIZE = 64;
/** `avatar` + `avatarLarge`, the size a centered hero's avatar takes. */
const CENTERED_AVATAR_SIZE = 96;
/** `iconBadge` in ProfilePrimitives. */
const ICON_BADGE_SIZE = 32;

/** The row shapes the profile screens build their framed lists from. */
export type ProfileRowVariant =
  /** ProfileInfoRow: icon badge, small label above a value. */
  | "info"
  /** ProfileNavRow: icon badge, single label, trailing chevron. */
  | "nav"
  /** A settings toggle: title and caption with a switch on the right. */
  | "toggle"
  /** A signed-in device: round platform badge, a title over three lines, a chevron. */
  | "session";

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

  if (variant === "session") {
    return (
      <View style={[styles.row, styles.sessionRow]}>
        <SkeletonCircle size={36} />
        <View style={styles.rowCopy}>
          <SkeletonLine variant="rowTitle" width="48%" />
          <SkeletonLine variant="caption" width="40%" />
          <SkeletonLine variant="caption" width="34%" />
          <SkeletonLine variant="caption" width="44%" />
        </View>
        <SkeletonLine variant="body" width={12} />
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

/** The hero: avatar, name, subtitle and the wrapped meta grid. */
function ProfileHeroSkeleton({
  align,
  metaItems,
  subtitle,
}: {
  align: ProfileHeroAlign;
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
        // Fixed widths here: the centred column is content-sized, so a
        // percentage line has nothing to be a percentage of and collapsed to
        // a stub beside the avatar.
        <>
          <SkeletonCircle size={CENTERED_AVATAR_SIZE} />
          <SkeletonLine variant="screenTitle" width={168} />
          {subtitle ? <SkeletonLine variant="body" width={208} /> : null}
        </>
      ) : (
        <View style={styles.heroTop}>
          <SkeletonCircle size={AVATAR_SIZE} />
          <View style={styles.heroCopy}>
            <SkeletonLine variant="screenTitle" width="52%" />
            <SkeletonLine variant="body" width="64%" />
          </View>
        </View>
      )}
      {/* The profile's "Joined" line under the name. */}
      {isCentered && subtitle ? <SkeletonLine variant="caption" width={128} /> : null}
      {metaItems > 0 ? (
        <View style={[styles.heroDetail, isCentered && styles.heroDetailCentered]}>
          {skeletonRows(metaItems, (index) => (
            <View
              key={`profile-meta-${index}`}
              style={[styles.heroMetaItem, isCentered && styles.heroMetaItemCentered]}
            >
              <SkeletonLine variant="caption" width={isCentered ? 72 : "56%"} />
              <SkeletonLine variant="rowTitle" width={isCentered ? 112 : "78%"} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** One framed list: how many rows it holds and what shape they take. */
export type ProfileSectionSkeleton = {
  rows: number;
  rowVariant?: ProfileRowVariant;
};

/** The real row's icon-only circle: `Button` at `size="md"`. */
const QUICK_ACTION_SIZE = 44;

/**
 * The placeholder every profile-shaped screen uses: the user's own profile,
 * a teammate's detail page, and the three profile settings screens.
 *
 * Built from the same vocabulary as `ProfilePrimitives` — a 64pt avatar hero
 * (96pt where the real one is centered), a wrapped meta grid, then framed
 * 16-radius lists of 66pt rows — because that is what actually replaces it. The
 * generic detail skeleton it supersedes drew none of the frames and sized the
 * avatar as a 56×64 rectangle.
 *
 * The screen decides the silhouette, and it must decide it per viewer: a
 * teammate's page shows a manager three lists and three actions, and a
 * colleague one list and no actions, so a skeleton drawn for the manager
 * promised the colleague sections that never arrived.
 */
export function ProfileSkeleton({
  sections = 3,
  rowsPerSection = 3,
  metaItems = 4,
  heroAlign = "row",
  heroSubtitle = false,
  showHero = true,
  quickActions = 0,
  rowVariant = "info",
}: {
  /** A count of uniform lists, or one entry per list when their shapes differ. */
  sections?: number | ProfileSectionSkeleton[];
  rowsPerSection?: number;
  metaItems?: number;
  /** Match the screen's own `ProfileHero`, or the silhouette shifts on load. */
  heroAlign?: ProfileHeroAlign;
  /** On where the centered hero carries a subtitle under the name. */
  heroSubtitle?: boolean;
  showHero?: boolean;
  /** Icon circles in the action row under the hero; 0 leaves the row out. */
  quickActions?: number;
  rowVariant?: ProfileRowVariant;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const sectionSpecs: ProfileSectionSkeleton[] =
    typeof sections === "number"
      ? Array.from({ length: sections }, () => ({ rows: rowsPerSection, rowVariant }))
      : sections;

  return (
    <SkeletonGroup style={styles.page}>
      {showHero ? (
        <ProfileHeroSkeleton align={heroAlign} metaItems={metaItems} subtitle={heroSubtitle} />
      ) : null}
      {/* The real row, so the circles sit where the actions will. */}
      {quickActions > 0 ? (
        <ProfileQuickActions accessibilityLabel="Loading actions" scrollEnabled={false}>
          {skeletonRows(quickActions, (index) => (
            <SkeletonPill
              height={QUICK_ACTION_SIZE}
              key={`profile-action-${index}`}
              width={QUICK_ACTION_SIZE}
            />
          ))}
        </ProfileQuickActions>
      ) : null}
      {sectionSpecs.map((section, sectionIndex) => (
        <View key={`profile-section-${sectionIndex}`} style={styles.section}>
          <SkeletonLine style={styles.sectionTitle} variant="sectionTitle" width="30%" />
          <View style={styles.list}>
            <View style={styles.listClip}>
              {skeletonRows(section.rows, (rowIndex) => (
                <View
                  key={`profile-row-${sectionIndex}-${rowIndex}`}
                  style={rowIndex < section.rows - 1 ? styles.rowDivider : null}
                >
                  <ProfileRow variant={section.rowVariant ?? rowVariant} />
                </View>
              ))}
            </View>
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
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
    // The real row's 112pt floor, so a device list stands in at full height.
    sessionRow: {
      minHeight: 112,
      alignItems: "flex-start",
    },
    section: {
      gap: mobileSpace.md,
    },
    // Mirrors `ProfileSection`'s title: 16pt medium, inset from the card and
    // with room above it. A margin, not padding: `SkeletonLine` fixes its
    // height to the line, so padding would push the bar out of the box.
    sectionTitle: {
      paddingHorizontal: mobileSpace.lg,
      marginTop: mobileSpace.sm,
    },
    // The clip sits on an inner view: iOS drops a view's own shadow when the
    // same view clips its children, so the shadow-casting list stays unclipped
    // and the rows are clipped to the corners one level down.
    list: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      ...mobileElevation("card", isDark),
    },
    listClip: {
      overflow: "hidden",
      borderRadius: mobileRadii.card - 1,
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
