import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGestureHandlerModule,
  createReactNativeModule,
  createSafeAreaContextModule,
} from "../../test/native";
import * as envModule from "../lib/env";

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("react-native-gesture-handler", async () =>
  createGestureHandlerModule(await import("react")),
);

vi.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

vi.mock("@react-navigation/native", async () => {
  const React = await import("react");

  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "theme-provider" }, children),
  };
});

vi.mock("@tanstack/react-query", async () => {
  const React = await import("react");

  return {
    QueryClient: class QueryClient {},
    QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "query-provider" }, children),
  };
});

vi.mock("../providers/AuthSessionProvider", async () => {
  const React = await import("react");

  return {
    AuthSessionProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "auth-provider" }, children),
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
  commonStackOptions: {
    headerBackButtonDisplayMode: "minimal",
  },
  createDetailStackOptions: (title: string) => ({
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

    expect(
      screen.getByText("Mobile configuration needs attention"),
    ).toBeInTheDocument();
    expect(screen.getByText("Use a reachable API URL.")).toBeInTheDocument();
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
    expect(screen.getByTestId("stack")).toBeInTheDocument();
  });
});
