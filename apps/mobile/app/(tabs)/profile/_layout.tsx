import { Stack } from "expo-router";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import {
  createDetailStackOptions,
  createTopLevelStackOptions,
} from "../../../src/shared/navigation/top-level-stack";

export default function ProfileLayout() {
  const mobileColors = useMobileColors();

  return (
    <Stack>
      <Stack.Screen name="index" options={createTopLevelStackOptions(mobileColors, "Profile")} />
      <Stack.Screen
        name="account"
        options={createDetailStackOptions(mobileColors, "Profile details")}
      />
      <Stack.Screen
        name="work"
        options={createDetailStackOptions(mobileColors, "Profile details")}
      />
      <Stack.Screen
        name="security"
        options={createDetailStackOptions(mobileColors, "Security & sessions")}
      />
      <Stack.Screen
        name="notifications"
        options={createDetailStackOptions(mobileColors, "Notifications")}
      />
      <Stack.Screen
        name="privacy"
        options={createDetailStackOptions(mobileColors, "Privacy & data")}
      />
      <Stack.Screen
        name="appearance"
        options={createDetailStackOptions(mobileColors, "Appearance")}
      />
    </Stack>
  );
}
