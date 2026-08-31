import { Stack } from "expo-router";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import { mobileTypography } from "../../../src/shared/theme/tokens";
import { createDetailStackOptions } from "../../../src/shared/navigation/top-level-stack";

export default function ProfileLayout() {
  const mobileColors = useMobileColors();

  return (
    <Stack>
      {/* The hub keeps a compact native bar. ProfileScreen replaces this
          placeholder with the person's name once the profile is available. */}
      <Stack.Screen
        name="index"
        options={{
          ...createDetailStackOptions(mobileColors, "Profile", { scrollEdge: true }),
          // Keep the native title machinery in place, but hide its placeholder
          // until ProfileScreen has the person's name and the hero scrolls.
          headerTitleStyle: {
            color: "transparent",
            fontFamily: mobileTypography.fontFamily.bold,
          },
        }}
      />
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
        name="password"
        options={createDetailStackOptions(mobileColors, "Change password", { largeTitle: true })}
      />
      <Stack.Screen
        name="two-factor"
        options={createDetailStackOptions(mobileColors, "Two-factor", { largeTitle: true })}
      />
      <Stack.Screen
        name="sessions"
        options={createDetailStackOptions(mobileColors, "Devices", { largeTitle: true })}
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
