import AuthProvider from "@/components/AuthProvider";
import ConsentRecordSync from "@/components/ConsentRecordSync";
import QueryProvider from "@/components/QueryProvider";
import AppChrome from "@/components/AppChrome";
import SignInPrefetch from "@/components/SignInPrefetch";
import PostHogProvider from "@/components/PostHogProvider";
import { preconnect, prefetchDNS } from "react-dom";
import { getClientFeatureFlags, isFeatureEnabled } from "@/lib/feature-flags";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/verify-token";
import logger from "@/lib/logger";
import { Timer } from "@/lib/server-timing";
import {
  getSupabaseUrl,
  requireSupabasePublishableKey,
  requireSupabaseUrl,
} from "@/lib/supabase-keys";
import "../app-ui.css";

/**
 * Everything the authenticated app needs, and nothing the marketing pages do.
 *
 * These providers used to sit in the root layout, so a visitor reading the
 * landing page downloaded the Supabase auth SDK — AuthProvider reaches
 * @/lib/supabase through @/features/account/client — along with React Query and
 * the nav shell, for a page with no account behind it. Lighthouse measured
 * 725 KB of JavaScript on that page with 48% of it never executed, and the
 * auth client alone was a 290 KB chunk that was 78% unused.
 *
 * The route group is what makes this possible without touching a single URL:
 * a directory in parentheses does not appear in any path. Everything that
 * needs a session lives under it; `/`, `/privacy`, `/terms`, `/cookie-policy`
 * and `/request-demo` stay at the root and get the small layout instead.
 */
/**
 * Every route in this group renders dynamically.
 *
 * Middleware serves the authenticated app a per-request nonce CSP, and a
 * statically prerendered page cannot carry that nonce — its scripts get
 * blocked and hydration breaks. Declaring it once here makes that structural
 * for the whole group, rather than a flag each new route has to remember;
 * csp-nonce-routes-dynamic.test.ts is the guard for it.
 */
export const dynamic = "force-dynamic";

function supabaseOrigin(): string | null {
  try {
    return new URL(getSupabaseUrl() ?? "").origin;
  } catch {
    return null;
  }
}

// /api/feature-flags answers signed-in callers only, so the layout seeds the
// same answer only for a request carrying a validly signed session. The id
// also tells AuthProvider whose session was verified for this request.
async function verifiedSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(requireSupabaseUrl(), requireSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Server Components cannot mutate cookies.
      },
    },
  });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return (await verifyAccessToken(session.access_token))?.userId ?? null;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The first auth call and the realtime socket both go to Supabase; opening
  // the connection with the document saves their DNS and TLS round trips.
  // supabase-js fetches without credentials, hence the anonymous pool.
  const supabase = supabaseOrigin();
  if (supabase) {
    preconnect(supabase, { crossOrigin: "anonymous" });
    prefetchDNS(supabase);
  }
  // A Server Component cannot set response headers, so with PERF_TIMING=1
  // its spans go to the log instead of Server-Timing.
  const timer = new Timer();
  const [posthogEnabled, verifiedUserId] = await Promise.all([
    timer.time("layout_posthog_flag", () => isFeatureEnabled("posthog")),
    timer.time("layout_session", () => verifiedSessionUserId().catch(() => null)),
  ]);
  const initialFeatureFlags = verifiedUserId
    ? {
        flags: await timer.time("layout_client_flags", () => getClientFeatureFlags()),
        readAt: Date.now(),
      }
    : undefined;
  const timing = timer.header();
  if (timing) logger.info({ timing }, "app layout timing");

  return (
    <AuthProvider serverVerifiedUserId={verifiedUserId}>
      <ConsentRecordSync />
      <PostHogProvider enabled={posthogEnabled}>
        <QueryProvider initialFeatureFlags={initialFeatureFlags}>
          {/* No Suspense boundary here on purpose. It used to wrap this whole
              subtree — every page — to satisfy OnboardingGate's
              useSearchParams(). Next renders a boundary's fallback into the
              static HTML when something inside reads search params, so
              `fallback={null}` meant every prerendered route shipped HTML with
              no page content in it, and nothing could paint until the bundle
              had downloaded and hydrated. The gate now owns a tight boundary
              around only the part that reads them. */}
          <SignInPrefetch />
          <AppChrome>{children}</AppChrome>
        </QueryProvider>
      </PostHogProvider>
    </AuthProvider>
  );
}
