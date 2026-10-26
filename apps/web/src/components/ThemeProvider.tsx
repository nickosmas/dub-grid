"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * The cross-subdomain `dg-theme` cookie is not written here: only a real
 * choice writes it (`ThemeToggleButton`), since a preference cookie set before
 * anyone chose one would need cookie consent.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableColorScheme={false}
      enableSystem
    >
      {children}
    </NextThemesProvider>
  );
}
