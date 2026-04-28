import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import bundleAnalyzer from "@next/bundle-analyzer";
import { loadEnvConfig } from "@next/env";
import { existsSync } from "fs";
import { resolve } from "path";

function resolveEnvRoot() {
  const cwd = process.cwd();

  // Support both ways we invoke the app:
  // - from the monorepo root via `npm run dev`
  // - directly inside apps/web
  if (existsSync(resolve(cwd, ".env.local")) || existsSync(resolve(cwd, ".env.example"))) {
    return cwd;
  }

  return resolve(cwd, "../..");
}

const envRoot = resolveEnvRoot();

// Keep the existing repo-root env workflow working after moving the Next app
// into apps/web. This loads .env* from the monorepo root before Next snapshots
// NEXT_PUBLIC_* variables for the client bundle.
loadEnvConfig(envRoot);

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_BASE_DOMAIN: process.env.NEXT_PUBLIC_BASE_DOMAIN,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
};

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Be explicit so the browser bundle always receives the public env contract
  // even when the app is started from a workspace subdirectory.
  env: publicEnv,
  experimental: {
    // Turbopack's SST filesystem cache has a known corruption bug:
    // "Another write batch or compaction is already active" — concurrent
    // writes corrupt the cache, causing routes to 500 after the first visit.
    // Disabling the FS cache keeps Turbopack speed but uses memory only,
    // eliminating the ENOENT 500s. Re-evaluate in a future Next.js release.
    turbopackFileSystemCacheForDev: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const composed = withBundleAnalyzer(withNextIntl(nextConfig));

// In dev: export the config directly — Sentry's webpack plugin is intentionally
// NOT loaded so it never registers its Pages Router manifest hooks, which cause
// ENOENT 500s in the Turbopack App Router dev server.
//
// In production: dynamically require withSentryConfig so the import is only
// evaluated during a production build, keeping dev completely clean.
if (process.env.NODE_ENV === "production") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require("@sentry/nextjs");
  module.exports = withSentryConfig(composed, {
    org: "dubgrid",
    project: "javascript-nextjs",
    silent: !process.env.CI,
    widenClientFileUpload: true,
    tunnelRoute: "/monitoring",
    webpack: {
      automaticVercelMonitors: true,
      treeshake: {
        removeDebugLogging: true,
      },
    },
  });
} else {
  module.exports = composed;
}
