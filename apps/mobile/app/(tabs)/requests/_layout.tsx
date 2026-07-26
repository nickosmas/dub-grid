import { Stack } from "expo-router";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import { createTopLevelStackOptions } from "../../../src/shared/navigation/top-level-stack";

export default function RequestsLayout() {
  const mobileColors = useMobileColors();

  return (
    <Stack>
      <Stack.Screen name="index" options={createTopLevelStackOptions(mobileColors, "Requests")} />
    </Stack>
  );
}
