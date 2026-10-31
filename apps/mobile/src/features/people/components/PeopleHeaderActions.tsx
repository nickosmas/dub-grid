import { Platform, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack } from "expo-router";
import { Pressable } from "../../../shared/components/Pressable";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToolbarIcon } from "../../../shared/navigation/useToolbarIcon";

/**
 * People's search, filter and add in the native navigation bar: bar buttons
 * (Liquid Glass on iOS 26, Material icon buttons on Android), Filter filled
 * blue while any filter is on, and on iOS the system search field under the
 * large title. Android's search field sits above the list instead
 * (`PeopleSearchField`), since its toolbar search collapses to an icon.
 */
export function PeopleHeaderActions({
  searchPlaceholder,
  onSearchChange,
  activeFilterCount,
  onOpenFilters,
  onAddPerson,
}: {
  searchPlaceholder: string;
  onSearchChange: (text: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  /** Omitted for someone who can't add anyone. */
  onAddPerson?: () => void;
}) {
  const mobileColors = useMobileColors();
  const isFiltered = activeFilterCount > 0;
  const filterLabel = isFiltered
    ? `Open people filters and sort, ${activeFilterCount} active`
    : "Open people filters and sort";
  const addIcon = useToolbarIcon("person.badge.plus", "person-add-alt");

  return (
    <>
      {Platform.OS === "ios" ? (
        <Stack.SearchBar
          hideWhenScrolling={false}
          placeholder={searchPlaceholder}
          onChangeText={(event) => onSearchChange(event.nativeEvent.text)}
          onCancelButtonPress={() => onSearchChange("")}
        />
      ) : null}
      {/* Add person on the leading edge, Filter on the trailing one. Android
          draws its icons to images first, so a button waits for its image
          rather than render empty. */}
      {onAddPerson && addIcon ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel="Add person"
            icon={addIcon}
            onPress={onAddPerson}
          />
        </Stack.Toolbar>
      ) : null}
      <Stack.Toolbar placement="right">
        {Platform.OS === "android" ? (
          <Stack.Toolbar.View>
            <Pressable
              accessibilityLabel={filterLabel}
              accessibilityRole="button"
              android_ripple={{ color: mobileColors.rippleNeutral, borderless: false }}
              onPress={onOpenFilters}
              style={[styles.androidFilter, isFiltered && { backgroundColor: mobileColors.brand }]}
            >
              <MaterialIcons
                color={isFiltered ? mobileColors.textInverse : mobileColors.textPrimary}
                name="filter-list"
                size={24}
              />
            </Pressable>
          </Stack.Toolbar.View>
        ) : (
          // A glass circle at rest, like Add person; while any filter is on,
          // iOS's prominent bar button fills it with the tint.
          <Stack.Toolbar.Button
            accessibilityLabel={filterLabel}
            icon="line.3.horizontal.decrease"
            tintColor={isFiltered ? mobileColors.brand : undefined}
            variant={isFiltered ? "prominent" : "plain"}
            onPress={onOpenFilters}
          />
        )}
      </Stack.Toolbar>
    </>
  );
}

const styles = StyleSheet.create({
  // Material 3's icon button: 40dp, and filled with the brand color while on.
  androidFilter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
