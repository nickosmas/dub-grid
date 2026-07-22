import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Appearance, useColorScheme } from "react-native";

import {
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "../lib/theme-preference";
import { darkMobileColors, mobileColors, type MobileColors } from "../theme/tokens";

type ResolvedTheme = "light" | "dark";

type ThemeModeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const DEFAULT_THEME_MODE_VALUE: ThemeModeContextValue = {
  preference: "system",
  resolvedTheme: "light",
  setPreference: () => {},
};

const ThemeModeContext = createContext<ThemeModeContextValue>(DEFAULT_THEME_MODE_VALUE);
const MobileColorsContext = createContext<MobileColors>(mobileColors);

export function ThemeModeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;

    loadThemePreference().then((stored) => {
      if (!cancelled) {
        setPreferenceState(stored);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedTheme: ResolvedTheme =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    saveThemePreference(next).catch(() => {});
    Appearance.setColorScheme(next === "system" ? null : next);
  }, []);

  const themeModeValue = useMemo<ThemeModeContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  const mobileColorsValue = useMemo(
    () => (resolvedTheme === "dark" ? darkMobileColors : mobileColors),
    [resolvedTheme],
  );

  return (
    <ThemeModeContext.Provider value={themeModeValue}>
      <MobileColorsContext.Provider value={mobileColorsValue}>
        {children}
      </MobileColorsContext.Provider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  return useContext(ThemeModeContext);
}

export function useMobileColors(): MobileColors {
  return useContext(MobileColorsContext);
}

/** Convenience for call sites that only need the boolean, not the full mode context. */
export function useIsDarkMode(): boolean {
  return useContext(ThemeModeContext).resolvedTheme === "dark";
}
