import { Stack } from "expo-router";
import { createTopLevelStackOptions } from "../../../src/shared/navigation/top-level-stack";

export default function RequestsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={createTopLevelStackOptions("Requests")} />
    </Stack>
  );
}
