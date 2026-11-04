import { Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { Text } from "../components/Text";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileText } from "../theme/tokens";

/**
 * A pushed screen's collapsed title on the leading edge, beside the back
 * button, as iOS 26 Mail sets a mailbox's name, rather than centered. While
 * `shown` it is a bare bar item (no glass capsule) and the centered title is
 * blank; the route's title still names the large title. Android's top app bar
 * already starts its title there, so it keeps the route's own.
 */
export function HeaderLeadingTitle({ title, shown }: { title: string; shown: boolean }) {
  const mobileColors = useMobileColors();

  if (Platform.OS !== "ios") {
    return null;
  }

  if (!shown) {
    return <Stack.Screen options={{ headerTitle: undefined }} />;
  }

  return (
    <>
      {/* Keeps the route's title for the large title, and draws nothing in
          the center of the bar. */}
      <Stack.Screen options={{ headerTitle: EmptyBarTitle }} />
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

function EmptyBarTitle() {
  return <View />;
}

const styles = StyleSheet.create({
  title: {
    ...mobileText.sectionTitle,
  },
});
