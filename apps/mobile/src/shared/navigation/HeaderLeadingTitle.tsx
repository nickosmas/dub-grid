import { Platform, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { Text } from "../components/Text";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileText } from "../theme/tokens";

/**
 * A pushed screen's title on the leading edge, beside the back button, as
 * iOS 26 Mail sets a mailbox's name, rather than centered. It is a bare bar
 * item (no glass capsule) and replaces the route's centered title. Android's
 * top app bar already starts its title there, so it keeps the route's own.
 */
export function HeaderLeadingTitle({ title }: { title: string }) {
  const mobileColors = useMobileColors();

  if (Platform.OS !== "ios") {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View hidesSharedBackground>
          <Text
            accessibilityRole="header"
            fit="fixed"
            numberOfLines={1}
            style={[styles.title, { color: mobileColors.textPrimary }]}
          >
            {title}
          </Text>
        </Stack.Toolbar.View>
      </Stack.Toolbar>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    ...mobileText.sectionTitle,
  },
});
