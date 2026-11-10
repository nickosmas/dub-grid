import { Stack } from "expo-router";
import { Platform } from "react-native";
import { useToolbarIcon, type MaterialIconName, type SFSymbol } from "./useToolbarIcon";

/**
 * One button in the native navigation bar. iOS shows its words (or the SF
 * Symbol when `iconOnly`), Android always the Material icon, which it draws
 * to an image first, so the button waits for that image rather than render
 * empty.
 */
export function HeaderBarAction({
  label,
  sfSymbol,
  materialIcon,
  placement,
  iconOnly = false,
  disabled,
  onPress,
}: {
  label: string;
  sfSymbol: SFSymbol;
  materialIcon: MaterialIconName;
  placement: "left" | "right";
  iconOnly?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const icon = useToolbarIcon(sfSymbol, materialIcon);
  const showsWords = Platform.OS === "ios" && !iconOnly;

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
