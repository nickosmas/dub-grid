import { Stack } from "expo-router";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import {
  createCommonStackOptions,
  createTopLevelStackOptions,
} from "../../../src/shared/navigation/top-level-stack";

export default function PeopleLayout() {
  const mobileColors = useMobileColors();

  return (
    <Stack screenOptions={createCommonStackOptions(mobileColors)}>
      <Stack.Screen name="index" options={createTopLevelStackOptions(mobileColors, "People")} />
    </Stack>
  );
}
