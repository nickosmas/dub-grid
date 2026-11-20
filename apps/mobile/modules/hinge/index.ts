import type { ComponentType, ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
type HingeChange = { status: string };

type HingeNativeModule = {
  getStatus(): string;
  /** The new layout is drawn: fade the cover laid over the window while it resized. */
  settle?(): void;
  addListener(event: "onChange", listener: (change: HingeChange) => void): { remove(): void };
};

type ExpoGlobal = { expo?: { modules?: Record<string, unknown> } };

/**
 * The native hinge module, or null where it isn't built in (Android, web,
 * tests). Read straight from the registry `requireOptionalNativeModule` uses,
 * so tests don't have to load Expo to get null.
 */
export const hingeModule =
  ((globalThis as ExpoGlobal).expo?.modules?.Hinge as HingeNativeModule | undefined) ?? null;

type PaneEdgeProps = { style?: StyleProp<ViewStyle>; children?: ReactNode };

/**
 * A split view's detail pane wrapper that gives its scroll views iOS's soft
 * top edge effect, or null where the module isn't built in.
 */
export const PaneEdge: ComponentType<PaneEdgeProps> | null = (() => {
  if (!hingeModule) return null;
  // Loaded only where the module exists, so tests never touch Expo's view registry.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireNativeView } = require("expo") as typeof import("expo");
  return requireNativeView<PaneEdgeProps>("Hinge");
})();
