import { Stack } from "expo-router";
import {
  createDetailStackOptions,
  createTopLevelStackOptions,
} from "../../../src/shared/navigation/top-level-stack";

export default function ProfileLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={createTopLevelStackOptions("Profile")}
      />
      <Stack.Screen
        name="account"
        options={createDetailStackOptions("Account details")}
      />
      <Stack.Screen
        name="work"
        options={createDetailStackOptions("Work profile")}
      />
      <Stack.Screen
        name="security"
        options={createDetailStackOptions("Security & sessions")}
      />
      <Stack.Screen
        name="notifications"
        options={createDetailStackOptions("Notifications")}
      />
    </Stack>
  );
}
