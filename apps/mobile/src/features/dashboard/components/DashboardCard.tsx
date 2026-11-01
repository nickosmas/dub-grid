import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { SectionHeading } from "../../../shared/components/SectionHeading";
import { IS_NATIVE_LIST } from "../../../shared/lib/native-list";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * A dashboard section as a grouped list draws one: a title (followed by a
 * chevron when it opens a fuller screen) over a flat card on the grouped
 * page. The figures inside are the content, and an optional sentence closes
 * the card under a hairline.
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
      <View style={styles.heading}>
        <SectionHeading onOpen={onOpen} title={title} titleStyle={styles.title} />
      </View>
      {surface ? (
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
      ) : (
        <View style={styles.body}>{children}</View>
      )}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    surface: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      // No shadow: the card separates from the grouped page by its fill, with
      // a hairline in dark mode where the two are close.
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.lg,
      overflow: "hidden",
    },
    group: {
      gap: mobileSpace.sm,
    },
    // A grouped list's header starts on the rows' text line, not the card edge.
    heading: {
      paddingHorizontal: IS_NATIVE_LIST ? mobileSpace.lg : 0,
    },
    // The platforms' prominent group header (17pt semibold) on device; the
    // web build keeps the larger drawn heading.
    title: {
      ...(IS_NATIVE_LIST ? mobileText.cardTitle : mobileText.title),
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
