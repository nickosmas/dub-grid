import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "@/lib/env.server";
import { clientEnv } from "@/lib/env";

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
  metadataBase: new URL(clientEnv?.NEXT_PUBLIC_SITE_URL ?? "https://dubgrid.com"),
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(dmSans.variable, dmMono.variable, "font-sans")}
    >
      <head>
        {/* Adopts a theme handed over from the other origin (apex ↔ org
            subdomain) before next-themes' own script reads localStorage.
            This is an external, cacheable first-party asset rather than an
            inline runtime string. */}
        <Script id="dg-theme-seed" src="/dg-theme-seed.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-screen bg-[var(--dg-color-bg)] text-[var(--dg-color-text-primary)] antialiased">
        <ThemeProvider>
          {/* Only what every page needs. The auth, query and nav-shell
              providers moved to (app)/layout.tsx so the marketing pages stop
              paying for a session they do not have — see the note there. */}
          {children}
          <AppToaster />
          <CookieConsent />
          <ConsentGatedAnalytics />
          <WebVitals />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
