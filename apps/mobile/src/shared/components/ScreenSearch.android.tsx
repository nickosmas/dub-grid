import { StyleSheet } from "react-native";
import { DockedSearchBar, Host, Text } from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { useThemeMode } from "../providers/ThemeModeProvider";
import type { ScreenSearchProps } from "./ScreenSearch";

export type { ScreenSearchProps } from "./ScreenSearch";

/** Material 3's docked search bar, at the top of a searchable screen. */
export function ScreenSearch({ placeholder, onSearchChange }: ScreenSearchProps) {
  const { resolvedTheme } = useThemeMode();

  return (
    <Host matchContents={{ vertical: true }} colorScheme={resolvedTheme} style={styles.host}>
      <DockedSearchBar modifiers={[fillMaxWidth()]} onQueryChange={onSearchChange}>
        <DockedSearchBar.Placeholder>
          <Text>{placeholder}</Text>
        </DockedSearchBar.Placeholder>
      </DockedSearchBar>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    alignSelf: "stretch",
    // Material's docked bar is 56dp; laid out at that height from the start,
    // the list doesn't jump when Compose reports its size.
    minHeight: 56,
  },
});
