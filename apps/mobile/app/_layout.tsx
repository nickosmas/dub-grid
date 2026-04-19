import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConfigurationScreen } from "../src/shared/components/ConfigurationScreen";
import { validateMobileEnv } from "../src/shared/lib/env";
import { queryClient } from "../src/shared/lib/query-client";
import { AuthSessionProvider } from "../src/shared/providers/AuthSessionProvider";
import { createDetailStackOptions } from "../src/shared/navigation/top-level-stack";
import { dubGridNavigationTheme } from "../src/shared/theme/tokens";

export default function RootLayout() {
  const envValidation = validateMobileEnv();

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="dark" />
        {envValidation.status === "invalid" ? (
          <ConfigurationScreen validation={envValidation} />
        ) : (
          <ThemeProvider value={dubGridNavigationTheme}>
            <QueryClientProvider client={queryClient}>
              <AuthSessionProvider>
                <Stack>
                  <Stack.Screen
                    name="index"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="(auth)/login"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="(tabs)"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="alerts"
                    options={createDetailStackOptions("Alerts")}
                  />
                  <Stack.Screen
                    name="shift/[employeeId]/[date]"
                    options={createDetailStackOptions("Shift Detail")}
                  />
                </Stack>
              </AuthSessionProvider>
            </QueryClientProvider>
          </ThemeProvider>
        )}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
