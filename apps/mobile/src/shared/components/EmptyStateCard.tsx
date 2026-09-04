import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { fillScreenAnchorStyles } from "./fill-screen-anchor";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileText, type MobileColors } from "../theme/tokens";

/**
 * Empty states are centred: an icon badge, then the copy, then the way out.
 *
 * `iconName` is required rather than defaulted. The default used to be
 * `sparkles-outline`, which is how the "AI" sparkle reached every screen that
 * forgot to pass one — a decorative glyph nothing in the product earns.
 * `design/no-decorative-ai-icons` now fails the build on it, and the prop stays
 * required so an empty state always names what it stands for.
 *
 * `compact` renders inside a card. Neither variant draws a panel of its own:
 * the card is already a bounded, lifted surface, so a box inside it reads as an
 * outline sticker rather than as structure.
 *
 * The badge differs by variant on purpose. In a card it is a small neutral disc
 * with a muted glyph, so it reads as a quiet placeholder inside an otherwise
 * busy dashboard. A full-page empty is the only thing on screen and is the
 * moment to be direct, so it keeps the larger brand badge.
 */
export function EmptyStateCard({
  iconName,
  title,
  body,
  actionLabel,
  onAction,
  actionVariant = "button",
  compact = false,
  fillScreen = false,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * `"link"` renders the action as underlined-weight text with a trailing
   * arrow instead of a filled pill — for a card whose empty state points at a
   * fuller view of the same thing ("View full schedule") rather than asking
   * for a new action.
   */
  actionVariant?: "button" | "link";
  compact?: boolean;
  fillScreen?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const compactStyles = useMemo(() => createCompactStyles(mobileColors), [mobileColors]);
  const variant = compact ? compactStyles : styles;
  // `Screen`'s `contentContainerStyle` carries `flexGrow: 1`, so `flex: 1` here
  // claims the viewport's leftover space even inside a scroll view, and the two
  // spacers place the message within it. See `fill-screen-anchor` for why not
  // dead centre.
  const isFilling = !compact && fillScreen;
  return (
    <View style={[variant.card, isFilling ? fillScreenAnchorStyles.fill : null]}>
      {isFilling ? <View style={fillScreenAnchorStyles.spacerAbove} /> : null}
      <View style={variant.iconFrame}>
        <Ionicons
          color={compact ? mobileColors.textMuted : mobileColors.brand}
          name={iconName}
          size={compact ? 22 : 28}
        />
      </View>
      <View style={variant.copy}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={variant.title}>
          {title}
        </Text>
        {body ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={variant.body}>
            {body}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <View style={variant.actionRow}>
          {actionVariant === "link" ? (
            <Button
              compact
              icon="arrow-forward"
              iconPosition="trailing"
              label={actionLabel}
              onPress={onAction}
              tone="link"
            />
          ) : (
            <Button compact label={actionLabel} onPress={onAction} tone="secondary" />
          )}
        </View>
      ) : null}
      {isFilling ? <View style={fillScreenAnchorStyles.spacerBelow} /> : null}
    </View>
  );
}

// Owns the page: sits on the ground itself, with no panel behind it.
const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    card: {
      // No panel. This sits inside a card, and information belongs directly on
      // that card's surface rather than in a box drawn on top of it. The
      // centring below is what keeps it deliberate now that nothing bounds it.
      paddingHorizontal: 4,
      paddingVertical: 32,
      gap: 16,
      alignItems: "center",
    },
    iconFrame: {
      width: 60,
      height: 60,
      // A circle, matching the in-card badge. Empty-state badges are round
      // across both variants; the rounded square stays the card *header's*
      // shape (`cardIconFrame`), where it reads as chrome rather than content.
      borderRadius: 30,
      backgroundColor: mobileColors.brandSoft,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    copy: {
      gap: 6,
      alignItems: "center",
    },
    title: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
      textAlign: "center",
    },
    body: {
      ...mobileText.body,
      color: mobileColors.textMuted,
      textAlign: "center",
      maxWidth: 320,
    },
    actionRow: {
      alignItems: "center",
    },
  });

// Inside a card: smaller badge and copy than the full-page variant, and no
// panel of its own, because the card is the container.
const createCompactStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    card: {
      // No panel. The card this sits in is already a bounded, lifted surface,
      // so a second box drawn inside it reads as an outline sticker rather than
      // as structure. The centring and the badge carry the shape instead.
      paddingHorizontal: 4,
      paddingVertical: 24,
      gap: 12,
      alignItems: "center",
    },
    iconFrame: {
      width: 48,
      height: 48,
      borderRadius: 24,
      // Filled rather than outlined. With the panel gone there is no nearby
      // edge for a hairline to echo, and the card's own surface colour would
      // leave a white disc invisible on a white card.
      backgroundColor: mobileColors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    copy: {
      gap: 4,
      alignItems: "center",
    },
    title: {
      ...mobileText.bodyStrong,
      color: mobileColors.textPrimary,
      textAlign: "center",
    },
    body: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      textAlign: "center",
      maxWidth: 260,
    },
    actionRow: {
      alignItems: "center",
    },
  });
