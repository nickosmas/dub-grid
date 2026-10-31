import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { SectionHeading } from "../../../shared/components/SectionHeading";
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
 * A dashboard section in the Apple Health idiom: a title (followed by a
 * chevron when it opens a fuller screen) over a plain surface on the page's coverage wash. The figures
 * inside are the content, and an optional sentence closes the card under a
 * hairline.
 *
 * `surface={false}` keeps the header and drops the box, for content that is
 * already made of its own shapes (the schedule's shift pills) and would only
 * be boxed twice.
 */
export function DashboardCard({
  title,
  onOpen,
  summary,
  surface = true,
  children,
}: {
  title: string;
  /** Opens the full screen behind the card; renders the title as a link with a chevron. */
  onOpen?: () => void;
  /** A one-sentence reading of the card's figures, under a hairline at the bottom. */
  summary?: string;
  /** `false` lays the children straight on the page under the header. */
  surface?: boolean;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.group}>
      <SectionHeading onOpen={onOpen} title={title} titleStyle={styles.title} />
      {surface ? (
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
      ) : (
        <View style={styles.body}>{children}</View>
      )}
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
    title: {
      ...mobileText.title,
      color: mobileColors.textPrimary,
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
