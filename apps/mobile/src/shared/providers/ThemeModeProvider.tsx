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

const RESTORE_TIMEOUT_MS = 500;

const ThemeModeContext = createContext<ThemeModeContextValue>(DEFAULT_THEME_MODE_VALUE);
const MobileColorsContext = createContext<MobileColors>(mobileColors);

export function ThemeModeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  // Nothing renders until the stored choice is known. The native splash is
  // still up at that point, so holding back costs nothing, while rendering on
  // the "system" default first painted a light frame and then flipped it for
  // anyone who had chosen dark (or the reverse).
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const restore = (stored: ThemePreference) => {
      if (cancelled) return;
      setPreferenceState(stored);
      setIsRestored(true);
      // Native surfaces (alerts, the keyboard, date pickers, the share
      // sheet) follow `Appearance`, not this context. Only `setPreference`
      // used to sync it, so after a restart a dark-mode choice on a light
      // phone opened system dialogs in light.
      if (stored !== "system") Appearance.setColorScheme(stored);
    };

    loadThemePreference().then(restore, () => restore("system"));
    // A keychain read can stall (iOS before first unlock); a late answer still
    // applies, but the app never waits on it past this.
    const fallback = setTimeout(() => {
      if (!cancelled) setIsRestored(true);
    }, RESTORE_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, []);

  const resolvedTheme: ResolvedTheme =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    saveThemePreference(next).catch(() => {});
    Appearance.setColorScheme(next === "system" ? "unspecified" : next);
  }, []);

  const themeModeValue = useMemo<ThemeModeContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  const mobileColorsValue = useMemo(
    () => (resolvedTheme === "dark" ? darkMobileColors : mobileColors),
    [resolvedTheme],
  );

  if (!isRestored) return null;

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
