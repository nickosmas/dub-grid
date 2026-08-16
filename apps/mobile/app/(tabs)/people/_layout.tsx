import { Stack } from "expo-router";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import {
  createDetailStackOptions,
  createTopLevelStackOptions,
} from "../../../src/shared/navigation/top-level-stack";

export default function PeopleLayout() {
  const mobileColors = useMobileColors();

  return (
    <Stack>
      <Stack.Screen name="index" options={createTopLevelStackOptions(mobileColors, "People")} />
      {/* Large titles all the way down this section, the way Settings does it:
          each pushed screen reads as a place of its own. `[id]`'s title is the
          person's name, which the screen feeds in once it resolves. */}
      <Stack.Screen
        name="add"
        options={createDetailStackOptions(mobileColors, "Add Person", { largeTitle: true })}
      />
      <Stack.Screen
        name="[id]"
        options={createDetailStackOptions(mobileColors, "Person", { largeTitle: true })}
      />
      {/* A static segment, so it never competes with `[id]` for a match. */}
      <Stack.Screen
        name="management/[personId]"
        options={createDetailStackOptions(mobileColors, "Management", { largeTitle: true })}
      />
    </Stack>
  );
}
