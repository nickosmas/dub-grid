import { Stack } from "expo-router";

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="coverage"
        options={{ presentation: "modal", headerShown: true, title: "Coverage" }}
      />
      <Stack.Screen
        name="open-shifts"
        options={{ presentation: "modal", headerShown: true, title: "Open shifts" }}
      />
      <Stack.Screen
        name="staff-hours"
        options={{ presentation: "modal", headerShown: true, title: "Overtime watch" }}
      />
      <Stack.Screen
        name="activity"
        options={{ presentation: "modal", headerShown: true, title: "Recent activity" }}
      />
      <Stack.Screen
        name="pending-approvals"
        options={{ presentation: "modal", headerShown: true, title: "Pending approvals" }}
      />
      <Stack.Screen name="my-schedule" options={{ headerShown: false }} />
    </Stack>
  );
}
