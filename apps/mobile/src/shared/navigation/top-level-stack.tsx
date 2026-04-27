import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Platform } from "react-native";
import { mobileColors } from "../theme/tokens";

export const commonStackOptions: NativeStackNavigationOptions = {
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

export function createTopLevelStackOptions(
  title: string,
): NativeStackNavigationOptions {
  return {
    ...commonStackOptions,
    title,
    headerLargeTitle: Platform.OS === "ios",
  };
}

export function createDetailStackOptions(
  title: string,
): NativeStackNavigationOptions {
  return {
    ...commonStackOptions,
    title,
    headerLargeTitle: false,
  };
}
