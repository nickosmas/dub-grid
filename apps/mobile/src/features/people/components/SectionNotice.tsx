import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { bannerIconColor } from "@dubgrid/design-tokens";
import { AppText } from "../../../shared/components/AppText";
import { ToneSymbol } from "../../../shared/components/ToneSymbol";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, type MobileColors } from "../../../shared/theme/tokens";

/**
 * What saving this section would do: `danger` for something taken away,
 * `warning` for something replaced or not happening. The mobile counterpart of
 * web's `SectionNotice`, so both apps say it in the same words in the same place.
 *
 * Consequences of the save, not properties of a field. Validation stays as the
 * plain red hint the choice groups and inputs already carry, so a filled box
 * only ever means the first of those two.
 *
 * `messages` is a list so a section can only ever raise one box.
 */
export function SectionNotice({
  messages,
  tone = "danger",
}: {
  messages: string[];
  tone?: "danger" | "warning";
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors, tone), [mobileColors, tone]);
  const iconColor = bannerIconColor(tone, useIsDarkMode() ? "dark" : "light");

  if (messages.length === 0) return null;

  return (
    <View accessibilityRole="summary" style={styles.notice}>
      <ToneSymbol color={iconColor} size={18} tone={tone} />
      <View style={styles.messages}>
        {messages.map((message) => (
          <AppText key={message} tone={tone} variant="meta">
            {message}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, tone: "danger" | "warning") =>
  StyleSheet.create({
    notice: {
      alignItems: "center",
      backgroundColor: tone === "warning" ? mobileColors.warningSoft : mobileColors.dangerSoft,
      borderRadius: mobileRadii.control,
      flexDirection: "row",
      gap: mobileSpace.sm,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    messages: {
      flex: 1,
      gap: mobileSpace.xs,
    },
  });
