import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { AppText } from "../components/AppText";
import { Pressable } from "../components/Pressable";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace } from "../theme/tokens";

/** A link back to the page the pane showed before, named for that page. */
export type PaneBack = { label: string; onPress: () => void };

/**
 * A split view's detail pane names its page, where the native bar belongs to
 * the list's page. Only what the list beside it doesn't show goes above.
 */
export function PaneTitle({
  eyebrow,
  title,
  back,
}: {
  eyebrow?: string;
  title: string;
  back?: PaneBack;
}) {
  const mobileColors = useMobileColors();
  return (
    <View style={styles.heading}>
      {back ? (
        <Pressable
          accessibilityLabel={`Back to ${back.label}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={back.onPress}
          style={styles.back}
        >
          <Ionicons color={mobileColors.brand} name="chevron-back" size={18} />
          <AppText tone="brand" variant="meta">
            {back.label}
          </AppText>
        </Pressable>
      ) : null}
      {eyebrow ? (
        <AppText tone="secondary" variant="meta">
          {eyebrow}
        </AppText>
      ) : null}
      <AppText accessibilityRole="header" variant="screenTitle">
        {title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: mobileSpace.xs,
  },
  back: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: mobileSpace.xs,
  },
});
