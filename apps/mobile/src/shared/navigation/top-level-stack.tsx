import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Platform } from "react-native";
import type { MobileColors } from "../theme/tokens";

export function createCommonStackOptions(mobileColors: MobileColors): NativeStackNavigationOptions {
  return {
    headerBackVisible: true,
    headerBackButtonDisplayMode: "minimal",
    headerShadowVisible: false,
    headerTintColor: mobileColors.textPrimary,
    headerStyle: {
      backgroundColor: mobileColors.background,
    },
    headerTitleStyle: {
      color: mobileColors.textPrimary,
      fontWeight: "700",
    },
    headerLargeTitleStyle: {
      color: mobileColors.textPrimary,
      fontWeight: "700",
    },
    headerLargeTitleShadowVisible: false,
    contentStyle: {
      backgroundColor: mobileColors.background,
    },
  };
}

export function createTopLevelStackOptions(
  mobileColors: MobileColors,
  title: string,
): NativeStackNavigationOptions {
  const useLargeTitle = Platform.OS === "ios";
  const common = createCommonStackOptions(mobileColors);

  return {
    ...common,
    title,
    headerLargeTitle: useLargeTitle,
    headerLargeTitleEnabled: useLargeTitle,
    headerStyle: useLargeTitle ? undefined : common.headerStyle,
  };
}

export function createDetailStackOptions(
  mobileColors: MobileColors,
  title: string,
): NativeStackNavigationOptions {
  return {
    ...createCommonStackOptions(mobileColors),
    title,
    headerLargeTitle: false,
    headerLargeTitleEnabled: false,
  };
}
