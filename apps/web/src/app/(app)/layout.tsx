import AuthProvider from "@/components/AuthProvider";
import QueryProvider from "@/components/QueryProvider";
import AppShell from "@/components/AppShell";
import { MobileSubNavProvider } from "@/components/MobileSubNavContext";
import { NavigationGuardProvider } from "@/components/NavigationGuardProvider";
import { TooltipProvider } from "@/components/ui/hint";
import { TOOLTIP_DELAY_MS } from "@/lib/constants";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import PostHogProvider from "@/components/PostHogProvider";
import { isFeatureEnabled } from "@/lib/feature-flags";

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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const posthogEnabled = await isFeatureEnabled("posthog");

  return (
    <AuthProvider>
      <PostHogProvider enabled={posthogEnabled}>
        <QueryProvider>
          {/* No Suspense boundary here on purpose. It used to wrap this whole
              subtree — every page — to satisfy OnboardingGate's
              useSearchParams(). Next renders a boundary's fallback into the
              static HTML when something inside reads search params, so
              `fallback={null}` meant every prerendered route shipped HTML with
              no page content in it, and nothing could paint until the bundle
              had downloaded and hydrated. The gate now owns a tight boundary
              around only the part that reads them. */}
          <OnboardingGate>
            <MobileSubNavProvider>
              <TooltipProvider delay={TOOLTIP_DELAY_MS}>
                {/* Wraps the whole shell so it sees every nav link,
                    not just the ones inside a given page. */}
                <NavigationGuardProvider>
                  <AppShell>{children}</AppShell>
                </NavigationGuardProvider>
              </TooltipProvider>
            </MobileSubNavProvider>
          </OnboardingGate>
        </QueryProvider>
      </PostHogProvider>
    </AuthProvider>
  );
}
