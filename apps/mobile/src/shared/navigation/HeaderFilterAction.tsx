import { Platform, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack } from "expo-router";
import { Pressable } from "../components/Pressable";
import { useMobileColors } from "../providers/ThemeModeProvider";

/**
 * A screen's Filter in the native navigation bar's trailing edge: a Liquid
 * Glass bar button on iOS 26 and a Material icon button on Android, filled
 * with the brand color while any filter is on.
 */
export function HeaderFilterAction({
  accessibilityLabel,
  activeCount,
  onPress,
}: {
  accessibilityLabel: string;
  activeCount: number;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const isFiltered = activeCount > 0;
  const label = isFiltered ? `${accessibilityLabel}, ${activeCount} active` : accessibilityLabel;

  return (
    <Stack.Toolbar placement="right">
      {Platform.OS === "android" ? (
        <Stack.Toolbar.View>
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            android_ripple={{ color: mobileColors.rippleNeutral, borderless: false }}
            onPress={onPress}
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
        <Stack.Toolbar.Button
          accessibilityLabel={label}
          icon="line.3.horizontal.decrease"
          tintColor={isFiltered ? mobileColors.brand : undefined}
          variant={isFiltered ? "prominent" : "plain"}
          onPress={onPress}
        />
      )}
    </Stack.Toolbar>
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
