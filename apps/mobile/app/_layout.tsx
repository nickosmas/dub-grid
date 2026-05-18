import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MobileRealtimeProvider } from "../src/features/auth/providers/MobileRealtimeProvider";
import { ConfigurationScreen } from "../src/shared/components/ConfigurationScreen";
import { validateMobileEnv } from "../src/shared/lib/env";
import { queryClient } from "../src/shared/lib/query-client";
import { AuthSessionProvider } from "../src/shared/providers/AuthSessionProvider";
import { NetworkStateProvider } from "../src/shared/providers/NetworkStateProvider";
import { ToastProvider } from "../src/shared/providers/ToastProvider";
import {
  commonStackOptions,
  createDetailStackOptions,
} from "../src/shared/navigation/top-level-stack";
import { dubGridNavigationTheme } from "../src/shared/theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const envValidation = validateMobileEnv();

  // Hold the splash screen until DM Sans Bold is loaded so the brand
  // wordmark never flashes in the system font fallback. If loading
  // errors out (rare — the font is bundled into the binary), we still
  // proceed so the app isn't stuck on the splash.
  const [fontsLoaded, fontsError] = useFonts({ DMSans_700Bold });
  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="auto" />
        {envValidation.status === "invalid" ? (
          <ConfigurationScreen validation={envValidation} />
        ) : (
          <ThemeProvider value={dubGridNavigationTheme}>
            <NetworkStateProvider>
              <ToastProvider>
                <QueryClientProvider client={queryClient}>
                  <AuthSessionProvider>
                    <MobileRealtimeProvider>
                      <Stack screenOptions={commonStackOptions}>
                        <Stack.Screen name="index" options={{ headerShown: false }} />
                        <Stack.Screen
                          name="(auth)/login"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="(auth)/onboarding"
                          options={{ headerShown: false, animation: "fade" }}
                        />
                        <Stack.Screen
                          name="(tabs)"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="alerts"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="shift/[employeeId]/[date]"
                          options={createDetailStackOptions("Shift Detail")}
                        />
                      </Stack>
                    </MobileRealtimeProvider>
                  </AuthSessionProvider>
                </QueryClientProvider>
              </ToastProvider>
            </NetworkStateProvider>
          </ThemeProvider>
        )}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
