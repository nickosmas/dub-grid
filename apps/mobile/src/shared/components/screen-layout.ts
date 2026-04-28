export type ScreenBottomPaddingMode = "tabbed" | "stack" | "modal";

const SCREEN_BOTTOM_PADDING = {
  tabbed: 72,
  stack: 24,
  modal: 16,
} as const;

export const DEFAULT_SCREEN_BOTTOM_PADDING_MODE: ScreenBottomPaddingMode =
  "stack";

export function getScreenBottomPadding(
  mode: ScreenBottomPaddingMode,
  safeAreaBottom: number,
): number {
  return Math.max(safeAreaBottom, 0) + SCREEN_BOTTOM_PADDING[mode];
}
