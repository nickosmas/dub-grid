import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getMobileNavigationTheme } from "@dubgrid/design-tokens";
import { MobileRealtimeProvider } from "../src/features/auth/providers/MobileRealtimeProvider";
import { ConsentGate } from "../src/features/consent/components/ConsentGate";
import { ConfigurationScreen } from "../src/shared/components/ConfigurationScreen";
import { validateMobileEnv } from "../src/shared/lib/env";
import { queryClient } from "../src/shared/lib/query-client";
import { AppLockProvider } from "../src/shared/providers/AppLockProvider";
import { AuthSessionProvider } from "../src/shared/providers/AuthSessionProvider";
import { NetworkStateProvider } from "../src/shared/providers/NetworkStateProvider";
import {
  ThemeModeProvider,
  useMobileColors,
  useThemeMode,
} from "../src/shared/providers/ThemeModeProvider";
import { ToastProvider } from "../src/shared/providers/ToastProvider";
import {
  createCommonStackOptions,
  createDetailStackOptions,
} from "../src/shared/navigation/top-level-stack";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutContent({
  envValidation,
}: {
  envValidation: ReturnType<typeof validateMobileEnv>;
}) {
  const mobileColors = useMobileColors();
  const { resolvedTheme } = useThemeMode();
  const navigationTheme = useMemo(
    () => getMobileNavigationTheme(resolvedTheme === "dark"),
    [resolvedTheme],
  );

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      {envValidation.status === "invalid" ? (
        <ConfigurationScreen validation={envValidation} />
      ) : (
        <NetworkStateProvider>
          <ToastProvider>
            <QueryClientProvider client={queryClient}>
              <AuthSessionProvider>
                <AppLockProvider>
                  <MobileRealtimeProvider>
                    <ConsentGate>
                      <Stack screenOptions={createCommonStackOptions(mobileColors)}>
                        <Stack.Screen name="index" options={{ headerShown: false }} />
                        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
                        <Stack.Screen
                          name="(auth)/onboarding"
                          options={{ headerShown: false, animation: "fade" }}
                        />
                        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                        <Stack.Screen name="alerts" options={{ headerShown: false }} />
                        <Stack.Screen
                          name="shift/[employeeId]/[date]"
                          options={createDetailStackOptions(mobileColors, "Shift Detail")}
                        />
                      </Stack>
                    </ConsentGate>
                  </MobileRealtimeProvider>
                </AppLockProvider>
              </AuthSessionProvider>
            </QueryClientProvider>
          </ToastProvider>
        </NetworkStateProvider>
      )}
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const envValidation = validateMobileEnv();

  // Hold the splash screen until DM Sans loads so brand text never flashes
  // in the system font fallback. If loading errors out (rare — the fonts
  // are bundled into the binary), we still proceed so the app isn't stuck
  // on the splash.
  const [fontsLoaded, fontsError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeModeProvider>
          <RootLayoutContent envValidation={envValidation} />
        </ThemeModeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
