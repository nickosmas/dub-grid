import { Stack } from "expo-router";
import {
  createDetailStackOptions,
  createTopLevelStackOptions,
} from "../../src/shared/navigation/top-level-stack";

export default function AlertsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={createTopLevelStackOptions("Alerts")} />
      <Stack.Screen name="[id]" options={createDetailStackOptions("Alert")} />
    </Stack>
  );
}
