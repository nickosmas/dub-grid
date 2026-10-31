import { StyleSheet } from "react-native";
import { DockedSearchBar, Host, Text } from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { useThemeMode } from "../../../shared/providers/ThemeModeProvider";
import type { PeopleSearchFieldProps } from "./PeopleSearchField";

export type { PeopleSearchFieldProps } from "./PeopleSearchField";

/** Material 3's docked search bar, above the People list. */
export function PeopleSearchField({ placeholder, onSearchChange }: PeopleSearchFieldProps) {
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
