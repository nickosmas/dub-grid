import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";
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

import AuthProvider from "@/components/AuthProvider";
import QueryProvider from "@/components/QueryProvider";
import AppShell from "@/components/AppShell";
import { MobileSubNavProvider } from "@/components/MobileSubNavContext";
import ConsentGatedAnalytics from "@/components/ConsentGatedAnalytics";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/hint";
import { TOOLTIP_DELAY_MS } from "@/lib/constants";
import CookieConsent from "@/components/CookieConsent";
import OnboardingGate from "@/components/onboarding/OnboardingGate";

import PostHogProvider from "@/components/PostHogProvider";
import AppToaster from "@/components/AppToaster";
import WebVitals from "@/components/WebVitals";
import ThemeProvider from "@/components/ThemeProvider";
import { isFeatureEnabled } from "@/lib/feature-flags";

const staticWebCssVariables = createStaticWebCssVariables() as CSSProperties;
const themedCssText = createThemedCssText();
const themeSeedScript = createThemeSeedScript();

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const posthogEnabled = await isFeatureEnabled("posthog");

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
          <AuthProvider>
            <PostHogProvider enabled={posthogEnabled}>
              <QueryProvider>
                <Suspense fallback={null}>
                  <OnboardingGate>
                    <MobileSubNavProvider>
                      <TooltipProvider delay={TOOLTIP_DELAY_MS}>
                        <AppShell>{children}</AppShell>
                      </TooltipProvider>
                    </MobileSubNavProvider>
                  </OnboardingGate>
                </Suspense>
              </QueryProvider>
            </PostHogProvider>
          </AuthProvider>
          <AppToaster />
          <CookieConsent />
          <ConsentGatedAnalytics />
          <WebVitals />
        </ThemeProvider>
      </body>
    </html>
  );
}
