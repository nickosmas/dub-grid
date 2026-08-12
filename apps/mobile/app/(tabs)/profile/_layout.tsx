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
      {/* Large titles all the way down this section, the way Settings does it:
          each pushed panel reads as a place of its own. */}
      <Stack.Screen name="index" options={createTopLevelStackOptions(mobileColors, "Profile")} />
      <Stack.Screen
        name="account"
        options={createDetailStackOptions(mobileColors, "Profile details", { largeTitle: true })}
      />
      <Stack.Screen
        name="work"
        options={createDetailStackOptions(mobileColors, "Profile details", { largeTitle: true })}
      />
      <Stack.Screen
        name="security"
        options={createDetailStackOptions(mobileColors, "Security & sessions", {
          largeTitle: true,
        })}
      />
      <Stack.Screen
        name="notifications"
        options={createDetailStackOptions(mobileColors, "Notifications", { largeTitle: true })}
      />
      <Stack.Screen
        name="privacy"
        options={createDetailStackOptions(mobileColors, "Privacy & data", { largeTitle: true })}
      />
    </Stack>
  );
}
