import { Stack } from "expo-router";
import { DeferredTab } from "../../../src/shared/navigation/DeferredTab";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import {
  createCommonStackOptions,
  createTopLevelStackOptions,
} from "../../../src/shared/navigation/top-level-stack";

export default function PeopleLayout() {
  const mobileColors = useMobileColors();

  return (
    <DeferredTab>
      <Stack screenOptions={createCommonStackOptions(mobileColors)}>
        <Stack.Screen name="index" options={createTopLevelStackOptions(mobileColors, "People")} />
      </Stack>
    </DeferredTab>
  );
}
