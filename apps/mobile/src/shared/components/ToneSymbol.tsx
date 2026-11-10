import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import type { ToneSymbolProps } from "./ToneSymbol.types";

export type { ToneSymbolProps } from "./ToneSymbol.types";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

const TONE_ICON: Record<ToneSymbolProps["tone"], MaterialIconName> = {
  success: "check-circle",
  warning: "warning",
  info: "info",
  danger: "report",
};

/**
 * A tone's filled Material icon: a circle with a check, a triangle with !, a
 * circle with i, an octagon with !. Its mark is a hole in the shape, so it
 * shows whatever is behind. The same on both phones.
 */
export function ToneSymbol({ tone, offline = false, size, color }: ToneSymbolProps) {
  return (
    <MaterialIcons
      accessibilityElementsHidden
      color={color}
      importantForAccessibility="no"
      name={offline ? "cloud-off" : TONE_ICON[tone]}
      size={size}
    />
  );
}
