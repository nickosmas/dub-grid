import { Stack } from "expo-router";
import { DeferredTab } from "../../../src/shared/navigation/DeferredTab";
import { useMobileColors } from "../../../src/shared/providers/ThemeModeProvider";
import { createTopLevelStackOptions } from "../../../src/shared/navigation/top-level-stack";

export default function RequestsLayout() {
  const mobileColors = useMobileColors();

  return (
    <DeferredTab>
      <Stack>
        <Stack.Screen name="index" options={createTopLevelStackOptions(mobileColors, "Requests")} />
      </Stack>
    </DeferredTab>
  );
}
