import type { ComponentType } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

export type NativeSearchFieldProps = ViewProps & {
  placeholder: string;
  onChangeText: (event: NativeSyntheticEvent<{ text: string }>) => void;
};

type ExpoGlobal = {
  expo?: { modules?: Record<string, unknown> };
};

/**
 * UIKit's search field, or null where it isn't built in (Android, web,
 * tests, or a build from before this module): a caller draws its own then.
 */
export const NativeSearchField: ComponentType<NativeSearchFieldProps> | null = (() => {
  if (!(globalThis as ExpoGlobal).expo?.modules?.SearchField) return null;
  // Loaded only where the module exists, so tests never touch Expo's view registry.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireNativeView } = require("expo") as typeof import("expo");
  return requireNativeView<NativeSearchFieldProps>("SearchField");
})();
