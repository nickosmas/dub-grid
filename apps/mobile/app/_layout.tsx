import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Stack, type ErrorBoundaryProps } from "expo-router";
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
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getMobileNavigationTheme } from "@dubgrid/design-tokens";
import { MobileRealtimeProvider } from "../src/features/auth/providers/MobileRealtimeProvider";
import { markMobileAuthRuntimeStarted } from "../src/features/auth/lib/auth-entry-measurement";
import { ConsentGate } from "../src/features/consent/components/ConsentGate";
import { TermsGate } from "../src/features/consent/components/TermsGate";
import { ConfigurationScreen } from "../src/shared/components/ConfigurationScreen";
import { RouteErrorScreen } from "../src/shared/components/RouteErrorScreen";
import { StartupSplashGate } from "../src/shared/components/StartupSplashGate";
import { validateMobileEnv } from "../src/shared/lib/env";
import { queryClient } from "../src/shared/lib/query-client";
import { AppLockProvider } from "../src/shared/providers/AppLockProvider";
import { AuthSessionProvider } from "../src/shared/providers/AuthSessionProvider";
import { NetworkStateProvider } from "../src/shared/providers/NetworkStateProvider";
import { NetworkRecoveryProvider } from "../src/shared/providers/NetworkRecoveryProvider";
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
import { mobileTypography } from "../src/shared/theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => {});
markMobileAuthRuntimeStarted();

/**
 * Expo Router renders this instead of crashing the app when a render throws.
 * Without it a single bad render takes the whole app down with no way back —
 * web has the equivalent via each segment's `error.tsx`.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // The native splash is still held at this point if we failed during startup.
  SplashScreen.hideAsync().catch(() => {});

  return (
    <ThemeModeProvider>
      <RouteErrorScreen
        actionLabel="Try again"
        body="Something went wrong and this screen couldn't load. Trying again usually clears it."
        detail={error.message}
        onAction={() => {
          void retry();
        }}
        title="This screen ran into a problem"
      />
    </ThemeModeProvider>
  );
}

function RootLayoutContent({
  envValidation,
}: {
  envValidation: ReturnType<typeof validateMobileEnv>;
}) {
  const mobileColors = useMobileColors();
  const { resolvedTheme } = useThemeMode();
  const navigationTheme = useMemo(() => {
    const baseTheme = getMobileNavigationTheme(resolvedTheme === "dark");

    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        // Native large-title headers inherit React Navigation's `card`
        // colour while an interactive pop is in progress. The design-token
        // card is white in light mode, but mobile pages are slate, so it
        // flashed white above the People list behind Staff Profile.
        background: mobileColors.background,
        card: mobileColors.background,
        border: mobileColors.borderSubtle,
      },
    };
  }, [mobileColors.background, mobileColors.borderSubtle, resolvedTheme]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      {envValidation.status === "invalid" ? (
        <ConfigurationScreen validation={envValidation} />
      ) : (
        <NetworkStateProvider>
          <NetworkRecoveryProvider>
            <ToastProvider>
              <QueryClientProvider client={queryClient}>
                <AuthSessionProvider>
                  <AppLockProvider>
                    <MobileRealtimeProvider>
                      <ConsentGate>
                        <TermsGate>
                          <StartupSplashGate>
                            <Stack screenOptions={createCommonStackOptions(mobileColors)}>
                              <Stack.Screen name="index" options={{ headerShown: false }} />
                              <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
                              <Stack.Screen
                                name="(auth)/forgot-password"
                                options={{ headerShown: false }}
                              />
                              <Stack.Screen
                                name="(auth)/reset-password"
                                options={{ headerShown: false }}
                              />
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
                              <Stack.Screen
                                name="person/[id]/index"
                                options={{
                                  ...createDetailStackOptions(mobileColors, "Staff Profile", {
                                    scrollEdge: true,
                                  }),
                                  // PersonDetailScreen replaces this placeholder with
                                  // the person's name once they scroll, the same way
                                  // ProfileScreen does for the signed-in user's own name.
                                  headerTitleStyle: {
                                    color: "transparent",
                                    fontFamily: mobileTypography.fontFamily.bold,
                                  },
                                }}
                              />
                              {/* Add to Schedule is a pushed screen rather than a
                                  sheet: it is a three-picker form, and stacking
                                  it over the person page put a third modal on a
                                  stack iOS is unreliable about tearing down.
                                  Management access stays a sheet, which is where
                                  management settings always open. */}
                              <Stack.Screen
                                name="person/[id]/schedule"
                                options={createDetailStackOptions(mobileColors, "Add to Schedule", {
                                  largeTitle: true,
                                })}
                              />
                            </Stack>
                          </StartupSplashGate>
                        </TermsGate>
                      </ConsentGate>
                    </MobileRealtimeProvider>
                  </AppLockProvider>
                </AuthSessionProvider>
              </QueryClientProvider>
            </ToastProvider>
          </NetworkRecoveryProvider>
        </NetworkStateProvider>
      )}
    </NavigationThemeProvider>
  );
}

/**
 * Native stack headers are transparent while iOS performs an interactive back
 * swipe. This fills the controller underneath with the same page colour, so a
 * diagonal scroll or a partially completed swipe never reveals UIKit white.
 */
function RootLayoutSurface({
  envValidation,
}: {
  envValidation: ReturnType<typeof validateMobileEnv>;
}) {
  const mobileColors = useMobileColors();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: mobileColors.background }}>
      {/* The single owner of keyboard geometry for the whole app. Everything
          that moves for the keyboard reads from here: `Screen`, `AuthShell` and
          the bottom sheet. Before this there were three separate mechanisms and
          none of them did anything on Android except rely on `adjustResize`.

          No `statusBarTranslucent` / `navigationBarTranslucent` /
          `preserveEdgeToEdge` here. They only apply when the library manages
          edge-to-edge itself; this app is already edge-to-edge through
          react-native-edge-to-edge (the SDK 54 default), which owns the system
          bars, so the library ignores all three and warns on every launch if
          they are passed. The sheet's own `<Modal>` still needs its pair of
          translucency props — that is a different window and a different
          mechanism (see `BottomSheetModal`). */}
      <KeyboardProvider>
        <RootLayoutContent envValidation={envValidation} />
      </KeyboardProvider>
    </GestureHandlerRootView>
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
      <ThemeModeProvider>
        <RootLayoutSurface envValidation={envValidation} />
      </ThemeModeProvider>
    </SafeAreaProvider>
  );
}
