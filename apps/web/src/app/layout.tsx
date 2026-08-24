import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { DM_Sans, DM_Mono } from "next/font/google";
import { createStaticWebCssVariables, createThemedCssText } from "@dubgrid/design-tokens";
import { createThemeSeedScript } from "@/lib/theme-preference";
import "./globals.css";
import "@/lib/env";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://dubgrid.com"),
  title: "DubGrid",
  description: "Staff scheduling, built for care teams.",
  openGraph: {
    title: "DubGrid",
    description: "Staff scheduling, built for care teams.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DubGrid",
    description: "Staff scheduling, built for care teams.",
  },
};

import ConsentGatedAnalytics from "@/components/ConsentGatedAnalytics";
import { cn } from "@/lib/utils";
import CookieConsent from "@/components/CookieConsent";

import AppToaster from "@/components/AppToaster";
import WebVitals from "@/components/WebVitals";
import ThemeProvider from "@/components/ThemeProvider";

const staticWebCssVariables = createStaticWebCssVariables() as CSSProperties;
const themedCssText = createThemedCssText();
const themeSeedScript = createThemeSeedScript();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={staticWebCssVariables}
      className={cn(dmSans.variable, dmMono.variable, "font-sans")}
    >
      <head>
        <style id="dg-theme-vars" dangerouslySetInnerHTML={{ __html: themedCssText }} />
        {/* Adopts a theme handed over from the other origin (apex ↔ org
            subdomain) before next-themes' own script reads localStorage.
            Must stay in <head> and ahead of <body> so it lands on the first
            paint — see createThemeSeedScript(). */}
        <script
          id="dg-theme-seed"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeSeedScript }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {/* Only what every page needs. The auth, query and nav-shell
              providers moved to (app)/layout.tsx so the marketing pages stop
              paying for a session they do not have — see the note there. */}
          {children}
          <AppToaster />
          <CookieConsent />
          <ConsentGatedAnalytics />
          <WebVitals />
        </ThemeProvider>
      </body>
    </html>
  );
}
