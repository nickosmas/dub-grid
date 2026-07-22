import { Stack } from "expo-router";
import { useMobileColors } from "../../src/shared/providers/ThemeModeProvider";
import {
  createDetailStackOptions,
  createTopLevelStackOptions,
} from "../../src/shared/navigation/top-level-stack";

export default function AlertsLayout() {
  const mobileColors = useMobileColors();

  return (
    <Stack>
      <Stack.Screen name="index" options={createTopLevelStackOptions(mobileColors, "Alerts")} />
      <Stack.Screen name="[id]" options={createDetailStackOptions(mobileColors, "Alert")} />
    </Stack>
  );
}
