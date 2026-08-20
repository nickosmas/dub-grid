"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

import { isThemePreference, writeThemeCookie } from "@/lib/theme-preference";

/**
 * Mirrors the live preference into the cross-subdomain `dg-theme` cookie so
 * the apex and org subdomains stay in step in production. Kept as a child of
 * the provider because it needs `useTheme()`, and split out so the provider
 * itself stays declarative.
 *
 * This is the only place the cookie is written — the pre-paint seed script
 * deliberately only reads it, which keeps the domain-suffix rule in
 * `lib/cookies.ts` rather than duplicated into a stringified script.
 */
function ThemeCookieSync() {
  const { theme } = useTheme();

  useEffect(() => {
    if (isThemePreference(theme)) writeThemeCookie(theme);
  }, [theme]);

  return null;
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeCookieSync />
      {children}
    </NextThemesProvider>
  );
}
