import { Stack } from "expo-router";
import {
  createDetailStackOptions,
  createTopLevelStackOptions,
} from "../../../src/shared/navigation/top-level-stack";

export default function PeopleLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={createTopLevelStackOptions("People")}
      />
      <Stack.Screen
        name="[id]"
        options={createDetailStackOptions("Person")}
      />
    </Stack>
  );
}
