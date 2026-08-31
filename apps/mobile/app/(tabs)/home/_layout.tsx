import { Stack } from "expo-router";
import {
  createCommonStackOptions,
  createDetailStackOptions,
} from "../../../src/shared/navigation/top-level-stack";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";

export default function HomeLayout() {
  const mobileColors = useMobileColors();

  return (
    <Stack screenOptions={createCommonStackOptions(mobileColors)}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="coverage" options={createDetailStackOptions(mobileColors, "Coverage")} />
      <Stack.Screen
        name="open-shifts"
        options={createDetailStackOptions(mobileColors, "Open shifts")}
      />
      <Stack.Screen
        name="staff-hours"
        options={createDetailStackOptions(mobileColors, "Overtime watch")}
      />
      <Stack.Screen
        name="activity"
        options={createDetailStackOptions(mobileColors, "Recent activity")}
      />
      <Stack.Screen
        name="pending-approvals"
        options={createDetailStackOptions(mobileColors, "Pending approvals")}
      />
      <Stack.Screen name="my-schedule" options={{ headerShown: false }} />
    </Stack>
  );
}
