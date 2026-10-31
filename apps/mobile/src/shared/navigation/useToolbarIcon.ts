import { useEffect, useState } from "react";
import { Platform, type ImageSourcePropType } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { Stack } from "expo-router";
import { useMobileColors } from "../providers/ThemeModeProvider";

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];
type ToolbarIcon = NonNullable<React.ComponentProps<typeof Stack.Toolbar.Button>["icon"]>;
type SFSymbol = Extract<ToolbarIcon, string>;

/**
 * The icon for a native header button: an SF Symbol on iOS, and on Android a
 * Material icon drawn to an image, since Android's toolbar takes an image
 * source rather than a symbol name. Undefined until the Android image exists.
 */
export function useToolbarIcon(
  sf: SFSymbol,
  material: MaterialIconName,
): SFSymbol | ImageSourcePropType | undefined {
  const mobileColors = useMobileColors();
  const [androidSource, setAndroidSource] = useState<ImageSourcePropType | undefined>();

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let cancelled = false;
    void MaterialIcons.getImageSource(material, 24, mobileColors.textPrimary).then((source) => {
      if (!cancelled && source) setAndroidSource(source);
    });
    return () => {
      cancelled = true;
    };
  }, [material, mobileColors.textPrimary]);

  return Platform.OS === "android" ? androidSource : sf;
}
