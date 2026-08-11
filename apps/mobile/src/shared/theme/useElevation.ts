import { useMemo } from "react";
import { useIsDarkMode } from "../providers/ThemeModeProvider";
import { mobileElevation, type MobileElevation, type MobileElevationLevel } from "./tokens";

/**
 * Resolves a named shadow level for the current theme, so screens don't have to
 * thread `isDark` through their `createStyles` factory just to cast a shadow.
 *
 * Reach for this in components that build styles inline. Style factories that
 * already take `isDark` should call `mobileElevation(level, isDark)` directly
 * rather than calling a hook per level.
 */
export function useElevation(level: MobileElevationLevel): MobileElevation {
  const isDark = useIsDarkMode();
  return useMemo(() => mobileElevation(level, isDark), [level, isDark]);
}
