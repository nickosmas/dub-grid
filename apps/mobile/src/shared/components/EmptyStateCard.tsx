import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { EmptyScene } from "./empty-scene/EmptyScene";
import type { EmptySceneKind } from "./empty-scene/scenes";
import type { EmptySceneDay } from "./empty-scene/day-scene";
import type { EmptySceneWeek } from "./empty-scene/week-scene";
import { fillScreenAnchorStyles } from "./fill-screen-anchor";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileText, type MobileColors, mobileSpace } from "../theme/tokens";

/**
 * Empty states are centred: a scene, then the copy, then the way out.
 *
 * Each empty state has its own scene (`empty-scene/scenes.ts`), drawn on the
 * "Empty states and skeletons" canvas, so the picture says what is missing.
 * An action belongs only where the next step is on this screen (owner,
 * 2026-11-03): clearing a filter, trying again.
 *
 * `compact` renders inside a card. Neither variant draws a panel of its own:
 * the card is already a bounded, lifted surface, so a box inside it reads as an
 * outline sticker rather than as structure.
 */
export function EmptyStateCard({
  scene,
  sceneWeek,
  sceneDay,
  title,
  body,
  actionLabel,
  onAction,
  actionVariant = "button",
  compact = false,
  fillScreen = false,
}: {
  scene: EmptySceneKind;
  /** The viewer's week, so a "this week" scene marks the right days. */
  sceneWeek?: EmptySceneWeek;
  /** The day the screen is on, so a day scene names it. */
  sceneDay?: EmptySceneDay;
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
      <EmptyScene day={sceneDay} kind={scene} size={compact ? "card" : "page"} week={sceneWeek} />
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
