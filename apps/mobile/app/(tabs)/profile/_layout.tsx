import { Stack } from "expo-router";
import { AlertsHeaderButton } from "../../../src/shared/navigation/AlertsHeaderButton";
import { createTopLevelStackOptions } from "../../../src/shared/navigation/top-level-stack";

export default function ProfileLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          ...createTopLevelStackOptions("Profile"),
          headerRight: () => <AlertsHeaderButton />,
        }}
      />
    </Stack>
  );
}
