import { Stack } from "expo-router";
import { Platform } from "react-native";
import { useHasSideColumn } from "./useHasSideColumn";
import { useToolbarIcon, type MaterialIconName, type SFSymbol } from "./useToolbarIcon";

/**
 * One button in the native navigation bar. iOS shows its words (or the SF
 * Symbol when `iconOnly`, or when the bar stands in an iPhone Duo's side
 * column, where words don't fit), Android always the Material icon, which it
 * draws to an image first, so the button waits for that image rather than
 * render empty.
 */
export function HeaderBarAction({
  label,
  sfSymbol,
  materialIcon,
  placement,
  iconOnly = false,
  words = false,
  disabled,
  onPress,
}: {
  label: string;
  sfSymbol: SFSymbol;
  materialIcon: MaterialIconName;
  placement: "left" | "right";
  iconOnly?: boolean;
  /**
   * Its words even on an iPhone Duo, where the button then stands at the top
   * right rather than in the side column, which takes only symbols.
   */
  words?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const icon = useToolbarIcon(sfSymbol, materialIcon);
  const sideColumn = useHasSideColumn();
  const showsWords = Platform.OS === "ios" && !iconOnly && (!sideColumn || words);

  if (!showsWords && !icon) return null;

  return (
    <Stack.Toolbar placement={placement}>
      {showsWords ? (
        <Stack.Toolbar.Button accessibilityLabel={label} disabled={disabled} onPress={onPress}>
          {label}
        </Stack.Toolbar.Button>
      ) : (
        <Stack.Toolbar.Button
          accessibilityLabel={label}
          disabled={disabled}
          icon={icon}
          onPress={onPress}
        />
      )}
    </Stack.Toolbar>
  );
}
