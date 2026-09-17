import { useMemo, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "../../../shared/components/Pressable";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileElevation,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * Whether a section needs a hand, which is the only thing that colours the
 * page: red for something broken, amber for something waiting on a decision.
 * Healthy and informational sections stay neutral, so the absence of colour
 * is the good news and the page never reads as a rainbow. There is
 * deliberately no green and no blue. Read by `StatusGradient`, not by the
 * card itself.
 */
export type DashboardCardTone = "neutral" | "warning" | "danger";

/**
 * A dashboard card in the Apple Health idiom: a plain surface on a page whose
 * colour says what needs a hand. The colour is not the card's: it is one
 * vertical wash behind the whole column (`StatusGradient`), which passes
 * through each card's tone at that card's height. The title sits above the
 * surface with "See all ›" beside it, as every dashboard card has read; the
 * figures inside are the content, and an optional sentence closes the card
 * under a hairline.
 *
 * Neutral cards keep the ordinary card shadow; colour is reserved for a card
 * that has something to say.
 */
export function DashboardCard({
  title,
  onOpen,
  summary,
  children,
}: {
  title: string;
  /** Opens the full screen behind the card; renders the title as a link with a chevron. */
  onOpen?: () => void;
  /** A one-sentence reading of the card's figures, under a hairline at the bottom. */
  summary?: string;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.group}>
      <View style={styles.header}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {onOpen ? (
          <Pressable
            accessibilityLabel={`See all: ${title}`}
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            onPress={onOpen}
            style={({ pressed }) => [styles.seeAll, pressed && styles.seeAllPressed]}
          >
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.seeAllLabel}>
              See all
            </Text>
            <Ionicons color={mobileColors.brand} name="chevron-forward" size={14} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.frame}>
        <View style={[styles.glow, mobileElevation("card", isDark)]}>
          <View style={styles.surface}>
            <View style={styles.body}>{children}</View>
            {summary ? (
              <View style={styles.summary}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.summaryText}>
                  {summary}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    frame: {},
    // The halo: a wide, soft `boxShadow` in the tone's colour, which both
    // platforms draw the same way. A neutral card keeps the ordinary lift.
    glow: {
      borderRadius: mobileRadii.card,
    },
    surface: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      // Dark mode keeps the hairline, where a shadow alone cannot draw an edge.
      borderWidth: isDark ? 1 : 0,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.lg,
      overflow: "hidden",
    },
    group: {
      gap: mobileSpace.sm,
    },
    // The heading over its surface, as the shared Card draws it.
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: mobileSpace.md,
    },
    title: {
      ...mobileText.title,
      color: mobileColors.textPrimary,
      flex: 1,
    },
    seeAll: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.xs,
      paddingVertical: mobileSpace.xs,
    },
    seeAllPressed: {
      opacity: 0.6,
    },
    seeAllLabel: {
      ...mobileText.label,
      color: mobileColors.brand,
    },
    body: {
      gap: mobileSpace.md,
    },
    summary: {
      marginTop: mobileSpace.lg,
      paddingTop: mobileSpace.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
    },
    summaryText: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
    },
  });
