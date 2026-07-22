import { getStoredValue, setStoredValue } from "./local-storage";

const THEME_PREFERENCE_KEY = "dubgrid-mobile-theme-preference";

export type ThemePreference = "system" | "light" | "dark";

const VALID_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  await setStoredValue(THEME_PREFERENCE_KEY, preference);
}

export async function loadThemePreference(): Promise<ThemePreference> {
  const raw = await getStoredValue(THEME_PREFERENCE_KEY);
  if (raw && VALID_PREFERENCES.includes(raw as ThemePreference)) {
    return raw as ThemePreference;
  }

  return "system";
}
