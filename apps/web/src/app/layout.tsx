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
  description: "Smart staff scheduling for care facilities",
  openGraph: {
    title: "DubGrid",
    description: "Smart staff scheduling for care facilities",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DubGrid",
    description: "Smart staff scheduling for care facilities",
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
import TermsAcceptanceGate from "@/components/TermsAcceptanceGate";
import OnboardingGate from "@/components/onboarding/OnboardingGate";

import PostHogProvider from "@/components/PostHogProvider";
import { Toaster } from "sonner";

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
              <TermsAcceptanceGate>
                <Suspense fallback={null}>
                  <OnboardingGate>
                    <MobileSubNavProvider>
                      <TooltipProvider delay={TOOLTIP_DELAY_MS}>
                        <AppShell>{children}</AppShell>
                      </TooltipProvider>
                    </MobileSubNavProvider>
                  </OnboardingGate>
                </Suspense>
              </TermsAcceptanceGate>
            </QueryProvider>
          </PostHogProvider>
        </AuthProvider>
        <Toaster
          position="top-center"
          closeButton
          duration={6000}
          toastOptions={{
            className:
              "text-[15px] font-semibold rounded-[var(--dg-radius-lg)] w-[min(calc(100vw-48px),720px)] max-w-full",
          }}
        />
        <CookieConsent />
        <ConsentGatedAnalytics />
      </body>
    </html>
  );
}
