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
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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
  async redirects() {
    return [
      { source: "/notifications", destination: "/alerts", permanent: false },
      { source: "/notifications/:path*", destination: "/alerts/:path*", permanent: false },
    ];
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

  // No fallbacks here on purpose. A wrong default is worse than none: the
  // previous `"javascript-nextjs"` named a project that does not exist in the
  // org, so every build without these vars set made a doomed API call and
  // reported "Project not found" — a local configuration gap dressed up as a
  // Sentry problem.
  const sentryOrg = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;

  // Uploading needs all three. Without them — a local production build, a
  // fresh clone, CI outside Vercel — the plugin still runs, because it also
  // owns the tunnel route, the Vercel cron monitors and debug-log
  // treeshaking. It just stops short of creating a release or uploading
  // sourcemaps, so no request is made that is certain to fail and no stray
  // releases show up in Sentry from someone's laptop.
  const canUpload = Boolean(sentryOrg && sentryProject && process.env.SENTRY_AUTH_TOKEN);

  // Next loads this config in more than one process per build, so the notice
  // appears once per process. Not worth latching: an env-var flag only reaches
  // workers spawned after it is set, which is not a guarantee worth depending
  // on for a log line.
  if (!canUpload) {
    console.warn(
      "Sentry: skipping release and source-map upload (set SENTRY_ORG, SENTRY_PROJECT and SENTRY_AUTH_TOKEN to enable).",
    );
  }

  module.exports = withSentryConfig(composed, {
    org: sentryOrg,
    project: sentryProject,
    silent: !process.env.CI,
    widenClientFileUpload: true,
    sourcemaps: { disable: !canUpload },
    release: { create: canUpload },
    errorHandler: (err: Error) => {
      console.warn(
        "Sentry release/source-map upload failed; continuing production build.",
        err.message,
      );
    },
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
