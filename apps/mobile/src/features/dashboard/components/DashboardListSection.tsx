import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * The full list behind a dashboard card, as the platforms draw a list: one
 * grouped card on the page, with how many rows it holds as the group's
 * header, the way Mail and Settings caption a list.
 */
export function DashboardListSection({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.group}>
      <Text style={styles.caption}>{caption}</Text>
      <View style={styles.surface}>{children}</View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    group: {
      gap: mobileSpace.sm,
      paddingTop: mobileSpace.md,
    },
    caption: {
      ...mobileText.meta,
      color: mobileColors.textSecondary,
      paddingHorizontal: mobileSpace.lg,
    },
    surface: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      // Dark mode keeps a hairline, where the page and the card are close.
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: mobileColors.cardBorder,
      paddingHorizontal: mobileSpace.lg,
      overflow: "hidden",
    },
  });
