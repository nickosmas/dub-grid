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

/** What a card is about, which is what colours it. */
export type DashboardCardTone = "neutral" | "brand" | "success" | "warning" | "danger";

/**
 * A dashboard card in the Apple Health idiom: the surface washed with its
 * context colour and haloed by a soft glow of the same colour, so the page
 * says at a glance what is healthy and what needs a hand. The title sits
 * inside the card as a small "Title ›" row that opens the full screen, the
 * figures inside are the content, and an optional sentence closes the card
 * under a hairline.
 *
 * Neutral cards keep the plain surface and the ordinary card shadow; colour
 * is reserved for a card that has something to say.
 */
export function DashboardCard({
  title,
  tone = "neutral",
  onOpen,
  summary,
  children,
}: {
  title: string;
  tone?: DashboardCardTone;
  /** Opens the full screen behind the card; renders the title as a link with a chevron. */
  onOpen?: () => void;
  /** A one-sentence reading of the card's figures, under a hairline at the bottom. */
  summary?: string;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const palette = useMemo(() => createTonePalette(mobileColors, isDark), [mobileColors, isDark])[
    tone
  ];

  const header = (
    <View style={styles.titleRow}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {onOpen ? <Ionicons color={mobileColors.textMuted} name="chevron-forward" size={16} /> : null}
    </View>
  );

  return (
    <View
      style={[
        styles.glow,
        tone === "neutral"
          ? mobileElevation("card", isDark)
          : { boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 26, color: palette.glow }] },
      ]}
    >
      <View style={[styles.surface, { backgroundColor: palette.fill }]}>
        {onOpen ? (
          <Pressable
            accessibilityLabel={`See all: ${title}`}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onOpen}
            style={({ pressed }) => [styles.titlePressable, pressed && styles.titlePressed]}
          >
            {header}
          </Pressable>
        ) : (
          header
        )}
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
  );
}

/** `#rrggbb` at an alpha, for a shadow colour the tone supplies. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Dark mode leans harder on the glow, since a tinted fill barely separates
// from a near-black page and the halo is what carries the colour there.
function createTonePalette(
  mobileColors: MobileColors,
  isDark: boolean,
): Record<DashboardCardTone, { fill: string; glow: string }> {
  const alpha = isDark ? 0.45 : 0.2;
  return {
    neutral: { fill: mobileColors.surface, glow: "transparent" },
    brand: { fill: mobileColors.brandSoft, glow: withAlpha(mobileColors.brand, alpha) },
    success: { fill: mobileColors.successSoft, glow: withAlpha(mobileColors.success, alpha) },
    warning: { fill: mobileColors.warningSoft, glow: withAlpha(mobileColors.warning, alpha) },
    danger: { fill: mobileColors.dangerSoft, glow: withAlpha(mobileColors.danger, alpha) },
  };
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    // The halo: a wide, soft `boxShadow` in the tone's colour, which both
    // platforms draw the same way. A neutral card keeps the ordinary lift.
    glow: {
      borderRadius: mobileRadii.card,
    },
    surface: {
      borderRadius: mobileRadii.card,
      // Dark mode keeps the hairline, where a shadow alone cannot draw an edge.
      borderWidth: isDark ? 1 : 0,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.lg,
      overflow: "hidden",
    },
    titlePressable: {
      alignSelf: "flex-start",
    },
    titlePressed: {
      opacity: 0.6,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.xs,
      marginBottom: mobileSpace.sm,
    },
    title: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
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
