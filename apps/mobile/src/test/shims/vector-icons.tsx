// Test shim for @expo/vector-icons. The real package pulls expo-font ->
// expo-asset (native font loading) which vitest can't resolve in jsdom. Render
// a lightweight stub that exposes the icon name (accessibilityLabel + a data
// attribute) so tests can still query icons, without the native font chain.
import * as React from "react";
import { View } from "react-native";

type IconProps = {
  name?: string;
  size?: number;
  color?: string;
  testID?: string;
  accessibilityLabel?: string;
  [key: string]: unknown;
};

function Icon({ name, size: _size, color: _color, accessibilityLabel, ...rest }: IconProps) {
  return React.createElement(View, {
    ...rest,
    accessibilityLabel: accessibilityLabel ?? name,
    ...({ "data-icon-name": name } as Record<string, unknown>),
  });
}

// Default export covers subpath imports (@expo/vector-icons/Ionicons, etc.).
export default Icon;

// Named exports cover the barrel import (@expo/vector-icons).
export const Ionicons = Icon;
export const MaterialCommunityIcons = Icon;
export const MaterialIcons = Icon;
export const Feather = Icon;
export const FontAwesome = Icon;
export const FontAwesome5 = Icon;
export const AntDesign = Icon;
export const Entypo = Icon;
export const Octicons = Icon;
export const createIconSet = (): typeof Icon => Icon;
