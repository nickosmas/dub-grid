import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { DM_Sans, DM_Mono } from "next/font/google";
import { createWebCssVariables } from "@dubgrid/design-tokens";
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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://dubgrid.com",
  ),
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

const webCssVariables = createWebCssVariables() as CSSProperties;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={webCssVariables}
      className={cn(dmSans.variable, dmMono.variable, "font-sans")}
    >
      <body suppressHydrationWarning>
        <AuthProvider>
          <PostHogProvider>
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
      </body>
    </html>
  );
}
