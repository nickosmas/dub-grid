import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText } from "../../../shared/components/AppText";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
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

  if (messages.length === 0) return null;

  return (
    <View accessibilityRole="summary" style={styles.notice}>
      <Ionicons
        color={tone === "warning" ? mobileColors.warningText : mobileColors.dangerText}
        name="warning"
        size={16}
      />
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
      borderColor: tone === "warning" ? mobileColors.warningBorder : mobileColors.dangerBorder,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
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
