import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGestureHandlerModule,
  createReactNativeModule,
  createSafeAreaContextModule,
} from "../../test/native";
import * as envModule from "../lib/env";

const navigationThemeValues: Array<{ colors?: { background?: string; card?: string } }> = [];

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("react-native-gesture-handler", async () =>
  createGestureHandlerModule(await import("react")),
);

vi.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

vi.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: () => Promise.resolve(),
  hideAsync: () => Promise.resolve(),
}));

vi.mock("@expo-google-fonts/dm-sans", () => ({
  useFonts: () => [true, null],
  DMSans_400Regular: "DMSans_400Regular",
  DMSans_500Medium: "DMSans_500Medium",
  DMSans_600SemiBold: "DMSans_600SemiBold",
  DMSans_700Bold: "DMSans_700Bold",
}));

vi.mock("../../features/consent/components/ConsentGate", async () => {
  const React = await import("react");

  return {
    ConsentGate: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "consent-gate" }, children),
  };
});

vi.mock("../../features/consent/components/TermsGate", async () => {
  const React = await import("react");

  return {
    TermsGate: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "terms-gate" }, children),
  };
});

vi.mock("@react-navigation/native", async () => {
  const React = await import("react");

  return {
    ThemeProvider: ({ children, value }: { children: React.ReactNode; value: unknown }) => {
      navigationThemeValues.push(value as { colors?: { background?: string; card?: string } });
      return React.createElement("div", { "data-testid": "theme-provider" }, children);
    },
  };
});

vi.mock("@tanstack/react-query", async () => {
  const React = await import("react");

  return {
    QueryClient: class QueryClient {},
    onlineManager: {
      isOnline: () => true,
    },
    QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "query-provider" }, children),
  };
});

vi.mock("../providers/AuthSessionProvider", async () => {
  const React = await import("react");

  return {
    AuthSessionProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "auth-provider" }, children),
    useSessionState: () => ({ session: null, accessToken: null, isLoading: false }),
  };
});

vi.mock("../../features/auth/hooks/useBootstrap", () => ({
  BOOTSTRAP_QUERY_KEY_PREFIX: ["mobile", "bootstrap"],
  useBootstrap: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("../../features/auth/hooks/useHasSeenOnboarding", () => ({
  useHasSeenOnboarding: () => ({ data: true, isLoading: false }),
}));

vi.mock("../providers/AppLockProvider", async () => {
  const React = await import("react");

  return {
    AppLockProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "app-lock-provider" }, children),
  };
});

vi.mock("../providers/ToastProvider", async () => {
  const React = await import("react");

  return {
    ToastProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "toast-provider" }, children),
  };
});

vi.mock("../providers/NetworkStateProvider", async () => {
  const React = await import("react");

  return {
    NetworkStateProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "network-provider" }, children),
  };
});

vi.mock("../../features/auth/providers/MobileRealtimeProvider", async () => {
  const React = await import("react");

  return {
    MobileRealtimeProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "mobile-realtime-provider" }, children),
  };
});

vi.mock("expo-router", async () => {
  const React = await import("react");
  const Stack = Object.assign(
    ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "stack" }, children),
    {
      Screen: ({ name }: { name: string }) =>
        React.createElement("div", { "data-testid": `screen-${name}` }),
    },
  );

  return { Stack };
});

vi.mock("../navigation/top-level-stack", () => ({
  createCommonStackOptions: () => ({
    headerBackButtonDisplayMode: "minimal",
  }),
  createDetailStackOptions: (_mobileColors: unknown, title: string) => ({
    title,
  }),
}));

const validateMobileEnvSpy = vi.spyOn(envModule, "validateMobileEnv");
let RootLayout: (typeof import("../../../app/_layout"))["default"];

beforeAll(async () => {
  RootLayout = (await import("../../../app/_layout")).default;
});

describe("RootLayout", () => {
  beforeEach(() => {
    validateMobileEnvSpy.mockReset();
    navigationThemeValues.length = 0;
  });

  it("shows the mobile setup screen when env validation fails", () => {
    validateMobileEnvSpy.mockReturnValue({
      status: "invalid",
      issues: [
        {
          key: "EXPO_PUBLIC_API_BASE_URL",
          message: "Use a reachable API URL.",
        },
      ],
    });

    render(<RootLayout />);

    expect(screen.getByText("Mobile configuration needs attention")).toBeInTheDocument();
    expect(screen.getByText("Mobile connection")).toBeInTheDocument();
    expect(
      screen.getByText("This build is missing a reachable web connection."),
    ).toBeInTheDocument();
  });

  it("renders the app shell when env validation passes", () => {
    validateMobileEnvSpy.mockReturnValue({
      status: "ready",
      config: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon-key",
        apiBaseUrl: "https://dubgrid.com",
      },
    });

    render(<RootLayout />);

    expect(screen.getByTestId("query-provider")).toBeInTheDocument();
    expect(screen.getByTestId("auth-provider")).toBeInTheDocument();
    expect(screen.getByTestId("app-lock-provider")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-realtime-provider")).toBeInTheDocument();
    expect(screen.getByTestId("stack")).toBeInTheDocument();
    // The light page is plain white; the navigation theme has to follow it or
    // the bar behind a screen transition flashes the old grey.
    expect(navigationThemeValues.at(-1)?.colors).toMatchObject({
      background: "#FFFFFF",
      card: "#FFFFFF",
    });
  });
});
