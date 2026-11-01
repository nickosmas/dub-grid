import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { CONTENT_UNAVAILABLE_ICON_SIZE } from "./ContentUnavailable";
import { fillScreenAnchorStyles } from "./fill-screen-anchor";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileText, type MobileColors, mobileSpace } from "../theme/tokens";

/**
 * Empty states are centred: a symbol, then the copy, then the way out.
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
 * The symbol is plain, in the secondary colour, as iOS's
 * ContentUnavailableView and Material's empty state draw it: a disc behind it
 * read as a drawn badge rather than the system's own empty page.
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
      <Ionicons
        color={mobileColors.textSubtle}
        name={iconName}
        size={compact ? COMPACT_ICON_SIZE : CONTENT_UNAVAILABLE_ICON_SIZE}
      />
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

const COMPACT_ICON_SIZE = 32;

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
    copy: {
      gap: mobileSpace.sm,
      alignItems: "center",
    },
    title: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
      textAlign: "center",
    },
    body: {
      ...mobileText.body,
      color: mobileColors.textSubtle,
      textAlign: "center",
      maxWidth: 320,
    },
    actionRow: {
      alignItems: "center",
    },
  });

// Inside a card: a smaller symbol and copy than the full-page variant, and no
// panel of its own, because the card is the container.
const createCompactStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    card: {
      // No panel. The card this sits in is already a bounded, lifted surface,
      // so a second box drawn inside it reads as an outline sticker rather than
      // as structure. The centring and the symbol carry the shape instead.
      paddingHorizontal: 4,
      paddingVertical: 24,
      gap: 12,
      alignItems: "center",
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
