import { Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { Text } from "../components/Text";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileText } from "../theme/tokens";

/**
 * A pushed screen's collapsed title on the leading edge, beside the back
 * button, as iOS 26 Mail sets a mailbox's name, rather than centered. While
 * `enabled` the centered title stays blank and the leading one shows once
 * `collapsed`; the route's title still names the large title. Android's top
 * app bar already starts its title there, so it keeps the route's own.
 */
export function HeaderLeadingTitle({
  title,
  enabled,
  collapsed,
}: {
  title: string;
  enabled: boolean;
  collapsed: boolean;
}) {
  const mobileColors = useMobileColors();

  if (Platform.OS !== "ios") {
    return null;
  }

  if (!enabled) {
    return <Stack.Screen options={{ headerTitle: undefined }} />;
  }

  // The centered title stays blank for as long as this is enabled, and the
  // leading one stays mounted and only fades. Swapping between them as the
  // title collapsed let iOS draw its own centered title for a frame while the
  // large title was folding back out.
  return (
    <>
      <Stack.Screen options={{ headerTitle: EmptyBarTitle }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View hidesSharedBackground>
          <Text
            accessibilityElementsHidden={!collapsed}
            accessibilityRole="header"
            fit="fixed"
            importantForAccessibility={collapsed ? "auto" : "no-hide-descendants"}
            numberOfLines={1}
            style={[styles.title, { color: mobileColors.textPrimary, opacity: collapsed ? 1 : 0 }]}
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
