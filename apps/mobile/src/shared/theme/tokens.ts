import {
  borderColorFromText,
  colorTokens,
  darkColorTokens,
  mobileNavigationTheme,
  mobileTypographyTokens,
  overlayTokens,
  radiusTokens,
  spacingTokens,
} from "@dubgrid/design-tokens";
import type { TextStyle } from "react-native";

export const mobileColors = {
  ...colorTokens,
  overlay: overlayTokens.background,
} as const;
export const darkMobileColors = {
  ...darkColorTokens,
  overlay: overlayTokens.background,
} as const;
export type MobileColors = Record<keyof typeof mobileColors, string>;
export const mobileSpacing = spacingTokens;
export const mobileRadii = radiusTokens;
export const mobileTypography = mobileTypographyTokens;
export const dubGridNavigationTheme = mobileNavigationTheme;
export const mobileBorderColorFromText = borderColorFromText;

export const mobileText = mobileTypographyTokens.text satisfies Record<string, TextStyle>;
