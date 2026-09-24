import type { Metadata } from "next";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./fonts.css";
import "@/lib/env.server";
import { clientEnv } from "@/lib/env";

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
import CookieConsent from "@/components/CookieConsent";

import AppToaster from "@/components/AppToaster";
import WebVitals from "@/components/WebVitals";
import ThemeProvider from "@/components/ThemeProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="font-sans">
      <head>
        {/* The same four Latin files next/font previously preloaded. Other
            character subsets remain on-demand through fonts.css. */}
        {[
          "5c285b27cdda1fe8-s.p.2_mbdogr7ni8i.woff2",
          "83afe278b6a6bb3c-s.p.2bn3s6zvc0dyp.woff2",
          "36363bfb06833f56-s.p.38hmww4cj4vme.woff2",
          "a73419dd2ba2d841-s.p.2yee423r7ahpo.woff2",
        ].map((file) => (
          <link
            key={file}
            rel="preload"
            href={`/fonts/${file}`}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
        {/* Adopts a theme handed over from the other origin (apex ↔ org
            subdomain) before next-themes' own script reads localStorage.
            This is an external, cacheable first-party asset rather than an
            inline runtime string. */}
        <Script id="dg-theme-seed" src="/dg-theme-seed.js" strategy="beforeInteractive" />
        <Script
          id="dg-form-submit-guard"
          src="/dg-form-submit-guard.js"
          strategy="beforeInteractive"
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[var(--dg-color-bg)] text-[var(--dg-color-text-primary)] antialiased"
      >
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
