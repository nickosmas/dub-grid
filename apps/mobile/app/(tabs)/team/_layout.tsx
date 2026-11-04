import { Stack } from "expo-router";
import { DeferredTab } from "../../../src/shared/navigation/DeferredTab";

export default function TeamLayout() {
  return (
    <DeferredTab>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
    </DeferredTab>
  );
}
