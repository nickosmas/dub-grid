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
      <Stack.Screen name="add" options={createDetailStackOptions(mobileColors, "Add Person")} />
      <Stack.Screen name="[id]" options={createDetailStackOptions(mobileColors, "Person")} />
    </Stack>
  );
}
