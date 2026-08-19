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
      {/* Large titles for the forms, the way Settings does it: each pushed
          screen reads as a place of its own. The person page is the exception —
          its heading is the centered identity block it draws itself, so it
          takes a plain static title and prints the name once, under the
          avatar, rather than in the bar as well. */}
      <Stack.Screen
        name="add"
        options={createDetailStackOptions(mobileColors, "Add Person", { largeTitle: true })}
      />
      {/* The one profile page there is: management users open it too, since
          their access lives on the same record. */}
      <Stack.Screen name="[id]" options={createDetailStackOptions(mobileColors, "Staff Profile")} />
    </Stack>
  );
}
