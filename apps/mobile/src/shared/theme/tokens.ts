import {
  borderColorFromText,
  colorTokens,
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
export const mobileSpacing = spacingTokens;
export const mobileRadii = radiusTokens;
export const mobileTypography = mobileTypographyTokens;
export const dubGridNavigationTheme = mobileNavigationTheme;
export const mobileBorderColorFromText = borderColorFromText;

export const mobileText = mobileTypographyTokens.text satisfies Record<
  string,
  TextStyle
>;
