import { useEffect, useState } from "react";
import { Platform, type ImageSourcePropType } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { Stack } from "expo-router";
import { useMobileColors } from "../providers/ThemeModeProvider";

export type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];
type ToolbarIcon = NonNullable<React.ComponentProps<typeof Stack.Toolbar.Button>["icon"]>;
export type SFSymbol = Extract<ToolbarIcon, string>;

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

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// Drawn once per icon and colour for the life of the app, so a bar that comes
// back (every editor's checkmark) has its image on the first frame.
const iosImageCache = new Map<string, ImageSourcePropType>();

/**
 * An iOS header icon drawn to an image in a set colour, for a prominent bar
 * item: iOS draws a symbol on the filled brand capsule in a pale tint of it,
 * where the system's own commit glyph is white. Undefined on Android, whose
 * toolbar tints its icons itself.
 */
export function useIosToolbarImage(
  ionicon: IoniconName,
  color: string,
): ImageSourcePropType | undefined {
  const key = `${ionicon}:${color}`;
  const [source, setSource] = useState<ImageSourcePropType | undefined>(() =>
    iosImageCache.get(key),
  );

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const cached = iosImageCache.get(key);
    if (cached) {
      setSource(cached);
      return;
    }
    let cancelled = false;
    void Ionicons.getImageSource(ionicon, 24, color).then((image) => {
      if (!image) return;
      iosImageCache.set(key, image);
      if (!cancelled) setSource(image);
    });
    return () => {
      cancelled = true;
    };
  }, [ionicon, color, key]);

  return source;
}
