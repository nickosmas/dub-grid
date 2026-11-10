import { Stack } from "expo-router";
import type { NativeStackNavigationOptions } from "expo-router/native-stack";
import { useMobileColors } from "../providers/ThemeModeProvider";
import type { MobileColors } from "../theme/tokens";

/** Alerts' placeholder: both its route option and its screen name it. */
export const ALERTS_SEARCH_PLACEHOLDER = "Search title or message";

export type ScreenSearchProps = {
  placeholder: string;
  onSearchChange: (text: string) => void;
};

function searchBarColors(mobileColors: MobileColors) {
  return {
    // Android's app-bar search draws in these; iOS keeps its system field.
    headerIconColor: mobileColors.textPrimary,
    textColor: mobileColors.textPrimary,
    hintTextColor: mobileColors.textSubtle,
    tintColor: mobileColors.brand,
  } as const;
}

/**
 * A screen's search field: the platform's own search in the navigation bar,
 * under the large title on iOS and as the app bar's search action on
 * Android, in DubGrid's colors.
 */
export function ScreenSearch({ placeholder, onSearchChange }: ScreenSearchProps) {
  const mobileColors = useMobileColors();
  return (
    <Stack.SearchBar
      {...searchBarColors(mobileColors)}
      hideWhenScrolling={false}
      // Under the large title on every screen; on a pushed page iOS 26 would
      // otherwise move it to the bottom toolbar.
      placement="stacked"
      placeholder={placeholder}
      onChangeText={(event) => onSearchChange(event.nativeEvent.text)}
      onCancelButtonPress={() => onSearchChange("")}
      onClose={() => onSearchChange("")}
    />
  );
}

/**
 * The search bar as a route option, for a pushed screen whose search has to
 * exist before the push lays out its large title (iOS 26 draws a field added
 * later over the title). The screen still renders `ScreenSearch` for its
 * handlers.
 */
export function screenSearchRouteOptions(
  placeholder: string,
  mobileColors: MobileColors,
): NativeStackNavigationOptions {
  return {
    headerSearchBarOptions: {
      ...searchBarColors(mobileColors),
      placement: "stacked",
      hideWhenScrolling: false,
      placeholder,
    },
  };
}
