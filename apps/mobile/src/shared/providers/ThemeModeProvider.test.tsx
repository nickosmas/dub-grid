import { act, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useColorScheme = vi.fn();
const setColorScheme = vi.fn();
const loadThemePreference = vi.fn();
const saveThemePreference = vi.fn();

vi.mock("react-native", () => ({
  useColorScheme: () => useColorScheme(),
  Appearance: {
    setColorScheme: (...args: unknown[]) => setColorScheme(...args),
  },
}));

vi.mock("../lib/theme-preference", () => ({
  loadThemePreference: (...args: unknown[]) => loadThemePreference(...args),
  saveThemePreference: (...args: unknown[]) => saveThemePreference(...args),
}));

import {
  ThemeModeProvider,
  useIsDarkMode,
  useMobileColors,
  useThemeMode,
} from "./ThemeModeProvider";
import { darkMobileColors, mobileColors } from "../theme/tokens";

function ThemeProbe() {
  const { preference, resolvedTheme, setPreference } = useThemeMode();
  const colors = useMobileColors();
  const isDark = useIsDarkMode();

  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <span data-testid="is-dark">{String(isDark)}</span>
      <span data-testid="colors-match">
        {colors === (resolvedTheme === "dark" ? darkMobileColors : mobileColors) ? "yes" : "no"}
      </span>
      <button onClick={() => setPreference("dark")}>Set dark</button>
      <button onClick={() => setPreference("system")}>Set system</button>
    </div>
  );
}

describe("ThemeModeProvider", () => {
  beforeEach(() => {
    useColorScheme.mockReset();
    setColorScheme.mockReset();
    loadThemePreference.mockReset();
    saveThemePreference.mockReset();
    useColorScheme.mockReturnValue("light");
    loadThemePreference.mockResolvedValue("system");
    saveThemePreference.mockResolvedValue(undefined);
  });

  it("loads the persisted preference on mount and resolves the theme from it", async () => {
    loadThemePreference.mockResolvedValue("dark");

    render(
      <ThemeModeProvider>
        <ThemeProbe />
      </ThemeModeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preference")).toHaveTextContent("dark");
    });
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(screen.getByTestId("is-dark")).toHaveTextContent("true");
    expect(screen.getByTestId("colors-match")).toHaveTextContent("yes");
  });

  it("resolves 'system' preference from the device color scheme", async () => {
    useColorScheme.mockReturnValue("dark");
    loadThemePreference.mockResolvedValue("system");

    render(
      <ThemeModeProvider>
        <ThemeProbe />
      </ThemeModeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    });
  });

  it("persists the preference and syncs Appearance when setPreference is called", async () => {
    render(
      <ThemeModeProvider>
        <ThemeProbe />
      </ThemeModeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preference")).toHaveTextContent("system");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Set dark"));
    });

    expect(screen.getByTestId("preference")).toHaveTextContent("dark");
    expect(saveThemePreference).toHaveBeenCalledWith("dark");
    expect(setColorScheme).toHaveBeenCalledWith("dark");
  });

  it("passes null to Appearance.setColorScheme when switching back to system", async () => {
    render(
      <ThemeModeProvider>
        <ThemeProbe />
      </ThemeModeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preference")).toHaveTextContent("system");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Set system"));
    });

    expect(setColorScheme).toHaveBeenCalledWith(null);
  });
});
