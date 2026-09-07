import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText } from "../../../shared/components/AppText";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, type MobileColors } from "../../../shared/theme/tokens";

/**
 * What saving this section would take away. The mobile counterpart of web's
 * `SectionNotice`, so both apps say it in the same words in the same place.
 *
 * Consequences of the save, not properties of a field. Validation stays as the
 * plain red hint the choice groups and inputs already carry, so a filled box
 * only ever means the first of those two.
 *
 * `messages` is a list so a section can only ever raise one box.
 */
export function SectionNotice({ messages }: { messages: string[] }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  if (messages.length === 0) return null;

  return (
    <View accessibilityRole="summary" style={styles.notice}>
      <Ionicons color={mobileColors.dangerText} name="warning" size={16} />
      <View style={styles.messages}>
        {messages.map((message) => (
          <AppText key={message} tone="danger" variant="meta">
            {message}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    notice: {
      alignItems: "center",
      backgroundColor: mobileColors.dangerSoft,
      borderColor: mobileColors.dangerBorder,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      flexDirection: "row",
      gap: mobileSpace.sm,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    messages: {
      flex: 1,
      gap: 2,
    },
  });
