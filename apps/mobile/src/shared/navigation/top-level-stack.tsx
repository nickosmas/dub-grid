import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Platform } from "react-native";
import { mobileColors } from "../theme/tokens";

const commonOptions: NativeStackNavigationOptions = {
  headerBackTitleVisible: false,
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
    ...commonOptions,
    title,
    headerLargeTitle: Platform.OS === "ios",
  };
}

export function createDetailStackOptions(
  title: string,
): NativeStackNavigationOptions {
  return {
    ...commonOptions,
    title,
    headerLargeTitle: false,
  };
}
